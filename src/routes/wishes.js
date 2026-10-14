import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { Router } from "express";
import formidable from "formidable";

import { env } from "../config/env.js";
import { Wish } from "../models/wish.js";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const BOOTSTRAP_LIMIT = 60;
const MAX_LIMIT = 500;
/** Harus sama dengan MAX_MESSAGE_LENGTH / MAX_NAME_LENGTH di web/src/lib/wish.ts. */
const MAX_MESSAGE_LENGTH = 40;
const MAX_NAME_LENGTH = 20;

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".webm", ".mp4"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** formidable hands back `string | string[]` for every field. */
const firstValue = (value) => (Array.isArray(value) ? value[0] : value);

function sanitizeText(value, maxLength) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

/** @param {import("socket.io").Server} io */
export function createWishesRouter(io) {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const limit = clampNumber(req.query.limit, 1, MAX_LIMIT, BOOTSTRAP_LIMIT);
      const rows = await Wish.findAll({ order: [["createdAt", "DESC"]], limit });
      res.json({ wishes: rows.map((row) => row.toClient()) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    const form = formidable({
      uploadDir: env.uploadDir,
      keepExtensions: true,
      maxFiles: 1,
      maxFileSize: MAX_FILE_BYTES,
      filter: ({ mimetype }) =>
        Boolean(mimetype && (mimetype.startsWith("image/") || mimetype.startsWith("video/"))),
    });

    let fields;
    let files;
    try {
      [fields, files] = await form.parse(req);
    } catch (error) {
      console.error("[wishes] upload rejected:", error.message);
      return res
        .status(400)
        .json({ error: "Upload ditolak. Pastikan berkas berupa gambar/video di bawah 15 MB." });
    }

    const uploaded = files.image?.[0];
    if (!uploaded) {
      return res.status(400).json({ error: "Tidak ada berkas gambar atau video." });
    }

    const message = sanitizeText(firstValue(fields.message), MAX_MESSAGE_LENGTH);
    if (!message) {
      // No stray file left behind when the payload turns out to be invalid.
      await fsp.rm(uploaded.filepath, { force: true });
      return res.status(400).json({ error: "Wish tidak boleh kosong." });
    }

    const rawExt = path.extname(uploaded.originalFilename ?? "").toLowerCase();
    const filename = `${randomUUID()}${ALLOWED_EXT.has(rawExt) ? rawExt : ".jpg"}`;

    try {
      await fsp.rename(uploaded.filepath, path.join(env.uploadDir, filename));

      const row = await Wish.create({
        name: sanitizeText(firstValue(fields.name), MAX_NAME_LENGTH) || "Anonim",
        message,
        filename,
        // The browser already measured the bitmap; trusting it here saves an
        // image-decoding dependency on the server.
        width: clampNumber(firstValue(fields.width), 16, 8000, 1200),
        height: clampNumber(firstValue(fields.height), 16, 8000, 1600),
      });

      const wish = row.toClient();
      io.emit("wish:new", wish);
      console.log(`[wishes] wish dari ${wish.name} disiarkan ke ${io.engine.clientsCount} klien`);
      return res.status(201).json({ wish });
    } catch (error) {
      await fsp.rm(path.join(env.uploadDir, filename), { force: true });
      return next(error);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const { id } = req.params;
      const row = UUID_RE.test(id) ? await Wish.findByPk(id) : null;
      if (!row) return res.status(404).json({ error: "Wish not found" });

      const deleted = row.toClient();
      await row.destroy();
      await fsp.rm(path.join(env.uploadDir, row.filename), { force: true });

      io.emit("wish:delete", { id });
      console.log(`[wishes] wish ${id} deleted by admin`);
      return res.json({ success: true, deleted });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
