import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "./db.js";
import { insertRecovery } from "./fake-cloud.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: message }) }],
    isError: true,
  };
}

/** Run a mutation atomically: every statement commits together or not at all. */
async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function serviceExists(client: PoolClient, service: string): Promise<boolean> {
  const result = await client.query("SELECT 1 FROM services WHERE id = $1", [service]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Attach an audit row to the right incident: an explicit id when the caller
 * names one, otherwise the open incident on the affected service.
 */
async function recordAction(
  client: PoolClient,
  target: { incidentId: string } | { service: string },
  type: string,
  params: Record<string, unknown>,
  result: string,
): Promise<void> {
  let incidentId: string | null = null;
  if ("incidentId" in target) {
    incidentId = target.incidentId;
  } else {
    const open = await client.query(
      "SELECT id FROM incidents WHERE service_id = $1 AND status <> 'resolved' ORDER BY created_at DESC LIMIT 1",
      [target.service],
    );
    incidentId = open.rows[0]?.id ?? null;
  }
  await client.query(
    "INSERT INTO actions (incident_id, type, params, result) VALUES ($1, $2, $3, $4)",
    [incidentId, type, JSON.stringify(params), result],
  );
}

/**
 * The fake-cloud MCP server Mayday's agent drives. Read tools are safe and
 * annotated read-only; write tools are annotated destructive so the harness
 * gates them behind human approval.
 */
export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "mayday-fake-cloud", version: "0.1.0" });

  server.registerTool(
    "get_service_health",
    {
      description:
        "Current status of every service with its latest telemetry sample (latency p95, error rate, CPU, RPS).",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const result = await pool.query(`
        SELECT s.id, s.status, s.region, s.version, s.replicas,
               m.ts AS sampled_at, m.latency_p95_ms, m.error_rate, m.cpu_pct, m.rps
        FROM services s
        LEFT JOIN LATERAL (
          SELECT * FROM metrics WHERE service_id = s.id AND ts <= now() ORDER BY ts DESC LIMIT 1
        ) m ON true
        ORDER BY s.id
      `);
      return json(result.rows);
    },
  );

  server.registerTool(
    "query_metrics",
    {
      description:
        "Per-minute telemetry for one service over a time window. Use this to see when a metric started degrading.",
      inputSchema: {
        service: z.string().describe("Service id, e.g. checkout-api"),
        window_minutes: z.number().int().min(1).max(180).default(30),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ service, window_minutes }) => {
      const result = await pool.query(
        `SELECT ts, latency_p95_ms, error_rate, cpu_pct, rps
         FROM metrics
         WHERE service_id = $1 AND ts >= now() - ($2 || ' minutes')::interval AND ts <= now()
         ORDER BY ts`,
        [service, window_minutes],
      );
      return json(result.rows);
    },
  );

  server.registerTool(
    "search_logs",
    {
      description:
        "Recent log lines for a service, optionally filtered by level (info/warn/error) or a substring match.",
      inputSchema: {
        service: z.string(),
        level: z.enum(["info", "warn", "error"]).optional(),
        query: z.string().optional().describe("Substring to match in the message"),
        limit: z.number().int().min(1).max(200).default(50),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ service, level, query, limit }) => {
      const result = await pool.query(
        `SELECT ts, level, endpoint, message
         FROM logs
         WHERE service_id = $1
           AND ($2::text IS NULL OR level = $2)
           AND ($3::text IS NULL OR message ILIKE '%' || $3 || '%')
         ORDER BY ts DESC LIMIT $4`,
        [service, level ?? null, query ?? null, limit],
      );
      return json(result.rows);
    },
  );

  server.registerTool(
    "list_deployments",
    {
      description:
        "Deploy history, newest first. Correlate deploy times with when metrics degraded.",
      inputSchema: { service: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ service }) => {
      const result = await pool.query(
        `SELECT service_id, version, deployed_at, status, changelog
         FROM deployments
         WHERE ($1::text IS NULL OR service_id = $1)
         ORDER BY deployed_at DESC LIMIT 20`,
        [service ?? null],
      );
      return json(result.rows);
    },
  );

  server.registerTool(
    "get_incident",
    {
      description: "Details of one incident, including actions taken so far.",
      inputSchema: { id: z.string().describe("Incident id, e.g. INC-0042") },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const incident = await pool.query("SELECT * FROM incidents WHERE id = $1", [id]);
      const actions = await pool.query(
        "SELECT type, params, executed_at, result FROM actions WHERE incident_id = $1 ORDER BY executed_at",
        [id],
      );
      return json({ incident: incident.rows[0] ?? null, actions: actions.rows });
    },
  );

  server.registerTool(
    "restart_service",
    {
      description:
        "Restart a service. DESTRUCTIVE: drops in-flight requests for ~30s. Requires human approval.",
      inputSchema: {
        service: z.string(),
        reason: z.string().describe("Why this restart should fix the incident"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ service, reason }) =>
      withTransaction(async (client) => {
        if (!(await serviceExists(client, service))) {
          return toolError(`Unknown service "${service}". Use get_service_health to list services.`);
        }
        await client.query("UPDATE services SET status = 'healthy' WHERE id = $1", [service]);
        await insertRecovery(client, service);
        await recordAction(client, { service }, "restart_service", { service, reason }, "success");
        return json({ ok: true, message: `${service} restarted; telemetry recovering.` });
      }),
  );

  server.registerTool(
    "rollback_deployment",
    {
      description:
        "Roll a service back to a previously deployed version. DESTRUCTIVE: replaces the running release. Requires human approval.",
      inputSchema: {
        service: z.string(),
        to_version: z.string().describe("A version from this service's deploy history, e.g. v1.4.1"),
        reason: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ service, to_version, reason }) =>
      withTransaction(async (client) => {
        if (!(await serviceExists(client, service))) {
          return toolError(`Unknown service "${service}". Use get_service_health to list services.`);
        }
        const history = await client.query(
          "SELECT DISTINCT version FROM deployments WHERE service_id = $1",
          [service],
        );
        const versions = history.rows.map((r) => r.version as string);
        if (!versions.includes(to_version)) {
          return toolError(
            `Version "${to_version}" was never deployed for ${service}. Previously deployed: ${versions.join(", ")}.`,
          );
        }
        await client.query(
          "UPDATE deployments SET status = 'rolled_back' WHERE service_id = $1 AND status = 'active'",
          [service],
        );
        await client.query(
          "INSERT INTO deployments (service_id, version, deployed_at, status, changelog) VALUES ($1, $2, now(), 'active', $3)",
          [service, to_version, `rollback: ${reason}`],
        );
        await client.query(
          "UPDATE services SET status = 'healthy', version = $2 WHERE id = $1",
          [service, to_version],
        );
        await insertRecovery(client, service);
        await recordAction(
          client,
          { service },
          "rollback_deployment",
          { service, to_version, reason },
          "success",
        );
        return json({ ok: true, message: `${service} rolled back to ${to_version}; telemetry recovering.` });
      }),
  );

  server.registerTool(
    "scale_service",
    {
      description:
        "Change a service's replica count. DESTRUCTIVE: changes capacity. Requires human approval.",
      inputSchema: {
        service: z.string(),
        replicas: z.number().int().min(1).max(20),
        reason: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ service, replicas, reason }) =>
      withTransaction(async (client) => {
        const updated = await client.query(
          "UPDATE services SET replicas = $2 WHERE id = $1",
          [service, replicas],
        );
        if ((updated.rowCount ?? 0) === 0) {
          return toolError(`Unknown service "${service}". Use get_service_health to list services.`);
        }
        await recordAction(client, { service }, "scale_service", { service, replicas, reason }, "success");
        return json({ ok: true, message: `${service} scaled to ${replicas} replicas.` });
      }),
  );

  server.registerTool(
    "resolve_incident",
    {
      description:
        "Mark an incident resolved after verifying recovery. Requires human approval — closing an incident is a judgment call.",
      inputSchema: {
        id: z.string(),
        resolution: z.string().describe("What fixed it and how recovery was verified"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ id, resolution }) =>
      withTransaction(async (client) => {
        const updated = await client.query(
          "UPDATE incidents SET status = 'resolved' WHERE id = $1",
          [id],
        );
        if ((updated.rowCount ?? 0) === 0) {
          return toolError(`Unknown incident "${id}".`);
        }
        await recordAction(client, { incidentId: id }, "resolve_incident", { id, resolution }, "success");
        return json({ ok: true, message: `${id} resolved.` });
      }),
  );

  return server;
}
