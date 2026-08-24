import cors from "cors";
import "dotenv/config";
import express from "express";

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

// Coming next:
//   /mcp    — fake-cloud MCP server (metrics, logs, deployments; gated actions)
//   /agent  — TrueForge session proxy (create session, stream turns, approvals)

app.listen(port, () => {
  console.log(`mayday-backend listening on http://localhost:${port}`);
});
