// Keyword asset audit. Read-only toward the website: nothing is generated into the site, nothing is submitted.
//   node keyword-audit.mjs   (run gsc-pull.mjs first for fresh Search Console data)
// Outputs to reports/keyword-audit/: keyword-map.csv, intent-clusters.csv, entities.csv, pages.csv,
// commercial-keywords.csv, audit-data.json. Counts come from the actual files; the coverage levels describe whether a
// page EXISTS for a keyword's entity and topic, not whether that page ranks or fully answers the question.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const SITE = "https://yuankunfangwu.com";
const outDir = path.join(root, "reports", "keyword-audit");
fs.mkdirSync(outDir, { recursive: true });
const bank = JSON.parse(fs.readFileSync(path.join(root, "data/keyword-bank.json"), "utf8"));
const gscFile = fs.readdirSync(path.join(root, "reports")).filter((f) => /^gsc-snapshot-.*\.json$/.test(f)).sort().at(-1);
const gsc = gscFile ? JSON.parse(fs.readFileSync(path.join(root, "reports", gscFile), "utf8")) : null;

// ---------------- pages ----------------
const urls = [...fs.readFileSync(path.join(root, "sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const fileOf = (u) => { const rel = decodeURIComponent(u.slice(SITE.length + 1)); return path.join(root, !rel || rel.endsWith("/") ? `${rel}index.html` : rel); };
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&amp;|&quot;|&#39;/g, " ").replace(/\s+/g, " ").trim();
const pages = {};
for (const u of urls) {
  const f = fileOf(u); if (!fs.existsSync(f)) continue;
  const html = fs.readFileSync(f, "utf8");
  const pick = (re) => (html.match(re) || [])[1] || "";
  const mainHtml = (html.match(/<main[\s\S]*?<\/main>/i) || html.match(/<article[\s\S]*?<\/article>/i) || [html])[0];
  const ld = [...html.matchAll(/"@type":"([A-Za-z]+)"/g)].map((m) => m[1]);
  pages[u] = {
    url: u, path: u.slice(SITE.length) || "/", title: strip(pick(/<title>([\s\S]*?)<\/title>/)), desc: pick(/<meta name="description" content="([^"]*)"/),
    h1: strip(pick(/<h1[^>]*>([\s\S]*?)<\/h1>/)), h1Count: (html.match(/<h1[\s>]/g) || []).length, canonical: pick(/<link rel="canonical" href="([^"]*)"/),
    noindex: /<meta[^>]+name="robots"[^>]+noindex/i.test(html), text: strip(mainHtml), full: strip(html), images: (strip(html), (mainHtml.match(/<img\b/g) || []).length),
    ldTypes: [...new Set(ld)].join("/"), outLinks: [...html.matchAll(/<a [^>]*href="([^"#?]+)/g)].map((m) => m[1])
  };
}
const pagePaths = new Set(Object.values(pages).map((p) => p.path));
const inbound = {};
for (const p of Object.values(pages)) for (const l of new Set(p.outLinks)) {
  let t = l.startsWith(SITE) ? l.slice(SITE.length) || "/" : l;
  if (!t.startsWith("/")) { try { t = path.posix.join(path.posix.dirname(p.path), t); } catch { continue; } }
  if (t.endsWith("index.html")) t = t.slice(0, -"index.html".length) || "/";
  if (t !== p.path && pagePaths.has(t)) inbound[t] = (inbound[t] || 0) + 1;
}
// near-duplicate check on main text (8-char shingles)
const shingles = (t) => { const s = new Set(); for (let i = 0; i + 8 <= t.length; i += 2) s.add(t.slice(i, i + 8)); return s; };
const sh = Object.fromEntries(Object.values(pages).map((p) => [p.path, shingles(p.text)]));
const maxSim = {};
const keys = Object.keys(sh);
for (const a of keys) { let best = 0, who = ""; for (const b of keys) { if (a === b) continue; let inter = 0; for (const x of sh[a]) if (sh[b].has(x)) inter++; const j = inter / (sh[a].size + sh[b].size - inter || 1); if (j > best) { best = j; who = b; } } maxSim[a] = { best, who }; }

// ---------------- Search Console join ----------------
const perf = {}; for (const r of gsc?.pages || []) perf[r.keys[0]] = r;
const insp = gsc?.inspection || {};
const pageRows = Object.values(pages).map((p) => {
  const i = insp[p.url] || {}, pf = perf[p.url];
  return { url: p.url, title: p.title, h1Count: p.h1Count, textChars: p.text.length, images: p.images, inbound: inbound[p.path] || 0, ldTypes: p.ldTypes, noindex: p.noindex, canonicalSelf: p.canonical === p.url,
    maxSimilarity: +(maxSim[p.path]?.best || 0).toFixed(2), similarTo: maxSim[p.path]?.who || "", googleStatus: i.coverage || i.error || "未检查", lastCrawl: i.lastCrawl || "", googleCanonicalMatches: i.googleCanonical ? i.googleCanonical === (i.userCanonical || p.url) : "", impressions: pf?.impressions ?? 0, clicks: pf?.clicks ?? 0, avgPosition: pf ? +pf.position.toFixed(1) : "" };
});

// ---------------- entities & topics ----------------
const COMM = [["白鹤", "/communities/baihe-xiaoqu.html"], ["格林公馆", "/communities/gelin-gongguan.html"], ["宏立瑞园", "/communities/hongli-ruiyuan.html"], ["华润", "/communities/huarun-zhongyang-gongyuan.html"], ["湖畔天下", "/communities/hupan-tianxia.html"], ["朗诗", "/communities/langshi-lvse-jiequ.html"], ["三湘森林海尚", "/communities/sanxiang-senlin-haishang.html"], ["三湘海尚", "/communities/sanxiang-senlin-haishang.html"], ["森林公馆", "/communities/senlin-gongguan.html"], ["翔和雅苑", "/communities/xianghe-yayuan.html"], ["星信名邸", "/communities/xingxin-mingdi.html"], ["银翔新村", "/communities/yinxiang-xincun.html"], ["中建溪岸澜庭", "/communities/zhongjian-xian-lanting.html"], ["中冶翔腾", "/communities/zhongye-xiangteng.html"]].sort((a, b) => b[0].length - a[0].length);
const commPage = (e) => (COMM.find(([k]) => e.includes(k)) || [])[1] || null;
const allText = Object.values(pages).filter((p) => !/\/sitemap\.html$|\/communities\/$/.test(p.path)).map((p) => `${p.path}\u0001${p.full}`);
const mentioned = (e) => allText.filter((t) => t.split("\u0001")[1].includes(e)).map((t) => t.split("\u0001")[0]);

const P = (...x) => x;
const TOPICS = [
  { id: "brand", name: "品牌与主体", rx: /源坤|宋德旭|塬坤/, pages: P("/about.html", "/nanxiang-fangchan-zhongjie-yuankunfangwu/", "/contact.html", "/"), terms: ["源坤房屋"] },
  { id: "recruit", name: "招聘/加盟/求职", rx: /招聘|加盟|底薪|提成|入职|五险|找工作|包吃住|上班/, pages: [], terms: [] },
  { id: "rent", name: "租房", rx: /租房|租金|合租|整租|押金|租客|一室户租/, pages: [], terms: [] },
  { id: "relocation", name: "动迁/安置房", rx: /动迁|安置/, pages: [], terms: [] },
  { id: "property", name: "特殊产权", rx: /商住|公寓|小产权|loft|产权年限|商办/i, pages: P("/guides/policy.html", "/guides/transaction.html"), terms: ["产权", "使用权"] },
  { id: "swap", name: "改善置换/先卖后买", rx: /置换|换房|换大|换新|先卖|先买|卖小换大|卖旧换新/, pages: P("/services/nanxiang-upgrade.html", "/answers/sell-first-or-buy-first-for-home-upgrade.html", "/answers/replacement-home-payment-timeline.html"), terms: ["置换", "先卖"] },
  { id: "villa", name: "别墅/大平层", rx: /别墅|大平层|联排|独栋|叠加|豪宅/, pages: P("/communities/hupan-tianxia.html", "/communities/gelin-gongguan.html", "/services/nanxiang-upgrade.html"), terms: ["别墅"] },
  { id: "agent", name: "找中介/经纪人", rx: /中介|经纪人|经纪公司|不吃差价|带看/, pages: P("/nanxiang-fangchan-zhongjie-yuankunfangwu/", "/about.html", "/services/nanxiang-buying.html", "/services/nanxiang-selling.html"), terms: ["中介", "经纪"] },
  { id: "price_sell", name: "卖房定价/行情", rx: /卖房|定价|挂牌|成交周期|好卖|出售|独家/, pages: P("/services/nanxiang-selling.html", "/guides/transaction.html", "/answers/walk-up-top-duplex-pricing.html", "/answers/many-sales-not-easy-resale.html", "/guides/timing.html"), terms: ["定价", "挂牌", "卖房", "出售"] },
  { id: "loan", name: "贷款/公积金", rx: /贷款|公积金|首付|月供|组合贷|利率/, pages: P("/guides/loans.html", "/guides/budget.html"), terms: ["贷款", "公积金"] },
  { id: "tax", name: "税费/过户/流程", rx: /税|满五|满二|唯一|过户|产证|交易流程|流程|定金|抵押|中介费/, pages: P("/guides/transaction.html", "/guides/policy.html"), terms: ["税", "过户", "定金"] },
  { id: "school", name: "学区/入学", rx: /学区|学校|入学|中学|小学|对口|幼儿园/, pages: P("/guides/selection.html", "/guides/policy.html"), terms: ["学区", "入学"] },
  { id: "newhome", name: "新房/新盘", rx: /新房|新盘|开盘|摇号|认筹|得房率|交房|交付|期房|楼盘|精装|毛坯/, pages: P("/answers/new-home-offer-real-cost.html", "/answers/new-home-average-price-and-four-bedroom.html", "/answers/nearby-new-project-and-resale-price.html"), terms: ["新房"] },
  { id: "transit", name: "地铁/通勤/板块", rx: /地铁|通勤|号线|站|交通|板块/, pages: P("/guides/selection.html", "/answers/nanxiang-driving-versus-metro.html", "/answers/nanxiang-metro-and-lakeside-choice.html"), terms: ["地铁", "通勤"] },
  { id: "budget", name: "预算/刚需改善", rx: /预算|总价|刚需|改善|\d+万|养老/, pages: P("/guides/budget.html", "/guides/selection.html", "/services/nanxiang-buying.html"), terms: ["预算"] },
  { id: "price_buy", name: "房价/行情/值不值得买", rx: /房价|多少钱|均价|单价|成交价|行情|涨|跌|值得买|划算|砍价|还价/, pages: P("/guides/timing.html", "/guides/budget.html", "/guides/selection.html"), terms: ["房价", "价格", "成交"] },
  { id: "facility", name: "配套/物业/车位", rx: /配套|物业|车位|商场|生活|医院|菜场|老街/, pages: P("/guides/selection.html"), terms: ["配套", "物业"] },
  { id: "choose", name: "户型/楼栋/房况", rx: /户型|几号楼|楼层|朝向|采光|噪音|装修|维修|口碑|怎么样|好不好|产权清晰|学区房/, pages: P("/guides/selection.html", "/answers/home-noise-viewing-checks.html", "/answers/renovated-resale-home-checks.html"), terms: ["户型", "看房"] },
  { id: "general", name: "其他买房决策", rx: /./, pages: P("/guides/selection.html", "/services/nanxiang-buying.html"), terms: ["买房"] }
];
// A page counts for a topic only if it really contains at least one topic term (evidence recorded).
const evidence = {};
for (const t of TOPICS) {
  t.live = t.pages.filter((pp) => {
    const pg = pages[SITE + pp]; if (!pg) return false;
    if (!t.terms.length) return true;
    const hits = t.terms.reduce((n, x) => n + (pg.full.split(x).length - 1), 0);
    (evidence[t.id] ||= []).push({ page: pp, hits, inTitle: t.terms.some((x) => pg.title.includes(x) || pg.h1.includes(x)) });
    return hits > 0;
  });
}
const VALUE = { brand: "高", agent: "高", swap: "高", villa: "高", price_sell: "高", loan: "中", tax: "中", newhome: "中", transit: "中", budget: "中", price_buy: "中", choose: "中", general: "中", school: "低", facility: "低", property: "低", rent: "低", recruit: "低", relocation: "低" };
const status = (u) => { const i = insp[u]; return i ? (/indexed/i.test(i.coverage || "") && !/not indexed|unknown/i.test(i.coverage || "") ? "已编入索引" : (i.coverage || "未知")) : "未检查"; };

// ---------------- classify the 10,000 phrasings ----------------
const rows = [];
const entCount = {}, patCount = {};
const entOf = (r) => r[3].split(/\s+/)[0];
for (const r of bank.questions) { const e = entOf(r); entCount[e] = (entCount[e] || 0) + 1; const pat = r[2].split(e).join("〔X〕"); patCount[pat] = (patCount[pat] || 0) + 1; }
bank.questions.forEach((r, idx) => {
  const [cat, sub, q, core, intent] = r, e = entOf(r), pat = q.split(e).join("〔X〕");
  const topic = TOPICS.find((t) => t.rx.test(q) || t.rx.test(core)) || TOPICS.at(-1);
  const generic = /^南翔/.test(e) || /^嘉定/.test(e) || /站$|商圈|商场|老街|印象城|五彩城|MEGA/.test(e);
  const cp = commPage(e), ment = cp ? [cp] : (generic ? [] : mentioned(e));
  let type = "其他";
  if (topic.id === "brand") type = "品牌关键词";
  else if (/单边|独家委托|独家代理/.test(q)) type = "上海单边代理";
  else if (topic.id === "swap") type = "改善置换";
  else if (topic.id === "agent") type = "中介/经纪人推荐";
  else if (topic.id === "villa" || cat === "南翔别墅/大平层") type = "别墅买卖";
  else if (topic.id === "price_sell" && /定价|挂牌|好卖|行情|成交周期/.test(q)) type = "房屋定价";
  else if (cat === "南翔卖房" || topic.id === "price_sell") type = "卖房需求";
  else if (!generic && /二手房|找中介/.test(cat) && !["rent", "recruit"].includes(topic.id)) type = "小区名称关键词";
  else if (cat === "南翔区域" || cat === "南翔商圈/商场") type = "南翔区域关键词";
  else if (["rent", "recruit", "relocation", "property"].includes(topic.id)) type = "其他(租赁/招聘/特殊产权)";
  else type = "买房需求";
  const side = topic.id === "recruit" ? "求职/加盟" : topic.id === "rent" ? "租方" : (/卖房|出售|定价|挂牌|好卖|独家/.test(q) || cat === "南翔卖房" ? "卖方" : (topic.id === "swap" ? "买卖兼有" : "买方"));
  // A topic the site has no content for (rental, recruiting, relocation housing) is never "covered", even if the community is named elsewhere.
  const topicOk = topic.live.length > 0;
  let level = 0, hostPage = "";
  if (topicOk && cp) { level = 3; hostPage = cp; }
  else if (topicOk && ment.length) { level = 2; hostPage = topic.live[0]; }
  else if (topicOk) { level = 1; hostPage = topic.live[0]; }
  const areaM = q.match(/嘉定新城|马陆|江桥|安亭|古猗园|南翔老城|南翔新城|白鹤|徐行/);
  rows.push({ id: idx + 1, question: q, core, cat, sub, intent, type, topicId: topic.id, topic: topic.name, region: areaM ? `南翔/${areaM[0]}` : "南翔", entity: generic ? "" : e, entityHasPage: !!cp, side, value: VALUE[topic.id], level, host: hostPage ? SITE + hostPage : "", pageStatus: hostPage ? status(SITE + hostPage) : "无承接页", pattern: pat, patternCount: patCount[pat], templated: patCount[pat] >= 50 });
});

// ---------------- stats ----------------
const count = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const stats = {
  raw: bank.questions.length, distinctText: new Set(rows.map((r) => r.question)).size, distinctCore: new Set(rows.map((r) => r.core)).size,
  entities: Object.keys(entCount).length, patterns: Object.keys(patCount).length, templatedRows: rows.filter((r) => r.templated).length, templatedPatterns: Object.values(patCount).filter((n) => n >= 50).length,
  byType: count(rows, (r) => r.type), byTopic: count(rows, (r) => r.topic), byLevel: count(rows, (r) => r.level), byValue: count(rows, (r) => r.value), bySide: count(rows, (r) => r.side), byPageStatus: count(rows, (r) => r.pageStatus),
  outOfScope: rows.filter((r) => ["recruit", "rent"].includes(r.topicId)).length, recruit: rows.filter((r) => r.topicId === "recruit").length, rent: rows.filter((r) => r.topicId === "rent").length,
  riskyLow: rows.filter((r) => ["relocation", "property"].includes(r.topicId)).length,
  covered: rows.filter((r) => r.level >= 1).length, notCovered: rows.filter((r) => r.level === 0).length
};
stats.valid = stats.raw - stats.recruit; // excludes only recruiting/franchise phrasings, which are not customer demand
stats.validInScope = stats.raw - stats.outOfScope;
stats.queriesWithImpressions = gsc?.queries?.length ?? null;

// intent clusters = topic x demand side
const clusters = {};
for (const r of rows) { const k = `${r.topic}|${r.side}`; const c = (clusters[k] ||= { topic: r.topic, side: r.side, value: r.value, rows: 0, entities: new Set(), patterns: new Set(), covered: 0, host: r.host }); c.rows++; if (r.entity) c.entities.add(r.entity); c.patterns.add(r.pattern); if (r.level >= 1) c.covered++; if (!c.host && r.host) c.host = r.host; }

// ---------------- entities ----------------
const entRows = Object.entries(entCount).sort((a, b) => b[1] - a[1]).map(([e, n]) => {
  const cp = commPage(e), m = /^南翔|^嘉定/.test(e) ? [] : mentioned(e);
  const sample = rows.find((r) => r.core.split(/\s+/)[0] === e);
  return { entity: e, phrasings: n, mainCategory: sample?.cat || "", communityPage: cp ? SITE + cp : "", mentionedOnPages: m.length, advice: cp ? "已有同名小区页，优先补充卖房/置换角度" : (m.length ? "站内有提及但无专页" : (/^南翔|^嘉定/.test(e) ? "通用词，由专题页承接" : "站内没有该小区，需真实资料后再决定是否建页")) };
});

// ---------------- commercial keywords ----------------
const HUBS = new Set(["/", "/knowledge.html", "/questions/", "/communities/", "/guides/", "/sitemap.html", "/contact.html"]);
const COM = [["南翔房屋置换找哪家公司", ["南翔", "置换", "公司|中介|经纪|服务"]], ["南翔房产中介推荐", ["南翔", "中介|经纪"]], ["南翔本地房产中介", ["南翔", "本地", "中介|经纪"]], ["南翔二手房出售", ["南翔", "二手房", "出售|卖"]], ["南翔卖房怎么定价", ["南翔", "卖房|出售", "定价|挂牌"]], ["南翔改善置换", ["南翔", "改善", "置换"]], ["南翔别墅买卖", ["南翔", "别墅"]], ["南翔别墅出售", ["南翔", "别墅", "出售|卖"]], ["南翔买房推荐", ["南翔", "买房", "推荐|怎么选|选房"]], ["南翔先卖后买", ["南翔", "先卖"]], ["南翔先买后卖", ["南翔", "先买"]], ["南翔各小区房价及对比", ["南翔", "小区", "房价|对比|比较"]], ["上海房产单边代理", ["单边|独家委托|独家代理"]], ["源坤房屋", ["源坤房屋"]]];
const comRows = COM.map(([kw, groups]) => {
  const res = Object.values(pages).map((p) => {
    const head = `${p.title} ${p.h1}`, hs = groups.every((g) => new RegExp(g).test(head)), body = groups.every((g) => new RegExp(g).test(p.full));
    return { p, score: (hs ? 2 : 0) + (body ? 1 : 0), hs };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  const strong = res.filter((x) => x.hs && !HUBS.has(x.p.path)), weak = res.filter((x) => !(x.hs && !HUBS.has(x.p.path)));
  return { keyword: kw, strongPages: strong.slice(0, 3).map((x) => x.p.path), strongCount: strong.length, bodyOnlyCount: weak.length, bodySamples: weak.slice(0, 2).map((x) => x.p.path), verdict: strong.length ? "有专页（标题/H1 含该词，不含首页等导航页）" : (weak.length ? "仅正文提及，没有专题页" : "没有承接页") };
});

fs.writeFileSync(path.join(outDir, "audit-data.json"), JSON.stringify({ generatedAt: new Date().toISOString(), gscFile, gscRange: gsc?.range, gscTotals: gsc?.totals, stats, evidence, commercial: comRows, clusters: Object.values(clusters).map((c) => ({ ...c, entities: c.entities.size, patterns: c.patterns.size })), pages: pageRows }, null, 1));

const csv = (head, data) => `﻿${[head.join(","), ...data.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; }).join(","))].join("\r\n")}\r\n`;
fs.writeFileSync(path.join(outDir, "keyword-map.csv"), csv(
  ["序号", "关键词或问法", "核心词", "原分类", "子类", "搜索意图", "主类型", "需求方", "区域", "小区/实体", "话题簇", "商业价值", "对应官网URL", "内容覆盖等级(0无/1通用页/2实体或提及/3同名小区页+主题页)", "页面收录状态(Google)", "搜索曝光及排名", "AI测试结果", "模板化(同一问法≥50个实体)", "后续建议"],
  rows.map((r) => [r.id, r.question, r.core, r.cat, r.sub, r.intent, r.type, r.side, r.region, r.entity, r.topic, r.value, r.host, r.level, r.pageStatus, "无查询词数据", "未测试", r.templated ? "是" : "否",
    r.topicId === "recruit" ? "不建设（非客户需求）" : r.topicId === "rent" ? "范围外：站内无租赁内容，是否开展由业务决定" : r.level === 0 ? "无承接页，先判断是否真实需求" : r.templated && r.level === 1 ? "并入专题页，不单独建页" : r.level === 3 ? "完善该小区页的卖房/置换内容" : "由专题页统一承接"])));
fs.writeFileSync(path.join(outDir, "intent-clusters.csv"), csv(["话题簇", "需求方", "商业价值", "问法数", "涉及实体数", "问法模板数", "有承接页的问法数", "建议承接页"], Object.values(clusters).sort((a, b) => b.rows - a.rows).map((c) => [c.topic, c.side, c.value, c.rows, c.entities.size, c.patterns.size, c.covered, c.host])));
fs.writeFileSync(path.join(outDir, "entities.csv"), csv(["小区/实体", "问法数", "主要原分类", "同名小区页", "站内提及页数", "建议"], entRows.map((e) => [e.entity, e.phrasings, e.mainCategory, e.communityPage, e.mentionedOnPages, e.advice])));
fs.writeFileSync(path.join(outDir, "pages.csv"), csv(["URL", "标题", "H1数", "正文字数", "正文图片数", "站内被链接数", "结构化类型", "noindex", "canonical指向自身", "与最相似页面的相似度", "最相似页面", "Google收录状态", "最近抓取", "Google规范网址一致", "曝光(90天)", "点击", "平均排名"], pageRows.map((p) => [p.url, p.title, p.h1Count, p.textChars, p.images, p.inbound, p.ldTypes, p.noindex, p.canonicalSelf, p.maxSimilarity, p.similarTo, p.googleStatus, p.lastCrawl, p.googleCanonicalMatches, p.impressions, p.clicks, p.avgPosition])));
fs.writeFileSync(path.join(outDir, "commercial-keywords.csv"), csv(["目标关键词", "判断", "标题或H1已承接的页面数", "承接页(最多3个)", "仅正文提及的页面数", "正文提及样例"], comRows.map((c) => [c.keyword, c.verdict, c.strongCount, c.strongPages.join(" "), c.bodyOnlyCount, c.bodySamples.join(" ")])));
console.log("KW_AUDIT_OK", JSON.stringify({ raw: stats.raw, entities: stats.entities, patterns: stats.patterns, covered: stats.covered, notCovered: stats.notCovered, level: stats.byLevel, value: stats.byValue }));
