import fs from 'fs'
import path from 'path'
import os from 'os'
import {getLogger} from '../logger'

const logger = getLogger('deviceRegistry')

/**
 * The PaaS openapi only ever takes a device_eui/nodeEui, but a voice user says a
 * device *name* ("客厅温湿度计"), not a 16-hex EUI. There is no "search device by
 * name" endpoint to call, so we keep a small local alias cache: every device
 * successfully created through `register_device` is remembered here (name -> eui),
 * and later tools resolve a spoken name back to its eui via fuzzy match.
 *
 * Persisted under the user's home dir so it survives `npm run build` (which wipes dist/).
 */

const REGISTRY_DIR = path.join(os.homedir(), '.sensecraft_data_mcp')
const REGISTRY_FILE = path.join(REGISTRY_DIR, 'device_registry.json')

interface RegistryEntry {
    deviceName: string
    eui: string
    registeredAt: string
}

type Registry = Record<string, RegistryEntry>

function loadRegistry(): Registry {
    try {
        const raw = fs.readFileSync(REGISTRY_FILE, 'utf-8')
        return JSON.parse(raw)
    } catch {
        return {}
    }
}

function saveRegistry(registry: Registry): void {
    try {
        fs.mkdirSync(REGISTRY_DIR, {recursive: true})
        fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8')
    } catch (error) {
        logger.error(`failed to persist device registry: ${error}`)
    }
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

/** Called after a successful register_device so future queries can use the device's name. */
export function rememberDevice(deviceName: string, eui: string): void {
    const registry = loadRegistry()
    registry[normalizeText(deviceName)] = {
        deviceName,
        eui: normalizeEui(eui),
        registeredAt: new Date().toISOString()
    }
    saveRegistry(registry)
}

/**
 * Resolves a user-provided device reference (spoken name OR literal EUI) to an EUI.
 * Never guesses on a low-confidence match; instead returns candidates so the caller
 * can ask the user to disambiguate.
 */
export function resolveDeviceRef(input: string): DeviceResolution {
    const trimmed = String(input ?? '').trim()

    if (looksLikeEui(trimmed)) {
        return {confident: true, eui: normalizeEui(trimmed), wasLiteralEui: true, candidates: []}
    }

    const entries = Object.values(loadRegistry())
    const scored = entries
        .map((entry) => ({deviceName: entry.deviceName, eui: entry.eui, score: similarityScore(trimmed, entry.deviceName)}))
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
