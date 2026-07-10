# SenseCAP 农业播报 MCP 重新设计

## 背景与问题

现有 `sensecraft_data_mcp` 的 5 个 PaaS 工具（`register_device`/`get_device_key`/`view_latest_telemetry_data`/`list_telemetry_data`/`aggregate_chart_points`）是把 SenseCAP PaaS OpenAPI 的端点几乎逐一照搬成 MCP 工具，本质是"CLI 转 MCP"：

- 消费者被设定为程序，而实际消费者是小智这类**手持语音终端**——没有屏幕、单轮对话延迟敏感、用户说的是自然语言而非结构化参数。
- 没有任何工具能回答"我有哪些设备、谁在线、谁没数据"，`register_device`/`get_device_key` 都要求调用方已经知道具体某一个设备。
- 遥测数据返回后从不翻译成人话，`response.ts` 的 `summarizeTelemetryPayload` 对多通道设备只会说"具体数值见 data 字段"，把格式化工作甩给了下游，语音场景里这等于没有播报。
- `list_telemetry_data` 工具实际调用的是 `/openapi/view_latest_telemetry_data` 端点（应为 `/openapi/list_telemetry_data`），是一个真实的接口路径错误。
- `device_registry.ts` 维护一份本地"设备名→EUI"别名缓存，存在的唯一理由是当初没有调用任何"列出账号下设备"的接口；PaaS 的 `/list_devices` 端点可以直接、实时地提供这个信息，本地缓存因此失去存在必要，且存在数据陈旧、遗漏账号下未经本工具注册过的设备等问题。
- 设备开局/烧固件相关的 Arduino 代码模板工具（`list_all_code`/`read_code_file`）与农业播报工具混在同一个 MCP server 里，服务的是完全不同的场景（开发者用编码 Agent 做硬件开局 vs. 农场主对语音终端提问），二者混杂导致每种消费者都要面对与自己无关的工具噪音。

## 目标

1. 让小智这类语音终端能够直接问出"我的设备现在怎么样""某个设备现在读数是多少"这类问题，并得到一段可直接播报的自然语言答案。
2. 工具的内部实现基于已确认可用的 SenseCAP PaaS OpenAPI 端点，不再依赖本地设备别名缓存。
3. 把设备开局/固件相关工具从这个 MCP server 中拆出，各自服务于对应的消费者。

## 非目标

- 不做设备开局/绑定流程的重新设计（`/device/bind`、`/openapi/device/create_development_kit` 等端点的选择与实现细节留给拆分后的新包自行决定）。
- 不做任意时间范围的历史数据查询（原型讨论中提出过，但决定收窄为下述 `get_device_trend` 的封闭档位方案，理由见下文"设计取舍"）。
- 不改动 `sensecraft-solutions` 里的部署配置（`solution.yaml`/`devices/mcp_bridge.yaml`/`docker-compose.yml`），这是后续实现计划的一部分，不在本次设计范围内。

## 消费者与交互模型

目标消费者是小智（XiaoZhi）语音终端，交互特征：

- 无屏幕，所有工具返回值必须是可直接朗读的自然语言（`say` 字段），`data` 字段仅供 Agent 内部使用，不面向用户朗读。
- 单轮对话对延迟敏感，每个工具内部对 PaaS 的调用次数必须是常数级、可预期的，不能因设备数量增长而线性拖慢单次问答。
- 用户说话不带结构化参数（无法说出 ISO 时间戳、精确设备 EUI），设备引用要靠模糊匹配 + 歧义追问解决，时间范围要靠封闭的口语化档位（"今天"/"这周"）而非任意起止时间。

## 架构：拆分为两个 MCP 包

| 包名 | 职责 | 消费者 |
|---|---|---|
| `sensecraft_data_mcp`（沿用现名） | 农业播报：设备总览、单设备详细读数、可选趋势查询 | 小智等语音终端 |
| `sensecraft_device_provision_mcp`（新增） | 设备开局：`register_device`、`get_device_key`、`list_all_code`、`read_code_file` | Claude Desktop/Cursor 等编码 Agent |

两个包各自维护独立的 `package.json`/`Dockerfile`，`sensecraft_device_provision_mcp` 直接复用现有 `code_reader.ts`（含 `src/static/arduino/*` 模板）与现有的 `register_device`/`get_device_key` 实现，不改动其内部逻辑，仅搬移文件位置和 MCP server 入口。

## 工具设计（`sensecraft_data_mcp`）

### 1. `get_farm_overview()` — 设备总览，异常优先播报

**内部调用**（固定 2 次 PaaS 请求，与设备数量无关）：
1. `GET /list_devices` — 拿账号下全部设备的 `device_eui`/`device_name`。
2. `POST /view_device_running_status`（`device_euis` 传入上一步返回的全部 EUI，一次批量请求）— 拿 `online_status`/`latest_message_time`/`battery_status`/`battery_digit`/`report_frequency`。

**播报策略**：优先播报异常项——`online_status` 为离线、`battery_digit`（电量百分比）低于 30%、或最后上报时间超过该设备 `report_frequency` 两倍时长（视为"失联"，即便 `online_status` 仍显示在线）——健康设备只用一句话汇总数量。例如：

> "你有5台设备。大棚2号温湿度计已经离线3天，电量还剩20%，建议检查一下。其余4台设备在线正常。"

**参数**：无必填参数。可选 `filter`（自由文本，如"离线的"/"大棚"），命中时按名称片段或状态关键词在同一份已拉取的数据上做本地过滤，不产生额外 PaaS 调用。

### 2. `get_device_reading(device)` — 单设备详细播报

**参数**：`device`（string，必填）— 口语化设备名或 EUI。

**设备解析**：现场调用 `GET /list_devices`，对返回的 `device_name` 列表做模糊匹配（复用现有 `device_registry.ts` 中 `similarityScore`/`levenshtein` 的匹配算法与置信度阈值，仅将数据源从本地 `device_registry.json` 替换为这次实时拉取的列表）；若已是合法 EUI 格式则跳过匹配直接使用。匹配置信度不足时返回 `wrapAsk`，附带候选名称列表，交由用户口头澄清；找不到候选时返回 `wrapFail`。

**内部调用**（解析成功后，固定 2 次 PaaS 请求）：
1. `GET /view_latest_telemetry_data`（仅传 `device_eui`，不传 `channel_index`）— 拿该设备全部通道最新读数。
2. `POST /view_device_running_status`（该设备单个 EUI）— 拿电量与在线状态，与读数一并播报。

**格式化**：新增本地静态映射表 `measurement_catalog.ts`，收录 PaaS 官方文档中的 56 个 `measurement_id → {name, unit}` 对照（覆盖气温、湿度、光照、气压、风速、风向、降雨、土壤温湿度、土壤 EC/pH、PAR、太阳辐射等农业相关测量项），将 `{measurement_id: 4097, value: 26.2}` 这类原始点位翻译为"气温26.2℃"，拼接全部通道后生成一段播报文本。这一步是相对现状价值最大的改动——现有 `summarizeTelemetryPayload` 从不做这个翻译。

**示例**：

> "大棚气象站现在气温26.2℃、湿度93%、光照2585勒克斯、气压1001.7百帕、风速0.3米每秒，过去一小时降雨0.3毫米。电量85%，信号正常。"

### 3. `get_device_trend(device, range)` — 可选，二期实现

**参数**：`device`（同上）；`range`（枚举：`"today" | "this_week"`，必填，不接受任意时间戳）。

**内部调用**：按 `range` 换算出对应的 `time_start`/`time_end`，调用 `GET /aggregate_chart_points`（`this_week` 用较大 `interval` 控制返回点数）。

**格式化**：生成趋势句，例如"今天温度在22到31度之间波动，目前26.2度；降雨累计12毫米。"

**设计取舍**：Home Assistant 的 `GetLiveContext` 只回答"现在"，历史数据由独立的 Logbook 界面承载，不进入语音对话工具集。SenseCAP 自身的 Dashboard（Table/Graph/Panel）已经完整覆盖历史数据查看需求。因此本工具标记为可选——先不实现，仅在明确出现"语音问历史趋势"的真实需求后再补，避免在语音场景里重复造一个不适合语音表达的"数据看板"。

## 已确认可用的 PaaS OpenAPI 端点（本设计依赖）

| 端点 | 方法 | 用途 | 本设计中的使用 |
|---|---|---|---|
| `/list_devices` | GET | 列出账号下设备（`device_eui`/`device_name`） | `get_farm_overview`、`get_device_reading` 的设备解析 |
| `/view_device_running_status` | POST（`device_euis[]`） | 在线状态/电量/最后上报时间/上报频率 | `get_farm_overview`、`get_device_reading` |
| `/view_latest_telemetry_data` | GET | 单设备全部通道最新读数 | `get_device_reading` |
| `/aggregate_chart_points` | GET | 分段聚合数据 | `get_device_trend`（二期） |

`/view_devices`、`/list_device_channels`、`/device/bind`、`/delete_devices`、`/view_simcard` 本设计暂不使用（前两者非当前工具集必需；后三者属于设备开局范畴，划归 `sensecraft_device_provision_mcp`）。

## 共享基础设施

- **响应契约不变**：沿用现有 `response.ts` 的 `wrapTell`/`wrapAsk`/`wrapFail`（`success`/`facts.executed`/`say`/`say_kind`/`data`）结构，新工具直接复用。
- **设备解析逻辑迁移**：`device_registry.ts` 中的 `similarityScore`/`levenshtein`/`looksLikeEui`/`normalizeText` 等纯函数保留并复用，但去掉 `loadRegistry`/`saveRegistry`/`rememberDevice` 相关的本地文件读写——匹配对象改为每次调用现场从 `/list_devices` 拿到的列表。
- **新增 `measurement_catalog.ts`**：静态常量表，`measurement_id → {name_zh, unit}`，数据来源为 PaaS 官方 OpenAPI 文档 PDF 中的"List of Measurement IDs"章节（56 条）。

## 错误处理

- PaaS 请求失败（网络错误、鉴权失败）时，`_doHttp` 捕获到的具体错误原因（HTTP 状态码、PaaS 返回的 `code`）应通过 `FAULT` 映射表转成具体中文提示（如"AccessId或accessKey错误"），不再统一压扁成"请稍后重试"——现有 `paas_client.ts` 里已有 `FAULT` 表可直接复用，只需在 catch 块里先查表再兜底。
- 设备名模糊匹配置信度不足：返回 `wrapAsk` + 候选列表（沿用现有阈值：单候选需 ≥75 分，多候选最高分需 ≥85 分且领先第二名 ≥10 分）。
- `/list_devices` 返回空列表（账号下无设备）：`get_farm_overview` 返回 `wrapTell`，播报"你的账号下还没有绑定任何设备"。

## 测试

- 单元测试覆盖 `measurement_catalog.ts` 的翻译函数（给定 `measurement_id` 返回正确的中文名与单位，未收录的 `measurement_id` 有兜底文案而非崩溃）。
- 单元测试覆盖设备模糊匹配逻辑迁移后的行为不变（沿用现有 `device_registry.ts` 测试用例，仅替换数据源为 mock 的 `/list_devices` 响应）。
- 集成测试用 mock 的 PaaS HTTP 响应验证 `get_farm_overview`/`get_device_reading` 的调用次数固定（各 2 次），且异常优先的播报顺序正确。

## 迁移影响（供后续实现计划参考，非本次范围）

- `sensecraft-solutions` 中 `solution.yaml` 的 `output_interfaces` 工具列表与 `description.md`/`description_zh.md` 需要在实现完成后同步更新为新工具集。
- 现有已知的 Docker `WebSocket` 全局对象缺失问题（已在 `49e7c43` 修复，改用显式 `ws` 依赖）与本次设计无关，不受影响。
