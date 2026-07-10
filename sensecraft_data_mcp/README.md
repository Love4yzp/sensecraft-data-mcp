# SenseCraft MCP Server

面向 SenseCAP / SenseCraft 生态的 [MCP](https://modelcontextprotocol.io) Server，对接 SenseCAP PaaS（sensecap.seeed.cc）设备/遥测数据接口，并提供 Arduino/PlatformIO 代码模板读取工具。

## 安装与构建

```bash
npm install
npm run build
```

构建产物在 `dist/`，会同时拷贝 `.env*` 配置与 `static/` 模板文件。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `ACCESS_ID` / `ACCESS_KEY` | 是 | SenseCAP PaaS 开放平台的 API 凭据 |
| `SENSECRAFT_SITE_ENV` | 否 | `global`（默认，sensecap.seeed.cc）、`china`（国内站，sensecap.seeed.cn）或 `develop`（内部测试） |
| `SENSECRAFT_TIMEZONE` | 否 | 播报设备上报时间时使用的 IANA 时区（如 `Asia/Shanghai`）。`china` 站点默认已设为 `Asia/Shanghai`；其余站点不设置时会用 UTC 并明确标注，不会瞎猜时区 |
| `MCP_ENDPOINT` | 否 | 设置后以 WebSocket 客户端出站连接该地址（例如小智 ESP32 的 MCP 接入点），不设置则走 stdio |

## 用法一：stdio（Claude Desktop / Cursor 等）

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

## 用法二：接入小智 ESP32（XiaoZhi）的 MCP 接入点

在小智智控台拿到 `ws://<host>:8004/mcp_endpoint/mcp/?token=xxx` 这样的接入点地址后，直接启动：

```bash
MCP_ENDPOINT="ws://<host>:8004/mcp_endpoint/mcp/?token=xxx" \
ACCESS_ID=your-access-id \
ACCESS_KEY=your-access-key \
node dist/index.js
```

无需额外的 Python 桥接进程；断线会自动指数退避重连。详见仓库根目录 README 的[《接入小智 ESP32（XiaoZhi）》](../README.md#接入小智-esp32xiaozhi)一节。

## 工具（Tools）一览

| Tool | 说明 |
| --- | --- |
| `get_farm_overview` | 设备总览：几台设备、谁离线、谁电量低，异常优先播报 |
| `get_device_reading` | 按设备名称或 EUI 查询某一个设备当前全部通道的读数，格式化成一段可播报文字 |
| `register_device` | 注册设备并返回 EUI |
| `get_device_key` | 按设备名称或 EUI 查询 `device_key`/`token` |
| `view_latest_telemetry_data` | 查询最新遥测数据 |
| `list_telemetry_data` | 查询历史遥测数据 |
| `aggregate_chart_points` | 聚合遥测数据用于绘图 |
| `list_all_code` / `read_code_file` | 列出/读取 Arduino 代码模板 |

除 `register_device` 外，涉及设备的参数既可传设备名也可传 EUI，工具内部会做模糊匹配并在歧义时要求澄清。所有工具返回统一的 `{ success, facts: { executed }, say, say_kind, data }` 结构，便于语音助手直接口播 `say` 字段。
