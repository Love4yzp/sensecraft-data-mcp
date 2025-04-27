export interface McpRegister {
    tools: (...args: any[]) => ToolItem[]
}

export class ToolItem {
    name: string

    description: string
    paramsSchema?: any
    item: (...args: any[]) => any
}