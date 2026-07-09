/**
 * Voice-assistant-friendly response contract for MCP tools, following the same
 * anti-hallucination shape used by other XiaoZhi-facing MCP servers:
 *   { success, facts: { executed }, say, say_kind, data }
 *
 * - `say` is the exact text the voice assistant should speak. Never invent numbers,
 *   units or semantics that aren't actually present in `data`.
 * - `say_kind`: "tell" for a normal answer, "ask" when the user needs to disambiguate
 *   (see candidates in `data`), "fail" when the operation could not be completed.
 * - `facts.executed`: true only for write/control operations that actually changed
 *   something. Read-only queries are always false.
 */

export type SayKind = 'tell' | 'ask' | 'fail'

export interface WrappedResponse<T = unknown> {
    success: boolean
    facts: { executed: boolean }
    say: string
    say_kind: SayKind
    data?: T
}

export interface ToolCallResult {
    content: [{ type: 'text', text: string }]
}

function toToolResult(wrapped: WrappedResponse): ToolCallResult {
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(wrapped)
            }
        ]
    }
}

/** A successful read (executed=false) or write (executed=true) operation. */
export function wrapTell<T>(say: string, data?: T, executed = false): ToolCallResult {
    return toToolResult({success: true, facts: {executed}, say, say_kind: 'tell', data})
}

/** The request is ambiguous (e.g. multiple device name candidates) and needs user input. */
export function wrapAsk<T>(say: string, data?: T): ToolCallResult {
    return toToolResult({success: false, facts: {executed: false}, say, say_kind: 'ask', data})
}

/** The operation failed or did not execute. */
export function wrapFail<T>(say: string, data?: T): ToolCallResult {
    return toToolResult({success: false, facts: {executed: false}, say, say_kind: 'fail', data})
}

const MAX_ITEMS_IN_DATA = 200

/**
 * Turns a raw PaaS telemetry payload into a short, honest spoken summary without
 * guessing at field names, units, or semantics we don't actually know from the API.
 * The full (size-capped) payload is always preserved in `data` for the caller to inspect.
 */
export function summarizeTelemetryPayload(payload: unknown): { say: string, data: unknown } {
    if (payload === null || payload === undefined) {
        return {say: '没有查询到符合条件的遥测数据。', data: payload}
    }

    if (Array.isArray(payload)) {
        if (payload.length === 0) {
            return {say: '没有查询到符合条件的遥测数据。', data: payload}
        }
        const truncated = payload.length > MAX_ITEMS_IN_DATA
        const data = truncated ? payload.slice(0, MAX_ITEMS_IN_DATA) : payload
        const say = truncated
            ? `共查询到${payload.length}条遥测数据，数据量较大，已截取前${MAX_ITEMS_IN_DATA}条，完整数值见data字段。`
            : `共查询到${payload.length}条遥测数据，具体数值见data字段。`
        return {say, data}
    }

    if (typeof payload === 'object') {
        const keys = Object.keys(payload as Record<string, unknown>)
        if (keys.length === 0) {
            return {say: '没有查询到符合条件的遥测数据。', data: payload}
        }
        return {say: '查询到设备遥测数据，具体数值见data字段。', data: payload}
    }

    return {say: `查询结果：${payload}`, data: payload}
}
