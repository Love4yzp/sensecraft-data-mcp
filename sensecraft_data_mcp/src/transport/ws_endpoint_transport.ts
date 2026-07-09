import {getLogger} from '../logger'
import type {Transport, TransportSendOptions} from '@modelcontextprotocol/sdk/shared/transport.js'
import type {JSONRPCMessage} from '@modelcontextprotocol/sdk/types.js'
import {serializeMessage, deserializeMessage} from '@modelcontextprotocol/sdk/shared/stdio.js'

const logger = getLogger('wsEndpointTransport')

/**
 * MCP Transport that dials OUT to a XiaoZhi(小智) "MCP接入点" (mcp-endpoint-server)
 * over a WebSocket, instead of listening on stdio/HTTP.
 *
 * Wire format matches the stdio convention the MCP SDK already uses
 * (one JSON-RPC message per line) so we can reuse serializeMessage/deserializeMessage,
 * it also matches what xiaozhi's own `mcp_pipe.py` bridge forwards frame-for-frame.
 */
export class WebSocketEndpointTransport implements Transport {
    onclose?: () => void
    onerror?: (error: Error) => void
    onmessage?: (message: JSONRPCMessage) => void

    private readonly endpoint: string
    private socket?: WebSocket
    private started = false

    constructor(endpoint: string) {
        this.endpoint = endpoint
    }

    start(): Promise<void> {
        if (this.started) {
            throw new Error('WebSocketEndpointTransport already started!')
        }
        this.started = true

        return new Promise((resolve, reject) => {
            let settled = false
            const socket = new WebSocket(this.endpoint)
            this.socket = socket

            socket.addEventListener('open', () => {
                logger.info(`connected to XiaoZhi MCP endpoint`)
                settled = true
                resolve()
            })

            socket.addEventListener('message', (event: MessageEvent) => {
                if (typeof event.data !== 'string') {
                    logger.warn('ignoring non-text frame from MCP endpoint')
                    return
                }
                for (const line of event.data.split('\n')) {
                    const trimmed = line.trim()
                    if (!trimmed) continue
                    try {
                        this.onmessage?.(deserializeMessage(trimmed))
                    } catch (error) {
                        logger.error(`failed to parse message from MCP endpoint: ${error}`)
                        this.onerror?.(error as Error)
                    }
                }
            })

            socket.addEventListener('error', () => {
                const error = new Error('MCP endpoint websocket error')
                logger.error(error.message)
                if (!settled) {
                    settled = true
                    reject(error)
                }
                this.onerror?.(error)
            })

            socket.addEventListener('close', (event: CloseEvent) => {
                logger.info(`MCP endpoint connection closed: code=${event.code} reason=${event.reason}`)
                if (!settled) {
                    settled = true
                    reject(new Error(`MCP endpoint connection closed before it was established (code=${event.code})`))
                }
                this.onclose?.()
            })
        })
    }

    async send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocketEndpointTransport is not connected')
        }
        this.socket.send(serializeMessage(message))
    }

    async close(): Promise<void> {
        this.socket?.close()
    }
}
