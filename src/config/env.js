import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, "..", "..");

dotenv.config({ path: path.join(ROOT_DIR, ".env") });

const port = Number(process.env.PORT ?? 4100);

export const env = {
  port,
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  publicUrl: (process.env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/+$/, ""),
  uploadDir: path.join(ROOT_DIR, "uploads"),
  db: {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5432),
    name: process.env.DB_NAME ?? "wishing_wall",
    user: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASSWORD ?? "postgres",
    ssl: process.env.DB_SSL === "true",
  },
};
