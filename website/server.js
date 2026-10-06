// VoidScript website - a tiny static server with no dependencies, made for
// Wispbyte (or any Node host). Wispbyte gives the port in SERVER_PORT.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.SERVER_PORT || process.env.PORT || 3000);
const ROOT = path.join(__dirname, "public");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".json": "application/json", ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
};

// The latest release, cached for 10 minutes so the page can show the version.
let release = { at: 0, data: null };
function latestRelease() {
  if (Date.now() - release.at < 10 * 60 * 1000 && release.data) return Promise.resolve(release.data);
  return new Promise((resolve) => {
    const req = require("https").get("https://api.github.com/repos/cjl26rg2/Void-Script/releases/latest",
      { headers: { "User-Agent": "voidscript-site", Accept: "application/vnd.github+json" }, timeout: 6000 }, (res) => {
        let body = "";
        res.on("data", (c) => { body += c; });
        res.on("end", () => {
          try {
            const r = JSON.parse(body);
            const asset = (r.assets || [])[0];
            release = { at: Date.now(), data: { version: r.tag_name, name: r.name, url: r.html_url, download: asset ? asset.browser_download_url : r.html_url, published: r.published_at } };
          } catch { /* keep the last good answer */ }
          resolve(release.data);
        });
      });
    req.on("error", () => resolve(release.data));
    req.on("timeout", () => { req.destroy(); resolve(release.data); });
  });
}

function send(res, code, body, type, extra) {
  res.writeHead(code, Object.assign({ "Content-Type": type, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" }, extra || {}));
  res.end(body);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed", "text/plain");
  if (url.pathname === "/api/release") {
    const data = await latestRelease();
    return send(res, data ? 200 : 503, JSON.stringify(data || { error: "unavailable" }), "application/json", { "Cache-Control": "public, max-age=300" });
  }
  if (url.pathname === "/download") {
    const data = await latestRelease();
    res.writeHead(302, { Location: data ? data.download : "https://github.com/cjl26rg2/Void-Script/releases/latest" });
    return res.end();
  }
  // Static files - never outside ROOT.
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT)) return send(res, 403, "Forbidden", "text/plain");
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  } catch {
    file = path.join(ROOT, "404.html");
    return fs.readFile(file, (err, buf) => send(res, 404, err ? "Not found" : buf, "text/html; charset=utf-8"));
  }
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, "Not found", "text/plain");
    const ext = path.extname(file).toLowerCase();
    send(res, 200, req.method === "HEAD" ? "" : buf, TYPES[ext] || "application/octet-stream",
      { "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=86400" });
  });
}).listen(PORT, "0.0.0.0", () => console.log(`VoidScript site on port ${PORT}`));
