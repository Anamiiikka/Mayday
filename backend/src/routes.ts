import { Router, type NextFunction, type Request, type Response } from "express";
import { pool } from "./db.js";
import { seed } from "./fake-cloud.js";
import { getAgentState, startInvestigation, submitApproval } from "./trueforge.js";

export const routes = Router();

/**
 * Anything that dispatches an agent, clears a destructive action, or rewrites
 * the demo cloud is guarded by a shared secret when one is configured. Left
 * unset for local use, where the backend is only reachable from this machine.
 */
function requireOperator(req: Request, res: Response, next: NextFunction) {
  const token = process.env.OPERATOR_TOKEN;
  if (!token) return next();
  if (req.headers.authorization === `Bearer ${token}`) return next();
  res.status(401).json({ error: "Unauthorized: operator token required" });
}

/** Anything the agent has not resolved is still someone's problem. */
routes.get("/incidents", async (_req, res, next) => {
  try {
    const incidents = await pool.query(
      `SELECT i.id, i.title, i.severity, i.service_id, i.status, i.impact,
              i.created_at, i.session_id
       FROM incidents i ORDER BY i.created_at DESC`,
    );
    const services = await pool.query(
      `SELECT s.id, s.status, s.region, s.version, s.replicas,
              m.latency_p95_ms, m.error_rate, m.cpu_pct
       FROM services s
       LEFT JOIN LATERAL (
         SELECT * FROM metrics WHERE service_id = s.id AND ts <= now()
         ORDER BY ts DESC LIMIT 1
       ) m ON true
       ORDER BY s.id`,
    );
    res.json({ incidents: incidents.rows, services: services.rows });
  } catch (err) {
    next(err);
  }
});

/** One incident with the evidence the Command Room charts. */
routes.get("/incidents/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const incident = await pool.query("SELECT * FROM incidents WHERE id = $1", [id]);
    if (incident.rowCount === 0) {
      res.status(404).json({ error: `Unknown incident ${id}` });
      return;
    }
    const serviceId = incident.rows[0].service_id as string;
    const [metrics, logs, deployments, actions] = await Promise.all([
      pool.query(
        `SELECT to_char(date_bin('5 minutes', ts, now()), 'HH24:MI') AS at,
                round(avg(latency_p95_ms))::int AS latency_p95_ms,
                round(avg(error_rate)::numeric, 2)::float8 AS error_rate
         FROM metrics
         WHERE service_id = $1 AND ts >= now() - interval '90 minutes' AND ts <= now()
         GROUP BY date_bin('5 minutes', ts, now())
         ORDER BY date_bin('5 minutes', ts, now())`,
        [serviceId],
      ),
      pool.query(
        `SELECT level, endpoint, message, count(*)::int AS occurrences
         FROM logs WHERE service_id = $1 AND level = 'error'
         GROUP BY level, endpoint, message ORDER BY max(ts) DESC LIMIT 5`,
        [serviceId],
      ),
      pool.query(
        `SELECT version, deployed_at, status, changelog FROM deployments
         WHERE service_id = $1 ORDER BY deployed_at DESC LIMIT 5`,
        [serviceId],
      ),
      pool.query(
        `SELECT type, params, executed_at, result FROM actions
         WHERE incident_id = $1 ORDER BY executed_at`,
        [id],
      ),
    ]);
    res.json({
      incident: incident.rows[0],
      metrics: metrics.rows,
      logs: logs.rows,
      deployments: deployments.rows,
      actions: actions.rows,
    });
  } catch (err) {
    next(err);
  }
});

routes.post("/agent/investigate", requireOperator, async (req, res, next) => {
  try {
    const { incidentId } = req.body as { incidentId?: string };
    if (!incidentId) {
      res.status(400).json({ error: "incidentId is required" });
      return;
    }
    const incident = await pool.query("SELECT title FROM incidents WHERE id = $1", [
      incidentId,
    ]);
    if (incident.rowCount === 0) {
      res.status(404).json({ error: `Unknown incident ${incidentId}` });
      return;
    }
    const started = await startInvestigation(incidentId, incident.rows[0].title as string);
    await pool.query(
      `UPDATE incidents SET status = 'investigating', session_id = $2
       WHERE id = $1 AND status <> 'resolved'`,
      [incidentId, started.sessionId],
    );
    res.json(started);
  } catch (err) {
    next(err);
  }
});

routes.get("/agent/sessions/:sessionId", async (req, res, next) => {
  try {
    const state = await getAgentState(req.params.sessionId);
    // Mirror the run's state onto the incident so the feed shows who is
    // waiting on a human, not just the operator with this page open.
    if (state.status === "awaiting_approval" || state.status === "investigating") {
      await pool.query(
        `UPDATE incidents SET status = $2
         WHERE session_id = $1 AND status <> 'resolved' AND status <> $2`,
        [req.params.sessionId, state.status],
      );
    }
    res.json(state);
  } catch (err) {
    next(err);
  }
});

routes.post("/agent/approve", requireOperator, async (req, res, next) => {
  try {
    const { sessionId, threadId, toolCallId, decision } = req.body as {
      sessionId?: string;
      threadId?: string;
      toolCallId?: string;
      decision?: "allow" | "deny";
    };
    if (!sessionId || !threadId || !toolCallId || !decision) {
      res
        .status(400)
        .json({ error: "sessionId, threadId, toolCallId and decision are required" });
      return;
    }
    if (decision !== "allow" && decision !== "deny") {
      res.status(400).json({ error: 'decision must be "allow" or "deny"' });
      return;
    }

    // Clear the call the agent is actually waiting on, not whatever id the
    // caller supplied. Without this a stale tab — or a crafted request — could
    // approve a different action than the one shown to the person deciding.
    const state = await getAgentState(sessionId);
    if (!state.pending) {
      res.status(409).json({ error: "That run is not waiting on a decision." });
      return;
    }
    if (state.pending.toolCallId !== toolCallId || state.pending.threadId !== threadId) {
      res.status(409).json({
        error: `This run is waiting on ${state.pending.tool}, not the action you approved. Reload the incident to see the current request.`,
      });
      return;
    }

    const result = await submitApproval(sessionId, threadId, toolCallId, decision);
    await pool.query(
      `UPDATE incidents SET status = 'investigating'
       WHERE session_id = $1 AND status = 'awaiting_approval'`,
      [sessionId],
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** Reset the simulated cloud so the incident can be demonstrated again. */
routes.post("/demo/reset", requireOperator, async (_req, res, next) => {
  try {
    await seed(pool);
    res.json({ ok: true, message: "Fake cloud reseeded; INC-0042 is open again." });
  } catch (err) {
    next(err);
  }
});
