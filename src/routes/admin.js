import { createHmac, timingSafeEqual } from "node:crypto";

import express, { Router } from "express";

import { env } from "../config/env.js";

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

/** Token ditandatangani dengan password admin, jadi mengganti password mencabut semua token lama. */
const sign = (payload) => createHmac("sha256", env.adminPassword).update(payload).digest("hex");

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function issueToken() {
  const expires = String(Date.now() + TOKEN_TTL_MS);
  return `${expires}.${sign(expires)}`;
}

function verifyToken(token) {
  if (!env.adminPassword || typeof token !== "string") return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || !safeEqual(signature, sign(expires))) return false;
  return Number(expires) > Date.now();
}

/** Middleware: hanya lanjut kalau header `Authorization: Bearer <token>` valid. */
export function requireAdmin(req, res, next) {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!verifyToken(token)) return res.status(401).json({ error: "Tidak diizinkan." });
  return next();
}

/** Percobaan gagal per IP, disimpan di memori (cukup untuk satu proses). */
const failures = new Map();

export function createAdminRouter() {
  const router = Router();

  router.post("/login", express.json({ limit: "1kb" }), (req, res) => {
    if (!env.adminPassword) {
      return res.status(503).json({ error: "Login admin belum diaktifkan di server." });
    }

    const now = Date.now();
    const record = failures.get(req.ip);
    if (record && record.count >= MAX_FAILED_ATTEMPTS && now - record.last < LOCKOUT_MS) {
      return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi nanti." });
    }

    if (!safeEqual(req.body?.password ?? "", env.adminPassword)) {
      failures.set(req.ip, { count: (record?.count ?? 0) + 1, last: now });
      return res.status(401).json({ error: "Password salah." });
    }

    failures.delete(req.ip);
    return res.json({ token: issueToken() });
  });

  /** Dipakai halaman admin untuk mengecek token yang tersimpan masih berlaku. */
  router.get("/session", requireAdmin, (_req, res) => res.json({ ok: true }));

  return router;
}
