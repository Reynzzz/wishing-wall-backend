import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, "..", "..");

dotenv.config({ path: path.join(ROOT_DIR, ".env") });

const port = Number(process.env.PORT ?? 4100);

/**
 * CORS_ORIGIN boleh "*", satu origin, atau beberapa dipisah koma. Garis miring di
 * belakang dibuang: origin yang dikirim browser tidak pernah memakainya, jadi
 * "https://situs.com/" tidak akan pernah cocok.
 */
function parseCorsOrigin(raw) {
  const list = String(raw ?? "*")
    .split(",")
    .map((item) => item.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (list.length === 0 || list.includes("*")) return "*";
  return list.length === 1 ? list[0] : list;
}

export const env = {
  port,
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  /** Password panel admin. Kosong = login admin dimatikan (takedown ditolak). */
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
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
