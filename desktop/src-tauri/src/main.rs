// SPDX-License-Identifier: GPL-3.0-or-later
// VoidScript Desktop - the app that runs the Roblox Studio bridge, shows its live
// status, lists every tool, and hosts a built-in AI chat (NVIDIA API) that builds
// in Studio through the bridge. Optional, off-by-default workspace access lets the
// AI read/write files and run commands inside ONE folder the user picks.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, Read};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WindowEvent};
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::tungstenite::Message;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const BRIDGE_URL: &str = "ws://127.0.0.1:17613";
const NVIDIA_BASE: &str = "https://integrate.api.nvidia.com/v1";
const OPENROUTER_BASE: &str = "https://openrouter.ai/api/v1";
const LOG_CAP: usize = 3000;
const RUN_TIMEOUT: Duration = Duration::from_secs(120);
const OUTPUT_CAP: usize = 60_000;
const READ_CAP: u64 = 512 * 1024;
// start.bat exits with this when it just installed an update (see start.bat).
const EXIT_UPDATED: i32 = 99;

fn yes() -> bool { true }

#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
struct Settings {
    accepted_disclaimer: bool,
    provider: String, // "nvidia" | "openrouter"
    nvidia_key: String,
    nvidia_model: String,
    openrouter_key: String,
    openrouter_model: String,
    workspace_enabled: bool,
    workspace_dir: String,
    access: String, // "ask" | "sandbox" | "full"
    reply_language: String,
    #[serde(default = "yes")]
    auto_start_bridge: bool,
    #[serde(default = "yes")]
    close_to_tray: bool,
    theme: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            accepted_disclaimer: false,
            provider: "nvidia".into(),
            nvidia_key: String::new(),
            nvidia_model: String::new(),
            openrouter_key: String::new(),
            openrouter_model: String::new(),
            workspace_enabled: false,
            workspace_dir: String::new(),
            access: "sandbox".into(),
            reply_language: String::new(),
            auto_start_bridge: true,
            close_to_tray: true,
            theme: "dark".into(),
        }
    }
}

// What the UI sees: never the raw API key, only whether one is set.
#[derive(Serialize, Clone)]
struct SettingsView {
    accepted_disclaimer: bool,
    provider: String,
    nvidia_key_set: bool,
    nvidia_key_hint: String,
    nvidia_model: String,
    openrouter_key_set: bool,
    openrouter_key_hint: String,
    openrouter_model: String,
    workspace_enabled: bool,
    workspace_dir: String,
    access: String,
    reply_language: String,
    auto_start_bridge: bool,
    close_to_tray: bool,
    theme: String,
}

// People paste keys as `Bearer nvapi-…`, in quotes, or with a line break from the
// copy button - all of which the API rejects as a bad key. Keep only the token.
fn clean_key(k: &str) -> String {
    let k: String = k.chars().filter(|c| !c.is_whitespace() && !matches!(c, '"' | '\'' | '`' | '\u{200b}' | '\u{feff}')).collect();
    let low = k.to_ascii_lowercase();
    if low.starts_with("bearer") && k.len() > 6 { k[6..].to_string() }
    else if low.starts_with("authorization:bearer") { k[20..].to_string() }
    else { k }
}

// "…ab12" - enough for the user to recognise a saved key, never the key itself.
fn key_hint(k: &str) -> String {
    let k = k.trim();
    if k.len() > 8 && k.is_ascii() { format!("…{}", &k[k.len() - 4..]) } else { String::new() }
}

impl From<&Settings> for SettingsView {
    fn from(s: &Settings) -> Self {
        SettingsView {
            accepted_disclaimer: s.accepted_disclaimer,
            provider: if s.provider == "openrouter" { "openrouter".into() } else { "nvidia".into() },
            nvidia_key_set: !s.nvidia_key.trim().is_empty(),
            nvidia_key_hint: key_hint(&s.nvidia_key),
            nvidia_model: s.nvidia_model.clone(),
            openrouter_key_set: !s.openrouter_key.trim().is_empty(),
            openrouter_key_hint: key_hint(&s.openrouter_key),
            openrouter_model: s.openrouter_model.clone(),
            workspace_enabled: s.workspace_enabled,
            access: match s.access.as_str() { "ask" | "full" => s.access.clone(), _ => "sandbox".into() },
            workspace_dir: s.workspace_dir.clone(),
            reply_language: s.reply_language.clone(),
            auto_start_bridge: s.auto_start_bridge,
            close_to_tray: s.close_to_tray,
            theme: s.theme.clone(),
        }
    }
}

#[derive(Serialize, Clone, Default)]
struct BridgeState {
    process: String, // stopped | starting | running | updating | error | missing
    connected: bool,
    mcp_alive: bool,
    studio: Option<bool>,
    studio_app: Option<bool>,
    place_name: String,
    tools: Vec<Value>,
    servers: Vec<Value>,
    exit_code: Option<i32>,
    root: String,
}

#[derive(Serialize, Clone)]
struct LogLine {
    t: u64,
    text: String,
    kind: String,
}

struct AppState {
    root: Option<PathBuf>,
    settings_path: PathBuf,
    settings: Mutex<Settings>,
    bridge_pid: Mutex<Option<u32>>,
    user_stopped: AtomicBool,
    quitting: AtomicBool,
    log: Mutex<VecDeque<LogLine>>,
    bstate: Mutex<BridgeState>,
    ws_tx: Mutex<Option<mpsc::UnboundedSender<String>>>,
    pending: Mutex<HashMap<u64, oneshot::Sender<Value>>>,
    next_id: AtomicU64,
    http: reqwest::Client,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

// The app sits in the VoidScript folder next to start.bat. During development it
// runs from desktop/src-tauri/target/..., so walk up a few levels to find it.
fn find_root() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let mut dir = exe.parent()?.to_path_buf();
    for _ in 0..6 {
        if dir.join("start.bat").is_file() && dir.join("bridge.py").is_file() {
            return Some(dir);
        }
        dir = dir.parent()?.to_path_buf();
    }
    None
}

fn display_path(p: &Path) -> String {
    let s = p.display().to_string();
    s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
}

// Strip ANSI colour codes the launcher prints for its console banner.
fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                while let Some(&n) = chars.peek() {
                    chars.next();
                    if ('@'..='~').contains(&n) { break; }
                }
            }
            continue;
        }
        if c != '\r' { out.push(c); }
    }
    out
}

// The bridge stamps its own lines "HH:MM:SS ..."; the app shows its own time.
fn strip_time_prefix(t: &str) -> &str {
    let b = t.as_bytes();
    let is_d = |i: usize| b.get(i).map(|c| c.is_ascii_digit()).unwrap_or(false);
    if b.len() > 9 && is_d(0) && is_d(1) && b[2] == b':' && is_d(3) && is_d(4) && b[5] == b':' && is_d(6) && is_d(7) && b[8] == b' ' {
        &t[9..]
    } else {
        t
    }
}

fn line_kind(t: &str) -> &'static str {
    let u = t.to_uppercase();
    if u.contains("ERROR") || u.contains("TRACEBACK") || u.contains("FAILED") || u.contains("SECURITY: REJECTED") || u.contains("ABORT") {
        "err"
    } else if u.contains("WARN") || u.contains("KILLED") || u.contains("HIJACK") {
        "warn"
    } else if u.contains("UPDATE") {
        "acc"
    } else {
        "info"
    }
}

fn push_log(app: &AppHandle, text: String, kind: &str) {
    let st = app.state::<AppState>();
    let line = LogLine { t: now_ms(), text, kind: kind.to_string() };
    {
        let mut log = st.log.lock().unwrap();
        log.push_back(line.clone());
        while log.len() > LOG_CAP { log.pop_front(); }
    }
    let _ = app.emit("bridge-log", line);
}

fn emit_state(app: &AppHandle) {
    let st = app.state::<AppState>();
    let s = st.bstate.lock().unwrap().clone();
    let _ = app.emit("bridge-state", s);
}

fn set_process(app: &AppHandle, p: &str, code: Option<i32>) {
    {
        let st = app.state::<AppState>();
        let mut b = st.bstate.lock().unwrap();
        b.process = p.to_string();
        if code.is_some() { b.exit_code = code; }
    }
    emit_state(app);
}

fn load_settings(path: &Path) -> Settings {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<Settings>(&s).ok())
        .unwrap_or_default()
}

fn save_settings_file(path: &Path, s: &Settings) -> Result<(), String> {
    if let Some(dir) = path.parent() { let _ = std::fs::create_dir_all(dir); }
    let text = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| format!("could not save settings: {e}"))
}

// ── bridge process ──────────────────────────────────────────────────────────

fn kill_tree(pid: u32) {
    let mut c = Command::new("taskkill");
    c.args(["/PID", &pid.to_string(), "/T", "/F"]).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    c.creation_flags(CREATE_NO_WINDOW);
    let _ = c.status();
}

fn start_bridge_proc(app: &AppHandle, args: &str) -> Result<(), String> {
    let st = app.state::<AppState>();
    let root = match st.root.clone() {
        Some(r) => r,
        None => {
            set_process(app, "missing", None);
            return Err("VoidScript.exe must sit in the VoidScript folder, next to start.bat.".into());
        }
    };
    if st.bridge_pid.lock().unwrap().is_some() {
        return Ok(()); // already running
    }
    st.user_stopped.store(false, Ordering::SeqCst);
    let bat = root.join("start.bat");
    let mut cmd = Command::new("cmd.exe");
    cmd.arg("/d").arg("/c");
    #[cfg(windows)]
    cmd.raw_arg(format!("\"\"{}\" {}\"", bat.display(), args));
    cmd.current_dir(&root)
        .env("VS_GUI", "1")
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONIOENCODING", "utf-8")
        // No keyboard in the app: an empty stdin makes any console prompt (e.g. the
        // bridge's "kill the port squatter? [y/N]") read end-of-file and take its
        // safe default instead of blocking forever in a hidden console. start.bat
        // is already safe without stdin (no `timeout`, and `pause` is skipped
        // when VS_GUI is set).
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn().map_err(|e| format!("could not start the bridge: {e}"))?;
    *st.bridge_pid.lock().unwrap() = Some(child.id());
    set_process(app, "starting", None);
    push_log(app, format!("── starting VoidScript bridge ({}) ──", display_path(&root)), "acc");

    for stream in [child.stdout.take().map(|s| Box::new(s) as Box<dyn Read + Send>),
                   child.stderr.take().map(|s| Box::new(s) as Box<dyn Read + Send>)].into_iter().flatten() {
        let app2 = app.clone();
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stream);
            let mut buf = Vec::new();
            loop {
                buf.clear();
                match reader.read_until(b'\n', &mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        let raw = strip_ansi(&String::from_utf8_lossy(&buf));
                        let text = strip_time_prefix(raw.trim_end()).to_string();
                        if text.trim().is_empty() { continue; }
                        let kind = line_kind(&text);
                        push_log(&app2, text, kind);
                    }
                }
            }
        });
    }

    let app3 = app.clone();
    std::thread::spawn(move || {
        let code = child.wait().ok().and_then(|s| s.code());
        let st = app3.state::<AppState>();
        *st.bridge_pid.lock().unwrap() = None;
        if st.quitting.load(Ordering::SeqCst) { return; }
        if code == Some(EXIT_UPDATED) {
            push_log(&app3, "── update installed - restarting the bridge with the new version ──".into(), "acc");
            set_process(&app3, "updating", code);
            let _ = app3.emit("bridge-updated", ());
            std::thread::sleep(Duration::from_millis(800));
            let _ = start_bridge_proc(&app3, "--skip-update");
            return;
        }
        let stopped_by_user = st.user_stopped.load(Ordering::SeqCst);
        push_log(&app3, format!("── bridge stopped (exit code {}) ──", code.map(|c| c.to_string()).unwrap_or("?".into())),
                 if stopped_by_user || code == Some(0) { "info" } else { "err" });
        set_process(&app3, if stopped_by_user { "stopped" } else { "error" }, code);
    });
    Ok(())
}

fn stop_bridge_proc(app: &AppHandle) {
    let st = app.state::<AppState>();
    st.user_stopped.store(true, Ordering::SeqCst);
    let pid = *st.bridge_pid.lock().unwrap();
    if let Some(pid) = pid { kill_tree(pid); }
}

// ── bridge websocket client (native: sends no Origin header, which the bridge
//    allows by design; browser pages can't use this path) ────────────────────

fn apply_bridge_msg(app: &AppHandle, msg: &Value) {
    let st = app.state::<AppState>();
    let mut changed = false;
    {
        let mut b = st.bstate.lock().unwrap();
        if let Some(v) = msg.get("studio") { let nv = v.as_bool(); if b.studio != nv { b.studio = nv; changed = true; } }
        if let Some(v) = msg.get("studio_app") { let nv = v.as_bool(); if b.studio_app != nv { b.studio_app = nv; changed = true; } }
        if let Some(v) = msg.get("place_name").and_then(|v| v.as_str()) { if b.place_name != v { b.place_name = v.to_string(); changed = true; } }
        let t = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if matches!(t, "connected" | "tools" | "mcp_status") {
            if let Some(v) = msg.get("mcp_alive").or_else(|| msg.get("alive")).and_then(|v| v.as_bool()) { b.mcp_alive = v; }
            if let Some(arr) = msg.get("tools").and_then(|v| v.as_array()) { b.tools = arr.clone(); }
            if let Some(arr) = msg.get("servers").and_then(|v| v.as_array()) { b.servers = arr.clone(); }
            changed = true;
        }
    }
    if changed { emit_state(app); }
}

async fn bridge_client(app: AppHandle) {
    loop {
        match tokio_tungstenite::connect_async(BRIDGE_URL).await {
            Ok((ws, _)) => {
                let (mut sink, mut stream) = ws.split();
                let (tx, mut rx) = mpsc::unbounded_channel::<String>();
                {
                    let st = app.state::<AppState>();
                    *st.ws_tx.lock().unwrap() = Some(tx);
                    let mut b = st.bstate.lock().unwrap();
                    b.connected = true;
                    if b.process == "starting" || b.process == "updating" { b.process = "running".into(); }
                }
                emit_state(&app);
                let writer = tauri::async_runtime::spawn(async move {
                    while let Some(m) = rx.recv().await {
                        if sink.send(Message::Text(m.into())).await.is_err() { break; }
                    }
                });
                // Keep Studio's attach state and the tool list fresh, like the extension
                // does. Runs as its own task: its replies are read by the loop below,
                // so nothing here may be awaited before that loop starts (doing so
                // stalled every request until it timed out).
                let app_poll = app.clone();
                let poller = tauri::async_runtime::spawn(async move {
                    let mut tick: u32 = 0;
                    loop {
                        let no_tools = app_poll.state::<AppState>().bstate.lock().unwrap().tools.is_empty();
                        if tick % 4 == 0 || no_tools {
                            let _ = bridge_call(&app_poll, json!({"type": "list_tools"}), 15_000).await;
                        }
                        let _ = bridge_call(&app_poll, json!({"type": "studio_status"}), 12_000).await;
                        tick = tick.wrapping_add(1);
                        tokio::time::sleep(Duration::from_secs(5)).await;
                    }
                });
                while let Some(Ok(frame)) = stream.next().await {
                    if let Message::Text(t) = frame {
                        if let Ok(v) = serde_json::from_str::<Value>(t.as_str()) {
                            apply_bridge_msg(&app, &v);
                            if let Some(id) = v.get("id").and_then(|x| x.as_u64()) {
                                let st = app.state::<AppState>();
                                let waiter = st.pending.lock().unwrap().remove(&id);
                                if let Some(w) = waiter { let _ = w.send(v); }
                            }
                        }
                    }
                }
                poller.abort();
                writer.abort();
                {
                    let st = app.state::<AppState>();
                    *st.ws_tx.lock().unwrap() = None;
                    for (_, w) in st.pending.lock().unwrap().drain() {
                        let _ = w.send(json!({"type": "error", "error": "bridge disconnected"}));
                    }
                    let mut b = st.bstate.lock().unwrap();
                    b.connected = false;
                    b.mcp_alive = false;
                    b.studio = None;
                }
                emit_state(&app);
            }
            Err(_) => {}
        }
        tokio::time::sleep(Duration::from_millis(1500)).await;
    }
}

async fn bridge_call(app: &AppHandle, mut payload: Value, timeout_ms: u64) -> Result<Value, String> {
    let st = app.state::<AppState>();
    let tx = st.ws_tx.lock().unwrap().clone().ok_or("The bridge is not running. Start it on the Home tab.")?;
    let id = st.next_id.fetch_add(1, Ordering::SeqCst);
    payload["id"] = json!(id);
    let (otx, orx) = oneshot::channel();
    st.pending.lock().unwrap().insert(id, otx);
    tx.send(payload.to_string()).map_err(|_| "bridge connection closed".to_string())?;
    match tokio::time::timeout(Duration::from_millis(timeout_ms), orx).await {
        Ok(Ok(v)) => Ok(v),
        _ => {
            st.pending.lock().unwrap().remove(&id);
            Err("The bridge did not answer in time.".into())
        }
    }
}

// ── workspace access (off by default; one user-chosen folder) ───────────────

fn full_access(st: &AppState) -> bool { st.settings.lock().unwrap().access == "full" }

// Where relative paths and commands start: the workspace folder if one is set,
// otherwise (full access only) the user's home folder.
fn start_dir(st: &AppState) -> Result<PathBuf, String> {
    match workspace_base(st) {
        Ok(b) => Ok(b),
        Err(e) if full_access(st) => std::env::var_os("USERPROFILE").map(PathBuf::from).ok_or(e),
        Err(e) => Err(e),
    }
}

fn workspace_base(st: &AppState) -> Result<PathBuf, String> {
    let s = st.settings.lock().unwrap();
    if !s.workspace_enabled || s.workspace_dir.trim().is_empty() {
        return Err("Workspace access is off. Turn it on in VoidScript → Settings → Workspace access.".into());
    }
    std::fs::canonicalize(&s.workspace_dir).map_err(|e| format!("The workspace folder is unavailable: {e}"))
}

// Resolve a path the AI gave us INSIDE the workspace. Rejects absolute paths and
// ".." outright, then canonicalises (resolving symlinks) the path - or, for a new
// file, its nearest existing ancestor - and requires it to stay under the base.
fn jail(st: &AppState, rel: &str) -> Result<PathBuf, String> {
    if full_access(st) {
        // Full PC access (the user switched it on): any path, relative ones from start_dir.
        let p = Path::new(rel.trim());
        return Ok(if p.is_absolute() { p.to_path_buf() } else { start_dir(st)?.join(p) });
    }
    let base = workspace_base(st)?;
    let rel = rel.trim();
    let p = Path::new(if rel.is_empty() { "." } else { rel });
    for c in p.components() {
        match c {
            Component::Prefix(_) | Component::RootDir => return Err("Use a path relative to the workspace folder.".into()),
            Component::ParentDir => return Err("\"..\" is not allowed - stay inside the workspace folder.".into()),
            _ => {}
        }
    }
    let joined = base.join(p);
    let mut existing = joined.clone();
    let mut tail: Vec<std::ffi::OsString> = Vec::new();
    while !existing.exists() {
        match (existing.file_name(), existing.parent()) {
            (Some(name), Some(parent)) => { tail.push(name.to_os_string()); existing = parent.to_path_buf(); }
            _ => return Err("Invalid path.".into()),
        }
    }
    let mut resolved = std::fs::canonicalize(&existing).map_err(|e| e.to_string())?;
    if !resolved.starts_with(&base) {
        return Err("That path is outside the workspace folder.".into());
    }
    for name in tail.into_iter().rev() { resolved.push(name); }
    Ok(resolved)
}

fn cap_text(mut s: String, cap: usize) -> String {
    if s.len() > cap {
        let mut cut = cap;
        while !s.is_char_boundary(cut) { cut -= 1; }
        s.truncate(cut);
        s.push_str("\n…(output truncated)");
    }
    s
}

// ── commands ────────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct Snapshot { state: BridgeState, settings: SettingsView, log: Vec<LogLine>, version: String }

#[tauri::command]
fn get_snapshot(app: AppHandle, st: State<'_, AppState>) -> Snapshot {
    Snapshot {
        state: st.bstate.lock().unwrap().clone(),
        settings: SettingsView::from(&*st.settings.lock().unwrap()),
        log: st.log.lock().unwrap().iter().cloned().collect(),
        version: app.package_info().version.to_string(),
    }
}

#[tauri::command]
fn start_bridge(app: AppHandle) -> Result<(), String> { start_bridge_proc(&app, "") }

#[tauri::command]
fn stop_bridge(app: AppHandle) { stop_bridge_proc(&app); }

#[tauri::command]
async fn restart_bridge(app: AppHandle) -> Result<(), String> {
    stop_bridge_proc(&app);
    for _ in 0..50 {
        if app.state::<AppState>().bridge_pid.lock().unwrap().is_none() { break; }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    start_bridge_proc(&app, "--skip-update")
}

#[tauri::command]
async fn bridge_request(app: AppHandle, payload: Value, timeout_ms: Option<u64>) -> Result<Value, String> {
    bridge_call(&app, payload, timeout_ms.unwrap_or(120_000)).await
}

#[tauri::command]
fn save_settings(st: State<'_, AppState>, patch: Value) -> Result<SettingsView, String> {
    let mut s = st.settings.lock().unwrap();
    let mut v = serde_json::to_value(&*s).map_err(|e| e.to_string())?;
    if let (Some(obj), Some(p)) = (v.as_object_mut(), patch.as_object()) {
        for (k, val) in p {
            // An empty key field means "keep the saved key" (the UI never sees it).
            if (k == "nvidia_key" || k == "openrouter_key") && val.as_str().map(|x| x.trim().is_empty()).unwrap_or(true) { continue; }
            if k == "clear_nvidia_key" { obj.insert("nvidia_key".into(), json!("")); continue; }
            if k == "clear_openrouter_key" { obj.insert("openrouter_key".into(), json!("")); continue; }
            obj.insert(k.clone(), val.clone());
        }
    }
    let mut next: Settings = serde_json::from_value(v).map_err(|e| e.to_string())?;
    next.nvidia_key = clean_key(&next.nvidia_key);
    next.openrouter_key = clean_key(&next.openrouter_key);
    save_settings_file(&st.settings_path, &next)?;
    *s = next;
    Ok(SettingsView::from(&*s))
}

#[tauri::command]
async fn pick_workspace(app: AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = oneshot::channel();
    app.dialog().file().set_title("Choose the workspace folder VoidScript may use").pick_folder(move |f| {
        let _ = tx.send(f.and_then(|p| p.into_path().ok()).map(|p| display_path(&p)));
    });
    rx.await.ok().flatten()
}

#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    if !(url.starts_with("https://") || url.starts_with("http://")) { return Err("only web links can be opened".into()); }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_folder(app: AppHandle, st: State<'_, AppState>, which: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let p = match which.as_str() {
        "workspace" => workspace_base(&st)?,
        "logs" => st.root.clone().ok_or("VoidScript folder not found")?.join("logs"),
        _ => st.root.clone().ok_or("VoidScript folder not found")?,
    };
    app.opener().open_path(display_path(&p), None::<&str>).map_err(|e| e.to_string())
}

// ── extra MCP servers (config.json next to bridge.py) ─────────────────────────
// The bridge reads config.json only at launch, so the UI restarts it after a change.
// "roblox" is the primary server and is never edited here.

fn mcp_config_path(st: &AppState) -> Result<PathBuf, String> {
    Ok(st.root.clone().ok_or("VoidScript folder not found")?.join("config.json"))
}

fn read_mcp_config(path: &Path) -> Value {
    let mut cfg = std::fs::read_to_string(path).ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .filter(|v| v.is_object())
        .unwrap_or_else(|| json!({ "mcpServers": { "roblox": { "command": "launch_studio_mcp.py", "args": [] } } }));
    if !cfg["mcpServers"].is_object() { cfg["mcpServers"] = json!({}); }
    cfg
}

fn write_mcp_config(path: &Path, cfg: &Value) -> Result<(), String> {
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| format!("could not save config.json: {e}"))
}

#[tauri::command]
fn mcp_list(st: State<'_, AppState>) -> Result<Value, String> {
    let cfg = read_mcp_config(&mcp_config_path(&st)?);
    let mut out = vec![];
    if let Some(m) = cfg["mcpServers"].as_object() {
        for (id, spec) in m {
            // Only env names go to the UI; values are often tokens.
            let env: Vec<String> = spec["env"].as_object().map(|e| e.keys().cloned().collect()).unwrap_or_default();
            out.push(json!({ "id": id, "command": spec["command"], "args": spec["args"], "env": env, "primary": id == "roblox" }));
        }
    }
    Ok(json!(out))
}

#[tauri::command]
fn mcp_add(st: State<'_, AppState>, id: String, command: String, args: Vec<String>, env: Option<serde_json::Map<String, Value>>) -> Result<(), String> {
    let id = id.trim().to_string();
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Server name can only use letters, numbers, - and _.".into());
    }
    if id == "roblox" { return Err("'roblox' is the Studio server and can't be replaced.".into()); }
    if command.trim().is_empty() { return Err("A command is required.".into()); }
    let path = mcp_config_path(&st)?;
    let mut cfg = read_mcp_config(&path);
    let mut spec = json!({ "command": command.trim(), "args": args });
    if let Some(e) = env.filter(|e| !e.is_empty()) { spec["env"] = Value::Object(e); }
    cfg["mcpServers"][id] = spec;
    write_mcp_config(&path, &cfg)
}

#[tauri::command]
fn mcp_remove(st: State<'_, AppState>, id: String) -> Result<(), String> {
    if id == "roblox" { return Err("'roblox' is the Studio server and can't be removed.".into()); }
    let path = mcp_config_path(&st)?;
    let mut cfg = read_mcp_config(&path);
    cfg["mcpServers"].as_object_mut().map(|m| m.remove(&id));
    write_mcp_config(&path, &cfg)
}

// The active AI provider. Both speak the OpenAI chat-completions API, so one code
// path serves both; only the base URL, key and a couple of headers differ.
struct Provider { name: &'static str, base: &'static str, key: String, openrouter: bool }

fn active_provider(st: &AppState) -> Result<Provider, String> { provider_for(st, None) }

// `which` lets the model picker list another provider's models without switching.
fn provider_for(st: &AppState, which: Option<&str>) -> Result<Provider, String> {
    let s = st.settings.lock().unwrap();
    if which.unwrap_or(s.provider.as_str()) == "openrouter" {
        if s.openrouter_key.is_empty() { return Err("Add your OpenRouter API key in Settings first.".into()); }
        Ok(Provider { name: "OpenRouter", base: OPENROUTER_BASE, key: clean_key(&s.openrouter_key), openrouter: true })
    } else {
        if s.nvidia_key.is_empty() { return Err("Add your NVIDIA API key in Settings first.".into()); }
        Ok(Provider { name: "NVIDIA", base: NVIDIA_BASE, key: clean_key(&s.nvidia_key), openrouter: false })
    }
}

fn with_headers(p: &Provider, rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    let rb = rb.bearer_auth(&p.key);
    // OpenRouter's (optional) app attribution headers.
    if p.openrouter { rb.header("HTTP-Referer", "https://voidstudioai.netlify.app").header("X-Title", "VoidScript") } else { rb }
}

const NON_CHAT: &[&str] = &[
    "embed", "rerank", "retriever", "guard", "safety", "reward", "parakeet", "canary", "whisper",
    "fastpitch", "tts", "asr", "clip", "sdxl", "stable-diffusion", "flux", "cosmos", "paligemma",
    "deplot", "kosmos", "neva", "vila", "ocr", "segment", "detector", "nv-yolo", "bge", "e5-", "arctic-embed",
    "riva-translate", "nemotron-parse", "diffusion", "fuyu", "ising-calibration",
];

#[derive(Serialize)]
struct ModelInfo { id: String, tools: Option<bool>, reasoning: Option<bool> }

#[tauri::command]
async fn ai_models(st: State<'_, AppState>, provider: Option<String>) -> Result<Vec<ModelInfo>, String> {
    let p = provider_for(&st, provider.as_deref())?;
    let r = with_headers(&p, st.http.get(format!("{}/models", p.base))).send().await
        .map_err(|e| format!("Could not reach {}: {e}", p.name))?;
    let status = r.status();
    let text = r.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() { return Err(format!("{} API {}: {}", p.name, status.as_u16(), cap_text(text, 400))); }
    let v: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let mut out: Vec<ModelInfo> = v.get("data").and_then(|d| d.as_array()).map(|a| {
        a.iter().filter_map(|m| {
            let id = m.get("id").and_then(|x| x.as_str())?.to_string();
            // OpenRouter lists each model's supported parameters; NVIDIA doesn't.
            let params = m.get("supported_parameters").and_then(|x| x.as_array());
            let tools = params.map(|ps| ps.iter().any(|x| x.as_str() == Some("tools")));
            let reasoning = params.map(|ps| ps.iter().any(|x| x.as_str() == Some("reasoning")));
            // NVIDIA's catalogue also lists embedding, reranking, safety, speech and
            // image models that can't chat at all - picking one only ever errors.
            if !p.openrouter && NON_CHAT.iter().any(|w| id.to_ascii_lowercase().contains(w)) { return None; }
            Some(ModelInfo { id, tools, reasoning })
        }).collect()
    }).unwrap_or_default();
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out.dedup_by(|a, b| a.id == b.id);
    Ok(out)
}

// NVIDIA answers with {"detail": ...} or {"title","detail"}; OpenAI-style APIs with
// {"error": {"message": ...}}. Show just that message instead of a raw JSON dump.
fn api_error_text(body: &str) -> String {
    if let Ok(v) = serde_json::from_str::<Value>(body) {
        let msg = v.pointer("/error/message").or_else(|| v.get("detail")).or_else(|| v.get("message"))
            .or_else(|| v.get("error")).or_else(|| v.get("title"));
        if let Some(m) = msg.and_then(|m| m.as_str()) { return cap_text(m.to_string(), 500); }
    }
    cap_text(body.to_string(), 500)
}

#[tauri::command]
async fn ai_chat(st: State<'_, AppState>, body: Value) -> Result<Value, String> {
    let p = active_provider(&st)?;
    let r = with_headers(&p, st.http.post(format!("{}/chat/completions", p.base))).json(&body)
        .timeout(Duration::from_secs(300)).send().await
        .map_err(|e| format!("Could not reach {}: {e}", p.name))?;
    let status = r.status();
    let text = r.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let hint = match status.as_u16() {
            401 | 403 => " - check your API key in Settings.",
            402 => " - your OpenRouter account is out of credits (or pick a :free model).",
            404 => " - that model isn't available; pick another in Settings.",
            429 => " - rate limited; wait a moment and try again.",
            _ => "",
        };
        return Err(format!("{} API {}{}\n{}", p.name, status.as_u16(), hint, api_error_text(&text)));
    }
    let v: Value = serde_json::from_str(&text).map_err(|e| format!("Unexpected {} response: {e}", p.name))?;
    // OpenRouter can return HTTP 200 with an error object from the upstream model.
    if let Some(err) = v.get("error") {
        let msg = err.get("message").and_then(|m| m.as_str()).unwrap_or("unknown error");
        return Err(format!("{}: {}", p.name, msg));
    }
    Ok(v)
}

// ── reference files (the user attaches them to a chat message as context) ───

const REF_CAP: u64 = 256 * 1024;

#[derive(Serialize)]
struct RefFile { name: String, path: String, size: u64, content: Option<String>, error: Option<String> }

fn read_ref(path: &Path) -> RefFile {
    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| display_path(path));
    let mut rf = RefFile { name, path: display_path(path), size: 0, content: None, error: None };
    match std::fs::metadata(path) {
        Err(e) => rf.error = Some(format!("can't open it: {e}")),
        Ok(md) if md.is_dir() => rf.error = Some("that's a folder - attach files".into()),
        Ok(md) if md.len() > REF_CAP => { rf.size = md.len(); rf.error = Some(format!("too large ({} KB, limit {} KB)", md.len() / 1024, REF_CAP / 1024)); }
        Ok(md) => {
            rf.size = md.len();
            match std::fs::read(path) {
                Err(e) => rf.error = Some(format!("can't read it: {e}")),
                Ok(bytes) if bytes.iter().take(8192).any(|b| *b == 0) => rf.error = Some("binary file - only text files (scripts, docs, JSON…) can be attached".into()),
                Ok(bytes) => rf.content = Some(String::from_utf8_lossy(&bytes).to_string()),
            }
        }
    }
    rf
}

#[tauri::command]
async fn pick_reference_files(app: AppHandle) -> Vec<RefFile> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = oneshot::channel();
    app.dialog().file().set_title("Attach reference files").pick_files(move |files| {
        let paths: Vec<PathBuf> = files.unwrap_or_default().into_iter().filter_map(|f| f.into_path().ok()).collect();
        let _ = tx.send(paths);
    });
    rx.await.unwrap_or_default().iter().map(|p| read_ref(p)).collect()
}

#[tauri::command]
fn read_reference_files(paths: Vec<String>) -> Vec<RefFile> {
    paths.iter().take(20).map(|p| read_ref(Path::new(p))).collect()
}

#[derive(Serialize)]
struct DirEntry { name: String, dir: bool, size: u64 }

#[tauri::command]
fn ws_list(st: State<'_, AppState>, path: String) -> Result<Vec<DirEntry>, String> {
    let p = jail(&st, &path)?;
    let mut out = Vec::new();
    for e in std::fs::read_dir(&p).map_err(|e| format!("cannot list {}: {e}", path))?.flatten().take(500) {
        let md = e.metadata().ok();
        out.push(DirEntry {
            name: e.file_name().to_string_lossy().to_string(),
            dir: md.as_ref().map(|m| m.is_dir()).unwrap_or(false),
            size: md.map(|m| m.len()).unwrap_or(0),
        });
    }
    out.sort_by(|a, b| b.dir.cmp(&a.dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

#[tauri::command]
fn ws_read(st: State<'_, AppState>, path: String) -> Result<String, String> {
    let p = jail(&st, &path)?;
    let md = std::fs::metadata(&p).map_err(|e| format!("cannot read {path}: {e}"))?;
    if md.is_dir() { return Err(format!("{path} is a folder - use workspace_list")); }
    if md.len() > READ_CAP { return Err(format!("{path} is too large to read ({} KB, limit {} KB).", md.len() / 1024, READ_CAP / 1024)); }
    let bytes = std::fs::read(&p).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

#[tauri::command]
fn ws_write(st: State<'_, AppState>, path: String, content: String) -> Result<String, String> {
    let p = jail(&st, &path)?;
    if p.is_dir() { return Err(format!("{path} is a folder")); }
    if let Some(dir) = p.parent() { std::fs::create_dir_all(dir).map_err(|e| e.to_string())?; }
    std::fs::write(&p, content.as_bytes()).map_err(|e| format!("cannot write {path}: {e}"))?;
    Ok(format!("wrote {} bytes to {path}", content.len()))
}

#[tauri::command]
fn ws_delete(st: State<'_, AppState>, path: String) -> Result<String, String> {
    let p = jail(&st, &path)?;
    let p = std::fs::canonicalize(&p).unwrap_or(p);
    if workspace_base(&st).map(|b| b == p).unwrap_or(false) { return Err("Refusing to delete the whole workspace folder.".into()); }
    let home = std::env::var_os("USERPROFILE").map(PathBuf::from).and_then(|h| std::fs::canonicalize(h).ok());
    let windir = std::env::var_os("SystemRoot").map(PathBuf::from).and_then(|w| std::fs::canonicalize(w).ok());
    if p.parent().is_none() || p.components().count() <= 3 || Some(&p) == home.as_ref()
        || windir.map(|w| p.starts_with(w)).unwrap_or(false) {
        return Err("Refusing to delete a drive, your user folder or Windows files.".into());
    }
    if p.is_dir() { std::fs::remove_dir_all(&p) } else { std::fs::remove_file(&p) }
        .map_err(|e| format!("cannot delete {path}: {e}"))?;
    Ok(format!("deleted {path}"))
}

#[tauri::command]
async fn ws_run(st: State<'_, AppState>, command: String) -> Result<String, String> {
    let base = start_dir(&st)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new("cmd.exe");
        cmd.arg("/d").arg("/c");
        #[cfg(windows)]
        cmd.raw_arg(&command);
        cmd.current_dir(&base).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        let mut child = cmd.spawn().map_err(|e| format!("could not run the command: {e}"))?;
        let mut out_s = child.stdout.take().unwrap();
        let mut err_s = child.stderr.take().unwrap();
        let t_out = std::thread::spawn(move || { let mut b = Vec::new(); let _ = out_s.read_to_end(&mut b); b });
        let t_err = std::thread::spawn(move || { let mut b = Vec::new(); let _ = err_s.read_to_end(&mut b); b });
        let started = Instant::now();
        let status = loop {
            if let Some(s) = child.try_wait().map_err(|e| e.to_string())? { break Some(s); }
            if started.elapsed() > RUN_TIMEOUT { kill_tree(child.id()); break None; }
            std::thread::sleep(Duration::from_millis(100));
        };
        let out = String::from_utf8_lossy(&t_out.join().unwrap_or_default()).to_string();
        let err = String::from_utf8_lossy(&t_err.join().unwrap_or_default()).to_string();
        let head = match status {
            Some(s) => format!("exit code {}", s.code().unwrap_or(-1)),
            None => format!("stopped after {}s (timeout)", RUN_TIMEOUT.as_secs()),
        };
        let mut text = format!("{head}\n{out}");
        if !err.trim().is_empty() { text.push_str("\n[stderr]\n"); text.push_str(&err); }
        Ok(cap_text(text, OUTPUT_CAP))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn quit_app(app: AppHandle) { quit(&app); }

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn quit(app: &AppHandle) {
    let st = app.state::<AppState>();
    st.quitting.store(true, Ordering::SeqCst);
    stop_bridge_proc(app);
    app.exit(0);
}

fn main() {
    let root = find_root();
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| { show_main(app); }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let settings_path = app.path().app_config_dir().map(|d| d.join("settings.json"))
                .unwrap_or_else(|_| PathBuf::from("voidscript-settings.json"));
            let settings = load_settings(&settings_path);
            let auto = settings.auto_start_bridge && settings.accepted_disclaimer;
            let bstate = BridgeState {
                process: if root.is_some() { "stopped".into() } else { "missing".into() },
                root: root.as_ref().map(|r| display_path(r)).unwrap_or_default(),
                ..Default::default()
            };
            app.manage(AppState {
                root: root.clone(),
                settings_path,
                settings: Mutex::new(settings),
                bridge_pid: Mutex::new(None),
                user_stopped: AtomicBool::new(false),
                quitting: AtomicBool::new(false),
                log: Mutex::new(VecDeque::new()),
                bstate: Mutex::new(bstate),
                ws_tx: Mutex::new(None),
                pending: Mutex::new(HashMap::new()),
                next_id: AtomicU64::new(1),
                http: reqwest::Client::builder().user_agent("VoidScript-Desktop").build().unwrap_or_default(),
            });

            let show = MenuItem::with_id(app, "show", "Open VoidScript", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit VoidScript", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit_i])?;
            let mut tray = TrayIconBuilder::with_id("main").tooltip("VoidScript").menu(&menu)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "show" => show_main(app),
                    "quit" => quit(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::DoubleClick { .. } = e { show_main(tray.app_handle()); }
                });
            // Full-size logo for the taskbar, Alt+Tab and tray (the default is a small frame).
            let logo = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png")).ok();
            if let (Some(w), Some(img)) = (app.get_webview_window("main"), logo.clone()) { let _ = w.set_icon(img); }
            match logo.or_else(|| app.default_window_icon().cloned()) { Some(icon) => tray = tray.icon(icon), None => {} }
            tray.build(app)?;

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(bridge_client(handle.clone()));
            if auto { let _ = start_bridge_proc(&handle, ""); }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let st = app.state::<AppState>();
                let to_tray = st.settings.lock().unwrap().close_to_tray;
                if to_tray && !st.quitting.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                    let _ = app.emit("hidden-to-tray", ());
                } else {
                    quit(app);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_snapshot, start_bridge, stop_bridge, restart_bridge, bridge_request,
            save_settings, pick_workspace, open_url, open_folder, mcp_list, mcp_add, mcp_remove,
            ai_models, ai_chat, pick_reference_files, read_reference_files,
            ws_list, ws_read, ws_write, ws_delete, ws_run, quit_app
        ])
        .build(tauri::generate_context!())
        .expect("error while building VoidScript")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                let st = app.state::<AppState>();
                st.quitting.store(true, Ordering::SeqCst);
                stop_bridge_proc(app);
            }
        });
}
