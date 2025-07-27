import express from "express";
import { MCPHost } from "./mcpHosts.js";
import path from "path";
const app = express();
app.use(express.json());

import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const host = new MCPHost();
await host.connectToServers();

app.post("/chat", async (req, res) => {
    const { message } = req.body;
    try {
        const response = await host.processQuery(message);
        res.json({ response });
    } catch (e) {
        res.status(500).json({ error: (e as Error).message });
    }
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));


// Serve index.html for the root route
app.get('/', (req, res) => {
    console.log("Serving index.html");
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(3001, () => {
    console.log('current directory:', __dirname);
    console.log("Web chat server running on http://localhost:3000");
});