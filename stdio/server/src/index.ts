import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from "zod";
import axios from 'axios';

// Create server instance
const server = new Server({
    name: "create-mcp-app",
    version: "1.0.0"
}, {
    capabilities: {
        tools: {}
    }
})


const TOOL_NAME = "get-patient-info"
const TOOL_DESCRIPTION = `
Get the patient information based on the patient barcode which is a 11 digit number.
Parameters:
- 'barcode': barcode of the patient.
`

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [{
            name: TOOL_NAME,
            description: TOOL_DESCRIPTION,
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
        }]
    }
})

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === TOOL_NAME && request.params.arguments !== undefined) {

        let {barcode} = request.params.arguments
        console.log(`from serverbarcode ${barcode}`)
        if (typeof(barcode) !== "string") {
            throw new Error(`Bad barcode format ` + barcode)
        }

        try {
            let data = await fetchPatientInfo(barcode)
            console.log('Data received (Axios):', data)
            return {
                content: [ {
                    type: "text",
                    text: JSON.stringify(data)
                }]
            }

        } catch(err) {
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

    throw new Error("Tool not found")
})

async function fetchPatientInfo<T>(barcode: string): Promise<T> {
    try {
        const apiUrlAxios = process.env.BASE_ENDPOINT
        const authTokenAxios = process.env.API_TOKEN
        const response = await axios.get<T>(apiUrlAxios + barcode, {
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
// Start the server
async function main() {
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error("Create-MCP-Project Server running on stdio.")
}

main().catch((error) => {
    console.error("Fatal error while running server:", error)
    process.exit(1)
})