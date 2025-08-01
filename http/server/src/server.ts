import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Notification, CallToolRequestSchema, ListToolsRequestSchema, LoggingMessageNotification, ToolListChangedNotification, JSONRPCNotification, JSONRPCError, InitializeRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "crypto";
import { Request, Response } from "express"
import { sendEmail } from "./sendEmail.js";

import axios from 'axios';
const SESSION_ID_HEADER_NAME = "mcp-session-id"
const JSON_RPC = "2.0"

export class MCPServer {
    server: Server

    // to support multiple simultaneous connections
    transports: { [sessionId: string]: StreamableHTTPServerTransport } = {}

    private toolInterval: NodeJS.Timeout | undefined
    private patientInfoToolName = "get_patient_info"
    private gdoStatusToolName = "get_gdo_status"
    private emailToolName = "send_email"
    private emailToolDescription = "Send an email to the user."
    private patientInfoToolDescription = `
        Get the patient information based on the patient barcode which is a 11 digit number.
        Parameters:
        - 'barcode': barcode of the patient. `
    private gdoStatusToolDescription = `
        Get the GDO Status based on the country code.
        Parameters:
        - 'country': country code for which the GDO status is to be fetched. `



    constructor(server: Server) {
        this.server = server
        this.setupTools()
    }

    async handleGetRequest(req: Request, res: Response) {
        console.log("get request received")
        // if server does not offer an SSE stream at this endpoint.
        // res.status(405).set('Allow', 'POST').send('Method Not Allowed')

        const sessionId = req.headers['mcp-session-id'] as string | undefined
        if (!sessionId || !this.transports[sessionId]) {
            res.status(400).json(this.createErrorResponse("Bad Request: invalid session ID or method."))
            return
        }

        console.log(`Establishing SSE stream for session ${sessionId}`)
        const transport = this.transports[sessionId]
        await transport.handleRequest(req, res)
        await this.streamMessages(transport)

        return
    }

    async handlePostRequest(req: Request, res: Response) {
        const sessionId = req.headers[SESSION_ID_HEADER_NAME] as string | undefined

        console.log("post request received")
        console.log("body: ", req.body)

        let transport: StreamableHTTPServerTransport

        try {
            // reuse existing transport
            if (sessionId && this.transports[sessionId]) {
                transport = this.transports[sessionId]
                await transport.handleRequest(req, res, req.body)
                return
            }

            // create new transport
            if (!sessionId && this.isInitializeRequest(req.body)) {
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    // for stateless mode:
                    // sessionIdGenerator: () => undefined
                })

                await this.server.connect(transport)
                await transport.handleRequest(req, res, req.body)

                // session ID will only be available (if in not Stateless-Mode)
                // after handling the first request
                const sessionId = transport.sessionId
                if (sessionId) {
                    this.transports[sessionId] = transport
                }

                return
            }

            res.status(400).json(this.createErrorResponse("Bad Request: invalid session ID or method."))
            return

        } catch (error) {

            console.error('Error handling MCP request:', error)
            res.status(500).json(this.createErrorResponse("Internal server error."))
            return
        }
    }

    async cleanup() {
        this.toolInterval?.close()
        await this.server.close()
    }

    private setupTools() {

        // Define available tools
        const setToolSchema = () => this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            this.patientInfoToolName = `get_patient_info`

            // tool that returns a single greeting
            const patientInfoTool = {
                name: this.patientInfoToolName,
                description: this.patientInfoToolDescription,
                inputSchema: {
                    type: "object",
                    properties: {
                        barcode: {
                            type: "string",
                            description: "barcode of the patient",
                        },
                    },
                    required: ["barcode"]
                },
            }


            // tool that sends multiple greetings with notifications
            const gdoStatusTool = {
                name: this.gdoStatusToolName,
                description: this.gdoStatusToolDescription,
                inputSchema: {
                    type: "object",
                    properties: {
                        country: {
                            type: "string",
                            description: "country code for which the GDO status is to be fetched"
                        },
                    },
                    required: ["country"]
                }
            }

            // tool that sends multiple greetings with notifications
            const emailTool = {
                name: this.emailToolName,
                description: this.emailToolDescription,
                inputSchema: {
                    type: "object",
                    properties: {
                        emailId: {
                            type: "string",
                            description: "email address to send the email to"
                        },
                        subject: {
                            type: "string",
                            description: "subject of the email"
                        },
                        content: {
                            type: "string",
                            description: "content of the email"
                        }
                    },
                    required: ["emailId", "subject", "content"]
                }
            }


            return {
                tools: [gdoStatusTool, patientInfoTool, emailTool]
            }
        })

        setToolSchema()

        // set tools dynamically, changing 5 second
        // this.toolInterval = setInterval(async () => {
        //     setToolSchema()
        //     // to notify client that the tool changed
        //     Object.values(this.transports).forEach((transport) => {

        //         const notification: ToolListChangedNotification = {
        //             method: "notifications/tools/list_changed",
        //         }
        //         this.sendNotification(transport, notification)
        //     })
        // }, 5000)

        // handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
            console.log("tool request received: ", request)
            console.log("extra: ", extra)

            const args = request.params.arguments
            const toolName = request.params.name
            const sendNotification = extra.sendNotification

            if (!args) {
                throw new Error("arguments undefined")
            }

            if (!toolName) {
                throw new Error("tool name undefined")
            }

            if (toolName === this.patientInfoToolName) {

                const { barcode } = args

                console.log(`from serverbarcode ${barcode}`)
                if (typeof (barcode) !== "string") {
                    throw new Error(`Bad barcode format ` + barcode)
                }

                try {
                    let data = await this.fetchPatientInfo(barcode)
                    console.log('Data received (Axios):', data)
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify(data)
                        }]
                    }

                } catch (err) {
                    let errorMessage = "Error occured while creating the project."
                    if (err instanceof Error) {
                        errorMessage += err.message
                    }
                    return {
                        content: [{
                            type: "text",
                            text: errorMessage
                        }]
                    }
                }
            }

            if (toolName === this.gdoStatusToolName) {

                const { country } = args

                console.log(`from server country ${country}`)
                if (typeof (country) !== "string") {
                    throw new Error(`Bad country format ` + country)
                }

                try {
                    let data = await this.fetchGDOStatus(country)
                    console.log('Data received (Axios):', data)
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify(data)
                        }]
                    }

                } catch (err) {
                    let errorMessage = "Error occured while creating the project."
                    if (err instanceof Error) {
                        errorMessage += err.message
                    }
                    return {
                        content: [{
                            type: "text",
                            text: errorMessage
                        }]
                    }
                }
            }


            
            if (toolName === this.emailToolName) {
                const { emailId, subject, content } = args

                if (!emailId) {
                    throw new Error("Email ID to send the email to is undefined.")
                }
                let htmlContent = '<h2>' + content as string + '</h2>'

                // Simulate sending an email
                console.log(`Sending email to ${emailId}...`)
                sendEmail({
                    to: emailId as string,
                    subject: subject as string,
                    text: 'Plain-text body',
                    html: htmlContent,
                }).then(() => console.log('Email sent'))
                    .catch(console.error);



                // Notify client that the email has been sent
                const notification: LoggingMessageNotification = {
                    method: "notifications/message",
                    params: { level: "info", data: `Email sent to ${emailId}` }
                }
                await sendNotification(notification)

                let response = {
                    "result": "your request to send email has been processed",
                    "emailId": emailId
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(response)
                    }]
                }
            }


            throw new Error("Tool not found")
        })
    }

    private async fetchGDOStatus<T>(country: string): Promise<T> {
        try {
            const apiUrlAxios = process.env.FS61ENGINE_API_ENDPOINT as string
            const authTokenAxios = process.env.FS61ENGINE_API_KEY as string
            const url = apiUrlAxios + "?country=" + country
            console.log(`apiUrlAxios ${url}`)
            const response = await axios.get<T>(url, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `${authTokenAxios}`
                },
            });
          return response.data;
        } catch (error) {
          if (axios.isAxiosError(error)) {
            console.error("Axios error fetching data:", error);
          } else {
            console.error("Unexpected error fetching data:", error);
          }
          throw error;
        }
    }

    private async fetchPatientInfo<T>(barcode: string): Promise<T> {
        try {
            const apiUrlAxios = process.env.AROGYA_END_POINT as string
            const authTokenAxios = process.env.AROGYA_API_KEY as string
            const url = apiUrlAxios + barcode
            console.log(`apiUrlAxios ${url}`)
            const response = await axios.get<T>(url, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `${authTokenAxios}`
                },
            });
          return response.data;
        } catch (error) {
          if (axios.isAxiosError(error)) {
            console.error("Axios error fetching data:", error);
          } else {
            console.error("Unexpected error fetching data:", error);
          }
          throw error;
        }
    }
    

    // send message streaming message every second
    // cannot use server.sendLoggingMessage because we have can have multiple transports
    private async streamMessages(transport: StreamableHTTPServerTransport) {
        try {
            // based on LoggingMessageNotificationSchema to trigger setNotificationHandler on client
            const message: LoggingMessageNotification = {
                method: "notifications/message",
                params: { level: "info", data: "SSE Connection established" }
            }

            this.sendNotification(transport, message)

            let messageCount = 0

            const interval = setInterval(async () => {

                messageCount++

                const data = `Message ${messageCount} at ${new Date().toISOString()}`

                const message: LoggingMessageNotification = {
                    method: "notifications/message",
                    params: { level: "info", data: data }
                }


                try {

                    this.sendNotification(transport, message)

                    console.log(`Sent: ${data}`)

                    if (messageCount === 2) {
                        clearInterval(interval)

                        const message: LoggingMessageNotification = {
                            method: "notifications/message",
                            params: { level: "info", data: "Streaming complete!" }
                        }

                        this.sendNotification(transport, message)

                        console.log("Stream completed")
                    }

                } catch (error) {
                    console.error("Error sending message:", error)
                    clearInterval(interval)
                }

            }, 1000)

        } catch (error) {
            console.error("Error sending message:", error)
        }
    }


    private async sendNotification(transport: StreamableHTTPServerTransport, notification: Notification) {
        const rpcNotificaiton: JSONRPCNotification = {
            ...notification,
            jsonrpc: JSON_RPC,
        }
        await transport.send(rpcNotificaiton)
    }


    private createErrorResponse(message: string): JSONRPCError {
        return {
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: message,
            },
            id: randomUUID(),
        }
    }

    private isInitializeRequest(body: any): boolean {
        const isInitial = (data: any) => {
            const result = InitializeRequestSchema.safeParse(data)
            return result.success
        }
        if (Array.isArray(body)) {
            return body.some(request => isInitial(request))
        }
        return isInitial(body)
    }

}