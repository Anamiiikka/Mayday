import type { Pool, PoolClient } from "pg";

/** Any pg query runner: the shared pool or a transaction client. */
export type Db = Pool | PoolClient;

/**
 * The "fake cloud": synthetic services, telemetry, and deploy history that
 * Mayday's MCP tools read and act on. One scripted failure is built in —
 * checkout-api deploy v1.4.2 leaks DB connections — so a demo always has a
 * live SEV-1 with a discoverable root cause.
 */

export const SERVICES = [
  { id: "checkout-api", region: "ap-south-1", goodVersion: "v1.4.1" },
  { id: "payments-worker", region: "ap-south-1", goodVersion: "v2.0.8" },
  { id: "search-api", region: "ap-south-1", goodVersion: "v3.1.0" },
  { id: "auth-svc", region: "ap-south-1", goodVersion: "v1.9.4" },
  { id: "notifications", region: "ap-south-1", goodVersion: "v0.7.2" },
] as const;

export const BAD_VERSION = "v1.4.2";
export const INCIDENT_ID = "INC-0042";
/** The second scenario: a slow leak with no deploy behind it. */
export const LEAK_INCIDENT_ID = "INC-0043";

/** Services carrying a scripted failure, and how they present. */
const DEGRADED = new Set(["checkout-api", "payments-worker"]);

const HEALTHY_ERROR_MESSAGES = [
  ["info", "/health", "healthcheck ok"],
  ["info", "/api/orders", "order created"],
  ["warn", "/api/orders", "slow downstream call to inventory (420ms)"],
] as const;

const FAILURE_LOG_MESSAGES = [
  ["error", "/api/checkout", "timeout acquiring connection from pool (5000ms exceeded)"],
  ["error", "/api/checkout", "ECONNRESET talking to postgres: connection closed unexpectedly"],
  ["error", "/api/cart", "upstream checkout-api responded 503"],
  ["warn", "/api/checkout", "connection pool at 100/100, queueing request"],
] as const;

// Deliberately different in kind: memory pressure and GC, not connection
// errors, and almost no failed requests. Nothing here points at a release.
const LEAK_LOG_MESSAGES = [
  ["warn", "/internal/jobs", "heap usage 94% of limit, GC pause 1,240ms"],
  ["warn", "/internal/jobs", "old gen occupancy 91% after full GC"],
  ["warn", "/api/payments", "batch flush took 1,430ms (threshold 500ms)"],
  ["error", "/api/payments", "worker missed health probe: no response within 30s"],
] as const;

function jitter(base: number, spread: number): number {
  return Math.round(base + (Math.random() - 0.5) * 2 * spread);
}

export async function createSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'healthy',
      region TEXT NOT NULL,
      version TEXT NOT NULL,
      replicas INT NOT NULL DEFAULT 3
    );
    CREATE TABLE IF NOT EXISTS metrics (
      id BIGSERIAL PRIMARY KEY,
      service_id TEXT NOT NULL REFERENCES services(id),
      ts TIMESTAMPTZ NOT NULL,
      latency_p95_ms INT NOT NULL,
      error_rate REAL NOT NULL,
      cpu_pct REAL NOT NULL,
      rps INT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS metrics_service_ts ON metrics(service_id, ts DESC);
    CREATE TABLE IF NOT EXISTS logs (
      id BIGSERIAL PRIMARY KEY,
      service_id TEXT NOT NULL REFERENCES services(id),
      ts TIMESTAMPTZ NOT NULL,
      level TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      message TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS logs_service_ts ON logs(service_id, ts DESC);
    CREATE TABLE IF NOT EXISTS deployments (
      id BIGSERIAL PRIMARY KEY,
      service_id TEXT NOT NULL REFERENCES services(id),
      version TEXT NOT NULL,
      deployed_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      changelog TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      severity TEXT NOT NULL,
      service_id TEXT NOT NULL REFERENCES services(id),
      status TEXT NOT NULL DEFAULT 'open',
      impact TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      -- The TrueForge run investigating this incident, so its live state can
      -- be written back to the feed the whole team is watching.
      session_id TEXT
    );
    ALTER TABLE incidents ADD COLUMN IF NOT EXISTS session_id TEXT;
    CREATE TABLE IF NOT EXISTS actions (
      id BIGSERIAL PRIMARY KEY,
      incident_id TEXT REFERENCES incidents(id),
      type TEXT NOT NULL,
      params JSONB NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      result TEXT NOT NULL
    );
  `);
}

/** Wipe all rows and reseed 2h of healthy telemetry plus the scripted failure. */
export async function seed(dbPool: Pool): Promise<void> {
  await createSchema(dbPool);
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    await seedInTransaction(client);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function seedInTransaction(pool: PoolClient): Promise<void> {
  await pool.query(
    "TRUNCATE actions, incidents, deployments, logs, metrics, services CASCADE",
  );

  const now = Date.now();
  const incidentStart = now - 15 * 60_000;
  // The leak has been building for an hour and a half — long before anything
  // was released, which is the whole point of the second scenario.
  const leakStart = now - 90 * 60_000;

  for (const svc of SERVICES) {
    await pool.query(
      "INSERT INTO services (id, status, region, version) VALUES ($1, $2, $3, $4)",
      [
        svc.id,
        DEGRADED.has(svc.id) ? "degraded" : "healthy",
        svc.region,
        // Only checkout has a bad release; the leak is running the good one,
        // which is what makes the deploy history the wrong place to look.
        svc.id === "checkout-api" ? BAD_VERSION : svc.goodVersion,
      ],
    );
  }

  // Deploy history: everything stable for a day, then the bad checkout deploy.
  const deployRows: unknown[][] = [];
  for (const svc of SERVICES) {
    deployRows.push([
      svc.id,
      svc.goodVersion,
      new Date(now - 26 * 3600_000),
      svc.id === "checkout-api" ? "superseded" : "active",
      "routine release",
    ]);
  }
  deployRows.push([
    "checkout-api",
    BAD_VERSION,
    new Date(incidentStart),
    "active",
    "checkout: rework DB connection pooling for lower latency",
  ]);
  for (const row of deployRows) {
    await pool.query(
      "INSERT INTO deployments (service_id, version, deployed_at, status, changelog) VALUES ($1, $2, $3, $4, $5)",
      row,
    );
  }

  // Two hours of per-minute metrics. Checkout steps off a cliff at its deploy;
  // payments drifts upward for an hour and a half with its error rate flat.
  const sample = (serviceId: string, at: number) => {
    if (serviceId === "checkout-api" && at >= incidentStart) {
      const ramp = Math.min(1, (at - incidentStart) / (5 * 60_000));
      return [
        jitter(150 + 2250 * ramp, 150),
        +(0.3 + 7.8 * ramp).toFixed(2),
        jitter(55 + 40 * ramp, 5),
        jitter(620 - 260 * ramp, 40),
      ];
    }
    if (serviceId === "payments-worker" && at >= leakStart) {
      const ramp = Math.min(1, (at - leakStart) / (85 * 60_000));
      return [
        jitter(140 + 470 * ramp, 25),
        // Barely moves. Requests are slow, not failing — a rollback would be
        // the wrong read, and the error rate is what says so.
        +(0.3 + 0.3 * ramp).toFixed(2),
        jitter(45 + 47 * ramp, 3),
        jitter(600 - 80 * ramp, 30),
      ];
    }
    return [
      jitter(140, 40),
      +(0.1 + Math.random() * 0.4).toFixed(2),
      jitter(45, 12),
      jitter(600, 150),
    ];
  };

  const metricValues: string[] = [];
  const metricParams: unknown[] = [];
  let p = 1;
  for (const svc of SERVICES) {
    for (let i = 120; i >= 0; i--) {
      const ts = new Date(now - i * 60_000);
      metricValues.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      metricParams.push(svc.id, ts, ...sample(svc.id, ts.getTime()));
    }
  }
  await pool.query(
    `INSERT INTO metrics (service_id, ts, latency_p95_ms, error_rate, cpu_pct, rps) VALUES ${metricValues.join(",")}`,
    metricParams,
  );

  // Logs: routine chatter everywhere, plus each incident's signature — pool
  // exhaustion on checkout, heap pressure on payments.
  const logValues: string[] = [];
  const logParams: unknown[] = [];
  p = 1;
  for (const svc of SERVICES) {
    for (let i = 0; i < 30; i++) {
      const [level, endpoint, message] =
        HEALTHY_ERROR_MESSAGES[i % HEALTHY_ERROR_MESSAGES.length]!;
      logValues.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      logParams.push(svc.id, new Date(now - Math.random() * 120 * 60_000), level, endpoint, message);
    }
  }
  for (let i = 0; i < 40; i++) {
    const [level, endpoint, message] =
      FAILURE_LOG_MESSAGES[i % FAILURE_LOG_MESSAGES.length]!;
    logValues.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
    logParams.push(
      "checkout-api",
      new Date(incidentStart + Math.random() * 15 * 60_000),
      level,
      endpoint,
      message,
    );
  }
  for (let i = 0; i < 24; i++) {
    const [level, endpoint, message] = LEAK_LOG_MESSAGES[i % LEAK_LOG_MESSAGES.length]!;
    logValues.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
    logParams.push(
      "payments-worker",
      new Date(leakStart + Math.random() * 90 * 60_000),
      level,
      endpoint,
      message,
    );
  }
  await pool.query(
    `INSERT INTO logs (service_id, ts, level, endpoint, message) VALUES ${logValues.join(",")}`,
    logParams,
  );

  await pool.query(
    "INSERT INTO incidents (id, title, severity, service_id, status, impact, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [
      INCIDENT_ID,
      "Checkout latency 20x baseline after deploy",
      "SEV-1",
      "checkout-api",
      "open",
      "p95 at 2,400 ms · error rate 8.1%",
      new Date(incidentStart + 3 * 60_000),
    ],
  );

  await pool.query(
    "INSERT INTO incidents (id, title, severity, service_id, status, impact, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [
      LEAK_INCIDENT_ID,
      "Payments worker slowing under memory pressure",
      "SEV-2",
      "payments-worker",
      "open",
      "p95 610 ms · CPU 92% · no deploy in 26 h",
      new Date(now - 55 * 60_000),
    ],
  );
}

/** After an approved fix, telemetry eases back to baseline over ~5 minutes. */
export async function insertRecovery(pool: Db, serviceId: string): Promise<void> {
  const now = Date.now();
  const steps = 5;
  const stepMs = 30_000;

  // Recovery has to start where the service actually is and end where it was
  // before it degraded. Reading both from the service's own history means a
  // restart on one service cannot replay another service's numbers.
  const degraded = await pool.query(
    `SELECT latency_p95_ms, error_rate, cpu_pct, rps
     FROM metrics WHERE service_id = $1 ORDER BY ts DESC LIMIT 1`,
    [serviceId],
  );
  const healthy = await pool.query(
    `SELECT round(avg(latency_p95_ms))::int AS latency_p95_ms,
            round(avg(error_rate)::numeric, 2)::float8 AS error_rate,
            round(avg(cpu_pct))::int AS cpu_pct,
            round(avg(rps))::int AS rps
     FROM (
       SELECT * FROM metrics WHERE service_id = $1 ORDER BY ts ASC LIMIT 30
     ) AS before_it_broke`,
    [serviceId],
  );
  const from = degraded.rows[0];
  const to = healthy.rows[0];
  if (!from || !to) return;

  // The fix takes effect immediately, so the recovery curve has to land on
  // samples the agent can actually read back: it ends at now(), not after it.
  // Clear the degraded tail first so the newest sample is the healthy one.
  await pool.query(
    "DELETE FROM metrics WHERE service_id = $1 AND ts >= $2",
    [serviceId, new Date(now - steps * stepMs)],
  );

  const rows: string[] = [];
  const params: unknown[] = [];
  let p = 1;
  const ease = (start: number, end: number, at: number) => start + (end - start) * at;
  for (let i = 0; i <= steps; i++) {
    const at = i / steps;
    rows.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
    params.push(
      serviceId,
      new Date(now - (steps - i) * stepMs),
      jitter(ease(from.latency_p95_ms, to.latency_p95_ms, at), 40),
      +ease(from.error_rate, to.error_rate, at).toFixed(2),
      jitter(ease(from.cpu_pct, to.cpu_pct, at), 4),
      jitter(ease(from.rps, to.rps, at), 30),
    );
  }
  await pool.query(
    `INSERT INTO metrics (service_id, ts, latency_p95_ms, error_rate, cpu_pct, rps) VALUES ${rows.join(",")}`,
    params,
  );
}
