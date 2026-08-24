import cors from "cors";
import "dotenv/config";
import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 4000);

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
