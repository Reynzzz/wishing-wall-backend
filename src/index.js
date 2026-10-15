/**
 * Wishing Wall server.
 *
 *   POST   /api/wishes      multipart upload -> Postgres -> broadcast `wish:new`
 *   GET    /api/wishes      newest-first list (bootstrap for a fresh client)
 *   DELETE /api/wishes/:id  takedown (butuh token admin) -> broadcast `wish:delete`
 *   POST   /api/admin/login password admin -> token
 *   GET    /api/admin/session cek token admin
 *   GET    /uploads/<file>  stored images / videos
 *   GET    /health
 *
 * plus a Socket.IO channel that pushes every change to every open wall.
 */

import fs from "node:fs";
import http from "node:http";

import cors from "cors";
import express from "express";
import { Server as SocketServer } from "socket.io";

import { env } from "./config/env.js";
import { sequelize } from "./db/index.js";
import { Wish } from "./models/wish.js";
import { createAdminRouter } from "./routes/admin.js";
import { createWishesRouter } from "./routes/wishes.js";

const BOOTSTRAP_LIMIT = 60;

fs.mkdirSync(env.uploadDir, { recursive: true });

try {
  await sequelize.authenticate();
  // Creates the `wishes` table on first run; leaves an existing one untouched.
  await sequelize.sync();
} catch (error) {
  console.error(
    `[db] tidak bisa terhubung ke Postgres (${env.db.user}@${env.db.host}:${env.db.port}/${env.db.name}): ${error.message}`,
  );
  console.error("[db] cek nilai DB_* di server/.env, lalu jalankan `npm run db:create` bila database belum ada.");
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: { origin: env.corsOrigin, methods: ["GET", "POST", "DELETE"] },
});

// Di belakang Nginx: pakai IP klien asli (untuk pembatasan login admin).
app.set("trust proxy", 1);

app.use(cors({ origin: env.corsOrigin }));

app.use(
  "/uploads",
  express.static(env.uploadDir, { maxAge: "365d", immutable: true, index: false, dotfiles: "deny" }),
);

app.use("/api/admin", createAdminRouter());
app.use("/api/wishes", createWishesRouter(io));

app.get("/health", async (_req, res, next) => {
  try {
    res.json({ ok: true, wishes: await Wish.count() });
  } catch (error) {
    next(error);
  }
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// eslint-disable-next-line no-unused-vars
app.use((error, _req, res, _next) => {
  console.error("[server] unhandled:", error);
  res.status(500).json({ error: "Internal error" });
});

io.on("connection", async (socket) => {
  try {
    const rows = await Wish.findAll({ order: [["createdAt", "DESC"]], limit: BOOTSTRAP_LIMIT });
    socket.emit("wish:bootstrap", rows.map((row) => row.toClient()));
  } catch (error) {
    console.error("[socket] bootstrap gagal:", error.message);
  }
});

server.listen(env.port, async () => {
  console.log(
    `▲ wishing-wall server  http://localhost:${env.port}  (${await Wish.count()} wish tersimpan di Postgres)`,
  );
});
