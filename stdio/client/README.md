# MCP Stdio Client & Server

## Overview
This project contains two packages:
- **client**: A CLI tool that connects to multiple MCP servers, sends queries, and handles tool calls using LLMs (OpenAI, Groq, Gemini).
- **server**: An MCP server implementation that exposes tools/functions for the client to call.

## Setup

### Prerequisites
- Node.js (v18+ recommended)
- npm

### Install dependencies
```
cd stdio/client
npm install
cd ../server
npm install
```

## Environment Variables
Both client and server may require API keys. Create a `.env` file in each package as needed.

### Example `.env` for client
```
OPENAI_API_KEY=your-openai-key
GROQ_API_KEY=your-groq-key
GEMINI_API_KEY=your-gemini-key
```

## Running the Client
```
cd stdio/client
npm start
```
This will start the CLI. You can type queries, and the client will route tool calls to the appropriate MCP server.

## Running the Server
```
cd stdio/server
npm start
```
This will start the MCP server, exposing tools/functions for the client to use.

## Development Notes
- The client uses the Model Context Protocol (MCP) SDK to connect to servers via stdio.
- Tool schemas are dynamically loaded from the server and passed to the LLMs.
- The client supports OpenAI, Groq, and Gemini models (ensure you have the correct API keys).
- For custom tool development, add your tool to the server and ensure its schema is exposed via MCP.

---
For more details, see the code in `stdio/client/src` and `stdio/server/src`. 