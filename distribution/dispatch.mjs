// Dispatch layer: pushes queued drafts through the Wechatsync CLI, one platform at a time.
// Draft-only by design. Each platform runs in its own process: a failure, a login problem or a
// timeout on one platform never blocks the others.
//   node distribution/dispatch.mjs                 dry run (default): shows what would happen
//   node distribution/dispatch.mjs --run [--slug x] [--platform p]   actually sync drafts
// Requires: data/distribution-control.json enabled=true, mode=draft-only; the Wechatsync browser extension
// connected; WECHATSYNC_TOKEN (read from ~/.yuankun-seo/wechatsync-token.txt, never printed).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const run = process.argv.includes("--run"), onlySlug = arg("--slug"), onlyPlatform = arg("--platform");
const control = JSON.parse(fs.readFileSync(path.join(root, "data/distribution-control.json"), "utf8"));
const platforms = JSON.parse(fs.readFileSync(path.join(root, "distribution/platforms.json"), "utf8")); delete platforms._note;
const queuePath = path.join(root, "data/distribution-queue.json");
const queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));
const logDir = path.join(root, "distribution/logs"); fs.mkdirSync(logDir, { recursive: true });
const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(`DISPATCH ${m}`); if (run) fs.appendFileSync(path.join(logDir, "dispatch.log"), l + "\n"); };
// Platforms the owner allows for automatic draft sync (data/distribution-control.json -> draftPlatforms),
// and a per-platform daily cap so back-filling history never floods a draft box.
const allowed = new Set(control.draftPlatforms || Object.keys(platforms));
const dailyCap = control.dailyDraftCap || 2;
const MAX_ATTEMPTS = 3, PER_RUN_LIMIT = control.perRunLimit || 5;
const todayStr = new Date().toISOString().slice(0, 10);
const doneToday = (pid) => Object.values(queue.items).filter((e) => (e.platforms[pid]?.status === "synced_draft") && String(e.platforms[pid].updatedAt || "").startsWith(todayStr)).length;

if (run && !control.enabled) { log("STOPPED: master switch data/distribution-control.json enabled=false"); process.exit(0); }
if (control.mode !== "draft-only") { log(`STOPPED: mode=${control.mode}; only draft-only is implemented`); process.exit(0); }
let token = ""; try { token = fs.readFileSync(path.join(os.homedir(), ".yuankun-seo/wechatsync-token.txt"), "utf8").trim(); } catch { /* handled below */ }
if (run && !token) { log("STOPPED: no Wechatsync token in ~/.yuankun-seo"); process.exit(0); }
// Single instance: the scheduled task and a manual run must never edit the queue at the same time.
const lockFile = path.join(logDir, "dispatch.lock");
if (run) {
  try {
    const age = Date.now() - fs.statSync(lockFile).mtimeMs;
    if (age < 45 * 60000) { log("STOPPED: another dispatch is running (lock file is fresh)"); process.exit(0); }
  } catch { /* no lock */ }
  fs.writeFileSync(lockFile, `${process.pid} ${new Date().toISOString()}`);
  const release = () => { try { fs.unlinkSync(lockFile); } catch { /* already gone */ } };
  process.on("exit", release); process.on("SIGINT", () => process.exit(1)); process.on("SIGTERM", () => process.exit(1));
}
const syncTimeoutMs = (control.syncTimeoutMin || 6) * 60000;
const stalled = new Set(); // platforms that hung during this run are skipped for the rest of it
const env = { ...process.env, WECHATSYNC_TOKEN: token };
// Call the CLI's JS entry with Node directly: going through cmd.exe mangles long Chinese arguments.
const cliJs = path.join(process.env.APPDATA || "", "npm", "node_modules", "@wechatsync", "cli", "dist", "index.js");
const cli = (args, timeout) => spawnSync(process.execPath, [cliJs, ...args], { env: { ...env, NODE_USE_ENV_PROXY: "1" }, encoding: "utf8", timeout });

// Evidence for the network exit: right after a sync, look at Edge's live TCP connections.
// A connection whose remote address is the platform's own IP means Edge reached it directly (local network);
// connections to 127.0.0.1:7890 mean the proxy. This is a sample, not a packet capture.
const PLATFORM_HOSTS = { weixin: ["mp.weixin.qq.com"], zhihu: ["zhuanlan.zhihu.com"], sohu: ["mp.sohu.com"], baijiahao: ["baijiahao.baidu.com"], toutiao: ["mp.toutiao.com"], weibo: ["card.weibo.com"], xiaohongshu: ["creator.xiaohongshu.com"], douyin: ["creator.douyin.com"], netease: ["mp.163.com"] };
async function egressSample(pid) {
  try {
    const dns = await import("node:dns/promises");
    const ips = new Set((await Promise.all((PLATFORM_HOSTS[pid] || []).map((h) => dns.resolve4(h).catch(() => [])))).flat());
    const ps = "$ids=(Get-Process msedge -ErrorAction SilentlyContinue).Id; Get-NetTCPConnection -State Established | ? { $ids -contains $_.OwningProcess } | % { $_.RemoteAddress + ':' + $_.RemotePort }";
    const rows = spawnSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8", timeout: 20000 }).stdout.split(/\s+/).filter(Boolean);
    const direct = rows.some((r) => ips.has(r.split(":")[0]));
    return direct ? "Edge 直连平台IP（本地网络）" : `未抓到该平台的直连（Edge 连接 ${rows.length} 条，其中经代理 ${rows.filter((r) => r === "127.0.0.1:7890").length} 条）`;
  } catch (e) { return `抽样失败：${e.message}`; }
}

let done = 0;
for (const entry of Object.values(queue.items)) {
  if (onlySlug && entry.slug !== onlySlug) continue;
  for (const [pid, s] of Object.entries(entry.platforms)) {
    if (onlyPlatform && pid !== onlyPlatform) continue;
    const p = platforms[pid];
    if (!allowed.has(pid) || stalled.has(pid)) continue;
    if (!p?.verified) { s.note = "平台适配器尚未在已连接的扩展中验证，跳过"; continue; }
    if (!["pending", "needs_update", "failed", "needs_login"].includes(s.status) || s.attempts >= MAX_ATTEMPTS) continue;
    if (done >= PER_RUN_LIMIT) { log("run limit reached; remaining items wait for the next run"); break; }
    if (doneToday(pid) >= dailyCap) continue;
    if (!run) { log(`would sync ${entry.id} -> ${pid} (${s.status}, attempt ${s.attempts + 1})`); continue; }
    done++;
    const auth = cli(["auth", p.wechatsyncId], 60000);
    const authText = `${auth.stdout || ""}${auth.stderr || ""}`;
    if (auth.status !== 0 || /未登录|not logged|失败|fail/i.test(authText)) {
      s.status = "needs_login"; s.updatedAt = new Date().toISOString(); s.note = "需要在浏览器登录该平台，或扩展未连接";
      log(`${entry.id} -> ${pid}: needs_login`); continue;
    }
    s.attempts++;
    const r = cli(["sync", s.file, "-p", p.wechatsyncId, "-t", s.title || entry.title], syncTimeoutMs);
    if (r.error || r.signal) {
      // The CLI never answered. Do not retry blindly: park this platform so it cannot hang every run.
      // One timeout counts as one failed attempt (max 3 across runs) and stops this platform for the rest of this run.
      s.status = s.attempts >= MAX_ATTEMPTS ? "paused" : "failed"; s.updatedAt = new Date().toISOString();
      s.note = `同步超过 ${syncTimeoutMs / 60000} 分钟无响应（第 ${s.attempts} 次）${s.attempts >= MAX_ATTEMPTS ? "，已暂停，需要本人处理后再恢复" : "，下次运行会重试"}；可能是扩展卡住或需要前台完成平台的安全验证`;
      stalled.add(pid); log(`${entry.id} -> ${pid}: ${s.status} (timeout, attempt ${s.attempts})`);
      fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`); continue;
    }
    const text = `${r.stdout || ""}${r.stderr || ""}`.replace(/\x1b\[[0-9;]*m/g, "");
    // The CLI exits 0 even when a platform fails, so read its own summary line.
    const okCount = Number((text.match(/同步完成:\s*(\d+)\s*成功/) || [])[1] || 0);
    const ok = r.status === 0 && okCount > 0 && !/✗/.test(text);
    const loginProblem = /登录态|重新登录|未登录/.test(text);
    s.status = ok ? "synced_draft" : loginProblem ? "needs_login" : "failed"; s.updatedAt = new Date().toISOString();
    if (loginProblem) s.attempts = Math.max(0, s.attempts - 1);
    // Keep only the result lines (✓/✗, the draft link, the summary) rather than progress noise.
    s.note = text.split("\n").filter((l) => /[✓✗]|同步完成|https?:\/\//.test(l)).map((l) => l.trim()).join(" | ").slice(0, 300);
    s.egress = await egressSample(pid);
    log(`${entry.id} -> ${pid}: ${s.status}${ok ? "" : ` (${s.note})`} | egress: ${s.egress}`);
    fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`); // persist after every platform
  }
}
if (run) fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`);
log(`finished mode=${run ? "run" : "dry-run"} attempted=${done}`);
