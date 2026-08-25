import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.NEON_DATABASE_URL;
if (!connectionString) {
  throw new Error("NEON_DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

export const pool = new Pool({ connectionString, max: 5 });
