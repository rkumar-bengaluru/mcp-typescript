# MCP Stdio Server

## Overview
This package implements an MCP (Model Context Protocol) server that exposes tools/functions for use by MCP clients. It communicates over stdio and is designed to be used with the MCP Stdio Client.

## Setup

### Prerequisites
- Node.js (v18+ recommended)
- npm

### Install dependencies
```
cd stdio/server
npm install
```

## Environment Variables
Create a `.env` file if your tools require secrets or API keys.

## Running the Server
```
npm start
```
This will start the MCP server, exposing its tools/functions.

## Development Notes
- Tools are defined in `src/` and exposed via the MCP SDK.
- To add a new tool, implement it in the codebase and ensure it is included in the tool list returned by the server.
- The server communicates with clients using the Model Context Protocol over stdio.

---
For more details, see the code in `src/`. 