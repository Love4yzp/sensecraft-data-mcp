import {globalSetting as setting} from '../config/config'
import {getLogger} from '../logger'
import axios, { AxiosResponse } from 'axios';
import {McpRegister, ToolItem} from './mcp_register'
import {z} from 'zod'

let logger = getLogger("paasClient")
const HOST_NAME = setting!!['SENSECRAFT_DATA_SERVER_URL']

const ACCESS_ID = process.env.ACCESS_ID
const ACCESS_KEY = process.env.ACCESS_KEY
if (!ACCESS_ID || !ACCESS_KEY) {
    logger.error(`ACCESS_ID or ACCESS_KEY is not set\n\tACCESS_ID: ${ACCESS_ID}\n\tACCESS_KEY: ${ACCESS_KEY}`)
    process.exit(1)
}
const TOKEN = `Basic ${Buffer.from(ACCESS_ID + ":" + ACCESS_KEY).toString('base64')}`

const FAULT = {
    "0": "访问成功",
    "11104": "AccessId或者accessKey错误",
    "11105": "AccessId已被禁用",
    "11201": "您没有权限进行此操作",
    "11202": "参数错误",
    "11206": "您已经创建了太多的设备",
    "11303": "您的账号下没有此设备"
}

class JsonResponse {
    code: string
    message?: string
    data?: any
}

export class PaasClient implements McpRegister {
    tools(...args: any[]): ToolItem[] {
        let result: ToolItem[] = [];
        result.push({
            name: "register_device",
            description: "向sensecraft data(sensecap paas)平台注册设备, 会返回设备的eui",
            paramsSchema: {
                deviceName: z.string()
            },
            item: async (param) => {
                let deviceName = param.deviceName
                logger.debug(`register_device for deviceName: ${deviceName} .....`)
                let url = '/openapi/device/create_development_kit'
                try {
                    let result = await this._doHttp<JsonResponse>("post", url, {"dev_name": deviceName, "sku": "blank_device"})
                    if (result.code === '0') {
                        let data = result.data
                        if (data && data.eui) {
                            logger.info(`register_device(eui:${data.eui}) successfully`)
                            return {
                                content: [
                                    {
                                        "type": "text",
                                        "text": JSON.stringify({
                                            eui: data.eui
                                        })
                                    }
                                ]
                            }
                        }
                    }
                    if (FAULT[result.code]) {
                        return {
                            content: [
                                {
                                    "type": "text",
                                    "text": `注册失败, 原因:${FAULT[result.code]}`
                                }
                            ]
                        }
                    }
                    logger.info(`register_device error, response: ${result.data}`)
                    return {
                        content: [
                            {
                                "type": "text",
                                "text": "注册失败, 请稍后重试"
                            }
                        ]
                    }
                } catch (e) {
                    logger.error(`register_device encounter error: ${e}`)
                    return {
                        content: [
                            {
                                "type": "text",
                                "text": "注册失败, 请稍后重试"
                            }
                        ]
                    }
                }
            }
        })
        result.push({
            name: "get_device_key",
            description: "根据sensecraft data(sensecap paas)平台的eui获取设备的device_key和token",
            paramsSchema: {
                nodeEui: z.string()
            },
            item: async (param) => {
                let nodeEui = param.nodeEui
                logger.debug(`get_device_key for nodeEui: ${nodeEui} .....`)
                let url = '/openapi/device/view_node_key'
                try {
                    let result = await this._doHttp<JsonResponse>("get", url, {"node_eui": nodeEui})
                    if (result.code === '0') {
                        return {
                            content: [
                                {
                                    "type": "text",
                                    "text": JSON.stringify(result.data)
                                }
                            ]
                        }
                    }
                    if (FAULT[result.code]) {
                        return {
                            content: [
                                {
                                    "type": "text",
                                    "text": `查询deviceKey失败, 原因:${FAULT[result.code]}`
                                }
                            ]
                        }
                    }
                    logger.info(`get_device_key error, response: ${result.data}`)
                    return {
                        content: [
                            {
                                "type": "text",
                                "text": "查询deviceKey失败, 请稍后重试"
                            }
                        ]
                    }
                } catch (e) {
                    logger.error(`get_device_key encounter error: ${e}`)
                    return {
                        content: [
                            {
                                "type": "text",
                                "text": "查询deviceKey失败, 请稍后重试"
                            }
                        ]
                    }
                }
            }
        })
        return result;
    }


    async _doHttp<JsonResponse>(method:string, path: string, params?: Record<string, any>): Promise<JsonResponse> {
        try {
            let response: AxiosResponse<JsonResponse>
            if (method === 'get') {
                response = await axios.get(`${HOST_NAME}${path}`, {
                    params,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': TOKEN
                    },
                });
            } else {
                response = await axios.post(`${HOST_NAME}${path}`, params, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': TOKEN
                    },
                });
            }
            return response.data
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`HTTP GET Error: ${error.message}`);
            }
            throw error;
        }
    }

}