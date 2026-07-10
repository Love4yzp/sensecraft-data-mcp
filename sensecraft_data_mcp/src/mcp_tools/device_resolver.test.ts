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
