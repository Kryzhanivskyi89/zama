import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// базові налаштування
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

// upstream-и Zama
const RELAYER_UPSTREAM = process.env.RELAYER_UPSTREAM || "https://relayer.testnet.zama.org";
const GATEWAY_UPSTREAM = process.env.GATEWAY_UPSTREAM || "https://gateway.testnet.zama.org";

// статичний фронт
const publicDir = path.join(__dirname, "frontend", "public");
const indexHtmlPath = path.join(publicDir, "index.html");
if (!fs.existsSync(indexHtmlPath)) {
  throw new Error(`index.html not found at ${indexHtmlPath}`);
}

const app = express();

app.use(cors());

// COOP/COEP для Relayer SDK (SharedArrayBuffer)
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});

app.use(express.raw({ type: "*/*", limit: "10mb" }));

function buildUpstreamUrl(prefix, upstreamBase, originalUrl) {
  const rest = originalUrl.startsWith(prefix) ? originalUrl.slice(prefix.length) : originalUrl;
  return upstreamBase.replace(/\/+$/, "") + rest;
}

function sanitizeRequestHeaders(req) {
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  delete headers["content-length"];
  headers["accept-encoding"] = "identity";
  return headers;
}

function sanitizeResponseHeaders(upHeaders) {
  const headers = {};
  for (const [k, v] of upHeaders.entries()) {
    const key = k.toLowerCase();
    if (key === "content-encoding") continue;
    if (key === "content-length") continue;
    if (key === "transfer-encoding") continue;
    headers[k] = v;
  }
  return headers;
}

async function proxyHandler(prefix, upstreamBase, req, res) {
  try {
    const upstreamUrl = buildUpstreamUrl(prefix, upstreamBase, req.originalUrl);
    const method = req.method.toUpperCase();
    const headers = sanitizeRequestHeaders(req);
    const hasBody = !["GET", "HEAD"].includes(method);
    const body = hasBody ? req.body : undefined;

    const upstreamResp = await fetch(upstreamUrl, {
      method,
      headers,
      body: hasBody ? body : undefined,
      redirect: "follow",
    });

    const outHeaders = sanitizeResponseHeaders(upstreamResp.headers);
    res.status(upstreamResp.status);
    for (const [k, v] of Object.entries(outHeaders)) {
      res.setHeader(k, v);
    }
    res.removeHeader("content-encoding");
    res.removeHeader("Content-Encoding");

    const buf = Buffer.from(await upstreamResp.arrayBuffer());
    res.send(buf);
  } catch (e) {
    console.error("[proxy error]", prefix, e);
    res.status(502).json({ error: "proxy_failed", message: String(e?.message || e) });
  }
}

// ПРОКСІ ДО ZAMA (ВАЖЛИВО: до static)
app.all(/^\/relayer(\/.*)?$/, (req, res) =>
  proxyHandler("/relayer", RELAYER_UPSTREAM, req, res)
);
app.all(/^\/gateway(\/.*)?$/, (req, res) =>
  proxyHandler("/gateway", GATEWAY_UPSTREAM, req, res)
);

// статичні файли
app.use(express.static(publicDir));

// SPA fallback
app.use((req, res) => {
  res.sendFile(indexHtmlPath);
});

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server up at http://localhost:${PORT}`);
  console.log(`Relayer upstream: ${RELAYER_UPSTREAM}`);
  console.log(`Gateway upstream: ${GATEWAY_UPSTREAM}`);
});
