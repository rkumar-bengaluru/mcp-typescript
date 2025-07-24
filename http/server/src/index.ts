import express, { Request, Response } from "express"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { MCPServer } from "./server.js"
import { sendEmail } from "./sendEmail.js"
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });
console.log(process.env.GMAIL_USER, process.env.GMAIL_APP_PASS); // Debugging line to check if env variables are loaded correctly
// Load environment variables from .env file
/*******************************/
/******* Server Set Up *******/
/*******************************/

const server = new MCPServer(
    new Server({
        name: "rupak-mcp-server",
        version: "1.0.0"
    }, {
        capabilities: {
            tools: {},
            logging: {}
        }
    })
)

/*******************************/
/******* Endpoint Set Up *******/
/*******************************/

const app = express()
app.use(express.json())

const router = express.Router()

// endpoint for the client to use for sending messages
const MCP_ENDPOINT = "/mcp"

// handler
router.post(MCP_ENDPOINT, async (req: Request, res: Response) => {
    await server.handlePostRequest(req, res)
})

// Handle GET requests for SSE streams (using built-in support from StreamableHTTP)
router.get(MCP_ENDPOINT, async (req: Request, res: Response) => {
    await server.handleGetRequest(req, res)
})


app.use('/', router)

const PORT = 3000
app.listen(PORT, () => {
    console.log(`MCP Streamable HTTP Server listening on port ${PORT}`)
})

process.on('SIGINT', async () => {
    console.log('Shutting down server...')
    
    await server.cleanup()

    process.exit(0)
})