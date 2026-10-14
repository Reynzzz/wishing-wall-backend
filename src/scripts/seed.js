/**
 * Posts dummy wishes through the real API, so they are stored in Postgres
 * *and* broadcast to every open wall via `wish:new`.
 *
 *   npm run db:seed                  # 12 wishes, 1.5 s apart
 *   npm run db:seed -- 30 --delay 500
 *
 * The server must be running. Images are generated here as plain PNGs
 * (no image dependency) in a mix of portrait / landscape / square sizes.
 */
import zlib from "node:zlib";

import { env } from "../config/env.js";

const args = process.argv.slice(2);
const delayIndex = args.indexOf("--delay");
const delayMs = delayIndex >= 0 ? Number(args[delayIndex + 1]) : 1500;
const count = Number(args.find((arg, i) => !arg.startsWith("--") && i !== delayIndex + 1)) || 12;

const API_URL = `http://localhost:${env.port}/api/wishes`;

const PEOPLE = [
  ["Rayhan", "Semoga sukses selalu dan makin kompak!"],
  ["Putri", "Semoga semua impian kita tahun ini terwujud."],
  ["Budi", "Sehat selalu buat kita semua, aamiin."],
  ["Sinta", "Terima kasih untuk semua kenangan indahnya."],
  ["Dimas", "Semoga bisnis makin lancar dan berkah."],
  ["Anisa", "Mau liburan bareng keluarga tahun depan!"],
  ["Fajar", "Lulus tepat waktu, kerja di tempat impian."],
  ["Maya", "Semoga ketemu lagi di acara berikutnya."],
  ["Kevin", "Wish you all the best, guys!"],
  ["Lestari", "Damai dan bahagia untuk semua orang."],
  ["Agus", "Semoga bisa segera naik haji bareng ibu."],
  ["Nadia", "Semoga kita semua selalu dikelilingi orang baik."],
  ["Yoga", "Pengen punya studio musik sendiri."],
  ["Citra", "Semoga adik cepat sembuh dan ceria lagi."],
  ["Hendra", "Semoga tahun ini penuh cerita seru."],
];

const SIZES = [
  [480, 640], // 3:4 portrait
  [640, 480], // 4:3 landscape
  [540, 540], // square
  [450, 800], // 9:16 story
];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/** Diagonal two-colour gradient with a soft light spot, as an RGB PNG. */
function makePng(width, height, hueA, hueB) {
  const colorA = hsl(hueA, 0.7, 0.55);
  const colorB = hsl(hueB, 0.75, 0.35);
  const spotX = width * (0.25 + Math.random() * 0.5);
  const spotY = height * (0.2 + Math.random() * 0.4);
  const spotR = Math.min(width, height) * 0.45;

  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2;
      const glow = Math.max(0, 1 - Math.hypot(x - spotX, y - spotY) / spotR) * 0.45;
      const o = y * stride + 1 + x * 3;
      for (let c = 0; c < 3; c++) {
        const base = colorA[c] * (1 - t) + colorB[c] * t;
        raw[o + c] = Math.min(255, Math.round(base + (255 - base) * glow));
      }
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit, RGB, deflate, no filter, no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => v * 255);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

console.log(`[seed] mengirim ${count} wish dummy ke ${API_URL}`);

for (let i = 0; i < count; i++) {
  const [name, message] = PEOPLE[i % PEOPLE.length];
  const [width, height] = SIZES[i % SIZES.length];
  const hue = (i * 47 + Math.random() * 30) % 360;
  const png = makePng(width, height, hue, (hue + 70) % 360);

  const form = new FormData();
  form.set("name", name);
  form.set("message", message);
  form.set("width", String(width));
  form.set("height", String(height));
  form.set("image", new Blob([png], { type: "image/png" }), `dummy-${i + 1}.png`);

  try {
    const response = await fetch(API_URL, { method: "POST", body: form });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    console.log(`[seed] ${i + 1}/${count}  ${name} (${width}x${height})`);
  } catch (error) {
    console.error(`[seed] gagal — server jalan di port ${env.port}? ${error.message}`);
    process.exit(1);
  }

  if (i < count - 1) await sleep(delayMs);
}

console.log("[seed] selesai.");
