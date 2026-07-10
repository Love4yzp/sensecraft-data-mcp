import {globalSetting as setting} from '../config/config'

/**
 * SenseCAP PaaS returns timestamps as raw UTC ISO strings (e.g. "2026-07-10T05:45:34.729Z").
 * The official Dashboard converts these to the farm's local time before display. If a raw
 * UTC string is handed to a voice-assistant LLM, it tends to read the digits as if they
 * were already local time, misstating the hour. Convert before it reaches `data`.
 *
 * The IANA zone comes from SENSECRAFT_TIMEZONE (deploy-time env var, same mechanism as
 * ACCESS_ID/MCP_ENDPOINT) so each deployment can point at wherever its devices actually
 * are, instead of assuming every account is on Beijing time. When it's not set we don't
 * guess — we label the value as UTC rather than silently mislabeling it as local.
 */
const TIMEZONE: string | undefined = process.env.SENSECRAFT_TIMEZONE || setting?.['SENSECRAFT_TIMEZONE']

const ZONE_LABELS: Record<string, string> = {
    'Asia/Shanghai': '北京时间',
    'UTC': 'UTC'
}

export function toLocalTimeString(isoUtc: string): string {
    const date = new Date(isoUtc)
    if (isNaN(date.getTime())) return isoUtc

    const timeZone = TIMEZONE || 'UTC'
    const parts = new Intl.DateTimeFormat('zh-CN', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(date)

    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    const label = ZONE_LABELS[timeZone] ?? `${timeZone} 时区`
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}（${label}）`
}
