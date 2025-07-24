import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { URL } from "url"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { LoggingMessageNotificationSchema, ToolListChangedNotificationSchema, TextContentSchema } from "@modelcontextprotocol/sdk/types.js"
import winston from 'winston';

export class MCPClient {
    tools: { name: string, description: string }[] = []

    private client: Client
    private transport: StreamableHTTPClientTransport | null = null
    private isCompleted = false
    private logger = winston.createLogger({
        level: 'info', // Default log level
        format: winston.format.json(), // Structured JSON format
        transports: [
            new winston.transports.Console(), // Log to the console
        ],
    });

    constructor(serverName: string) {
        this.client = new Client({ name: `mcp-client-for-${serverName}`, version: "1.0.0" })
    }

    async connectToServer(serverUrl: string) {
        const url = new URL(serverUrl)
        try {
            this.transport = new StreamableHTTPClientTransport(url)
            await this.client.connect(this.transport)
            this.logger.info("Connected to server")

            this.setUpTransport()
            this.setUpNotifications()
        } catch (e) {
            this.logger.error("Failed to connect to MCP server: ", e)
            throw e
        }
    }

    async listTools() {
        try {
            const toolsResult = await this.client.listTools()
            this.logger.info('Available tools:', toolsResult.tools)
            this.tools = toolsResult.tools.map((tool) => {
                return {
                    name: tool.name,
                    description: tool.description ?? "",
                }
            })
        } catch (error) {
            this.logger.error(`Tools not supported by the server (${error})`);
        }
    }

    async getTools(): Promise<any[]> {
        const toolsResult = await this.client.listTools()
        const tools: any[] = toolsResult.tools.map((tool) => {
            return {
                type: 'function',
                strict: true,
                name: tool.name,
                description: tool.description ?? '',
                parameters: tool.inputSchema,
            }
        })
        return tools
    }

    async callTool(functionName: string, functionArgs: any = {}) {
        try {
            this.logger.info('\nCalling tool: ', functionName);

            const result = await this.client.callTool({
                name: functionName,
                arguments: functionArgs,
            })

            const content = result.content as object[]

            this.logger.info('results:');
            content.forEach((item) => {
                const parse = TextContentSchema.safeParse(item)
                if (parse.success) {
                    this.logger.info(`- ${parse.data.text}`);
                }
            })

            return result
        } catch (error) {
            this.logger.error(`Error calling greet tool: ${error}`);
        }

        throw new Error(`Tool ${functionName} not found or not callable.`)

    }

    // Set up notification handlers for server-initiated messages
    private setUpNotifications() {
        this.client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
            this.logger.info("LoggingMessageNotificationSchema received:  ", notification)
        })
        // will only be triggered after list tools called
        this.client.setNotificationHandler(ToolListChangedNotificationSchema, async (notification) => {
            this.logger.info("ToolListChangedNotificationSchema received:  ", notification)
            await this.listTools()
        })
    }

    private setUpTransport() {
        if (this.transport === null) {
            return
        }
        this.transport.onclose = () => {
            this.logger.info("SSE transport closed.")
            this.isCompleted = true
        }

        this.transport.onerror = async (error) => {
            this.logger.info("SSE transport error: ", error)
            await this.cleanup()
        }
    }

    async waitForCompletion() {
        while (!this.isCompleted) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    async cleanup() {
        await this.client.close()
    }
}
