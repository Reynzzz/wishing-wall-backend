/**
 * Creates the database named in .env if it does not exist yet.
 * Connects to the maintenance database `postgres` to do so.
 */
import pg from "pg";

import { env } from "../config/env.js";

const client = new pg.Client({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: "postgres",
  ssl: env.db.ssl ? { rejectUnauthorized: false } : undefined,
});

try {
  await client.connect();
  const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
    env.db.name,
  ]);
  if (rowCount) {
    console.log(`[db] database "${env.db.name}" sudah ada.`);
  } else {
    // Identifiers cannot be parameterised; quote it manually.
    await client.query(`CREATE DATABASE "${env.db.name.replace(/"/g, '""')}"`);
    console.log(`[db] database "${env.db.name}" dibuat.`);
  }
} catch (error) {
  console.error("[db] gagal:", error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
