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
