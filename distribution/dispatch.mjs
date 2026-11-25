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
const MAX_ATTEMPTS = 3, PER_RUN_LIMIT = 5;

if (run && !control.enabled) { log("STOPPED: master switch data/distribution-control.json enabled=false"); process.exit(0); }
if (control.mode !== "draft-only") { log(`STOPPED: mode=${control.mode}; only draft-only is implemented`); process.exit(0); }
let token = ""; try { token = fs.readFileSync(path.join(os.homedir(), ".yuankun-seo/wechatsync-token.txt"), "utf8").trim(); } catch { /* handled below */ }
if (run && !token) { log("STOPPED: no Wechatsync token in ~/.yuankun-seo"); process.exit(0); }
const env = { ...process.env, WECHATSYNC_TOKEN: token };
const cli = (args, timeout) => spawnSync("wechatsync", args, { env, encoding: "utf8", timeout, shell: process.platform === "win32" });

let done = 0;
for (const entry of Object.values(queue.items)) {
  if (onlySlug && entry.slug !== onlySlug) continue;
  for (const [pid, s] of Object.entries(entry.platforms)) {
    if (onlyPlatform && pid !== onlyPlatform) continue;
    const p = platforms[pid];
    if (!p?.verified) { s.note = "平台适配器尚未在已连接的扩展中验证，跳过"; continue; }
    if (!["pending", "needs_update", "failed"].includes(s.status) || s.attempts >= MAX_ATTEMPTS) continue;
    if (done >= PER_RUN_LIMIT) { log("run limit reached; remaining items wait for the next run"); break; }
    if (!run) { log(`would sync ${entry.id} -> ${pid} (${s.status}, attempt ${s.attempts + 1})`); continue; }
    done++;
    const auth = cli(["auth", p.wechatsyncId], 60000);
    const authText = `${auth.stdout || ""}${auth.stderr || ""}`;
    if (auth.status !== 0 || /未登录|not logged|失败|fail/i.test(authText)) {
      s.status = "needs_login"; s.updatedAt = new Date().toISOString(); s.note = "需要在浏览器登录该平台，或扩展未连接";
      log(`${entry.id} -> ${pid}: needs_login`); continue;
    }
    s.attempts++;
    const r = cli(["sync", s.file, "-p", p.wechatsyncId, "-t", entry.title], 12 * 60000);
    const text = `${r.stdout || ""}${r.stderr || ""}`.replace(/\x1b\[[0-9;]*m/g, "");
    const ok = r.status === 0 && !/失败|error|✗/i.test(text);
    s.status = ok ? "synced_draft" : "failed"; s.updatedAt = new Date().toISOString();
    s.note = text.trim().split("\n").slice(-3).join(" | ").slice(0, 300);
    log(`${entry.id} -> ${pid}: ${s.status}${ok ? "" : ` (${s.note})`}`);
    fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`); // persist after every platform
  }
}
if (run) fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`);
log(`finished mode=${run ? "run" : "dry-run"} attempted=${done}`);
