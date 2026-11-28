// Remote control for the content-operations lead (ChatGPT) through the Drive relay.
// ChatGPT drops small JSON task files into Drive folder 06-调度指令; this program validates each one against a
// fixed whitelist of business actions and writes a receipt to 04-发布结果与日志/任务回执/. There is no code path
// that runs a command, a script or a path taken from a task file.
//
//   node distribution/tasks.mjs            process new tasks (also run by run-automation.ps1)
//
// Task file (06-调度指令/<anything>.json):
//   { "id": "t-20261127-01", "action": "<one of ACTIONS>", "slug": "...", "platforms": ["zhihu"], "params": { ... } }
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secrets = path.join(os.homedir(), ".yuankun-seo");
const base = fs.readFileSync(path.join(secrets, "drive-root.txt"), "utf8").trim();
const inDir = path.join(base, "06-调度指令"), doneDir = path.join(inDir, "已处理");
const rcptDir = path.join(base, "04-发布结果与日志", "任务回执");
for (const d of [inDir, doneDir, rcptDir]) fs.mkdirSync(d, { recursive: true });

const rd = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const wr = (p, o) => fs.writeFileSync(path.join(root, p), `${JSON.stringify(o, null, 2)}\n`);
const statePath = path.join(secrets, "tasks-state.json");
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : { seen: {}, perHour: [] };
const PLATFORMS = Object.keys(rd("distribution/platforms.json")).filter((k) => !k.startsWith("_"));
const SIX = ["weixin", "zhihu", "sohu", "baijiahao", "toutiao", "weibo"];
const ACTIONS = new Set(["query_status", "query_queue", "query_item", "sync_draft", "retry_item", "pause_platform", "resume_platform", "set_schedule", "update_article", "pause_all", "resume_all"]);
const MAX_PER_HOUR = 30;
const PII = /1[3-9]\d{9}|\d{17}[\dXx]|\d+\s*号\s*\d+\s*室|\d+\s*幢\s*\d+\s*室/;
const UNVERIFIED = [[/成交(了)?\s*\d+\s*(套|笔|单)|累计成交|销冠|排名第一|行业第一/, "含未经核实的成交/排名表述"], [/(保证|包).{0,6}(上涨|升值|成交|学区|入学|落户)|稳赚|只涨不跌/, "含承诺性表述"], [/(客户|业主|买家|房东)[^。，]{0,6}(好评|五星|表示感谢)/, "含未经核实的客户评价"]];

const summary = () => {
  const q = rd("data/distribution-queue.json").items, tot = {}, per = {};
  for (const e of Object.values(q)) for (const [p, s] of Object.entries(e.platforms)) { tot[s.status] = (tot[s.status] || 0) + 1; ((per[p] ||= {})[s.status] = (per[p][s.status] || 0) + 1); }
  return { total: tot, perPlatform: per, controlSwitch: rd("data/distribution-control.json").enabled, mode: rd("data/distribution-control.json").mode, officialPublished: 0 };
};

function run(t) {
  const queue = rd("data/distribution-queue.json"), control = rd("data/distribution-control.json");
  const need = (c, m) => { if (!c) throw new Error(m); };
  const item = () => { need(typeof t.slug === "string" && queue.items[`yk-${t.slug}`], `未知文章 slug：${t.slug}`); return queue.items[`yk-${t.slug}`]; };
  const plats = () => { const p = t.platforms || []; need(Array.isArray(p) && p.length && p.every((x) => PLATFORMS.includes(x)), `平台必须是 ${PLATFORMS.join("/")} 之一`); return p; };
  switch (t.action) {
    case "query_status": return { summary: summary() };
    case "query_queue": {
      const p = t.params || {}, limit = Math.min(Number(p.limit) || 50, 100);
      if (p.status !== undefined) need(typeof p.status === "string" && /^[a-z_]{3,24}$/.test(p.status), "status 格式不正确");
      if (p.platform !== undefined) need(PLATFORMS.includes(p.platform), `platform 必须是 ${PLATFORMS.join("/")} 之一`);
      const rows = [];
      for (const e of Object.values(queue.items)) for (const [pl, s] of Object.entries(e.platforms)) {
        if (p.status && s.status !== p.status) continue;
        if (p.platform && pl !== p.platform) continue;
        rows.push({ slug: e.slug, title: e.title, platform: pl, status: s.status, attempts: s.attempts, reason: (s.note || "").replace(/https?:\/\/\S+/g, "[链接已隐藏]").slice(0, 120) });
      }
      return { total: rows.length, shown: Math.min(rows.length, limit), rows: rows.slice(0, limit) };
    }
    case "query_item": {
      const e = item();
      return { title: e.title, url: e.sourceUrl, priority: e.priority ?? null, notBefore: e.notBefore ?? null,
        platforms: Object.fromEntries(Object.entries(e.platforms).map(([p, s]) => [p, { status: s.status, attempts: s.attempts, updatedAt: s.updatedAt || null, reason: (s.note || "").replace(/https?:\/\/\S+/g, "[链接已隐藏]").slice(0, 160), verified: s.verified?.result || null, official: s.publish?.status || "未发布" }])) };
    }
    case "sync_draft": {
      const e = item(), out = {};
      for (const p of plats()) {
        const s = e.platforms[p]; need(s, `${p} 无适配稿`);
        if (s.status === "synced_draft") { out[p] = "已有草稿，不重复创建"; continue; }
        if (s.status === "needs_review") { out[p] = "此项需人工核对草稿箱，请用 retry_item 并带 confirmReviewed"; continue; }
        if (s.status === "skipped") { s.status = "pending"; }
        if (!["pending", "needs_update", "failed", "needs_login"].includes(s.status)) { out[p] = `当前状态 ${s.status} 不可排队`; continue; }
        s.status = s.status === "pending" || s.status === "needs_update" ? s.status : "pending"; out[p] = "已排队，下次分发运行时同步草稿（受每日上限限制）";
      }
      wr("data/distribution-queue.json", queue); return { result: out };
    }
    case "retry_item": {
      const e = item(), out = {};
      for (const p of plats()) {
        const s = e.platforms[p]; need(s, `${p} 无适配稿`);
        if (s.status === "synced_draft") { out[p] = "已有草稿，拒绝重试"; continue; }
        if (s.status === "needs_review" && t.params?.confirmReviewed !== true) { out[p] = "需要 params.confirmReviewed=true，表示已在平台草稿箱确认没有同标题草稿"; continue; }
        if (!["failed", "needs_login", "needs_review", "paused"].includes(s.status)) { out[p] = `当前状态 ${s.status} 无需重试`; continue; }
        s.status = "pending"; s.attempts = Math.min(s.attempts || 0, 1); s.note = `按任务 ${t.id} 重试`; out[p] = "已重新排队（失败次数最多保留为 1）";
      }
      wr("data/distribution-queue.json", queue); return { result: out };
    }
    case "pause_platform": case "resume_platform": {
      const set = new Set(control.pausedPlatforms || []);
      for (const p of plats()) t.action === "pause_platform" ? set.add(p) : set.delete(p);
      control.pausedPlatforms = [...set]; wr("data/distribution-control.json", control); return { pausedPlatforms: control.pausedPlatforms };
    }
    case "pause_all": case "resume_all": {
      control.enabled = t.action === "resume_all"; wr("data/distribution-control.json", control); return { controlSwitch: control.enabled };
    }
    case "set_schedule": {
      const e = item(); const p = t.params || {};
      if (p.priority !== undefined) { need(Number.isInteger(p.priority) && p.priority >= 1 && p.priority <= 99, "priority 必须是 1-99 的整数，越小越先"); e.priority = p.priority; }
      if (p.notBefore !== undefined) { need(/^\d{4}-\d{2}-\d{2}$/.test(p.notBefore), "notBefore 格式 YYYY-MM-DD"); e.notBefore = p.notBefore; }
      wr("data/distribution-queue.json", queue); return { priority: e.priority ?? null, notBefore: e.notBefore ?? null };
    }
    case "update_article": {
      const qa = rd("data/live-qa.json"), a = qa.items.find((i) => i.slug === t.slug); need(a, `未知文章 slug：${t.slug}`);
      const p = t.params || {}; const allowed = ["question", "takeaway", "answer", "decisionPoints"];
      need(Object.keys(p).length && Object.keys(p).every((k) => allowed.includes(k)), `只能更新 ${allowed.join("/")}`);
      const next = { ...a, ...p };
      need(next.question.length >= 6 && next.answer.length >= 20 && next.takeaway.length >= 6, "长度不足");
      const all = `${next.question}\n${next.answer}\n${next.takeaway}\n${(next.decisionPoints || []).join("\n")}`;
      need(!PII.test(all), "疑似含手机号、证件号或门牌号");
      for (const [re, m] of UNVERIFIED) need(!re.test(all), m);
      for (const m of all.matchAll(/从业\s*(\d+)\s*年/g)) need(Number(m[1]) === rd("data/brand-facts.json").personExperienceYears.value, "从业年限必须与品牌资料一致");
      Object.assign(a, p); a.dateModified = new Date().toISOString().slice(0, 10); qa.updatedAt = a.dateModified; wr("data/live-qa.json", qa);
      return { updated: Object.keys(p), note: "官网数据已更新；是否上线官网取决于官网发布开关与一次部署；各平台适配稿会在下次适配时标记为需更新" };
    }
    default: throw new Error("不在白名单内的操作");
  }
}

// Runs on its own 5-minute Windows task, independent of the article-distribution switch. Two protections:
// a lock so two runs never overlap, and a pause while a distribution run is editing the queue.
const logFile = path.join(root, "distribution/logs/tasks.log");
fs.mkdirSync(path.dirname(logFile), { recursive: true });
const tlog = (m) => { try { fs.appendFileSync(logFile, `${new Date().toISOString()} ${m}\n`); } catch { /* logging must not fail the run */ } };
const fresh = (f, min) => { try { return Date.now() - fs.statSync(f).mtimeMs < min * 60000; } catch { return false; } };
const lockFile = path.join(root, "distribution/logs/tasks.lock");
if (fresh(path.join(root, "distribution/logs/dispatch.lock"), 45)) { tlog("skipped: a distribution run is active"); console.log("TASKS_SKIPPED dispatch running"); process.exit(0); }
if (fresh(lockFile, 10)) { tlog("skipped: previous task run still active"); console.log("TASKS_SKIPPED locked"); process.exit(0); }
fs.writeFileSync(lockFile, String(process.pid));
process.on("exit", () => { try { fs.unlinkSync(lockFile); } catch { /* gone */ } });

const files = fs.readdirSync(inDir).filter((f) => f.endsWith(".json"));
let handled = 0;
state.perHour = state.perHour.filter((ts) => Date.now() - ts < 3600e3);
for (const f of files) {
  let t, receipt;
  try {
    t = JSON.parse(fs.readFileSync(path.join(inDir, f), "utf8").replace(/^﻿/, ""));
    if (typeof t.id !== "string" || !/^[A-Za-z0-9_-]{3,60}$/.test(t.id)) throw new Error("id 必须是 3-60 位字母、数字、下划线或短横线");
    if (state.seen[t.id]) { receipt = { id: t.id, status: "duplicate", message: "该任务编号已处理过，已忽略", at: new Date().toISOString() }; }
    else {
      if (!ACTIONS.has(t.action)) throw new Error(`不在白名单内的操作：${String(t.action).slice(0, 30)}`);
      if (state.perHour.length >= MAX_PER_HOUR) throw new Error("每小时任务数已达上限");
      state.perHour.push(Date.now());
      const result = run(t);
      receipt = { id: t.id, action: t.action, status: "ok", at: new Date().toISOString(), result };
      state.seen[t.id] = receipt.at;
    }
  } catch (e) {
    receipt = { id: t?.id || f, action: t?.action || null, status: "rejected", at: new Date().toISOString(), reason: e.message };
    if (t?.id) state.seen[t.id] = receipt.at;
  }
  const safeId = String(receipt.id).replace(/[^A-Za-z0-9_-]/g, "_");
  fs.writeFileSync(path.join(rcptDir, `${safeId}.json`), JSON.stringify(receipt, null, 2), "utf8");
  // Markdown twin: some Drive connectors read .md/.txt far better than .json.
  fs.writeFileSync(path.join(rcptDir, `${safeId}.md`), [`# 任务回执 ${receipt.id}`, "", `- 操作：${receipt.action || "（无）"}`, `- 结果：**${receipt.status}**`, `- 时间(UTC)：${receipt.at}`, receipt.reason ? `- 原因：${receipt.reason}` : "", "", receipt.result ? "## 结果数据\n\n```json\n" + JSON.stringify(receipt.result, null, 2) + "\n```" : ""].filter((x) => x !== "").join("\n"), "utf8");
  fs.renameSync(path.join(inDir, f), path.join(doneDir, `${Date.now()}-${f}`));
  tlog(`${receipt.status} ${receipt.id} ${receipt.action || ""} ${receipt.reason || ""}`); console.log(`TASK ${receipt.status} ${receipt.id} ${receipt.action || ""} ${receipt.reason || ""}`); handled++;
}
fs.writeFileSync(statePath, JSON.stringify(state));
console.log(`TASKS_OK handled=${handled}`);
