// Weekly SEO/GEO report -> reports/weekly-YYYY-MM-DD.md
//   node weekly-report.mjs
// Only real data is written. Any source that cannot be read is listed as 待授权 / 获取失败 with the reason.
// Credentials live OUTSIDE the repo, in %USERPROFILE%\.yuankun-seo\ (override with YUANKUN_SECRETS):
//   gsc-service-account.json   Google service-account key (Search Console, read-only)
//   bing-api-key.txt           Bing Webmaster API key
// They are never printed, logged or copied into reports.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
// Google is only reachable through the local proxy on this machine. Node ignores proxy
// variables unless asked, so re-run once with NODE_USE_ENV_PROXY=1 when a proxy is configured.
if (!process.env.NODE_USE_ENV_PROXY && (process.env.HTTPS_PROXY || process.env.https_proxy)) {
  const r = (await import("node:child_process")).spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  process.exit(r.status ?? 1);
}
const secretsDir = process.env.YUANKUN_SECRETS || path.join(os.homedir(), ".yuankun-seo");
const site = "https://yuankunfangwu.com";
const gscSite = process.env.GSC_SITE || "sc-domain:yuankunfangwu.com";
const today = new Date().toISOString().slice(0, 10);
const day = (offset) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
const L = [], pending = [];
const h = (t) => L.push("", `## ${t}`, "");
const secret = (name) => { try { return fs.readFileSync(path.join(secretsDir, name), "utf8").trim(); } catch { return null; } };
const sh = (cmd) => { try { return execSync(cmd, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString(); } catch { return ""; } };
const num = (n) => (n === undefined || n === null ? "无数据" : Number(n).toLocaleString("zh-CN"));

L.push(`# 源坤房屋 SEO/GEO 周报（${today}）`, "", `统计区间：${day(-9)} 至 ${day(-3)}（搜索后台数据通常延迟 2 到 3 天）。本报告只写能从官方接口或本仓库读到的数据，读不到的标注原因，不估算。`);

// 1. pages ---------------------------------------------------------------
h("一、网站页面");
const urls = (xml) => new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
const now = urls(fs.readFileSync(path.join(root, "sitemap.xml"), "utf8"));
const rev = sh(`git rev-list -1 --before="7 days ago" HEAD`).trim();
const before = rev ? urls(sh(`git show ${rev}:sitemap.xml`)) : null;
L.push(`- 公开页面总数（站点地图）：${now.size}`);
if (before && before.size) {
  const added = [...now].filter((u) => !before.has(u)), removed = [...before].filter((u) => !now.has(u));
  L.push(`- 近 7 天新增 ${added.length}，删除 ${removed.length}（对比 ${rev.slice(0, 7)} 时的站点地图）`);
  for (const u of added) L.push(`  - 新增：${u}`);
  for (const u of removed) L.push(`  - 删除：${u}`);
} else L.push("- 新增/删除页面数：无 7 天前的 git 记录可比较。");
L.push(`- 近 7 天提交：${sh(`git log --since="7 days ago" --oneline`).trim().split("\n").filter(Boolean).length} 个`);

// 2. technical check ---------------------------------------------------------
h("二、技术检查");
let out = "";
try { out = execSync("node seo-check.mjs", { cwd: root, stdio: ["ignore", "pipe", "pipe"] }).toString(); }
catch (e) { out = (e.stdout || "").toString(); }
const m = out.match(/problems=(\d+) warnings=(\d+)/);
L.push(m ? `- 必须修复 ${m[1]} 项，建议关注 ${m[2]} 项。详情见当日 reports/seo-${today}.md` : "- 技术检查未能运行。");

// 3. IndexNow ------------------------------------------------------------------
h("三、IndexNow");
try {
  const st = JSON.parse(fs.readFileSync(path.join(root, "data", "indexnow-state.json"), "utf8"));
  L.push(`- 状态文件记录 ${Object.keys(st.urls).length} 个页面，最近成功推送：${st.updatedAt || "未知"}`);
} catch { L.push("- 无推送状态文件。"); }
const log = sh("git log -1 --format=%cd").trim();
try {
  const lines = fs.readFileSync(path.join(root, "deploy", "indexnow.log"), "utf8").trim().split("\n");
  L.push(`- 最近日志：${lines.slice(-2).join("；")}`);
} catch { L.push("- 本机没有推送日志（日志只在运行部署的电脑上）。"); }
L.push("- 状态码 200/202 只代表请求已被接收，不代表已收录。Bing 后台的 IndexNow 记录需你登录核对。");

// 4. Google Search Console ----------------------------------------------------
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
async function googleToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "RS256", typ: "JWT" });
  const body = b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/webmasters.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3000 });
  const sig = crypto.sign("RSA-SHA256", Buffer.from(`${head}.${body}`), sa.private_key).toString("base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${body}.${sig}` }) });
  const j = await r.json();
  if (!j.access_token) throw new Error(`取令牌失败：${j.error_description || j.error || r.status}`);
  return j.access_token;
}
h("四、Google Search Console");
const saText = secret("gsc-service-account.json");
if (!saText) { L.push("- 待授权：未找到服务账号密钥（见《SEO运营与授权清单.md》）。收录、曝光、点击、排名暂无法自动获取。"); pending.push("Google Search Console"); }
else {
  try {
    const token = await googleToken(JSON.parse(saText));
    const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const call = async (url, body) => {
      const r = await fetch(url, { method: body ? "POST" : "GET", headers: auth, body: body && JSON.stringify(body), signal: AbortSignal.timeout(30000) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`HTTP ${r.status} ${j.error?.message || ""}`.trim());
      return j;
    };
    const api = "https://searchconsole.googleapis.com/webmasters/v3/sites/" + encodeURIComponent(gscSite);
    const step = async (label, fn) => { try { await fn(); } catch (e) { L.push(`- ${label}：请求失败（${e.name === "TimeoutError" ? "超时" : e.cause?.code || e.message}）`); } };
    const range = { startDate: day(-30), endDate: day(-3) };
    L.push(`- 授权状态：已连接，只读范围（webmasters.readonly）。统计区间 ${range.startDate} 至 ${range.endDate}。`);
    await step("搜索表现", async () => {
      const t = (await call(`${api}/searchAnalytics/query`, { ...range, dimensions: [] })).rows?.[0];
      if (t) L.push(`- 搜索表现：曝光 ${num(t.impressions)}，点击 ${num(t.clicks)}，点击率 ${(t.ctr * 100).toFixed(1)}%，平均排名 ${t.position.toFixed(1)}`);
      else L.push("- 搜索表现：授权正常，但该区间没有任何曝光记录。新站常见，可能是尚未产生搜索展示，也可能是后台数据延迟 2-3 天；不是接口错误。");
    });
    await step("搜索词", async () => {
      const rows = (await call(`${api}/searchAnalytics/query`, { ...range, dimensions: ["query"], rowLimit: 15 })).rows || [];
      if (rows.length) L.push("", "| 搜索词 | 曝光 | 点击 | 点击率 | 平均排名 |", "|---|---|---|---|---|", ...rows.map((r) => `| ${r.keys[0]} | ${r.impressions} | ${r.clicks} | ${(r.ctr * 100).toFixed(1)}% | ${r.position.toFixed(1)} |`));
    });
    await step("页面表现", async () => {
      const rows = (await call(`${api}/searchAnalytics/query`, { ...range, dimensions: ["page"], rowLimit: 10 })).rows || [];
      if (rows.length) L.push("", "| 页面 | 曝光 | 点击 | 平均排名 |", "|---|---|---|---|", ...rows.map((r) => `| ${r.keys[0]} | ${r.impressions} | ${r.clicks} | ${r.position.toFixed(1)} |`));
    });
    await step("站点地图", async () => {
      for (const s of (await call(`${api}/sitemaps`)).sitemap || []) L.push(`- 站点地图 ${s.path}：最近下载 ${s.lastDownloaded || "未知"}，错误 ${s.errors || 0}，警告 ${s.warnings || 0}，提交网址 ${(s.contents || []).map((c) => c.submitted).join("、")}（此处不含收录数，收录以下方逐网址检查为准）`);
    });
    await step("网址索引检查", async () => {
      const list = [...now], status = {}, failed = [];
      let next = 0;
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (next < list.length) {
          const u = list[next++];
          try {
            const j = await call("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", { inspectionUrl: u, siteUrl: gscSite });
            (status[j.inspectionResult?.indexStatusResult?.coverageState || "未知"] ||= []).push(u);
          } catch { failed.push(u); }
        }
      }));
      const ok = list.length - failed.length;
      const indexed = Object.entries(status).filter(([k]) => /indexed/i.test(k) && !/not indexed|Crawled|Discovered/i.test(k)).reduce((n, [, v]) => n + v.length, 0);
      L.push("", `- 实际收录（Google 网址检查接口，逐个网址）：已编入索引 ${indexed} / 成功检查 ${ok}（共 ${list.length} 个网址${failed.length ? `，${failed.length} 个请求失败` : ""}）`);
      for (const [k, v] of Object.entries(status)) L.push(`  - ${k}：${v.length} 个${v.length <= 3 ? `（${v.join("、")}）` : ""}`);
    });
  } catch (e) { L.push(`- 获取失败：${e.message}`); pending.push("Google Search Console（获取失败）"); }
}

// 5. Bing Webmaster -------------------------------------------------------------
h("五、Bing Webmaster Tools");
const bingKey = secret("bing-api-key.txt");
if (!bingKey) { L.push("- 待授权：未找到 Bing API Key（见《SEO运营与授权清单.md》）。"); pending.push("Bing Webmaster"); }
else {
  const bing = async (method) => {
    const r = await fetch(`https://ssl.bing.com/webmaster/api.svc/json/${method}?apikey=${encodeURIComponent(bingKey)}&siteUrl=${encodeURIComponent(site + "/")}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ErrorCode) throw new Error(`${method}：${j.Message || r.status}`);
    return j.d || [];
  };
  const date = (s) => (typeof s === "string" && /\/Date\((\d+)/.test(s) ? new Date(Number(s.match(/\/Date\((\d+)/)[1])).toISOString().slice(0, 10) : s);
  for (const [label, fn] of [
    ["近期流量与排名", async () => { const d = await bing("GetRankAndTrafficStats"); const last = d.slice(-7); L.push(`- 近 ${last.length} 条日统计：曝光合计 ${last.reduce((n, x) => n + (x.Impressions || 0), 0)}，点击合计 ${last.reduce((n, x) => n + (x.Clicks || 0), 0)}`); }],
    ["搜索词", async () => { const d = (await bing("GetQueryStats")).slice(-30).sort((a, b) => b.Impressions - a.Impressions).slice(0, 10); if (d.length) L.push("", "| 搜索词 | 曝光 | 点击 | 平均展示位置 |", "|---|---|---|---|", ...d.map((x) => `| ${x.Query} | ${x.Impressions} | ${x.Clicks} | ${x.AvgImpressionPosition} |`)); else L.push("- 搜索词：暂无数据。"); }],
    ["抓取", async () => { const d = await bing("GetCrawlStats"); const x = d.at(-1); L.push(x ? `- 最近抓取统计（${date(x.Date)}）：已抓取 ${x.CrawledPages}，抓取错误 ${x.CrawlErrors}，被索引页面 ${x.InIndex}，被 robots 拦截 ${x.BlockedByRobotsTxt}` : "- 抓取统计：暂无数据。"); }],
    ["站点地图", async () => { const d = await bing("GetFeeds"); for (const f of d) L.push(`- 站点地图 ${f.Url}：状态 ${f.Status}，最近抓取 ${date(f.LastCrawled)}，包含 ${f.UrlCount} 个网址`); if (!d.length) L.push("- 站点地图：接口未返回记录。"); }]
  ]) { try { await fn(); } catch (e) { L.push(`- ${label}获取失败：${e.message}`); } }
}

// 6. AI test sheets -------------------------------------------------------------
h("六、AI 搜索引用（人工记录）");
const sheets = fs.readdirSync(root).filter((f) => /^GEO效果测试表.*\.csv$/.test(f));
let shown = false;
for (const f of sheets) {
  const rows = fs.readFileSync(path.join(root, f), "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean).slice(1).map((l) => l.split(","));
  const done = rows.filter((r) => r[3]);
  if (!done.length) continue;
  shown = true;
  const mentioned = done.filter((r) => r[4] === "1").length, linked = done.filter((r) => r[5] === "1").length, wrong = done.filter((r) => r[6] === "错").length;
  L.push(`- ${f}：已测 ${done.length} 项；提到品牌 ${mentioned}，给出本站链接 ${linked}，信息有误 ${wrong}`);
}
if (!shown) L.push("- 尚无已填写的测试记录（表中测试日期为空）。AI 引用不能由后台获取，只能按《GEO效果测试说明.md》人工提问记录。");

// 7. conversions -------------------------------------------------------------------
h("七、访问与咨询转化");
const hasAnalytics = fs.readdirSync(path.join(root), { recursive: true }).some((f) => typeof f === "string" && f.endsWith(".html") && !f.startsWith("final-site-ready") && !f.startsWith("zongdexuWebSite") && /hm\.baidu\.com|clarity\.ms/.test(fs.readFileSync(path.join(root, f), "utf8")));
if (!hasAnalytics) { L.push("- 待接入：网站尚未安装访问统计，访问量、来源、电话点击、微信入口点击均无法统计。"); pending.push("访问统计"); }
else L.push("- 已检测到统计代码；统计后台数据暂需手动查看（百度统计无免费公开报表接口前提下，不自动采集）。");
L.push("- 电话/微信来电与添加好友数量：需你按周手动记录（待核实）。");

h("八、多平台内容分发");
try {
  const q = JSON.parse(fs.readFileSync(path.join(root, "data", "distribution-queue.json"), "utf8"));
  const ctl = JSON.parse(fs.readFileSync(path.join(root, "data", "distribution-control.json"), "utf8"));
  const tally = {};
  for (const e of Object.values(q.items)) for (const [pid, s] of Object.entries(e.platforms)) (tally[pid] ||= {})[s.status] = (tally[pid][s.status] || 0) + 1;
  L.push(`- 总开关：${ctl.enabled ? "已开启" : "关闭"}，模式：${ctl.mode}；队列文章 ${Object.keys(q.items).length} 篇。`);
  for (const [pid, t] of Object.entries(tally)) L.push(`- ${pid}：${Object.entries(t).map(([k, v]) => `${k} ${v}`).join("，")}`);
  L.push("- 同步成功仅表示草稿已进入平台草稿箱，不代表已发布、已收录或被 AI 引用。阅读量与公开链接需发布后在各平台后台核对（待核实）。");
} catch { L.push("- 尚未建立分发队列。"); }

h("九、本周待办");
L.push(...(pending.length ? pending.map((p) => `- 待授权/待处理：${p}`) : ["- 无待授权项。"]));
fs.mkdirSync(path.join(root, "reports"), { recursive: true });
const file = path.join(root, "reports", `weekly-${today}.md`);
fs.writeFileSync(file, L.join("\n") + "\n", "utf8");
console.log(`WEEKLY_REPORT written=reports/weekly-${today}.md pending=${pending.length}`);
