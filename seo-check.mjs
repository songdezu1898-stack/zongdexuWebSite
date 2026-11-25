// SEO technical check. Read-only: fetches pages, writes reports/seo-YYYY-MM-DD.md.
//   node seo-check.mjs          local + live checks
//   node seo-check.mjs --local  skip network checks
// Exit code is 1 when a blocking problem is found, so it can be scheduled.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const site = "https://yuankunfangwu.com";
const localOnly = process.argv.includes("--local");
const today = new Date().toISOString().slice(0, 10);
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const problems = [], warnings = [], notes = [];
const bad = (m) => problems.push(m), warn = (m) => warnings.push(m);

const sitemap = read("sitemap.xml");
const entries = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)].map((m) => ({ url: m[1], lastmod: m[2] }));
const fileFor = (url) => {
  const rel = decodeURIComponent(url.slice(site.length + 1));
  return path.join(root, !rel || rel.endsWith("/") ? `${rel}index.html` : rel);
};
const htmlOf = (url) => (fs.existsSync(fileFor(url)) ? fs.readFileSync(fileFor(url), "utf8") : "");
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// ---- 1. per-page checks ---------------------------------------------------
const titles = new Map(), descs = new Map(), pages = [], inbound = new Map();
for (const { url, lastmod } of entries) {
  const file = fileFor(url);
  if (!fs.existsSync(file)) { bad(`站点地图里的页面本地没有文件：${url}`); continue; }
  const raw = fs.readFileSync(file, "utf8");
  const html = raw.replace(/<script(?![^>]*ld\+json)[\s\S]*?<\/script>/gi, "");
  const g = (re) => (html.match(re) || [])[1];
  const title = decode(g(/<title>([^<]*)<\/title>/) || "");
  const desc = decode(g(/<meta name="description" content="([^"]*)"/) || "");
  const canonical = g(/<link rel="canonical" href="([^"]*)"/);
  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, "").replace(/\s+/g, "");
  pages.push({ url, text: text.length });
  if (!title) bad(`缺少 title：${url}`);
  else if (title.length > 70) warn(`title 偏长（${title.length} 字）：${url}`);
  if (!desc) bad(`缺少 description：${url}`);
  else if (desc.length < 30) warn(`description 偏短：${url}`);
  if (h1s !== 1) bad(`h1 数量为 ${h1s}（应为 1）：${url}`);
  if (canonical !== url) bad(`canonical 不是自身（${canonical}）：${url}`);
  if (/<meta[^>]+name="robots"[^>]+noindex/i.test(html)) bad(`公开页面带 noindex：${url}`);
  if (!/<meta name="viewport"/.test(html)) bad(`缺少移动端 viewport：${url}`);
  if (text.length < 400) warn(`正文偏少（约 ${text.length} 字）：${url}`);
  if (title) (titles.get(title) || titles.set(title, []).get(title)).push(url);
  if (desc) (descs.get(desc) || descs.set(desc, []).get(desc)).push(url);
  const dm = g(/"dateModified":"(\d{4}-\d{2}-\d{2})/);
  if (!lastmod) warn(`站点地图缺少 lastmod：${url}`);
  else if (lastmod > today) bad(`lastmod 是未来日期（${lastmod}）：${url}`);
  else if (dm && lastmod < dm) warn(`lastmod（${lastmod}）早于页面 dateModified（${dm}）：${url}`);
  for (const m of html.matchAll(/<a [^>]*href="([^"#?]+)[^"]*"/g)) {
    let h = m[1];
    if (h.startsWith(site)) h = h.slice(site.length) || "/";
    if (/^(https?:|mailto:|tel:|javascript:)/.test(h)) continue;
    const withIndex = h.endsWith("/") ? `${h}index.html` : h;
    const target = h.startsWith("/") ? path.join(root, withIndex) : path.resolve(path.dirname(file), withIndex);
    if (!fs.existsSync(target)) bad(`死链 ${h}（在 ${url}）`);
    else inbound.set(target, (inbound.get(target) || 0) + 1);
  }
}
for (const [t, u] of titles) if (u.length > 1) bad(`重复 title「${t}」：${u.join("、")}`);
for (const [, u] of descs) if (u.length > 1) warn(`重复 description：${u.join("、")}`);
for (const { url } of entries) {
  if (url !== `${site}/` && fs.existsSync(fileFor(url)) && !inbound.get(fileFor(url))) warn(`没有任何页面链接到它（孤儿页）：${url}`);
}

// public html files on disk that are not in the sitemap
const skipDir = new Set(["node_modules", ".git", "final-site-ready", "zongdexuWebSite", "wechat-drafts", "deploy", "reports", "backups"]);
const inMap = new Set(entries.map((e) => fileFor(e.url)));
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!skipDir.has(e.name)) walk(p); }
    else if (e.name.endsWith(".html") && !inMap.has(p) && !/baidu_verify|404\.html/.test(e.name) && !/noindex/i.test(fs.readFileSync(p, "utf8"))) {
      warn(`磁盘上有公开页面但不在站点地图：${path.relative(root, p)}`);
    }
  }
})(root);

// ---- 2. robots / IndexNow files -------------------------------------------
const robots = read("robots.txt");
if (!robots.includes(`Sitemap: ${site}/sitemap.xml`)) bad("robots.txt 没有声明 sitemap.xml");
if (/^Disallow:\s*\/\s*$/m.test(robots)) bad("robots.txt 含有 Disallow: /");
const key = (read("indexnow.mjs").match(/const key = "([0-9a-f]+)"/) || [])[1];
if (!key || !fs.existsSync(path.join(root, `${key}.txt`)) || read(`${key}.txt`).trim() !== key) bad("IndexNow 密钥文件缺失或内容不符");
let inState = null;
try { inState = JSON.parse(read("data/indexnow-state.json")); } catch { warn("data/indexnow-state.json 不存在（尚未推送过）"); }
if (inState) {
  const pending = entries.filter((e) => !(e.url in inState.urls)).length;
  notes.push(`IndexNow 状态文件记录 ${Object.keys(inState.urls).length} 个页面，最近更新 ${inState.updatedAt || "未知"}；站点地图中有 ${pending} 个页面尚未推送。`);
}
let lastPush = "无日志（日志只在运行部署的那台电脑上）";
try { lastPush = read("deploy/indexnow.log").trim().split("\n").slice(-3).join("；"); } catch { /* no log */ }

// ---- 3. live checks ---------------------------------------------------------
async function head(url, ua) {
  try {
    const r = await fetch(url, { redirect: "manual", headers: ua ? { "User-Agent": ua } : {} });
    return { status: r.status, loc: r.headers.get("location") || "" };
  } catch (e) { return { status: 0, loc: "", error: e.message }; }
}
const botRows = [];
let liveCount = 0;
if (!localOnly) {
  const live = [];
  for (let i = 0; i < entries.length; i += 8) {
    await Promise.all(entries.slice(i, i + 8).map(async (e) => live.push({ ...e, ...(await head(e.url)) })));
  }
  liveCount = live.filter((r) => r.status === 200).length;
  for (const r of live.filter((x) => x.status !== 200)) {
    (r.status === 404 ? warn : bad)(`线上 ${r.url} 返回 ${r.status || r.error}${r.status === 404 ? "（本地有、线上未发布？）" : ""}`);
  }
  const bots = {
    Googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    Bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "OAI-SearchBot": "OAI-SearchBot/1.0; +https://openai.com/searchbot",
    "Claude-SearchBot": "Claude-SearchBot",
    PerplexityBot: "PerplexityBot/1.0",
    Baiduspider: "Mozilla/5.0 (compatible; Baiduspider/2.0)"
  };
  for (const [name, ua] of Object.entries(bots)) {
    const [a, b] = await Promise.all([head(`${site}/`, ua), head(`${site}/sitemap.xml`, ua)]);
    botRows.push(`| ${name} | ${a.status} | ${b.status} |`);
    if (a.status !== 200 || b.status !== 200) bad(`${name} 访问被拒或异常（首页 ${a.status}，站点地图 ${b.status}）`);
  }
  const k = await fetch(`${site}/${key}.txt`).then(async (r) => ({ s: r.status, body: (await r.text()).trim() })).catch(() => ({ s: 0, body: "" }));
  if (k.s !== 200 || k.body !== key) bad(`线上 IndexNow 密钥文件异常（${k.s}）`);
  else notes.push("线上 IndexNow 密钥文件返回 200，内容与密钥一致。");
  const rb = await fetch(`${site}/robots.txt`).then((r) => r.text()).catch(() => "");
  if (!rb.includes(`Sitemap: ${site}/sitemap.xml`)) bad("线上 robots.txt 没有声明 sitemap.xml");
  const sm = await fetch(`${site}/sitemap.xml`).then((r) => r.text()).catch(() => "");
  const liveUrls = new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  const localSet = new Set(entries.map((e) => e.url));
  const onlyLocal = [...localSet].filter((u) => !liveUrls.has(u));
  const onlyLive = [...liveUrls].filter((u) => !localSet.has(u));
  if (onlyLocal.length) warn(`本地站点地图有、线上没有（待发布）：${onlyLocal.join("、")}`);
  if (onlyLive.length) bad(`线上站点地图有、本地没有（本地可能落后）：${onlyLive.join("、")}`);
  for (const u of ["https://www.yuankunfangwu.com/", "http://yuankunfangwu.com/", `${site}/index.html`]) {
    const r = await head(u);
    if (r.status !== 301 || !r.loc.startsWith(site)) warn(`${u} 没有 301 到规范地址（${r.status} ${r.loc}）`);
  }
}

// ---- 4. conversion entrances ------------------------------------------------
const noPhone = entries.filter((e) => !/tel:13040676264/.test(htmlOf(e.url))).map((e) => e.url.replace(site, "") || "/");
const analytics = entries.some((e) => /googletagmanager|gtag\(|hm\.baidu|clarity\.ms|plausible|umami|cloudflareinsights/.test(htmlOf(e.url)));

// ---- report -----------------------------------------------------------------
const L = [];
L.push(`# 源坤房屋 SEO 技术检查报告（${today}）`, "");
L.push(`检查范围：本地站点地图中的 ${entries.length} 个页面${localOnly ? "（仅本地）" : `，线上返回 200 的有 ${liveCount} 个`}。本报告只做技术检查，不含搜索排名、曝光、收录数量和 AI 引用；这些要 Google、Bing 后台授权数据，未获取前一律是“待授权”。`, "");
L.push("## 结论", "", `- 需要修复：${problems.length} 项`, `- 建议关注：${warnings.length} 项`, "");
L.push("## 需要修复", "", ...(problems.length ? problems.map((m) => `- ${m}`) : ["- 无"]), "");
L.push("## 建议关注", "", ...(warnings.length ? warnings.map((m) => `- ${m}`) : ["- 无"]), "");
if (!localOnly) L.push("## 爬虫访问（按 User-Agent 模拟）", "", "| 爬虫 | 首页 | sitemap.xml |", "|---|---|---|", ...botRows, "", "说明：只能证明网站没有拦截这些 UA，不能证明对方真的抓取过；真实抓取要看服务器日志或搜索后台。", "");
L.push("## IndexNow", "", ...notes.map((n) => `- ${n}`), `- 最近日志：${lastPush}`, "- 返回 202 只表示请求已收到，不代表已收录；Bing 后台里的 IndexNow 记录需要你登录确认（待核实）。", "");
L.push("## 咨询入口与统计", "", `- 没有电话链接的页面 ${noPhone.length} 个：${noPhone.join("、") || "无"}`, `- 访问统计代码：${analytics ? "已检测到统计脚本" : "未检测到任何统计脚本，来源与咨询点击目前无法记录"}`, "");
L.push("## 正文最少的 5 个页面", "", ...pages.sort((a, b) => a.text - b.text).slice(0, 5).map((p) => `- ${p.url}：约 ${p.text} 字`), "");
fs.mkdirSync(path.join(root, "reports"), { recursive: true });
fs.writeFileSync(path.join(root, "reports", `seo-${today}.md`), L.join("\n"), "utf8");
console.log(`SEO_CHECK problems=${problems.length} warnings=${warnings.length} report=reports/seo-${today}.md`);
process.exit(problems.length ? 1 : 0);
