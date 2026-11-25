// Bridge between the local pipeline and the Google Drive relay folder (synced by Google Drive for desktop).
// ChatGPT works inside Drive; this script only moves files on the local disk. No Drive API, no credentials,
// no open ports.
//   node distribution/drive-bridge.mjs out    01: copy live-transcript Markdown (never video/audio) for ChatGPT
//   node distribution/drive-bridge.mjs in     03: copy new approved Markdown into distribution/inbox/ (candidate only)
//   node distribution/drive-bridge.mjs report 04: write publish status, failures and article links
//   node distribution/drive-bridge.mjs detect  find and remember the Drive folder
// Folder location is remembered in ~/.yuankun-seo/drive-root.txt (outside the repo).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secrets = path.join(os.homedir(), ".yuankun-seo");
const rootFile = path.join(secrets, "drive-root.txt");
const statePath = path.join(secrets, "drive-bridge-state.json");
const D = { out: "01-直播转录待处理", review: "02-原创内容待审核", approved: "03-已授权发布队列", result: "04-发布结果与日志" };
const SRC = path.join(os.homedir(), "Documents", "Notebooklm", "直播同行监测");
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : { out: {}, in: {} };
const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 1));
const hash = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex").slice(0, 16);

function detect() {
  if (fs.existsSync(rootFile)) {
    const p = fs.readFileSync(rootFile, "utf8").trim();
    if (fs.existsSync(path.join(p, D.out))) return p;
  }
  const bases = [];
  for (const L of "DEFGHIJKLMNOPQRSTUVWXYZ") for (const n of ["我的云端硬盘", "My Drive"]) bases.push(`${L}:/${n}`);
  for (const n of ["我的云端硬盘", "My Drive", "Google Drive"]) bases.push(path.join(os.homedir(), n));
  for (const b of bases) {
    if (!fs.existsSync(b)) continue;
    const stack = [[b, 0]];
    while (stack.length) {
      const [d, depth] = stack.pop();
      if (fs.existsSync(path.join(d, D.out))) { fs.mkdirSync(secrets, { recursive: true }); fs.writeFileSync(rootFile, d); return d; }
      if (depth < 2) for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) stack.push([path.join(d, e.name), depth + 1]);
    }
  }
  return null;
}

const mode = process.argv[2];
const base = detect();
if (!base) { console.log("DRIVE_NOT_READY: 未找到 Google Drive 同步目录（未登录，或“源坤”中转文件夹尚未同步到本机）"); process.exit(mode === "detect" ? 1 : 0); }
if (mode === "detect") { console.log("DRIVE_OK folder found (path stored privately)"); process.exit(0); }

if (mode === "out") {
  let n = 0;
  if (fs.existsSync(SRC)) (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      // transcripts and summaries only: Markdown, small, never media or scripts
      if (!e.name.endsWith(".md") || fs.statSync(p).size > 2e6) continue;
      const rel = path.relative(SRC, p).replaceAll(path.sep, "__");
      const h = hash(p);
      if (state.out[rel] === h) continue;
      fs.copyFileSync(p, path.join(base, D.out, rel)); state.out[rel] = h; n++;
    }
  })(SRC);
  save(); console.log(`DRIVE_OUT copied=${n}`);
}

if (mode === "in") {
  const inbox = path.join(root, "distribution/inbox");
  let n = 0;
  for (const f of fs.readdirSync(path.join(base, D.approved)).filter((x) => x.endsWith(".md"))) {
    const p = path.join(base, D.approved, f), h = hash(p);
    if (state.in[f] === h) continue;
    // slug = file name; keep it web-safe or the ingest step rejects it and says why
    fs.copyFileSync(p, path.join(inbox, f)); state.in[f] = h; n++;
  }
  save(); console.log(`DRIVE_IN copied=${n}`);
}

if (mode === "report") {
  const rd = (p, d) => { try { return JSON.parse(fs.readFileSync(path.join(root, p), "utf8")); } catch { return d; } };
  const q = rd("data/distribution-queue.json", { items: {} }), control = rd("data/distribution-control.json", {});
  const intake = rd("data/intake-report.json", []), qa = rd("data/live-qa.json", { items: [] });
  const tail = (p, n) => { try { return fs.readFileSync(p, "utf8").trim().split("\n").slice(-n); } catch { return ["（无日志）"]; } };
  const day = new Date().toISOString().slice(0, 10);
  const tally = {}, rows = [];
  for (const e of Object.values(q.items)) for (const [pid, s] of Object.entries(e.platforms)) {
    tally[s.status] = (tally[s.status] || 0) + 1;
    if (!["pending", "skipped"].includes(s.status)) rows.push(`| ${e.title} | ${e.sourceUrl} | ${pid} | ${s.status} | ${s.updatedAt || ""} | ${(s.note || "").replace(/\|/g, "/").slice(0, 140)} |`);
  }
  const published = qa.items.filter((i) => i.published === true && i.reviewStatus === "approved").length;
  const candidates = qa.items.filter((i) => i.reviewStatus === "candidate").length;
  const L = [`# 运行状态与发布结果（${new Date().toISOString()}）`, "",
    "本文件由本地程序自动写入，供内容运营（ChatGPT）读取。", "",
    "## 开关", `- 自动分发总开关：${control.enabled ? "开启" : "关闭"}；模式：${control.mode}`, `- 官网自动发布：${control.autoPublishSite ? "开启" : "关闭"}`, "",
    "## 内容", `- 官网已发布问答数据：${published} 篇；候选（待审核）：${candidates} 篇`, "",
    "## 最近接收结果（03 目录 → 本地）", ...(intake.length ? ["| 时间 | 文件 | 结果 | 原因 |", "|---|---|---|---|", ...intake.slice(-15).map((i) => `| ${i.at} | ${i.file} | ${i.result} | ${(i.reasons || []).join("；")} |`)] : ["- 暂无"]), "",
    "说明：rejected 的文件已被退回，请按原因修改后用新的文件名重新放入 03；duplicate 表示与已有文章重复，无需处理。", "",
    "## 多平台草稿同步", ...(rows.length ? ["| 文章 | 官网链接 | 平台 | 状态 | 时间 | 说明 |", "|---|---|---|---|---|---|", ...rows] : ["- 暂无已处理的平台"]), "",
    `汇总：${JSON.stringify(tally)}`, "",
    "状态含义：synced_draft=草稿已进入平台草稿箱（未公开）；needs_login=浏览器扩展未连接或平台登录过期；failed=同步失败；pending=排队中；skipped=按主题不分发。", "",
    "## 桥接服务（最近 5 条）", ...tail(path.join(secrets, "bridge.log"), 5).map((l) => `- ${l}`), "",
    "## 自动任务日志（最近 8 条）", ...tail(path.join(root, "distribution/logs/automation.log"), 8).map((l) => `- ${l.slice(0, 300)}`), "",
    "synced_draft 不代表已发布、已收录或被 AI 引用；平台公开链接需发布后回填。"];
  fs.writeFileSync(path.join(base, D.result, "latest-status.md"), L.join("\n"), "utf8");
  fs.writeFileSync(path.join(base, D.result, `log-${day}.md`), L.join("\n"), "utf8");
  console.log(`DRIVE_REPORT written tally=${JSON.stringify(tally)}`);
}
