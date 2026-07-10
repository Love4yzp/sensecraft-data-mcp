# 农业播报 MCP · Phase 1 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `sensecraft_data_mcp` 包里新增 `get_farm_overview` 与 `get_device_reading` 两个语音播报工具，把设备名解析从本地文件缓存迁移到 PaaS 实时接口，并修复一个已确认的接口路径 bug。

**Architecture:** 新增 `measurement_catalog.ts`（静态 measurement_id 翻译表）与 `device_resolver.ts`（纯函数式设备模糊匹配，替换 `device_registry.ts` 的本地文件缓存）两个独立文件；`paas_client.ts` 新增两个私有方法封装对 `/list_devices`、`/view_device_running_status` 的调用，并在此基础上新增两个 MCP 工具、重构现有 4 个工具的设备解析调用点。

**Tech Stack:** TypeScript（Node 20），`@modelcontextprotocol/sdk`，`axios`，`zod`；测试用 Node 内置 `node:test` + `node:assert/strict`（不引入新的测试框架依赖）。

## Global Constraints

- Node 版本以 Docker 镜像 `node:20-alpine` 为准，不使用 Node 21+ 才有的特性。
- 不新增测试框架依赖（不装 jest/mocha），用 Node 内置 `node --test` 跑编译后的 `dist/**/*.test.js`。
- 复用现有响应契约 `wrapTell`/`wrapAsk`/`wrapFail`（`response.ts`），不改动其签名。
- 复用现有设备模糊匹配阈值：`MIN_SCORE=50`、`CONFIDENT_SOLO_SCORE=75`、`CONFIDENT_TOP_SCORE=85`、`CONFIDENT_MARGIN=10`、`MAX_CANDIDATES=5`。
- 复用现有 `FAULT` 错误码映射表（`paas_client.ts` 顶部）与 `_doHttp` 方法签名，不改动其行为。
- 以下 3 个 PaaS 接口的真实响应结构已在本次会话中用生产环境真实凭据验证过（china 站点 `https://sensecap.seeed.cn`），后续任务里的类型定义必须与此完全一致：

  `GET /openapi/list_devices`：
  ```json
  {"code":"0","data":[{"device_eui":"2CF7F1696251000C","device_name":"...","be_quota":"0","expired_time":""}]}
  ```

  `POST /openapi/view_device_running_status`，body `{"device_euis":["..."]}`：
  ```json
  {"code":"0","data":[{"device_eui":"2CF7F1696251000C","latest_message_time":"2026-07-10T02:35:13.511Z","online_status":1,"battery_status":1,"battery_digit":100,"expired_time":"1970-01-01T00:00:00.000Z","be_quota":0,"report_frequency":5}]}
  ```

  `GET /openapi/view_latest_telemetry_data?device_eui=...`（不传 `channel_index`，拿全部通道）：
  ```json
  {"code":"0","data":[{"channel_index":10,"points":[{"measurement_value":26.52,"measurement_id":"4097","time":"2026-07-10T02:39:44.319Z"}]}]}
  ```

- `online_status`：`1` = 在线，`0` = 离线。`battery_digit`：0~100 的电量百分比数值。`report_frequency`：设备上报周期，单位分钟。

---

### Task 1: `measurement_catalog.ts` — measurement_id 翻译表

**Files:**
- Create: `sensecraft_data_mcp/src/mcp_tools/measurement_catalog.ts`
- Test: `sensecraft_data_mcp/src/mcp_tools/measurement_catalog.test.ts`
- Modify: `sensecraft_data_mcp/package.json`（新增 `test` 脚本）

**Interfaces:**
- Produces: `formatMeasurement(measurementId: string | number, value: number): string`，供 Task 5/6 的 `get_device_reading` 工具使用。

- [ ] **Step 1: 写失败的测试**

创建 `sensecraft_data_mcp/src/mcp_tools/measurement_catalog.test.ts`：

```ts
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {formatMeasurement} from './measurement_catalog'

test('formats a known measurement id with its Chinese name and unit', () => {
    assert.equal(formatMeasurement('4097', 26.52), '气温26.52℃')
    assert.equal(formatMeasurement('4098', 92.67), '湿度92.67%RH')
})

test('accepts a numeric measurement id, not just a string', () => {
    assert.equal(formatMeasurement(4099, 4410), '光照强度4410Lux')
})

test('falls back to a generic label for an unrecognized measurement id instead of throwing', () => {
    // 4213 (Rain Accumulation) 是本次会话里从真实设备(2CF7F1696251000C 所在账号
    // 的天气站)读数里见到的 measurement_id，但不在 SenseCAP 官方发布的
    // Measurement ID 参考表(2021/3/30 版)里——静态表必然有遗漏，格式化函数
    // 必须优雅兜底而不是崩溃或丢数据。
    assert.equal(formatMeasurement('4213', 519.3), '测量项4213: 519.3')
})
```

- [ ] **Step 2: 添加测试脚本并运行确认失败**

修改 `sensecraft_data_mcp/package.json` 的 `scripts` 字段：

```json
  "scripts": {
    "build": "tsc && copyfiles -u 1 src/config/.env src/config/.env.* src/static/**/* dist/",
    "test": "tsc && node --test dist/mcp_tools"
  },
```

运行：
```bash
cd sensecraft_data_mcp && npm test
```
预期：TypeScript 编译报错（`measurement_catalog.ts` 不存在）或 `node --test` 报 `Cannot find module`。

- [ ] **Step 3: 实现 `measurement_catalog.ts`**

创建 `sensecraft_data_mcp/src/mcp_tools/measurement_catalog.ts`：

```ts
/**
 * measurement_id -> {中文名, 单位} 静态对照表。
 * 数据来源：SenseCAP OpenAPI 官方文档 "List of Measurement IDs" 章节
 * (https://sensecap-docs.seeed.cc/pdf/sensecap_opanapi_document_en.pdf,
 * PDF 标注最后生成于 2021/3/30)。该文档并非详尽——例如 4213 (Rain
 * Accumulation) 已在生产设备的真实响应里出现，但未被收录，因此
 * formatMeasurement 必须对未收录的 id 做兜底处理，而不是假设表是完整的。
 */

export interface MeasurementInfo {
    name: string
    unit: string
}

export const MEASUREMENT_CATALOG: Record<string, MeasurementInfo> = {
    "4097": {name: "气温", unit: "℃"},
    "4098": {name: "湿度", unit: "%RH"},
    "4099": {name: "光照强度", unit: "Lux"},
    "4100": {name: "CO2浓度", unit: "ppm"},
    "4101": {name: "气压", unit: "Pa"},
    "4102": {name: "土壤温度", unit: "℃"},
    "4103": {name: "土壤湿度", unit: "%RH"},
    "4104": {name: "风向", unit: "°"},
    "4105": {name: "风速", unit: "m/s"},
    "4106": {name: "pH值", unit: ""},
    "4107": {name: "光量子", unit: "umol/㎡s"},
    "4108": {name: "电导率", unit: "dS/m"},
    "4109": {name: "溶解氧", unit: "mg/L"},
    "4110": {name: "土壤体积含水量", unit: "%"},
    "4111": {name: "土壤电导率", unit: "dS/m"},
    "4112": {name: "土壤温度", unit: "℃"},
    "4113": {name: "每小时降雨量", unit: "mm/h"},
    "4115": {name: "距离", unit: "cm"},
    "4116": {name: "水浸检测", unit: ""},
    "4117": {name: "液位", unit: "cm"},
    "4118": {name: "氨气浓度", unit: "ppm"},
    "4119": {name: "硫化氢浓度", unit: "ppm"},
    "4120": {name: "流量", unit: "m³/h"},
    "4121": {name: "累计流量", unit: "m³"},
    "4122": {name: "氧气浓度", unit: "%vol"},
    "4123": {name: "水电导率", unit: "us/cm"},
    "4124": {name: "水温", unit: "℃"},
    "4125": {name: "土壤热通量", unit: "W/㎡"},
    "4126": {name: "日照时长", unit: "h"},
    "4127": {name: "总太阳辐射", unit: "W/㎡"},
    "4128": {name: "水面蒸发量", unit: "mm"},
    "4129": {name: "光合有效辐射", unit: "umol/㎡s"},
    "4130": {name: "加速度", unit: "m/s²"},
    "4131": {name: "音量", unit: "dB"},
    "4133": {name: "土壤张力", unit: "kPa"},
    "4134": {name: "盐度", unit: "mg/L"},
    "4135": {name: "溶解性总固体(TDS)", unit: "mg/L"},
    "4136": {name: "叶片温度", unit: "℃"},
    "4137": {name: "叶片湿度", unit: "%"},
    "4138": {name: "土壤湿度(10cm)", unit: "%"},
    "4139": {name: "土壤湿度(20cm)", unit: "%"},
    "4140": {name: "土壤湿度(30cm)", unit: "%"},
    "4141": {name: "土壤湿度(40cm)", unit: "%"},
    "4142": {name: "土壤温度(10cm)", unit: "℃"},
    "4143": {name: "土壤温度(20cm)", unit: "℃"},
    "4144": {name: "土壤温度(30cm)", unit: "℃"},
    "4145": {name: "土壤温度(40cm)", unit: "℃"},
    "4146": {name: "PM2.5", unit: "μg/m³"},
    "4147": {name: "PM10", unit: "μg/m³"},
    "4150": {name: "X轴加速度", unit: "m/s²"},
    "4151": {name: "Y轴加速度", unit: "m/s²"},
    "4152": {name: "Z轴加速度", unit: "m/s²"},
    "5100": {name: "开关状态", unit: ""},
}

/** 把一个原始遥测点位格式化成人话，未收录的 measurement_id 用通用兜底文案。 */
export function formatMeasurement(measurementId: string | number, value: number): string {
    const id = String(measurementId)
    const info = MEASUREMENT_CATALOG[id]
    if (!info) {
        return `测量项${id}: ${value}`
    }
    return `${info.name}${value}${info.unit}`
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd sensecraft_data_mcp && npm test
```
预期：3 个测试全部 PASS（`# pass 3`，`# fail 0`）。

- [ ] **Step 5: Commit**

```bash
git add sensecraft_data_mcp/src/mcp_tools/measurement_catalog.ts \
        sensecraft_data_mcp/src/mcp_tools/measurement_catalog.test.ts \
        sensecraft_data_mcp/package.json
git commit -m "feat: 新增 measurement_id 翻译表，把遥测原始点位格式化成人话"
```

---

### Task 2: `device_resolver.ts` — 实时设备模糊匹配（替换 `device_registry.ts`）

**Files:**
- Create: `sensecraft_data_mcp/src/mcp_tools/device_resolver.ts`
- Test: `sensecraft_data_mcp/src/mcp_tools/device_resolver.test.ts`
- Delete: `sensecraft_data_mcp/src/mcp_tools/device_registry.ts`（本任务最后一步删除，此前先确认没有编译错误产生的引用悬空——`paas_client.ts` 里的旧 import 在 Task 3 才会更新，因此本任务先不删除，改到 Task 3 结束时删除，见 Task 3 最后一步）

**Interfaces:**
- Produces: `interface DeviceInfo {deviceName: string, eui: string}`、`interface DeviceCandidate {deviceName: string, eui: string, score: number}`、`interface DeviceResolution {confident: boolean, eui?: string, matchedName?: string, wasLiteralEui: boolean, candidates: DeviceCandidate[]}`、`resolveDeviceRef(input: string, devices: DeviceInfo[]): DeviceResolution` — 供 Task 3 的 `PaasClient._resolveDeviceOrRespond` 使用。

- [ ] **Step 1: 写失败的测试**

创建 `sensecraft_data_mcp/src/mcp_tools/device_resolver.test.ts`：

```ts
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {resolveDeviceRef, DeviceInfo} from './device_resolver'

const devices: DeviceInfo[] = [
    {deviceName: '大棚气象站', eui: '2CF7F1696251000C'},
    {deviceName: 'Test-AP Holland', eui: '2CF7F1695511000C'},
]

test('resolves a literal EUI without matching against the device list', () => {
    const result = resolveDeviceRef('2cf7f1696251000c', devices)
    assert.equal(result.confident, true)
    assert.equal(result.wasLiteralEui, true)
    assert.equal(result.eui, '2CF7F1696251000C')
})

test('resolves an exact name match confidently', () => {
    const result = resolveDeviceRef('大棚气象站', devices)
    assert.equal(result.confident, true)
    assert.equal(result.eui, '2CF7F1696251000C')
    assert.equal(result.matchedName, '大棚气象站')
})

test('tolerates a one-character typo and still resolves confidently', () => {
    // "战" vs "站"：编辑距离1，相似度80分，且是唯一超过 MIN_SCORE 的候选，
    // 80 >= CONFIDENT_SOLO_SCORE(75)，应判定为可信匹配。
    const result = resolveDeviceRef('大棚气象战', devices)
    assert.equal(result.confident, true)
    assert.equal(result.eui, '2CF7F1696251000C')
})

test('asks for disambiguation when two candidates score close together', () => {
    const ambiguousDevices: DeviceInfo[] = [
        {deviceName: '大棚1号', eui: 'AAAAAAAAAAAAAAAA'},
        {deviceName: '大棚2号', eui: 'BBBBBBBBBBBBBBBB'},
    ]
    const result = resolveDeviceRef('大棚', ambiguousDevices)
    assert.equal(result.confident, false)
    assert.equal(result.candidates.length, 2)
})

test('returns no candidates for a name with no resemblance to any device', () => {
    const result = resolveDeviceRef('完全不相关的名字xyz', devices)
    assert.equal(result.confident, false)
    assert.equal(result.candidates.length, 0)
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd sensecraft_data_mcp && npm test
```
预期：FAIL，报 `Cannot find module './device_resolver'`。

- [ ] **Step 3: 实现 `device_resolver.ts`**

创建 `sensecraft_data_mcp/src/mcp_tools/device_resolver.ts`：

```ts
/**
 * 纯函数式设备名模糊匹配。调用方负责提供当前的设备列表（通常是每次调用
 * 现场从 PaaS /list_devices 拉取的实时结果）——这个模块自己不持有任何状态、
 * 不做任何文件/网络 IO，因此可以脱离 PaaS 独立测试。
 */

export interface DeviceInfo {
    deviceName: string
    eui: string
}

export interface DeviceCandidate {
    deviceName: string
    eui: string
    score: number
}

export interface DeviceResolution {
    confident: boolean
    eui?: string
    matchedName?: string
    /** True when the input was already a bare EUI and needed no fuzzy resolution. */
    wasLiteralEui: boolean
    candidates: DeviceCandidate[]
}

function normalizeText(text: string): string {
    return String(text ?? '').replace(/[\s\-_/,，、()（）]+/g, '').toLowerCase()
}

function normalizeEui(input: string): string {
    return String(input ?? '').replace(/[-:\s]+/g, '').toUpperCase()
}

function looksLikeEui(input: string): boolean {
    return /^[0-9a-f]{16}$/i.test(normalizeEui(input))
}

function levenshtein(a: string, b: string): number {
    const dp: number[][] = Array.from({length: a.length + 1}, () => new Array(b.length + 1).fill(0))
    for (let i = 0; i <= a.length; i++) dp[i][0] = i
    for (let j = 0; j <= b.length; j++) dp[0][j] = j
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
        }
    }
    return dp[a.length][b.length]
}

/** 0-100 similarity score. Pure-TS Levenshtein ratio + substring bonus, no extra deps. */
function similarityScore(query: string, candidate: string): number {
    const a = normalizeText(query)
    const b = normalizeText(candidate)
    if (!a || !b) return 0
    if (a === b) return 100
    const dist = levenshtein(a, b)
    const maxLen = Math.max(a.length, b.length)
    const base = (1 - dist / maxLen) * 100
    const containsBonus = (b.includes(a) || a.includes(b)) ? 10 : 0
    return Math.min(100, Math.round(base + containsBonus))
}

const MIN_SCORE = 50
const CONFIDENT_SOLO_SCORE = 75
const CONFIDENT_TOP_SCORE = 85
const CONFIDENT_MARGIN = 10
const MAX_CANDIDATES = 5

/**
 * Resolves a user-provided device reference (spoken name OR literal EUI) to an EUI,
 * matching against the given live device list. Never guesses on a low-confidence
 * match; instead returns candidates so the caller can ask the user to disambiguate.
 */
export function resolveDeviceRef(input: string, devices: DeviceInfo[]): DeviceResolution {
    const trimmed = String(input ?? '').trim()

    if (looksLikeEui(trimmed)) {
        return {confident: true, eui: normalizeEui(trimmed), wasLiteralEui: true, candidates: []}
    }

    const scored = devices
        .map((device) => ({
            deviceName: device.deviceName,
            eui: normalizeEui(device.eui),
            score: similarityScore(trimmed, device.deviceName)
        }))
        .filter((entry) => entry.score >= MIN_SCORE)
        .sort((a, b) => b.score - a.score)

    if (scored.length === 0) {
        return {confident: false, wasLiteralEui: false, candidates: []}
    }

    const best = scored[0]
    const confident = scored.length === 1
        ? best.score >= CONFIDENT_SOLO_SCORE
        : best.score >= CONFIDENT_TOP_SCORE && best.score - scored[1].score > CONFIDENT_MARGIN

    return {
        confident,
        eui: confident ? best.eui : undefined,
        matchedName: confident ? best.deviceName : undefined,
        wasLiteralEui: false,
        candidates: scored.slice(0, MAX_CANDIDATES)
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd sensecraft_data_mcp && npm test
```
预期：本文件的 5 个测试 + Task 1 的 3 个测试全部 PASS（`# pass 8`，`# fail 0`）。

- [ ] **Step 5: Commit**

```bash
git add sensecraft_data_mcp/src/mcp_tools/device_resolver.ts \
        sensecraft_data_mcp/src/mcp_tools/device_resolver.test.ts
git commit -m "feat: 新增纯函数式设备模糊匹配 device_resolver，替代本地文件缓存"
```

（此时 `device_registry.ts` 还没有被删除、`paas_client.ts` 还没有改，代码库整体仍能正常编译运行——删除旧文件放在 Task 3 末尾，避免这个任务留下悬空引用。）

---

### Task 3: `paas_client.ts` — 接入实时设备解析，移除本地缓存

**Files:**
- Modify: `sensecraft_data_mcp/src/mcp_tools/paas_client.ts:1-56`（imports + 顶层 `resolveDeviceOrRespond` 函数）
- Modify: `sensecraft_data_mcp/src/mcp_tools/paas_client.ts:61-91`（`register_device` 工具，移除 `rememberDevice` 调用）
- Modify: `sensecraft_data_mcp/src/mcp_tools/paas_client.ts:92-234`（其余 4 个工具，改用新的异步解析方法）
- Modify: `sensecraft_data_mcp/src/mcp_tools/paas_client.ts:239-265`（`_doHttp` 所在的类体内新增两个私有方法）
- Delete: `sensecraft_data_mcp/src/mcp_tools/device_registry.ts`

**Interfaces:**
- Consumes: `resolveDeviceRef(input: string, devices: DeviceInfo[]): DeviceResolution`、`DeviceInfo`（来自 Task 2 的 `device_resolver.ts`）。
- Produces: `PaasClient._listDevices(): Promise<DeviceInfo[]>`、`PaasClient._viewDeviceStatus(euis: string[]): Promise<DeviceRunningStatus[]>`、`PaasClient._resolveDeviceOrRespond(rawInput: string): Promise<{ok: true, eui: string, label: string} | {ok: false, result: ToolCallResult}>` — 供 Task 4/5 的新工具、以及本任务里改造的 4 个既有工具共同使用。

- [ ] **Step 1: 替换文件顶部 import 与移除顶层 `resolveDeviceOrRespond` 函数**

把 `paas_client.ts` 第 1-56 行：

```ts
import {globalSetting as setting} from '../config/config'
import {getLogger} from '../logger'
import axios, { AxiosResponse } from 'axios';
import {McpRegister, ToolItem} from './mcp_register'
import {z} from 'zod'
import {wrapTell, wrapAsk, wrapFail, summarizeTelemetryPayload, ToolCallResult} from './response'
import {rememberDevice, resolveDeviceRef, DeviceCandidate} from './device_registry'
```
到
```ts
function resolveDeviceOrRespond(rawInput: string): {ok: true, eui: string, label: string} | {ok: false, result: ToolCallResult} {
    const resolution = resolveDeviceRef(rawInput)
    if (resolution.confident && resolution.eui) {
        return {ok: true, eui: resolution.eui, label: resolution.matchedName ?? rawInput}
    }
    if (resolution.candidates.length > 0) {
        const names = resolution.candidates.map((c: DeviceCandidate) => c.deviceName).join('、')
        return {
            ok: false,
            result: wrapAsk(`没有找到明确匹配"${rawInput}"的设备，候选有：${names}。请明确是哪一个，或直接提供设备EUI。`, {candidates: resolution.candidates})
        }
    }
    return {
        ok: false,
        result: wrapFail(`没有找到名为"${rawInput}"的设备，请提供设备EUI，或先用register_device注册该设备。`)
    }
}
```

替换为：

```ts
import {globalSetting as setting} from '../config/config'
import {getLogger} from '../logger'
import axios, { AxiosResponse } from 'axios';
import {McpRegister, ToolItem} from './mcp_register'
import {z} from 'zod'
import {wrapTell, wrapAsk, wrapFail, summarizeTelemetryPayload, ToolCallResult} from './response'
import {resolveDeviceRef, DeviceInfo} from './device_resolver'
```

（删掉整个顶层 `resolveDeviceOrRespond` 函数——它在 Step 3 里变成 `PaasClient` 类的私有方法 `_resolveDeviceOrRespond`。）

- [ ] **Step 2: 在 `register_device` 工具里移除 `rememberDevice` 调用**

把（原第 61-91 行 `register_device` 工具体内）：

```ts
                    if (result.code === '0') {
                        let data = result.data
                        if (data && data.eui) {
                            logger.info(`register_device(eui:${data.eui}) successfully`)
                            rememberDevice(deviceName, data.eui)
                            return wrapTell(`设备"${deviceName}"注册成功，EUI为${data.eui}。`, {deviceName, eui: data.eui}, true)
                        }
                    }
```

替换为：

```ts
                    if (result.code === '0') {
                        let data = result.data
                        if (data && data.eui) {
                            logger.info(`register_device(eui:${data.eui}) successfully`)
                            return wrapTell(`设备"${deviceName}"注册成功，EUI为${data.eui}。`, {deviceName, eui: data.eui}, true)
                        }
                    }
```

（不再需要本地记住设备名——之后任何工具需要按名字找这个设备时，会直接现查 `/list_devices`，PaaS 服务端本来就知道这次绑定时起的名字。）

- [ ] **Step 3: 把其余 4 个工具的 `resolveDeviceOrRespond(...)` 调用改为 `await this._resolveDeviceOrRespond(...)`**

在 `get_device_key` 工具体内，把：
```ts
                const resolved = resolveDeviceOrRespond(nodeEuiInput)
```
改为：
```ts
                const resolved = await this._resolveDeviceOrRespond(nodeEuiInput)
```

在 `view_latest_telemetry_data` 工具体内，把：
```ts
                const resolved = resolveDeviceOrRespond(device_eui_input)
```
改为：
```ts
                const resolved = await this._resolveDeviceOrRespond(device_eui_input)
```

在 `list_telemetry_data` 工具体内，把：
```ts
                const resolved = resolveDeviceOrRespond(param.device_eui)
```
改为：
```ts
                const resolved = await this._resolveDeviceOrRespond(param.device_eui)
```

在 `aggregate_chart_points` 工具体内，把：
```ts
                const resolved = resolveDeviceOrRespond(param.device_eui)
```
改为：
```ts
                const resolved = await this._resolveDeviceOrRespond(param.device_eui)
```

这 4 处的 `item: async (param): Promise<ToolCallResult> => {...}` 已经是 `async` 函数（现有代码本来就是），所以加 `await` 不需要额外改函数签名。

- [ ] **Step 4: 在 `PaasClient` 类体内新增 3 个私有方法**

在 `paas_client.ts` 的 `_doHttp` 方法后面（原第 265 行 `}` 之前，也就是紧挨着类的结尾 `}` 之前）插入：

```ts

    private async _listDevices(): Promise<DeviceInfo[]> {
        const result = await this._doHttp<JsonResponse>("get", "/openapi/list_devices")
        if (result.code !== '0' || !Array.isArray(result.data)) {
            return []
        }
        return (result.data as Array<{device_eui: string, device_name: string}>).map((d) => ({
            deviceName: d.device_name,
            eui: d.device_eui
        }))
    }

    private async _viewDeviceStatus(euis: string[]): Promise<DeviceRunningStatus[]> {
        if (euis.length === 0) return []
        const result = await this._doHttp<JsonResponse>("post", "/openapi/view_device_running_status", {device_euis: euis})
        if (result.code !== '0' || !Array.isArray(result.data)) {
            return []
        }
        return result.data as DeviceRunningStatus[]
    }

    private async _resolveDeviceOrRespond(rawInput: string): Promise<{ok: true, eui: string, label: string} | {ok: false, result: ToolCallResult}> {
        const devices = await this._listDevices()
        const resolution = resolveDeviceRef(rawInput, devices)
        if (resolution.confident && resolution.eui) {
            return {ok: true, eui: resolution.eui, label: resolution.matchedName ?? rawInput}
        }
        if (resolution.candidates.length > 0) {
            const names = resolution.candidates.map((c) => c.deviceName).join('、')
            return {
                ok: false,
                result: wrapAsk(`没有找到明确匹配"${rawInput}"的设备，候选有：${names}。请明确是哪一个，或直接提供设备EUI。`, {candidates: resolution.candidates})
            }
        }
        return {
            ok: false,
            result: wrapFail(`没有找到名为"${rawInput}"的设备，请提供设备EUI，或先用register_device注册该设备。`)
        }
    }
```

在文件顶部的 `class JsonResponse {...}` 定义后面新增 `DeviceRunningStatus` 接口：

```ts
interface DeviceRunningStatus {
    device_eui: string
    latest_message_time: string
    online_status: number
    battery_status: number
    battery_digit: number
    expired_time: string
    be_quota: number | string
    report_frequency: number
}
```

- [ ] **Step 5: 编译确认没有类型错误**

```bash
cd sensecraft_data_mcp && npx tsc --noEmit
```
预期：无输出、退出码 0。若报 `resolveDeviceRef`/`DeviceInfo` 找不到，检查 Step 1 的 import 路径是否为 `./device_resolver`。

- [ ] **Step 6: 用真实凭据验证 4 个既有工具的设备解析行为没有回归**

先取容器里正在使用的真实凭据（这是当前已经部署、连着真实 PaaS 账号的容器）：

```bash
docker inspect sensecraft-data-mcp --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^(ACCESS_ID|ACCESS_KEY|SENSECRAFT_SITE_ENV)='
```

编译并跑一次 stdio 模式的 MCP server，手动发一条 `tools/call` 请求验证 `get_device_key` 能通过设备名（而不是 EUI）解析成功（把下面命令里的 `<ACCESS_ID>`/`<ACCESS_KEY>` 换成上一步拿到的真实值）：

```bash
cd sensecraft_data_mcp && npm run build
ACCESS_ID=<ACCESS_ID> ACCESS_KEY=<ACCESS_KEY> SENSECRAFT_SITE_ENV=china \
  node -e "
const {spawn} = require('child_process')
const proc = spawn('node', ['dist/index.js'], {env: process.env})
let buf = ''
proc.stdout.on('data', (d) => {
  buf += d.toString()
  const lines = buf.split('\n')
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const msg = JSON.parse(line)
      if (msg.id === 2) { console.log(JSON.stringify(msg, null, 2)); proc.kill(); process.exit(0) }
    } catch {}
  }
})
proc.stdin.write(JSON.stringify({jsonrpc:'2.0', id:1, method:'initialize', params:{protocolVersion:'2024-11-05', capabilities:{}, clientInfo:{name:'test',version:'0'}}}) + '\n')
setTimeout(() => {
  proc.stdin.write(JSON.stringify({jsonrpc:'2.0', method:'notifications/initialized', params:{}}) + '\n')
  proc.stdin.write(JSON.stringify({jsonrpc:'2.0', id:2, method:'tools/call', params:{name:'get_device_key', arguments:{nodeEui:'Test-AP Holland'}}}) + '\n')
}, 300)
"
```

预期：返回结果里 `result.content[0].text` 解析后的 JSON 里 `say` 字段是"已获取到设备"Test-AP Holland"的密钥信息。"这类内容，而不是"没有找到名为...的设备"——证明按名字（而不是本地缓存里的别名）也能实时解析成功。

- [ ] **Step 7: 删除旧的 `device_registry.ts`**

```bash
git rm sensecraft_data_mcp/src/mcp_tools/device_registry.ts
```

再跑一次编译确认没有任何文件还在引用它：

```bash
cd sensecraft_data_mcp && npx tsc --noEmit
```
预期：无输出、退出码 0。

- [ ] **Step 8: Commit**

```bash
git add sensecraft_data_mcp/src/mcp_tools/paas_client.ts
git commit -m "feat: 设备解析改为实时查询 /list_devices，删除本地别名缓存 device_registry.ts"
```

---

### Task 4: 修复 `list_telemetry_data` 接口路径 bug + 恢复具体错误信息

**Files:**
- Modify: `sensecraft_data_mcp/src/mcp_tools/paas_client.ts`（`list_telemetry_data` 工具的 URL；全部 7 处 `catch` 块）

**Interfaces:**
- 无新增接口，纯 bug 修复与错误信息改进，不影响其他任务的类型签名。

- [ ] **Step 1: 修复 `list_telemetry_data` 调用了错误端点的 bug**

在 `list_telemetry_data` 工具体内，把：
```ts
                let url = '/openapi/view_latest_telemetry_data'
                try {
                    let result = await this._doHttp<JsonResponse>("get", url, {...param, device_eui: resolved.eui})
```
改为：
```ts
                let url = '/openapi/list_telemetry_data'
                try {
                    let result = await this._doHttp<JsonResponse>("get", url, {...param, device_eui: resolved.eui})
```

- [ ] **Step 2: 确认修复后端点返回的真实结构——与 `view_latest_telemetry_data` 完全不同，不需要额外处理**

本次会话里已经用真实凭据验证过这个端点，返回结构如下（`device_eui=2CF7F1696251000C`, `limit=3`）：

```json
{
  "code": "0",
  "data": {
    "list": [
      [[10, "4098"], [10, "4097"], [10, "4099"]],
      [[[92.62, "2026-07-10T02:44:45.303Z"]], [[26.57, "2026-07-10T02:44:45.303Z"]], [[4570, "2026-07-10T02:44:45.303Z"]]]
    ]
  }
}
```

`data.list` 是一个二元数组：`list[0]` 是 `[channel_index, measurement_id]` 对的列表（每个对应一条数据序列），`list[1]` 是与之一一对应的 `[value, timestamp]` 点位列表。这和 `view_latest_telemetry_data` 的 `{channel_index, points:[{measurement_id, measurement_value, time}]}` 结构完全不同，是一种按位置对齐的列式编码。

**范围决定**：本任务只修复"调用了错误端点"这个问题（之前是把真实存在但语义错误的"最新值"数据伪装成"历史数据"返回，这是比"返回不好看的数据"更危险的问题——语音助手会拿着看起来正常的数字说出错误的时间范围结论）。修完 URL 之后，`result.data` 会是上面这种列式结构，现有 `summarizeTelemetryPayload`（`response.ts`）对不认识的 object 形状有通用兜底文案（"查询到设备遥测数据，具体数值见data字段"），不会崩溃，`data` 字段里是真实、正确的历史数据，只是没有格式化成人话。**把这种列式结构解析成人话播报是 Phase 2 `get_device_trend` 的工作范围**，不在本任务内重复实现——本任务的唯一目标是让 `list_telemetry_data` 工具返回真实、正确语义的数据，而不是把错误端点返回的数据包装得好看。

验证命令（用真实凭据重放一次，确认没有变化）：
```bash
ACCESS_ID=<ACCESS_ID> ACCESS_KEY=<ACCESS_KEY>
TOKEN=$(printf '%s:%s' "$ACCESS_ID" "$ACCESS_KEY" | base64)
curl -sS "https://sensecap.seeed.cn/openapi/list_telemetry_data?device_eui=2CF7F1696251000C&limit=3" \
  -H "Authorization: Basic $TOKEN" -H "Content-Type: application/json" | python3 -m json.tool
```
预期：输出与上面贴的真实结构一致（`code: "0"`，`data.list` 是二元数组）。

- [ ] **Step 3: 在全部 7 个工具（含 Task 5/6 新增的 2 个）的 `catch` 块里补充具体错误原因**

以 `register_device` 为例，把：
```ts
                } catch (e) {
                    logger.error(`register_device encounter error: ${e}`)
                    return wrapFail("注册失败，请稍后重试")
                }
```
改为：
```ts
                } catch (e) {
                    logger.error(`register_device encounter error: ${e}`)
                    return wrapFail(`注册失败：${e instanceof Error ? e.message : String(e)}`)
                }
```

对 `get_device_key`、`view_latest_telemetry_data`、`list_telemetry_data`、`aggregate_chart_points` 这 4 个工具的 `catch` 块做同样的改法（各自把提示语前缀换成对应工具的失败描述，例如"查询deviceKey失败：${...}"）。`register_device`/`get_device_key`/`view_latest_telemetry_data`/`list_telemetry_data`/`aggregate_chart_points` 共 5 处；Task 5/6 新增的 `get_farm_overview`/`get_device_reading` 从一开始就按这个模式写（见 Task 5/6），不需要在本任务里重复处理。

理由：`_doHttp` 捕获到的 axios 异常（网络错误、超时、DNS 失败等）此前被压扁成统一的"请稍后重试"，用户/语音助手完全无法判断是凭据问题还是网络问题；PaaS 业务错误码（`FAULT` 表）走的是另一条路径（`if (FAULT[result.code])`），已经是具体提示，不受本次改动影响。

- [ ] **Step 4: 编译确认无类型错误**

```bash
cd sensecraft_data_mcp && npx tsc --noEmit
```
预期：无输出、退出码 0。

- [ ] **Step 5: Commit**

```bash
git add sensecraft_data_mcp/src/mcp_tools/paas_client.ts
git commit -m "fix: list_telemetry_data 调用了错误的接口路径；恢复 catch 块里的具体错误原因"
```

---

### Task 5: `get_farm_overview()` 工具

**Files:**
- Modify: `sensecraft_data_mcp/src/mcp_tools/paas_client.ts`（`tools()` 方法内新增一个 `result.push({...})` 条目）

**Interfaces:**
- Consumes: `this._listDevices()`、`this._viewDeviceStatus(euis)`（Task 3 产出）。

- [ ] **Step 1: 在 `tools()` 方法末尾、`return result` 之前新增工具**

在 `aggregate_chart_points` 那个 `result.push({...})` 块之后、`return result;` 之前插入：

```ts
        result.push({
            name: "get_farm_overview",
            description: "查询账号下所有设备的总览：有几台设备、谁在线谁离线、电量情况、最后一次上报是什么时候。异常设备（离线、低电量、长时间未上报）会被优先播报，健康设备只汇总数量，不逐一念出。",
            paramsSchema: {},
            item: async (): Promise<ToolCallResult> => {
                logger.debug("get_farm_overview...")
                try {
                    const devices = await this._listDevices()
                    if (devices.length === 0) {
                        return wrapTell("你的账号下还没有绑定任何设备。")
                    }

                    const statuses = await this._viewDeviceStatus(devices.map((d) => d.eui))
                    const statusByEui = new Map(statuses.map((s) => [s.device_eui, s]))

                    const now = Date.now()
                    const problems: string[] = []
                    let healthyCount = 0

                    for (const device of devices) {
                        const status = statusByEui.get(device.eui)
                        if (!status) {
                            continue
                        }
                        const lastReportMs = new Date(status.latest_message_time).getTime()
                        const minutesSinceReport = (now - lastReportMs) / 60000
                        const isOffline = status.online_status === 0
                        const isLowBattery = status.battery_digit < 30
                        const isStale = status.report_frequency > 0 && minutesSinceReport > status.report_frequency * 2

                        if (isOffline || isLowBattery || isStale) {
                            const reasons: string[] = []
                            if (isOffline) reasons.push("离线")
                            if (isStale && !isOffline) reasons.push(`已经${Math.round(minutesSinceReport)}分钟没有新数据了`)
                            if (isLowBattery) reasons.push(`电量还剩${status.battery_digit}%`)
                            problems.push(`${device.deviceName}：${reasons.join('，')}`)
                        } else {
                            healthyCount++
                        }
                    }

                    let say = `你一共有${devices.length}台设备。`
                    if (problems.length > 0) {
                        say += problems.join('；') + '。'
                        if (healthyCount > 0) {
                            say += `其余${healthyCount}台设备在线正常。`
                        }
                    } else {
                        say += '全部在线正常。'
                    }
                    return wrapTell(say, {devices, statuses})
                } catch (e) {
                    logger.error(`get_farm_overview encounter error: ${e}`)
                    return wrapFail(`获取设备总览失败：${e instanceof Error ? e.message : String(e)}`)
                }
            }
        })
```

- [ ] **Step 2: 编译确认无类型错误**

```bash
cd sensecraft_data_mcp && npx tsc --noEmit
```
预期：无输出、退出码 0。

- [ ] **Step 3: 用真实凭据端到端验证**

复用 Task 3 Step 6 的 stdio 探测脚本模式，把 `tools/call` 的 `params` 换成：
```json
{"name":"get_farm_overview","arguments":{}}
```
（把 Task 3 Step 6 命令里的 `nodeEui:'Test-AP Holland'` 那一行整个替换成上面这行，其余不变，`ACCESS_ID`/`ACCESS_KEY`/`SENSECRAFT_SITE_ENV` 沿用同一份真实凭据。）

预期：返回的 `say` 字段类似"你一共有3台设备。Test-AP Holland：离线，已经...分钟没有新数据了；2CF7F16930210038：离线，电量还剩1%。其余1台设备在线正常。"——这应该和本次会话前面用 curl 直接查到的 3 台真实设备状态（`2CF7F1696251000C` 在线电量100、`2CF7F1695511000C` 离线电量100、`2CF7F16930210038` 离线电量1）一致。

- [ ] **Step 4: Commit**

```bash
git add sensecraft_data_mcp/src/mcp_tools/paas_client.ts
git commit -m "feat: 新增 get_farm_overview 工具，异常优先播报设备总览"
```

---

### Task 6: `get_device_reading(device)` 工具

**Files:**
- Modify: `sensecraft_data_mcp/src/mcp_tools/paas_client.ts`（顶部新增 import；`tools()` 方法内新增一个 `result.push({...})` 条目）

**Interfaces:**
- Consumes: `this._resolveDeviceOrRespond(rawInput)`、`this._viewDeviceStatus(euis)`（Task 3 产出）、`formatMeasurement(measurementId, value)`（Task 1 产出）。

- [ ] **Step 1: 新增 import**

在 `paas_client.ts` 顶部（Task 3 Step 1 改过的 import 块）新增一行：
```ts
import {formatMeasurement} from './measurement_catalog'
```

- [ ] **Step 2: 在 `tools()` 方法末尾、`return result` 之前新增工具**

紧接着 Task 5 新增的 `get_farm_overview` 之后插入：

```ts
        result.push({
            name: "get_device_reading",
            description: "查询某一个设备当前的详细读数（该设备全部通道的最新数据）以及电量、在线状态，返回一段可以直接播报的文字。设备可以用口语化名称或EUI指定。",
            paramsSchema: {
                device: z.string()
            },
            item: async (param): Promise<ToolCallResult> => {
                const rawInput = param.device
                logger.debug(`get_device_reading for device: ${rawInput} .....`)
                try {
                    const resolved = await this._resolveDeviceOrRespond(rawInput)
                    if (resolved.ok === false) return resolved.result

                    const [telemetryResult, statuses] = await Promise.all([
                        this._doHttp<JsonResponse>("get", "/openapi/view_latest_telemetry_data", {device_eui: resolved.eui}),
                        this._viewDeviceStatus([resolved.eui])
                    ])

                    if (telemetryResult.code !== '0') {
                        if (FAULT[telemetryResult.code]) {
                            return wrapFail(`查询设备读数失败，原因：${FAULT[telemetryResult.code]}`, {code: telemetryResult.code})
                        }
                        return wrapFail("查询设备读数失败，请稍后重试")
                    }

                    const channels = (telemetryResult.data ?? []) as Array<{channel_index: number, points: Array<{measurement_id: string, measurement_value: number}>}>
                    const readings: string[] = []
                    for (const channel of channels) {
                        for (const point of channel.points) {
                            readings.push(formatMeasurement(point.measurement_id, point.measurement_value))
                        }
                    }

                    if (readings.length === 0) {
                        return wrapTell(`设备"${resolved.label}"目前还没有遥测数据。`)
                    }

                    let say = `设备"${resolved.label}"：${readings.join('，')}。`
                    const status = statuses[0]
                    if (status) {
                        say += `电量${status.battery_digit}%，${status.online_status === 1 ? '在线' : '离线'}。`
                    }
                    return wrapTell(say, {readings, status})
                } catch (e) {
                    logger.error(`get_device_reading encounter error: ${e}`)
                    return wrapFail(`查询设备读数失败：${e instanceof Error ? e.message : String(e)}`)
                }
            }
        })
```

- [ ] **Step 3: 编译确认无类型错误**

```bash
cd sensecraft_data_mcp && npx tsc --noEmit
```
预期：无输出、退出码 0。

- [ ] **Step 4: 用真实凭据端到端验证**

同 Task 5 Step 3 的探测方式，`tools/call` 的 `params` 换成：
```json
{"name":"get_device_reading","arguments":{"device":"大棚"}}
```
（`2CF7F1696251000C` 的真实设备名是"TCL国际E城党群服务中心自动气象环境监测站"，不包含"大棚"字样——这一步先验证模糊匹配在真实、不完全匹配的输入下的行为：预期分数不足以自信匹配，应返回 `wrapAsk` 或 `wrapFail`，而不是误报成功。）

再验证一次精确匹配：把 `device` 换成 `"Test-AP Holland"`，预期返回的 `say` 字段包含该设备电量与在线状态的描述（Test-AP Holland 目前离线，预期读数部分可能为空或为最后一次的遥测值，视 PaaS 实际返回而定）。

再验证一次全通道播报的核心场景：把 `device` 换成 `"2CF7F1696251000C"`（直接用 EUI，跳过模糊匹配），预期 `say` 字段类似"设备"TCL国际E城党群服务中心自动气象环境监测站"：气温26.52℃，湿度92.67%RH，光照强度4410Lux，气压100160Pa，风向183.8°，风速0m/s，每小时降雨量0mm/h。电量100%，在线。"——这是本次 Phase 1 最核心的验收场景，必须逐字段核对翻译是否正确。

- [ ] **Step 5: Commit**

```bash
git add sensecraft_data_mcp/src/mcp_tools/paas_client.ts
git commit -m "feat: 新增 get_device_reading 工具，单设备全通道播报"
```

---

### Task 7: 端到端冒烟测试（真实 Docker 容器）

**Files:**
- 无代码改动，仅构建与部署验证。

- [ ] **Step 1: 重新构建镜像**

```bash
cd sensecraft_data_mcp && docker build -t sensecraft_data_mcp-sensecraft-data-mcp:phase1 .
```
预期：构建成功，无报错。

- [ ] **Step 2: 用与当前生产容器相同的凭据起一个临时容器**

```bash
SCRATCH=/private/tmp/claude-501/-Users-spencer-Seeed-d-sensecraft-mcp/32e572b0-2f34-4e32-8244-31463d296b5e/scratchpad
docker inspect sensecraft-data-mcp --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(ACCESS_ID|ACCESS_KEY|SENSECRAFT_SITE_ENV|MCP_ENDPOINT)=' > "$SCRATCH/phase1-test.env"
docker run -d --name sensecraft-data-mcp-phase1-test \
  --env-file "$SCRATCH/phase1-test.env" \
  sensecraft_data_mcp-sensecraft-data-mcp:phase1
sleep 5
docker logs sensecraft-data-mcp-phase1-test 2>&1 | tail -20
```
预期：日志出现 9 条 `tool(...) add to mcp server successfully!!`（原有 5 个 + 本次新增 `get_farm_overview`/`get_device_reading` 共 7 个——等等，`register_device`/`get_device_key`/`view_latest_telemetry_data`/`list_telemetry_data`/`aggregate_chart_points`/`get_farm_overview`/`get_device_reading` 共 7 个 PaaS 工具 + `list_all_code`/`read_code_file` 2 个代码模板工具 = 共 9 条），以及 `connected to XiaoZhi MCP endpoint`（沿用已修复的 ws 连接，不应再出现 `ReferenceError: WebSocket is not defined`）。

- [ ] **Step 3: 清理临时容器与凭据文件**

```bash
docker rm -f sensecraft-data-mcp-phase1-test
rm -f "$SCRATCH/phase1-test.env"
```

- [ ] **Step 4: 请求用户确认是否要把这个镜像换上生产容器**

这一步不自动执行——把生产容器换成 Phase 1 镜像属于用户此前明确要求"我来决定"的操作类别（此前 ws 修复时的换镜像也是每次都先说明步骤再执行）。跑完 Step 1-3 后，向用户报告验证结果，由用户决定是否要现在就替换生产容器、还是先走 Task 8 更新 `sensecraft-solutions` 的工具列表文案之后再一起换。
