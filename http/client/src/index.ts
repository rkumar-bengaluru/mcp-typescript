
import {MCPHost} from "./mcpHost.js"
import dotenv from 'dotenv';


dotenv.config()

async function main() {
    const host = new MCPHost("mcp-host")
    await host.connectToServers()

    try {
        await host.chatLoop()
    } finally {
        await host.cleanup()
        process.exit(0)
    }
}

main()