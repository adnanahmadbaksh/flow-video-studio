// Flow Video Studio — a tiny zero-dependency server that generates AI videos
// with Google's Veo models (the engine behind Google Flow) via the Gemini API.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const VIDEO_DIR = path.join(__dirname, "videos");
const PUBLIC_DIR = path.join(__dirname, "public");
const POLL_MS = 8000;

fs.mkdirSync(VIDEO_DIR, { recursive: true });

if (!API_KEY) {
  console.log("ℹ  No GEMINI_API_KEY env var — paste your key in the app page instead.");
}

/** In-memory job store: id -> job */
const jobs = new Map();

async function googleFetch(url, key, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { "x-goog-api-key": key, ...(opts.body ? { "Content-Type": "application/json" } : {}) },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      msg = body?.error?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  return res;
}

async function startGeneration(job) {
  const instance = { prompt: job.prompt };
  if (job.image) instance.image = { bytesBase64Encoded: job.image.data, mimeType: job.image.mimeType };

  const parameters = {};
  if (job.aspectRatio) parameters.aspectRatio = job.aspectRatio;
  if (job.resolution) parameters.resolution = job.resolution;
  if (job.durationSeconds) parameters.durationSeconds = Number(job.durationSeconds);
  if (job.negativePrompt) parameters.negativePrompt = job.negativePrompt;

  const res = await googleFetch(`${API_BASE}/models/${encodeURIComponent(job.model)}:predictLongRunning`, job.apiKey, {
    method: "POST",
    body: JSON.stringify({ instances: [instance], parameters }),
  });
  const op = await res.json();
  job.operation = op.name;
  job.status = "generating";
  delete job.image; // free memory
  pollJob(job);
}

async function pollJob(job) {
  try {
    const res = await googleFetch(`${API_BASE}/${job.operation}`, job.apiKey);
    const op = await res.json();
    if (!op.done) {
      setTimeout(() => pollJob(job), POLL_MS);
      return;
    }
    if (op.error) throw new Error(op.error.message || "Generation failed");

    const resp = op.response?.generateVideoResponse || op.response || {};
    const sample = resp.generatedSamples?.[0] || resp.generatedVideos?.[0];
    const uri = sample?.video?.uri;
    if (!uri) {
      const reason = resp.raiMediaFilteredReasons?.join(" ") || "No video returned (it may have been blocked by safety filters).";
      throw new Error(reason);
    }

    job.status = "downloading";
    const vid = await googleFetch(uri, job.apiKey);
    const file = `${job.id}.mp4`;
    fs.writeFileSync(path.join(VIDEO_DIR, file), Buffer.from(await vid.arrayBuffer()));
    job.videoUrl = `/videos/${file}`;
    job.status = "done";
    job.finishedAt = Date.now();
  } catch (err) {
    job.status = "error";
    job.error = err.message;
  }
}

function sendJson(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) reject(new Error("Request too large"));
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".mp4": "video/mp4", ".svg": "image/svg+xml" };

function serveStatic(res, baseDir, relPath) {
  const filePath = path.normalize(path.join(baseDir, relPath));
  if (!filePath.startsWith(baseDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    return res.end("Not found");
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

const publicJob = ({ image, operation, apiKey, ...rest }) => rest;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/status") {
      return sendJson(res, 200, { hasKey: Boolean(API_KEY) });
    }
    if (req.method === "GET" && url.pathname === "/api/jobs") {
      return sendJson(res, 200, [...jobs.values()].map(publicJob).reverse());
    }
    if (req.method === "POST" && url.pathname === "/api/generate") {
      const body = JSON.parse(await readBody(req));
      const apiKey = String(req.headers["x-user-api-key"] || "").trim() || API_KEY;
      if (!apiKey) return sendJson(res, 400, { error: "Please paste your Gemini API key at the top of the form." });
      if (!body.prompt?.trim()) return sendJson(res, 400, { error: "Prompt is required." });

      const job = {
        id: crypto.randomUUID(),
        prompt: body.prompt.trim(),
        negativePrompt: body.negativePrompt?.trim() || "",
        model: body.model || "veo-3.1-generate-preview",
        aspectRatio: body.aspectRatio,
        resolution: body.resolution,
        durationSeconds: body.durationSeconds,
        hasImage: Boolean(body.image),
        image: body.image,
        apiKey,
        status: "queued",
        createdAt: Date.now(),
      };
      jobs.set(job.id, job);
      startGeneration(job).catch((err) => {
        job.status = "error";
        job.error = err.message;
      });
      return sendJson(res, 202, publicJob(job));
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/api/jobs/")) {
      const id = url.pathname.split("/").pop();
      const job = jobs.get(id);
      if (job?.videoUrl) fs.rmSync(path.join(VIDEO_DIR, `${id}.mp4`), { force: true });
      jobs.delete(id);
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === "GET" && url.pathname.startsWith("/videos/")) {
      return serveStatic(res, VIDEO_DIR, url.pathname.slice("/videos/".length));
    }
    if (req.method === "GET") {
      return serveStatic(res, PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname);
    }
    res.writeHead(405);
    res.end();
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => console.log(`🎬 Flow Video Studio running at http://localhost:${PORT}`));
