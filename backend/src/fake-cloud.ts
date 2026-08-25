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
      created_at TIMESTAMPTZ NOT NULL
    );
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

  for (const svc of SERVICES) {
    const isBroken = svc.id === "checkout-api";
    await pool.query(
      "INSERT INTO services (id, status, region, version) VALUES ($1, $2, $3, $4)",
      [
        svc.id,
        isBroken ? "degraded" : "healthy",
        svc.region,
        isBroken ? BAD_VERSION : svc.goodVersion,
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

  // Two hours of per-minute metrics; checkout degrades after its deploy.
  const metricValues: string[] = [];
  const metricParams: unknown[] = [];
  let p = 1;
  for (const svc of SERVICES) {
    for (let i = 120; i >= 0; i--) {
      const ts = new Date(now - i * 60_000);
      const broken = svc.id === "checkout-api" && ts.getTime() >= incidentStart;
      const minutesIn = broken ? (ts.getTime() - incidentStart) / 60_000 : 0;
      const ramp = broken ? Math.min(1, minutesIn / 5) : 0;
      metricValues.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      metricParams.push(
        svc.id,
        ts,
        broken ? jitter(150 + 2250 * ramp, 150) : jitter(140, 40),
        broken ? +(0.3 + 7.8 * ramp).toFixed(2) : +(0.1 + Math.random() * 0.4).toFixed(2),
        broken ? jitter(55 + 40 * ramp, 5) : jitter(45, 12),
        broken ? jitter(620 - 260 * ramp, 40) : jitter(600, 150),
      );
    }
  }
  await pool.query(
    `INSERT INTO metrics (service_id, ts, latency_p95_ms, error_rate, cpu_pct, rps) VALUES ${metricValues.join(",")}`,
    metricParams,
  );

  // Logs: routine chatter everywhere, failure signatures on checkout.
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
}

/** After an approved fix, telemetry eases back to baseline over ~5 minutes. */
export async function insertRecovery(pool: Db, serviceId: string): Promise<void> {
  const now = Date.now();
  const rows: string[] = [];
  const params: unknown[] = [];
  let p = 1;
  for (let i = 0; i <= 5; i++) {
    const ease = i / 5;
    rows.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
    params.push(
      serviceId,
      new Date(now + i * 30_000),
      jitter(2400 - 2190 * ease, 80),
      +(8.1 - 7.9 * ease).toFixed(2),
      jitter(95 - 45 * ease, 4),
      jitter(360 + 240 * ease, 40),
    );
  }
  await pool.query(
    `INSERT INTO metrics (service_id, ts, latency_p95_ms, error_rate, cpu_pct, rps) VALUES ${rows.join(",")}`,
    params,
  );
}
