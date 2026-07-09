# SenseCraft MCP

面向 SenseCAP / SenseCraft 生态的 [MCP](https://modelcontextprotocol.io)（Model Context Protocol）服务集合，让支持 MCP 的 AI 助手（如 Claude Desktop、Cursor 等）能够直接：

- 在 SenseCAP PaaS（sensecap.seeed.cc）开放平台上注册设备、查询密钥；
- 查询/聚合设备的遥测（传感器）数据；
- 读取并生成可直接用于 PlatformIO/Arduino 项目的采集与上报代码模板（WiFi 上报、温湿度采集、LED 控制等）；
- 通过 WebSocket 出站连接接入小智 ESP32（XiaoZhi）的 **MCP 接入点**，让小智语音助手也能调用以上工具（见[《接入小智 ESP32（XiaoZhi）》](#接入小智-esp32xiaozhi)）。

## 项目结构

```
sensecraft_mcp/
├── sensecraft_data_mcp/   # 核心 MCP Server（可发布使用）
│   ├── src/
│   │   ├── index.ts              # MCP Server 入口，按 MCP_ENDPOINT 是否设置二选一：
│   │   │                         # stdio transport（Claude Desktop/Cursor）或 WebSocket 出站接入点（小智）
│   │   ├── config/                # 环境变量与多环境配置
│   │   ├── transport/
│   │   │   └── ws_endpoint_transport.ts  # 出站连接小智 MCP 接入点的 Transport 实现
│   │   ├── mcp_tools/
│   │   │   ├── paas_client.ts     # 对接 SenseCAP PaaS openapi 的工具
│   │   │   ├── code_reader.ts     # Arduino/PlatformIO 代码模板读取工具
│   │   │   ├── response.ts        # 语音助手友好的响应包装（say/say_kind/facts.executed）
│   │   │   └── device_registry.ts # 设备名 <-> EUI 的本地别名缓存与模糊匹配
│   │   └── static/arduino/        # 代码模板（.h/.cpp）
│   └── package.json
└── coding-assistant/       # 实验性/占位项目，尚未实现具体功能
```

## MCP 工具（Tools）一览

### PaaS 数据接口（`paas_client.ts`）

| Tool | 说明 |
| --- | --- |
| `register_device` | 向 SenseCAP PaaS 平台注册设备，返回设备 EUI；注册成功后会自动记入本地设备别名缓存 |
| `get_device_key` | 根据设备名称或 EUI 查询 `device_key` 和 `token` |
| `view_latest_telemetry_data` | 查询设备（按 channel/measurement）最新一年内的遥测数据 |
| `list_telemetry_data` | 查询指定时间范围内的历史遥测数据（最长一个月，仅限最近三个月） |
| `aggregate_chart_points` | 按时间段聚合遥测数据用于绘制折线图（最多返回 250 个点） |

以上除 `register_device` 外，涉及设备的参数（`device_eui`/`nodeEui`）既可以传入真实的 16 位十六进制 EUI，也可以传入设备名称——工具会先尝试按 EUI 格式识别，否则在本地别名缓存中做模糊匹配；匹配到多个相近候选时会返回 `say_kind: "ask"` 并附上候选列表，从不擅自选择第一个结果。所有工具的返回值统一为 `{ success, facts: { executed }, say, say_kind, data }` 结构，`say` 是可以直接读给用户听的文本，`facts.executed` 仅在真正产生了写操作（如 `register_device` 成功）时为 `true`。

### 代码模板接口（`code_reader.ts`）

| Tool | 说明 |
| --- | --- |
| `list_all_code` | 列出所有可用的 Arduino 代码模板及其用途描述 |
| `read_code_file` | 根据 `uri` 读取指定模板的完整内容 |

内置模板包括：向 SenseCraft data 上报测量值/设备状态（RSSI 等）、DHT20 温湿度采集、LED 闪烁控制、`config.h` 全局配置、以及 `main.cpp` 项目入口示例。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `ACCESS_ID` / `ACCESS_KEY` | 是 | SenseCAP PaaS 开放平台的 API 凭据，用于生成 `Authorization: Basic ...` 请求头 |
| `SENSECRAFT_SITE_ENV` | 否 | `global`（默认）或 `develop`，决定加载 `.env.global` / `.env.develop` 中的 `SENSECRAFT_DATA_SERVER_URL` 与 `LOGGER_LEVEL` |
| `MCP_ENDPOINT` | 否 | 设置后，服务不再监听 stdio，而是作为 WebSocket 客户端出站连接该地址（小智的 MCP 接入点地址），例如 `ws://<host>:8004/mcp_endpoint/mcp/?token=xxx` |

## 安装与构建

```bash
cd sensecraft_data_mcp
npm install
npm run build
```

构建产物在 `dist/`，会同时拷贝 `.env*` 配置与 `static/` 模板文件。

## 使用方式

`sensecraft_data_mcp` 通过 stdio 与 MCP 客户端通信，可在任意支持 MCP 的客户端中配置，例如 Claude Desktop 的 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "sensecraft_data_mcp": {
      "command": "node",
      "args": ["/path/to/sensecraft_data_mcp/dist/index.js"],
      "env": {
        "ACCESS_ID": "your-access-id",
        "ACCESS_KEY": "your-access-key",
        "SENSECRAFT_SITE_ENV": "global"
      }
    }
  }
}
```

## 接入小智 ESP32（XiaoZhi）

小智（[xiaozhi-esp32](https://github.com/78/xiaozhi-esp32)）语音助手通过一个叫 **MCP 接入点**（[mcp-endpoint-server](https://github.com/xinnan-tech/mcp-endpoint-server)）的 WebSocket 网关来扩展工具：第三方 MCP server 主动出站连接到接入点地址，小智后端再把设备的语音意图转发过来调用这些工具。官方参考实现（[mcp-calculator](https://github.com/78/mcp-calculator)）用一个 Python 脚本 `mcp_pipe.py` 做 stdio↔WebSocket 的转发桥；本项目没有额外套一层桥接进程，而是直接给 `index.ts` 增加了第二种 transport（`src/transport/ws_endpoint_transport.ts`），用 Node 原生的 `WebSocket` 客户端实现 MCP SDK 的 `Transport` 接口，一个 Node 进程就能直连接入点，无需安装 Python。

### 部署步骤

1. 参照小智的[《MCP 接入点使用指南》](https://github.com/xinnan-tech/xiaozhi-esp32-server/blob/main/docs/mcp-endpoint-integration.md)启用 MCP 接入点功能，从智控台的智能体配置里拿到形如下面的地址：

   ```
   ws://<host>:8004/mcp_endpoint/mcp/?token=xxx
   ```

2. 构建本项目（见上文“安装与构建”），然后设置 `MCP_ENDPOINT` 环境变量启动：

   ```bash
   MCP_ENDPOINT="ws://<host>:8004/mcp_endpoint/mcp/?token=xxx" \
   ACCESS_ID=your-access-id \
   ACCESS_KEY=your-access-key \
   node sensecraft_data_mcp/dist/index.js
   ```

3. 连接成功后进入智控台刷新 MCP 接入状态，应能看到 `register_device`、`get_device_key`、`view_latest_telemetry_data` 等工具。断线会按指数退避（1s 起，最长 600s）自动重连，每次重连都会重建一个全新的 `McpServer` 实例，不会带着上一次的会话状态。

不设置 `MCP_ENDPOINT` 时行为不变，仍然是 stdio transport，可以继续在 Claude Desktop / Cursor 里使用。

### 面向语音场景的响应设计

由于语音交互不适合把原始 JSON 甩给用户，`paas_client.ts` 的工具返回值统一包装成：

```json
{
  "success": true,
  "facts": { "executed": false },
  "say": "已获取到设备\"客厅温湿度计\"的密钥信息。",
  "say_kind": "tell",
  "data": { "...": "..." }
}
```

- `say_kind`: `tell`（正常回答）/ `ask`（需要用户澄清，见 `data.candidates`）/ `fail`（失败，未执行任何操作）。
- `facts.executed`: 只有真正的写操作（目前是 `register_device` 成功时）才为 `true`，查询类工具恒为 `false`。
- 遥测类工具不会替用户编造单位或读数含义（PaaS 返回的字段语义未公开文档化），`say` 只做诚实的、基于数据量的摘要，具体数值始终在 `data` 里，超过 200 条会截断并在 `say` 中说明。
- 设备名解析：语音场景下用户会说设备名而不是 EUI，`device_registry.ts` 维护一个本地别名缓存（`~/.sensecraft_data_mcp/device_registry.json`），在 `register_device` 成功后自动记录，查询类工具收到非 EUI 格式的输入时会在缓存里做归一化 + 编辑距离的模糊匹配；命中多个相近候选且区分度不够时返回 `ask` 而不是自作主张选第一个。

## 技术栈

TypeScript · [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) · axios · zod · dotenv

## 其他子项目

- `coding-assistant/`：早期实验性项目，目前仅有骨架代码，功能尚未实现。
