// team.js - team profiles for the VoidScript website.
//
//   /admin          password-protected panel (ADMIN_PASSWORD) to add, edit and remove people
//   /team           everyone
//   /<name>         one person's page, e.g. /Callum or /axol (capitals don't matter)
//   /api/team       the team as JSON (the homepage shows it)
//
// Pictures and banners come live from Discord using each person's Discord ID,
// through your bot's token (DISCORD_BOT_TOKEN - in .env; it never reaches a page).
// If they've joined the Lanyard server, their online status shows too.
// Profiles live in data/team.json next to this file.
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const DATA = path.join(__dirname, "data", "team.json");
const RESERVED = new Set(["admin", "team", "api", "download", "github", "discord", "health", "robots.txt", "sitemap.xml", "ai", "style.css", "logo.png", "spooky.png", "404", "index", "public", "data"]);
const SLUG = /^[a-z0-9][a-z0-9-]{1,23}$/i;
// Each role gets its own colour and a written-for-you description.
const ROLES = {
  owner: { color: "#f5b942", about: (n) => `${n} founded VoidScript and leads where it goes next. From the first idea to every big update, ${n} shapes what VoidScript is: the look, the features, and making sure building on Roblox feels like talking to a teammate.` },
  "main developer": { color: "#8b6cff", about: (n) => `${n} is VoidScript's main developer, deep in the engine that connects AI to Roblox Studio. When something new ships or something breaks, ${n} is the one making it work, fast and reliably.` },
  developer: { color: "#4c8dff", about: (n) => `${n} builds VoidScript, working on the features you use every day and making building on Roblox with AI faster and smoother.` },
  designer: { color: "#f2557a", about: (n) => `${n} designs how VoidScript looks and feels - the screens, the icons and every little detail that makes it nice to use.` },
  moderator: { color: "#2fc58b", about: (n) => `${n} keeps the VoidScript community friendly and helpful, and is often the first to answer when someone needs a hand.` },
  tester: { color: "#2fc5c5", about: (n) => `${n} tests VoidScript before everyone else, finding the bugs so you never have to.` },
};
const roleOf = (r) => ROLES[String(r || "").trim().toLowerCase()] || { color: "#ff7a3d", about: (n) => `${n} is part of the VoidScript team, helping build the AI that builds Roblox games.` };

// ── storage ─────────────────────────────────────────────────────────────────
function load() {
  try { const v = JSON.parse(fs.readFileSync(DATA, "utf8")); return Array.isArray(v) ? v : []; } catch { return []; }
}
function save(list) {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  const tmp = DATA + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, DATA);
}
const nameOf = (p) => p.display || p.label || (p.slug.charAt(0).toUpperCase() + p.slug.slice(1));
const sorted = () => load().sort((a, b) => (a.order || 0) - (b.order || 0));

// ── Discord (cached 30 minutes) ─────────────────────────────────────────────
const dcache = new Map();
function getJSON(url, headers) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: Object.assign({ "User-Agent": "voidscript-site (https://voidscript.dev)" }, headers || {}), timeout: 6000 }, (res) => {
      let b = "";
      res.on("data", (c) => { b += c; });
      res.on("end", () => { try { resolve(res.statusCode === 200 ? JSON.parse(b) : null); } catch { resolve(null); } });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}
async function discordUser(id) {
  if (!/^\d{15,22}$/.test(String(id || ""))) return null;
  const hit = dcache.get(id);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.data;
  const token = process.env.DISCORD_BOT_TOKEN;
  const [u, lan] = await Promise.all([
    token ? getJSON(`https://discord.com/api/v10/users/${id}`, { Authorization: "Bot " + token }) : null,
    getJSON(`https://api.lanyard.rest/v1/users/${id}`),
  ]);
  const ld = lan && lan.success ? lan.data : null;
  const user = u || (ld && ld.discord_user) || null;
  const anim = (h) => String(h).startsWith("a_") ? "gif" : "png";
  const act = ld && Array.isArray(ld.activities) ? ld.activities.find((a) => a.type !== 4) : null;
  const custom = ld && Array.isArray(ld.activities) ? ld.activities.find((a) => a.type === 4) : null;
  const data = user ? {
    username: user.username,
    avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${id}/${user.avatar}.${anim(user.avatar)}?size=256`
      : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(id) >> 22n) % 6n)}.png`,
    banner: u && u.banner ? `https://cdn.discordapp.com/banners/${id}/${u.banner}.${anim(u.banner)}?size=600` : "",
    color: u && u.accent_color ? "#" + u.accent_color.toString(16).padStart(6, "0") : "",
    status: ld ? ld.discord_status : "",
    activity: act ? (act.type === 2 ? `Listening to ${act.details || act.name}` : act.type === 3 ? `Watching ${act.name}` : `Playing ${act.name}`) : "",
    note: custom && custom.state ? custom.state : "",
  } : null;
  if (data || !hit) dcache.set(id, { at: Date.now(), data });
  return data || (hit && hit.data) || null;
}
// Discord IDs carry the account's creation time.
const joinedYear = (id) => { try { return new Date(Number(BigInt(id) >> 22n) + 1420070400000).getFullYear(); } catch { return 0; } };

// ── admin sessions ──────────────────────────────────────────────────────────
const sessions = new Map();
const attempts = new Map();
const cookieOf = (req) => (String(req.headers.cookie || "").match(/(?:^|;\s*)vs_admin=([a-f0-9]{64})/) || [])[1];
function authed(req) {
  const t = cookieOf(req);
  const exp = t && sessions.get(t);
  if (!exp || exp < Date.now()) { if (t) sessions.delete(t); return false; }
  return true;
}
function sameish(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest(), y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = "";
    req.on("data", (c) => { b += c; if (b.length > 64 * 1024) { reject(new Error("too big")); req.destroy(); } });
    req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch { reject(new Error("bad json")); } });
    req.on("error", reject);
  });
}

// ── pages ───────────────────────────────────────────────────────────────────
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (/^https:\/\/[^\s"'<>]+$/i.test(String(u || "")) ? String(u) : "");
const STATUS = { online: "Online", idle: "Away", dnd: "Do not disturb", offline: "Offline" };
const SPOOKY_HEAD = `<script>(function(){var d=new Date(),m=d.getMonth();if(m===9||(m===10&&d.getDate()===1)||/[?&]spooky\\b/.test(location.search))document.documentElement.classList.add("spooky");})();</script>`;
const shell = (title, body, desc, image) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title><meta name="description" content="${esc(desc || "")}" />
<meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(desc || "")}" />
<meta property="og:image" content="${esc(image || "/logo.png")}" /><meta name="theme-color" content="#0e0f12" />
<link rel="icon" href="/logo.png" /><link rel="stylesheet" href="/style.css?v=5" />${SPOOKY_HEAD}</head>
<body class="tm-page"><div class="tm-sky" aria-hidden="true"></div>
<header class="nav"><div class="wrap nav-in"><a class="brand" href="/"><img src="/logo.png" alt="" width="26" height="26" /><span>Void<b>Script</b></span></a>
<nav class="links"><a href="/#features">Features</a><a href="/team">Team</a><a href="/github">GitHub</a><a href="/discord">Discord</a></nav><a class="btn sm primary" href="/download">Download</a></div></header>
<main class="wrap team-wrap">${body}</main>
<footer class="wrap foot"><span>VoidScript · free &amp; open source</span><span class="grow"></span><a href="/team">Team</a><a href="/github">GitHub</a><a href="/discord">Discord</a></footer>
<script>if(document.documentElement.classList.contains("spooky")){var b=document.querySelector(".brand span");if(b)b.innerHTML="Spooky<b>Script</b>";document.querySelectorAll('img[src="/logo.png"]').forEach(function(i){i.src="/spooky.png"});}</script>
<script>document.addEventListener("click",function(e){var b=e.target.closest("[data-copy]");if(!b)return;navigator.clipboard.writeText(location.origin+b.getAttribute("data-copy")).then(function(){b.textContent="Link copied";setTimeout(function(){b.textContent="Copy link"},1600)})});</script>
</body></html>`;

function view(p, d) {
  const role = roleOf(p.role);
  const name = nameOf(p);
  return {
    name, role,
    color: /^#[0-9a-f]{6}$/i.test(p.color || "") ? p.color : role.color,
    avatar: safeUrl(p.avatar) || (d && d.avatar) || "/logo.png",
    about: p.description || role.about(name),
    year: p.discord_id ? joinedYear(p.discord_id) : 0,
  };
}

function profileCard(p, d) {
  const v = view(p, d);
  const banner = d && d.banner;
  const live = d && d.status && d.status !== "offline";
  const links = (p.links || []).filter((l) => safeUrl(l.url)).map((l) => `<a class="btn sm" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || "Link")}</a>`).join("");
  return `<article class="pf" style="--tm:${esc(v.color)}">
    <div class="pf-banner"${banner ? ` style="background-image:url('${esc(banner)}')"` : ""}><div class="pf-glow"></div></div>
    <div class="pf-body">
      <div class="pf-top">
        <div class="pf-av"><span class="pf-ring"></span><img src="${esc(v.avatar)}" alt="" width="132" height="132" referrerpolicy="no-referrer" />${d && d.status ? `<i class="tm-st s-${esc(d.status)}" title="${esc(STATUS[d.status] || d.status)}"></i>` : ""}</div>
        <div class="pf-acts"><button class="btn sm" data-copy="/${esc(p.label || p.slug)}">Copy link</button>${links}</div>
      </div>
      <h1 class="pf-name">${esc(v.name)}</h1>
      ${d && d.username ? `<p class="pf-user">@${esc(d.username)}</p>` : ""}
      <div class="pf-badges">
        ${p.role ? `<span class="bdg main">${esc(p.role)}</span>` : ""}
        <span class="bdg">VoidScript team</span>
        ${v.year ? `<span class="bdg">On Discord since ${v.year}</span>` : ""}
      </div>
      ${live || (d && (d.activity || d.note)) ? `<div class="pf-live">${live ? `<i class="dot s-${esc(d.status)}"></i>${esc(STATUS[d.status] || "")}` : ""}${d.activity ? `<span>${esc(d.activity)}</span>` : ""}${d.note ? `<em>"${esc(d.note)}"</em>` : ""}</div>` : ""}
      <div class="pf-about"><h3>About ${esc(v.name)}</h3><p>${esc(v.about).replace(/\n/g, "<br />")}</p></div>
    </div></article>`;
}

function miniCard(p, d) {
  const v = view(p, d);
  return `<a class="tc" href="/${esc(p.label || p.slug)}" style="--tm:${esc(v.color)}">
    <span class="tc-av"><span class="pf-ring"></span><img src="${esc(v.avatar)}" alt="" width="84" height="84" loading="lazy" referrerpolicy="no-referrer" />${d && d.status ? `<i class="tm-st s-${esc(d.status)}"></i>` : ""}</span>
    <b>${esc(v.name)}</b>${p.role ? `<span class="bdg main">${esc(p.role)}</span>` : ""}
    <p>${esc(v.about.length > 120 ? v.about.slice(0, 117).replace(/\s+\S*$/, "") + "…" : v.about)}</p>
    <span class="tc-more">View profile →</span></a>`;
}

async function profilePage(p) {
  const d = await discordUser(p.discord_id);
  const others = sorted().filter((x) => x.slug !== p.slug);
  const od = await Promise.all(others.map((x) => discordUser(x.discord_id)));
  const v = view(p, d);
  const rest = others.length ? `<section class="pf-rest"><h3>The rest of the team</h3><div class="pf-rest-row">${others.map((x, i) => {
    const w = view(x, od[i]);
    return `<a href="/${esc(x.label || x.slug)}" style="--tm:${esc(w.color)}"><img src="${esc(w.avatar)}" alt="" width="44" height="44" loading="lazy" referrerpolicy="no-referrer" /><span><b>${esc(w.name)}</b><i>${esc(x.role || "Team")}</i></span></a>`;
  }).join("")}</div></section>` : "";
  return shell(`${v.name} · VoidScript`, `<div class="pf-wrap">${profileCard(p, d)}${rest}<a class="tm-back" href="/team">← The whole team</a></div>`,
    `${v.name}${p.role ? ", " + p.role : ""} of VoidScript. ${v.about}`.slice(0, 200), v.avatar);
}
async function teamPage() {
  const list = sorted();
  const ds = await Promise.all(list.map((p) => discordUser(p.discord_id)));
  const stack = list.slice(0, 6).map((p, i) => `<img src="${esc(view(p, ds[i]).avatar)}" alt="" width="40" height="40" referrerpolicy="no-referrer" />`).join("");
  const body = list.length ? `<section class="tm-hero"><div class="tm-stack">${stack}</div><p class="eyebrow">The team</p><h2>The people behind VoidScript</h2>
      <p class="muted">${list.length} ${list.length === 1 ? "person" : "people"} building the AI that builds Roblox games.</p></section>
    <div class="tm-grid">${list.map((p, i) => miniCard(p, ds[i])).join("")}</div>`
    : `<section class="tm-hero"><h2>The team page is coming soon.</h2></section>`;
  return shell("Team · VoidScript", body, "Meet the people behind VoidScript.");
}

// ── routes ──────────────────────────────────────────────────────────────────
async function handle(req, res, url, send, TYPES) {
  const p = url.pathname;
  const html = (code, body) => send(req, res, code, body, TYPES[".html"], { "Cache-Control": "no-cache" });
  const json = (code, data, cache) => send(req, res, code, JSON.stringify(data), TYPES[".json"], { "Cache-Control": cache || "no-store" });

  if (p === "/team" || p === "/team/") { html(200, await teamPage()); return true; }
  if (p === "/api/team") {
    const list = sorted();
    const ds = await Promise.all(list.map((x) => discordUser(x.discord_id)));
    json(200, list.map((x, i) => { const v = view(x, ds[i]); return { name: v.name, role: x.role || "", url: "/" + (x.label || x.slug), avatar: v.avatar, color: v.color, status: (ds[i] && ds[i].status) || "" }; }), "public, max-age=300");
    return true;
  }
  if (p === "/admin") { send(req, res, 200, fs.readFileSync(path.join(__dirname, "public", "admin.html")), TYPES[".html"], { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" }); return true; }

  if (p.startsWith("/api/admin/")) {
    const ip = String(req.headers["cf-connecting-ip"] || req.socket.remoteAddress || "");
    if (p === "/api/admin/login" && req.method === "POST") {
      const a = attempts.get(ip) || { n: 0, until: 0 };
      if (a.until > Date.now()) { json(429, { error: "Too many tries - wait a few minutes." }); return true; }
      if (!process.env.ADMIN_PASSWORD) { json(503, { error: "Set ADMIN_PASSWORD in the website's .env file first." }); return true; }
      const body = await readBody(req).catch(() => ({}));
      if (!sameish(body.password || "", process.env.ADMIN_PASSWORD)) {
        a.n += 1; if (a.n >= 5) { a.until = Date.now() + 10 * 60 * 1000; a.n = 0; }
        attempts.set(ip, a);
        json(401, { error: "Wrong password." }); return true;
      }
      attempts.delete(ip);
      const t = crypto.randomBytes(32).toString("hex");
      sessions.set(t, Date.now() + 12 * 60 * 60 * 1000);
      send(req, res, 200, JSON.stringify({ ok: true }), TYPES[".json"], { "Set-Cookie": `vs_admin=${t}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`, "Cache-Control": "no-store" });
      return true;
    }
    if (p === "/api/admin/logout") { sessions.delete(cookieOf(req)); send(req, res, 200, "{}", TYPES[".json"], { "Set-Cookie": "vs_admin=; Path=/; Max-Age=0" }); return true; }
    if (!authed(req)) { json(401, { error: "Log in first." }); return true; }
    if (p === "/api/admin/team" && req.method === "GET") { json(200, { team: load(), discord: !!process.env.DISCORD_BOT_TOKEN, roles: Object.keys(ROLES) }); return true; }
    if (p === "/api/admin/discord" && req.method === "GET") { json(200, { user: await discordUser(url.searchParams.get("id")) }); return true; }
    if (p === "/api/admin/about" && req.method === "GET") { json(200, { about: roleOf(url.searchParams.get("role")).about(url.searchParams.get("name") || "They") }); return true; }
    if (p === "/api/admin/team" && req.method === "POST") {
      const b = await readBody(req).catch(() => null);
      if (!b) { json(400, { error: "Bad request." }); return true; }
      const label = String(b.slug || "").trim();
      const slug = label.toLowerCase();
      if (!SLUG.test(label) || RESERVED.has(slug)) { json(400, { error: "The page name must be 2-24 letters, numbers or dashes, and not a reserved word." }); return true; }
      if (b.discord_id && !/^\d{15,22}$/.test(String(b.discord_id))) { json(400, { error: "A Discord ID is 15-22 digits (right-click someone in Discord → Copy User ID)." }); return true; }
      const entry = {
        slug, label, discord_id: String(b.discord_id || ""), display: String(b.display || "").slice(0, 40),
        role: String(b.role || "").slice(0, 40), description: String(b.description || "").slice(0, 1200),
        color: /^#[0-9a-f]{6}$/i.test(b.color || "") ? b.color : "", avatar: safeUrl(b.avatar),
        links: (Array.isArray(b.links) ? b.links : []).slice(0, 4).map((l) => ({ label: String(l.label || "").slice(0, 24), url: safeUrl(l.url) })).filter((l) => l.url),
        order: Number(b.order) || 0,
      };
      const old = String(b.old_slug || "").toLowerCase();
      const list = load().filter((x) => x.slug !== slug && x.slug !== old);
      list.push(entry);
      save(list);
      dcache.delete(entry.discord_id);
      json(200, { ok: true, team: list });
      return true;
    }
    if (p === "/api/admin/team" && req.method === "DELETE") {
      const slug = String(url.searchParams.get("slug") || "").toLowerCase();
      save(load().filter((x) => x.slug !== slug));
      json(200, { ok: true, team: load() });
      return true;
    }
    json(404, { error: "Not found." });
    return true;
  }

  // /<name> → that person's page (capitals don't matter)
  const m = p.match(/^\/([a-z0-9][a-z0-9-]{1,23})\/?$/i);
  if (m && (req.method === "GET" || req.method === "HEAD")) {
    const person = load().find((x) => x.slug === m[1].toLowerCase());
    if (person) { html(200, await profilePage(person)); return true; }
  }
  return false;
}

module.exports = { handle };
