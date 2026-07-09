# SenseCraft MCP

面向 SenseCAP / SenseCraft 生态的 [MCP](https://modelcontextprotocol.io)（Model Context Protocol）服务集合，让支持 MCP 的 AI 助手（如 Claude Desktop、Cursor 等）能够直接：

- 在 SenseCAP PaaS（sensecap.seeed.cc）开放平台上注册设备、查询密钥；
- 查询/聚合设备的遥测（传感器）数据；
- 读取并生成可直接用于 PlatformIO/Arduino 项目的采集与上报代码模板（WiFi 上报、温湿度采集、LED 控制等）。

## 项目结构

```
sensecraft_mcp/
├── sensecraft_data_mcp/   # 核心 MCP Server（可发布使用）
│   ├── src/
│   │   ├── index.ts              # MCP Server 入口（stdio transport）
│   │   ├── config/                # 环境变量与多环境配置
│   │   ├── mcp_tools/
│   │   │   ├── paas_client.ts     # 对接 SenseCAP PaaS openapi 的工具
│   │   │   └── code_reader.ts     # Arduino/PlatformIO 代码模板读取工具
│   │   └── static/arduino/        # 代码模板（.h/.cpp）
│   └── package.json
└── coding-assistant/       # 实验性/占位项目，尚未实现具体功能
```

## MCP 工具（Tools）一览

### PaaS 数据接口（`paas_client.ts`）

| Tool | 说明 |
| --- | --- |
| `register_device` | 向 SenseCAP PaaS 平台注册设备，返回设备 EUI |
| `get_device_key` | 根据设备 EUI 查询 `device_key` 和 `token` |
| `view_latest_telemetry_data` | 查询设备（按 channel/measurement）最新一年内的遥测数据 |
| `list_telemetry_data` | 查询指定时间范围内的历史遥测数据（最长一个月，仅限最近三个月） |
| `aggregate_chart_points` | 按时间段聚合遥测数据用于绘制折线图（最多返回 250 个点） |

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

## 技术栈

TypeScript · [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) · axios · zod · dotenv

## 其他子项目

- `coding-assistant/`：早期实验性项目，目前仅有骨架代码，功能尚未实现。
