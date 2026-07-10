import {globalSetting as setting} from '../config/config'
import {getLogger} from '../logger'
import axios, { AxiosResponse } from 'axios';
import {McpRegister, ToolItem} from './mcp_register'
import {z} from 'zod'
import {wrapTell, wrapAsk, wrapFail, summarizeTelemetryPayload, ToolCallResult} from './response'
import {resolveDeviceRef, DeviceInfo} from './device_resolver'

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

export class PaasClient implements McpRegister {
    tools(): ToolItem[] {
        let result: ToolItem[] = [];
        result.push({
            name: "register_device",
            description: "向sensecraft data(sensecap paas)平台注册设备, 会返回设备的eui",
            paramsSchema: {
                deviceName: z.string()
            },
            item: async (param): Promise<ToolCallResult> => {
                let deviceName = param.deviceName
                logger.debug(`register_device for deviceName: ${deviceName} .....`)
                let url = '/openapi/device/create_development_kit'
                try {
                    let result = await this._doHttp<JsonResponse>("post", url, {"dev_name": deviceName, "sku": "blank_device"})
                    if (result.code === '0') {
                        let data = result.data
                        if (data && data.eui) {
                            logger.info(`register_device(eui:${data.eui}) successfully`)
                            return wrapTell(`设备"${deviceName}"注册成功，EUI为${data.eui}。`, {deviceName, eui: data.eui}, true)
                        }
                    }
                    if (FAULT[result.code]) {
                        return wrapFail(`注册失败，原因：${FAULT[result.code]}`, {code: result.code})
                    }
                    logger.info(`register_device error, response: ${result.data}`)
                    return wrapFail("注册失败，请稍后重试")
                } catch (e) {
                    logger.error(`register_device encounter error: ${e}`)
                    return wrapFail(`注册失败：${e instanceof Error ? e.message : String(e)}`)
                }
            }
        })
        result.push({
            name: "get_device_key",
            description: "根据sensecraft data(sensecap paas)平台的设备名称或eui获取设备的device_key和token",
            paramsSchema: {
                nodeEui: z.string()
            },
            item: async (param): Promise<ToolCallResult> => {
                let nodeEuiInput = param.nodeEui
                logger.debug(`get_device_key for nodeEui: ${nodeEuiInput} .....`)

                let url = '/openapi/device/view_node_key'
                try {
                    const resolved = await this._resolveDeviceOrRespond(nodeEuiInput)
                    if (resolved.ok === false) return resolved.result
                    let nodeEui = resolved.eui

                    let result = await this._doHttp<JsonResponse>("get", url, {"node_eui": nodeEui})
                    if (result.code === '0') {
                        return wrapTell(`已获取到设备"${resolved.label}"的密钥信息。`, result.data)
                    }
                    if (FAULT[result.code]) {
                        return wrapFail(`查询deviceKey失败，原因：${FAULT[result.code]}`, {code: result.code})
                    }
                    logger.info(`get_device_key error, response: ${result.data}`)
                    return wrapFail("查询deviceKey失败，请稍后重试")
                } catch (e) {
                    logger.error(`get_device_key encounter error: ${e}`)
                    return wrapFail(`查询deviceKey失败：${e instanceof Error ? e.message : String(e)}`)
                }
            }
        })
        result.push({
            name: "view_latest_telemetry_data",
            description: "根据sensecraft data(sensecap paas)平台的设备名称或device_eui、channel_index、measurement_id获取最新遥测数据." +
                "返回该设备一年内最新的遥测数据,如果没指定channel_index则返回设备每个通道下最新的数据点。",
            paramsSchema: {
                device_eui: z.string(),
                channel_index: z.number().optional(),
                measurement_id: z.number().optional()
            },
            item: async (param): Promise<ToolCallResult> => {
                let device_eui_input = param.device_eui
                let channel_index = param.channel_index
                let measurement_id = param.measurement_id
                logger.debug(`view_latest_telemetry_data for deviceEui-channelIndex-measurementId: ${device_eui_input}-${channel_index}-${measurement_id} .....`)

                let url = '/openapi/view_latest_telemetry_data'
                try {
                    const resolved = await this._resolveDeviceOrRespond(device_eui_input)
                    if (resolved.ok === false) return resolved.result

                    let result = await this._doHttp<JsonResponse>("get", url, {
                        "device_eui": resolved.eui,
                        "channel_index": channel_index,
                        "measurement_id": measurement_id
                    })
                    if (result.code === '0') {
                        const {say, data} = summarizeTelemetryPayload(result.data)
                        return wrapTell(`设备"${resolved.label}"：${say}`, data)
                    }
                    if (FAULT[result.code]) {
                        return wrapFail(`获取最新遥测数据失败，原因：${FAULT[result.code]}`, {code: result.code})
                    }
                    logger.info(`view_latest_telemetry_data error, response: ${result.data}`)
                    return wrapFail("获取最新遥测数据失败，请稍后重试")
                } catch (e) {
                    logger.error(`view_latest_telemetry_data encounter error: ${e}`)
                    return wrapFail(`获取最新遥测数据失败：${e instanceof Error ? e.message : String(e)}`)
                }
            }
        })
        result.push({
            name: "list_telemetry_data",
            description: "根据sensecraft data(sensecap paas)平台的设备名称或device_eui、channel_index、measurement_id获取指定设备的历史遥测数据" +
                "最长返回一个月的数据 只能查询最近三个月内的数据(通过time_start/time_end控制查询范围), limit 控制返回的数据条数",
            paramsSchema: {
                device_eui: z.string(),
                channel_index: z.number().optional(),
                measurement_id: z.number().optional(),
                limit: z.number().optional(),
                time_start: z.number().optional(),
                time_end: z.number().optional()
            },
            item: async (param): Promise<ToolCallResult> => {
                logger.debug(`list_telemetry_data for param: ${JSON.stringify(param)} .....`)

                let url = '/openapi/list_telemetry_data'
                try {
                    const resolved = await this._resolveDeviceOrRespond(param.device_eui)
                    if (resolved.ok === false) return resolved.result

                    let result = await this._doHttp<JsonResponse>("get", url, {...param, device_eui: resolved.eui})
                    if (result.code === '0') {
                        const {say, data} = summarizeTelemetryPayload(result.data)
                        return wrapTell(`设备"${resolved.label}"：${say}`, data)
                    }
                    if (FAULT[result.code]) {
                        return wrapFail(`获取指定设备的历史遥测数据失败，原因：${FAULT[result.code]}`, {code: result.code})
                    }
                    logger.info(`list_telemetry_data error, response: ${result.data}`)
                    return wrapFail("获取指定设备的历史遥测数据失败，请稍后重试")
                } catch (e) {
                    logger.error(`list_telemetry_data encounter error: ${e}`)
                    return wrapFail(`获取指定设备的历史遥测数据失败：${e instanceof Error ? e.message : String(e)}`)
                }
            }
        })
        result.push({
            name: "aggregate_chart_points",
            description: "根据sensecraft data(sensecap paas)平台的设备名称或device_eui、channel_index、measurement_id获取设备遥测数据折线图" +
                "将庞大的数据段分成小数据段，然后输出每个小段的平均值，最长返回一年的数据，每个测量量最多返回250个点，超过250个点将自动重新划分时间段返回250个点.",
            paramsSchema: {
                device_eui: z.string(),
                channel_index: z.number().optional(),
                measurement_id: z.number().optional(),
                interval: z.number().optional(),
                time_start: z.number().optional(),
                time_end: z.number().optional()
            },
            item: async (param): Promise<ToolCallResult> => {
                logger.debug(`aggregate_chart_points for param: ${JSON.stringify(param)} .....`)

                let url = '/openapi/aggregate_chart_points'
                try {
                    const resolved = await this._resolveDeviceOrRespond(param.device_eui)
                    if (resolved.ok === false) return resolved.result

                    let result = await this._doHttp<JsonResponse>("get", url, {...param, device_eui: resolved.eui})
                    if (result.code === '0') {
                        const {say, data} = summarizeTelemetryPayload(result.data)
                        return wrapTell(`设备"${resolved.label}"：${say}`, data)
                    }
                    if (FAULT[result.code]) {
                        return wrapFail(`获取设备遥测数据折线图失败，原因：${FAULT[result.code]}`, {code: result.code})
                    }
                    logger.info(`aggregate_chart_points error, response: ${result.data}`)
                    return wrapFail("获取设备遥测数据折线图失败，请稍后重试")
                } catch (e) {
                    logger.error(`aggregate_chart_points encounter error: ${e}`)
                    return wrapFail(`获取设备遥测数据折线图失败：${e instanceof Error ? e.message : String(e)}`)
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
                throw new Error(`HTTP Error: ${error.message}`);
            }
            throw error;
        }
    }

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

}
