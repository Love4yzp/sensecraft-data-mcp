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
