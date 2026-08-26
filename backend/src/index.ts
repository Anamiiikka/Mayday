import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import "dotenv/config";
import express from "express";
import { buildMcpServer } from "./mcp.js";
import { routes } from "./routes.js";

const app = express();

const DEFAULT_PORT = 4000;
const parsedPort = Number.parseInt(process.env.PORT ?? "", 10);
const port =
  Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535
    ? parsedPort
    : DEFAULT_PORT;
if (process.env.PORT && port === DEFAULT_PORT && String(parsedPort) !== process.env.PORT.trim()) {
  console.warn(`Ignoring invalid PORT="${process.env.PORT}"; using ${DEFAULT_PORT}`);
}

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000" }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "mayday-backend" });
});

// Command Room API: incident data from Neon plus the TrueForge agent proxy.
app.use("/api", routes);

// Optional shared-secret auth for /mcp: destructive tools mutate the demo
// cloud, so when MCP_TOKEN is set, only bearers of it may call the endpoint.
// (The human-approval gate itself lives in TrueForge's approval policy.)
app.use("/mcp", (req, res, next) => {
  const token = process.env.MCP_TOKEN;
  if (!token) return next();
  if (req.headers.authorization === `Bearer ${token}`) return next();
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Unauthorized: missing or invalid bearer token" },
    id: null,
  });
});

// Fake-cloud MCP endpoint (stateless streamable HTTP): TrueForge connects here.
app.post("/mcp", async (req, res) => {
  const server = buildMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// Stateless server: no SSE stream or sessions to manage.
app.get("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. POST JSON-RPC to /mcp." },
    id: null,
  });
});

// Surface failures as JSON so the Command Room can show what broke.
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Request failed:", err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  },
);

app.listen(port, () => {
  console.log(`mayday-backend listening on http://localhost:${port}`);
});
