import { pool } from "./db.js";
import { seed } from "./fake-cloud.js";

seed(pool)
  .then(async () => {
    const counts = await pool.query(
      `SELECT
         (SELECT count(*) FROM services) AS services,
         (SELECT count(*) FROM metrics) AS metrics,
         (SELECT count(*) FROM logs) AS logs,
         (SELECT count(*) FROM deployments) AS deployments,
         (SELECT count(*) FROM incidents) AS incidents`,
    );
    console.log("Seeded fake cloud:", counts.rows[0]);
    await pool.end();
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
    return pool.end();
  });
