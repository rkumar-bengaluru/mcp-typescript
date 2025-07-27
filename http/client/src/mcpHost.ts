import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import readline from "readline/promises"
import dotenv from "dotenv"
import configs from "../server-config.json" with { type: "json" }
import Groq from "groq-sdk";
import { MCPClient } from "./mcpClient.js"
import { Queue } from "./queue.js"
import winston from 'winston';


interface McpServer {
    name: string;
    description: string;
    url: string;
}

interface McpServers {
    "std-io-mcp-server": McpServer[];
}


const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export class MCPHost {
    private name: string = "mcp-host"
    private mcps: MCPClient[] = []
    private toolsMap: { [name: string]: MCPClient } = {}
    private arrayOfTools: any[] = [];
    private ai: Groq
    private queue: Queue<string> = new Queue<string>()
    private servers: McpServers = configs;
    private model: string = "llama-3.3-70b-versatile"
    private logger = winston.createLogger({
        level: 'info', // Default log level
        format: winston.format.json(), // Structured JSON format
        transports: [
            new winston.transports.Console(), // Log to the console
        ],
    });


    constructor(name: string) {
        this.name = name;
        this.ai = new Groq({
            apiKey: process.env.GROQ_API_KEY, // Ensure your API key is in an environment variable
        });
    }

    async connectToServers() {
        try {
            const servers = this.servers["std-io-mcp-server"];

            if (!servers || servers.length === 0) {
                this.logger.error("No MCP servers configured in server-config.json");
                return;
            }
            for (const server of servers) {
                this.logger.info(`Connecting to server: ${server.name}`);
                const mcp = new MCPClient(server.name)
                await mcp.connectToServer(server.url)
                const tools = await mcp.getTools()
                this.logger.info(`tools ${JSON.stringify(tools)}`)
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
                    this.logger.info(`toolDeclaration ${JSON.stringify(toolDeclaration)}`)
                    this.arrayOfTools.push(toolDeclaration)
                }

                const map: { [name: string]: MCPClient } = {}
                tools.forEach((t) => map[t.name] = mcp)
                this.toolsMap = {
                    ...this.toolsMap,
                    ...map
                }
                this.logger.info(`Connected to server ${server.name} with tools: ${tools.map(({ name }) => name)} and description ${tools.map(({ description }) => description)}`)
                for (const key in this.toolsMap) {
                    this.logger.info(`tool name: ${key}`)
                }

                this.queue.enqueue("Hello")
                this.queue.enqueue("World")
                console.log(`queue ${JSON.stringify(this.queue.peek())}`)
                console.log(`queue ${JSON.stringify(this.queue.dequeue())}`)
                console.log(`queue ${JSON.stringify(this.queue.peek())}`)
                console.log(`queue ${JSON.stringify(this.queue.dequeue())}`)
                console.log(`queue ${JSON.stringify(this.queue.peek())}`)
            }

        } catch (e) {
            this.logger.error("Failed to connect to MCP server: ", e)
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
        // for (const tool of this.arrayOfTools) {
        //     console.log(`Tool name: ${tool.function.name}`)
        //     console.log(`Tool description: ${tool.function.description}`)
        //     console.log(`Parameters--: ${JSON.stringify(tool.function.parameters)}`)
        // }
        try {
            const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
                { role: 'user', content: query },
            ];
            //const messages: any = [{ role: "user", content: query }];
            const response = await this.ai.chat.completions.create({
                messages: messages,
                model: this.model, // Or another Groq model that supports tool use
                tools: this.arrayOfTools,
                tool_choice: "auto", // Let the model decide whether to use a tool
                max_tokens: 1000
            });

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
                let index = 0
                console.log(`functionCalls ${JSON.stringify(functionCalls)}`)
                for (const fc of functionCalls) {
                    console.log(`Function to call: ${fc.function.name} at index ${index}`);
                    // get mcp client for this tool
                    const mcpClient = this.toolsMap[fc.function.name]
                    const toolCall = fc; // Assuming one tool call for simplicity
                    const functionName = toolCall.function.name;
                    const functionArgs = JSON.parse(toolCall.function.arguments);
                    if (index > 0) {
                        console.log(`functionArgs ${JSON.stringify(functionArgs)}`)
                        if (functionArgs['content']) {
                            const content = this.queue.dequeue()
                            console.log(`responses ${content}`)
                            functionArgs['content'] = content
                            console.log(`functionArgs ${JSON.stringify(functionArgs)}`)
                        }

                    }
                    // make the actual call
                    const result = await mcpClient.callTool(functionName,
                        functionArgs)
                    let parsedContent = undefined;
                    this.logger.info(`function call successful`)
                    if (Array.isArray(result.content)) {
                        for (const c of result.content) {
                            this.logger.info(`retrieving content`)
                            parsedContent = JSON.parse(c.text)
                            this.logger.info(`parsedContent ${JSON.stringify(parsedContent)}`)
                            this.queue.enqueue(JSON.stringify(parsedContent))
                            console.log(`added function call response to queue`)
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
                        model: this.model,
                        max_tokens: 1000,
                    });
                    const secondResponse = secondCompletion.choices[0].message.content;
                    index++
                    console.log(`Agent Reponse >> ${JSON.stringify(secondResponse)}`)
                    return secondResponse
                }
                
                // In a real app, you would call your actual function here:
                // const result = await scheduleMeeting(functionCall.args);
            } else {
                console.log(`Agent Reponse >> ${JSON.stringify(response.choices[0].message)}`)
                return textResponse;
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


