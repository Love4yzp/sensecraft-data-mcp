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
