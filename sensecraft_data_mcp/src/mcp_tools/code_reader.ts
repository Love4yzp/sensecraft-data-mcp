import path from 'path'
import fs from  'fs'
import {getLogger} from '../logger'
import {globalSetting as setting} from '../config/config'
import {McpRegister, ToolItem} from './mcp_register'
import {z} from 'zod'

const HOST_NAME = setting!!['SENSECRAFT_DATA_SERVER_URL']

let logger = getLogger("codeReader")

const RESOURCES_CONFIG = [
    {
        name: "sensecraft_http_measurement_send",
        uri: "file:///static/arduino/sensecraft_http_measurement_send.h",
        description: "向sensecraft data发送传感器测量结果的代码,接收参数为JsonDocument, 返回值true 表示数据发送成功, false 表示数据发送失败.",
        replaceHost: true
    },
    {
        name: "sensecraft_http_device_status_send",
        uri: "file:///static/arduino/sensecraft_http_device_status_send.h",
        description: "生成向sensecraft data平台发送设备实时状态(如电量,信号强度等)的代码,接收参数为JsonDocument.必须保存在和main.cpp同级目录.",
        replaceHost: true
    },
    {
        name: "tem_hum_collect",
        uri: "file:///static/arduino/tem_hum_collect.h",
        description: "获取当前环境的温湿度代码, 以JsonDocument格式返回.目前并没有打算通过引脚获取数据,仅是一个返回固定测量值的函数,用来验证数据上传功能正常.必须保存在和main.cpp同级目录. 此部分有涉及DHT设备读取的代码, 请在 platformIO 的配置文件platformio.ini中, 添加依赖:dfrobot/DFRobot_DHT20@^1.0.0",
        replaceHost: false
    },
    {
        name: "config",
        uri: "file:///static/arduino/config.h",
        description: "项目初始化后的全局统一配置文件,请把需要在项目里使用的配置添加到config.h中, 需要使用时根据保存路径导入config.h即可.必须保存在和main.cpp同级目录.",
        replaceHost: false
    },
    {
        name: "main",
        uri: "file:///static/arduino/main.cpp",
        description: "arduino 项目运行的主函数,也是程序运行的起点.通过修改这个文件可以修改启动时的配置与运行期间的功能.使用 platformio 开发的项目,这个函数文件必须保存在项目下的 src 文件夹下.",
        replaceHost: false
    },
    {
        name: "led_blink",
        uri: "file:///static/arduino/led_blink.h",
        description: "控制 led 闪烁的函数, 接受的参数为 int 类型的次数, 用来控制闪烁几次.需要保存在和main.cpp同级目录.必须保存在和main.cpp同级目录.",
        replaceHost: false
    }
]

logger.info(JSON.stringify(RESOURCES_CONFIG))

export class CodeReader implements McpRegister{

    rootPath: string

    constructor(rootPath) {
        this.rootPath = rootPath
    }

    tools(...args: any[]): ToolItem[] {
        let result = []
        result.push({
            name: "list_all_code",
            description: "列出现有的代码文件列表, 可根据代码的描述匹配符合要求的代码文件url,你可以根据返回的文件列表选择最符合用户需求的文件并读取文件的内容.如果列表中没有能实现客户需求的文件,就告诉客户:请明确告知不存在符合需求的代码!",
            paramsSchema: {},
            item: () => {
                logger.debug("list_all_code...")
                let list_code = []
                for (let fileItem of RESOURCES_CONFIG) {
                    list_code.push({
                        "type":"text",
                        "text": JSON.stringify({
                            uri: fileItem.uri,
                            name: fileItem.name,
                            description: fileItem.description,
                            mimeType: 'text/plain'
                        })
                    })
                }
                return {
                    content: list_code
                }
            }
        })
        result.push({
            name: "read_code_file",
            description: "根据文件uri获取代码文件,请根据提供的模板代码生成符合客户需求的内容生成时请注意用户项目的实际情况和代码模板的定义与描述.如果指定的文件uri不存在,就告诉客户:请明确告知不存在符合需求的代码!",
            paramsSchema: {
                uri: z.string()
            },
            item: (param) :any => {
                try {
                    let uri = param.uri
                    if (!uri || uri.length === 0) {
                        return {
                            content: [
                                {
                                    "type": "text",
                                    "text": "此文件链接为空,请提供有效的链接"
                                }
                            ]
                        }
                    }
                    logger.info(`read_code_file for uri:${uri}`)
                    for (let fileItem of RESOURCES_CONFIG) {
                        if (fileItem.uri !== uri) {
                            continue
                        }
                        let fileContent = this._read_template(uri)
                        if (fileItem.replaceHost) {
                            fileContent.replace("http://sensecapv1.seeed.cc/", HOST_NAME)
                        }
                        return {
                            content: [
                                {
                                    "type": "text",
                                    "text": JSON.stringify({
                                        fileContent: fileContent,
                                        description: fileItem.description
                                    })
                                }
                            ]
                        }
                    }
                    logger.info(`there is no file targeted by: ${uri}`)
                    return {
                        content: [
                            {
                                "type": "text",
                                "text": `此文件不存在:${JSON.stringify(uri)}`
                            }
                        ]
                    }
                } catch (e) {
                    logger.error(`read_file encounter error: ${e}`)
                    return {
                        content: [
                            {
                                "type": "text",
                                "text": `读取文件(uri: ${param.uri})失败, 请稍后重试`
                            }
                        ]
                    }
                }
            }
        })
        return result
    }

    _read_template(template_uri: string): string {
        let file_path = template_uri.replace("file://", "")
        return fs.readFileSync(path.join(this.rootPath, file_path)).toString()
    }

}

