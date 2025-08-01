import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import readline from "readline/promises"
import dotenv from "dotenv"
import configs from "../server-config.json" with { type: "json" }
import Groq from "groq-sdk";

dotenv.config()

type ServerConfig = {
    command: string,
    args: string[]
}
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export class MCPHost {
    private mcps: MCPClient[] = []
    private toolsMap: { [name: string]: MCPClient } = {}
    private arrayOfTools: any[] = [];
    private ai: Groq
    private servers: { [name: string]: ServerConfig } = configs
    private model: string = "gpt-4o"


    constructor() {
        this.ai = new Groq({
            apiKey: process.env.GROQ_API_KEY, // Ensure your API key is in an environment variable
        });
    }

    async connectToServers() {
        try {
            for (const serverName in this.servers) {
                const mcp = new MCPClient(serverName)
                const config = this.servers[serverName]
                await mcp.connectToServer(config)
                this.mcps.push(mcp)

                const tools = await mcp.getTools()
                console.log(`tools ${JSON.stringify(tools)}`)
                // Print name, description, and parameters for each tool
                for (const t of tools) {
                    const toolDeclaration = {
                        type: "function" as const,
                        function: {
                            name: t.name,
                            description: t.description,
                            parameters: t.parameters,
                        },
                    }
                    console.log(`toolDeclaration ${JSON.stringify(toolDeclaration)}`)
                    this.arrayOfTools.push(toolDeclaration)
                }

                const map: { [name: string]: MCPClient } = {}
                tools.forEach((t) => map[t.name] = mcp)
                this.toolsMap = {
                    ...this.toolsMap,
                    ...map
                }
                console.log(`Connected to server ${serverName} with tools: ${tools.map(({ name }) => name)} and description ${tools.map(({ description }) => description)}`)
            }

        } catch (e) {
            console.log("Failed to connect to MCP server: ", e)
            throw e
        }
    }

    async cleanup() {
        for (const mcp of this.mcps) {
            await mcp.cleanup()
        }
    }

    async callTool(tool_calls: any) {
        const toolCall = tool_calls[0]; // Assuming one tool call for simplicity
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
    }


    async processQuery(query: string) {
        for (const tool of this.arrayOfTools) {
            console.log(`Tool name: ${tool.function.name}`)
            console.log(`Tool description: ${tool.function.description}`)
            console.log(`Parameters--: ${JSON.stringify(tool.function.parameters)}`)
        }
        try {
            const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
                { role: 'user', content: query },
            ];
            //const messages: any = [{ role: "user", content: query }];
            const response = await this.ai.chat.completions.create({
                messages: messages,
                model: "llama-3.3-70b-versatile", // Or another Groq model that supports tool use
                tools: this.arrayOfTools,
                tool_choice: "auto", // Let the model decide whether to use a tool
                max_tokens: 1000
            });

            console.log(`Agent Reponse >> ${JSON.stringify(response.choices[0].message)}`)

            // Extract function calls and text from the response
            const choices = response.choices || [];
            let functionCalls = undefined;
            let textResponse = undefined;
            let message = undefined
            if (choices.length > 0) {
                message = choices[0].message;
                textResponse = message.content;
                functionCalls = message.tool_calls;
            }

            // Check for function calls in the response
            if (functionCalls && functionCalls.length > 0) {
                console.log(`functionCalls ${JSON.stringify(functionCalls)}`)
                for (const fc of functionCalls) {
                    console.log(`Function to call: ${fc.function.name}`);
                    // get mcp client for this tool
                    const mcpClient = this.toolsMap[fc.function.name]
                    const toolCall = fc; // Assuming one tool call for simplicity
                    const functionName = toolCall.function.name;
                    const functionArgs = JSON.parse(toolCall.function.arguments);
                    // make the actual call
                    const result = await mcpClient.callTool(functionName,
                        functionArgs)
                    let parsedContent = undefined;
                    if (Array.isArray(result.content)) {
                        for (const c of result.content) {
                            parsedContent = JSON.parse(c.text)
                        }
                    }
                    // Second request: Send the tool output back to the model
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id, // Important: Include the tool_call_id
                        content: JSON.stringify(parsedContent), // The output of the tool, can be a string or array
                    });

                    const secondCompletion = await this.ai.chat.completions.create({
                        messages: messages,
                        model: "llama-3.3-70b-versatile",
                        max_tokens: 1000,
                    });
                    const secondResponse = secondCompletion.choices[0].message.content;
                    console.log(`Agent Reponse >> ${JSON.stringify(secondResponse)}`)
                    return secondResponse
                }
                // In a real app, you would call your actual function here:
                // const result = await scheduleMeeting(functionCall.args);
            } else {
                console.log(textResponse);
                return textResponse; // Return the text response if no function calls
            }


        } catch (e) {
            console.log("Failed to query the llm: ", e)
            throw e
        }


    }

    async chatLoop() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        })

        try {
            console.log("\nMCP Client Started!")
            console.log("Type your message.")

            while (true) {
                const message = await rl.question("\nQuery: ")
                console.log("\n")
                await this.processQuery(message)
            }

        } finally {
            rl.close()
        }
    }
}


// Protocol client that maintain 1:1 connection with servers
class MCPClient {
    private client: Client
    private transport: StdioClientTransport | null = null

    constructor(serverName: string) {
        this.client = new Client({ name: `mcp-client-for-${serverName}`, version: "1.0.0" })
    }

    async connectToServer(serverConfig: ServerConfig) {
        try {
            this.transport = new StdioClientTransport({
                command: serverConfig.command,
                args: serverConfig.args,
            })
            this.client.connect(this.transport)

        } catch (e) {
            console.log("Failed to connect to MCP server: ", e)
            throw e
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

    async callTool(name: string, args: { [x: string]: unknown }) {
        console.log(`calling tool ${name} with args ${JSON.stringify(args)}`)
        const result = await this.client.callTool({
            name: name,
            arguments: args,
        })
        console.log(`result ${JSON.stringify(result)}`)
        return result
    }

    async cleanup() {
        await this.client.close()
    }
}