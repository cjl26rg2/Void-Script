// VoidScript website - a tiny static server with no dependencies, made for
// Wispbyte (or any Node host) behind Cloudflare. Wispbyte gives the port in SERVER_PORT.
"use strict";
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// Settings can live in a .env file next to this one (hosts like Wispbyte don't let
// you add your own environment variables): ADMIN_PASSWORD=..., DISCORD_BOT_TOKEN=...
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
} catch { /* no .env - fine */ }
console.log(process.env.ADMIN_PASSWORD ? "Admin panel: on" : "Admin panel: off (no ADMIN_PASSWORD in .env)");
const team = require("./team");

const PORT = Number(process.env.SERVER_PORT || process.env.PORT || 3000);
const ROOT = path.join(__dirname, "public");
const SITE = process.env.SITE_URL || "https://voidscript.dev";
const REPO = "cjl26rg2/Void-Script";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".json": "application/json; charset=utf-8",
  ".webp": "image/webp", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
};
const COMPRESS = new Set([".html", ".css", ".js", ".svg", ".json", ".txt", ".xml"]);

// Every response: HTTPS only, no framing, and anything stray upgraded to https.
const SECURITY = {
  "Strict-Transport-Security": "max-age=31536000",
  "Content-Security-Policy": "upgrade-insecure-requests; default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://api.github.com; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

// ── GitHub info, cached so the page never waits on (or hammers) GitHub ──────
const cache = {};
function github(apiPath, ttlMs) {
  const hit = cache[apiPath];
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.data);
  return new Promise((resolve) => {
    const req = https.get("https://api.github.com/repos/" + REPO + apiPath,
      { headers: Object.assign({ "User-Agent": "voidscript-site", Accept: "application/vnd.github+json" },
          // Optional: a GitHub token (no scopes needed) lifts the limit from 60 to 5000 requests an hour.
          process.env.GITHUB_TOKEN ? { Authorization: "Bearer " + process.env.GITHUB_TOKEN } : {}), timeout: 7000 }, (res) => {
        let body = "";
        res.on("data", (c) => { body += c; });
        res.on("end", () => {
          try { if (res.statusCode === 200) cache[apiPath] = { at: Date.now(), data: JSON.parse(body) }; } catch { /* keep the last good answer */ }
          resolve(cache[apiPath] ? cache[apiPath].data : null);
        });
      });
    req.on("error", () => resolve(hit ? hit.data : null));
    req.on("timeout", () => { req.destroy(); resolve(hit ? hit.data : null); });
  });
}
async function latestRelease() {
  const r = await github("/releases/latest", 10 * 60 * 1000);
  if (!r) return null;
  const asset = (r.assets || [])[0];
  return { version: r.tag_name, name: r.name, url: r.html_url, download: asset ? asset.browser_download_url : r.html_url,
    published: r.published_at, notes: String(r.body || "").slice(0, 20000) };
}
async function stats() {
  const [repo, releases] = await Promise.all([github("", 30 * 60 * 1000), github("/releases?per_page=100", 30 * 60 * 1000)]);
  const downloads = Array.isArray(releases) ? releases.reduce((n, r) => n + (r.assets || []).reduce((m, a) => m + (a.download_count || 0), 0), 0) : null;
  return { stars: repo ? repo.stargazers_count : null, forks: repo ? repo.forks_count : null, downloads, releases: Array.isArray(releases) ? releases.length : null };
}

// ── responses ────────────────────────────────────────────────────────────────
function send(req, res, code, body, type, extra) {
  const headers = Object.assign({ "Content-Type": type, Vary: "Accept-Encoding" }, SECURITY, extra || {});
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const ext = Object.keys(TYPES).find((e) => TYPES[e] === type);
  if (buf.length > 1024 && (COMPRESS.has(ext) || /json|text|xml|svg/.test(type))) {
    const enc = String(req.headers["accept-encoding"] || "");
    if (/\bbr\b/.test(enc)) { buf = zlib.brotliCompressSync(buf); headers["Content-Encoding"] = "br"; }
    else if (/\bgzip\b/.test(enc)) { buf = zlib.gzipSync(buf); headers["Content-Encoding"] = "gzip"; }
  }
  headers["Content-Length"] = buf.length;
  res.writeHead(code, headers);
  res.end(req.method === "HEAD" ? undefined : buf);
}
const json = (req, res, data, maxAge) => send(req, res, data ? 200 : 503, JSON.stringify(data || { error: "unavailable" }), TYPES[".json"], { "Cache-Control": `public, max-age=${maxAge}` });

const files = new Map(); // path -> { buf, etag, mtime }
function readStatic(file) {
  const st = fs.statSync(file);
  const hit = files.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit;
  const buf = fs.readFileSync(file);
  const entry = { buf, etag: `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`, mtime: st.mtimeMs };
  files.set(file, entry);
  return entry;
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    // Behind Cloudflare: anyone who arrived over plain http goes to https.
    if (req.headers["x-forwarded-proto"] === "http" && req.headers.host && !/^(localhost|127\.)/.test(req.headers.host)) {
      res.writeHead(301, { Location: "https://" + req.headers.host + req.url });
      return res.end();
    }
    // Team pages (/team, /<name>) and the admin panel (/admin).
    if (await team.handle(req, res, url, send, TYPES)) return;
    if (req.method !== "GET" && req.method !== "HEAD") return send(req, res, 405, "Method not allowed", TYPES[".txt"]);

    switch (url.pathname) {
      case "/api/release": return json(req, res, await latestRelease(), 300);
      case "/api/stats": return json(req, res, await stats(), 900);
      case "/health": return send(req, res, 200, "ok", TYPES[".txt"], { "Cache-Control": "no-store" });
      case "/download": {
        const r = await latestRelease();
        res.writeHead(302, Object.assign({ Location: r ? r.download : `https://github.com/${REPO}/releases/latest`, "Cache-Control": "no-store" }, SECURITY));
        return res.end();
      }
      case "/github": res.writeHead(302, { Location: `https://github.com/${REPO}` }); return res.end();
      case "/discord": res.writeHead(302, { Location: "https://discord.gg/EyGxnp2jaw" }); return res.end();
      case "/robots.txt": return send(req, res, 200, `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`, TYPES[".txt"], { "Cache-Control": "public, max-age=86400" });
      case "/sitemap.xml": return send(req, res, 200,
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url><url><loc>${SITE}/team</loc></url></urlset>\n`,
        TYPES[".xml"], { "Cache-Control": "public, max-age=86400" });
    }

    // Static files - never outside ROOT.
    let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT)) return send(req, res, 403, "Forbidden", TYPES[".txt"]);
    try { if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html"); }
    catch {
      const nf = path.join(ROOT, "404.html");
      return send(req, res, 404, fs.existsSync(nf) ? readStatic(nf).buf : "Not found", TYPES[".html"], { "Cache-Control": "no-cache" });
    }
    const f = readStatic(file);
    const ext = path.extname(file).toLowerCase();
    if (req.headers["if-none-match"] === f.etag) { res.writeHead(304, Object.assign({ ETag: f.etag }, SECURITY)); return res.end(); }
    send(req, res, 200, f.buf, TYPES[ext] || "application/octet-stream",
      { ETag: f.etag, "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=86400" });
  } catch (e) {
    send(req, res, 500, "Something went wrong.", TYPES[".txt"]);
    console.error(e);
  }
}).listen(PORT, "0.0.0.0", () => console.log(`VoidScript site on port ${PORT}`));
