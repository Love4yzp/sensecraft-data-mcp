#!/usr/bin/env node
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {getLogger} from "./logger";
import {CodeReader} from './mcp_tools/code_reader'
import {PaasClient} from './mcp_tools/paas_client'

let logger = getLogger('main')

const projectRoot = __dirname

main().catch((error) => {
    logger.error(`Fatal error in main(), error: ${error}`);
    process.exit(1);
});

async function main() {
    const server = new McpServer({
        name: "sensecraft_data_mcp",
        version: "0.4.0"
    });
    logger.info('sensecraft_data_mcp is starting...')
    let passClient = new PaasClient()
    let codeReader = new CodeReader(projectRoot)

    let tools = [...passClient.tools(), ...codeReader.tools()]
    for (let tool of tools) {
        server.tool(tool.name, tool.description, tool.paramsSchema, tool.item)
        logger.info(`tool(${tool.name}) add to mcp server successfully!!`)
    }

    const transport = new StdioServerTransport();

    // const transport = new SSEServerTransport()
    logger.info(`sensecraft_data_mcp is running...`)
    await server.connect(transport);
}

