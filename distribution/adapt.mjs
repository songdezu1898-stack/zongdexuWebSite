// Content adaptation layer: approved website articles -> per-platform Markdown drafts + queue entries.
// Independent of any distribution tool. Only items with published=true AND reviewStatus=approved qualify.
//   node distribution/adapt.mjs [slug]     (no slug = all approved items)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = "https://yuankunfangwu.com";
const qa = JSON.parse(fs.readFileSync(path.join(root, "data/live-qa.json"), "utf8")).items
  .filter((i) => i.published === true && i.reviewStatus === "approved");
const platforms = JSON.parse(fs.readFileSync(path.join(root, "distribution/platforms.json"), "utf8"));
delete platforms._note;
const queuePath = path.join(root, "data/distribution-queue.json");
const queue = fs.existsSync(queuePath) ? JSON.parse(fs.readFileSync(queuePath, "utf8")) : { version: 1, items: {} };
const only = process.argv[2];
// Not every article goes everywhere: platforms are chosen by topic. Platforms outside the list are marked "skipped".
const FULL = ["weixin", "zhihu", "toutiao", "sohu", "baijiahao", "netease"];
const routing = {
  买房: [...FULL, "xiaohongshu", "douyin", "weibo"],
  置换: [...FULL, "xiaohongshu", "douyin", "weibo"],
  卖房: [...FULL, "xiaohongshu", "weibo"],
  产品: ["weixin", "zhihu", "xiaohongshu"]
};

// Brand block comes from data/brand-facts.json (confirmed facts only). Personal experience and the
// entity's registration date are kept apart: the 10 years belong to the person, not to the company.
const facts = JSON.parse(fs.readFileSync(path.join(root, "data/brand-facts.json"), "utf8"));
for (const k of ["personExperienceYears", "operatingEntity", "brand"]) if (facts[k].status !== "confirmed") throw new Error(`brand fact not confirmed: ${k}`);
const brand = `${facts.brand.value}｜${facts.person.name}，上海嘉定南翔房产顾问，${facts.personExperienceYears.standardText}。经营主体：${facts.operatingEntity.value}。`;
const contact = "咨询电话/微信：13040676264　地址：上海市嘉定区陈翔公路1913号1层";
const disclaimer = "本文为决策方法整理，不含具体成交数据；价格、税费、贷款与政策以咨询时点的官方口径为准。";

// Per-platform voice: title shaping, body length cap and how much brand text to show.
const profile = {
  weixin:      { title: (i) => i.question, max: 4000, brand: "full" },
  zhihu:       { title: (i) => (/[？?]$/.test(i.question) ? i.question : i.question + "？"), max: 3500, brand: "short" },
  sohu:        { title: (i) => i.question, max: 3000, brand: "full" },
  baijiahao:   { title: (i) => i.question.length > 30 ? i.question : `${i.question}｜南翔买房卖房判断`, max: 3000, brand: "full" },
  toutiao:     { title: (i) => i.question.length > 28 ? i.question : `${i.question}（${i.category}决策要点）`, max: 2500, brand: "short" },
  weibo:       { title: (i) => i.takeaway, max: 1200, brand: "short" },
  xiaohongshu: { title: (i) => i.takeaway.slice(0, 20), max: 900, brand: "short" },
  douyin:      { title: (i) => i.takeaway.slice(0, 30), max: 900, brand: "short" },
  netease:     { title: (i) => i.question, max: 3000, brand: "full" }
};
function clipBody(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("\n"));
  return cut.slice(0, at > max * 0.6 ? at + 1 : max);
}

function render(item, style) {
  const url = `${site}/answers/${item.slug}.html`;
  const points = (item.decisionPoints || []).map((p, n) => `${n + 1}. ${p}`).join("\n");
  const foot = `\n\n---\n${brand}\n${contact}\n原文与更新：${url}\n${disclaimer}\n`;
  switch (style) {
    case "deep":
      return `# ${item.question}\n\n**一句话判断：** ${item.takeaway}\n\n${item.answer}\n\n## 做决定前的核对要点\n\n${points}${foot}`;
    case "qa":
      return `# ${item.question}\n\n结论先说：${item.takeaway}\n\n${item.answer}\n\n可以按这几步核对：\n\n${points}\n\n以上是我在南翔一线接触客户时整理的判断方法，具体到你的预算和房子，还要看实际情况。${foot}`;
    case "analysis":
      return `# ${item.question}\n\n> ${item.takeaway}\n\n${item.answer}\n\n## 判断步骤\n\n${points}${foot}`;
    case "note":
      return `# ${item.takeaway}\n\n${item.question}\n\n${item.answer}\n\n${points}\n\n${(item.keywords || []).slice(0, 4).map((k) => `#${k}`).join(" ")}${foot}`;
    case "short":
      return `${item.question}\n${item.takeaway}\n${item.answer}\n全文：${url}\n${brand}`;
    default: throw new Error(`unknown style ${style}`);
  }
}

let created = 0, updated = 0, unchanged = 0;
for (const item of qa.filter((i) => !only || i.slug === only)) {
  const id = `yk-${item.slug}`;
  const hash = crypto.createHash("sha256").update(JSON.stringify([item.question, item.answer, item.takeaway, item.decisionPoints, item.dateModified])).digest("hex").slice(0, 16);
  const entry = queue.items[id] ||= { id, slug: item.slug, sourceUrl: `${site}/answers/${item.slug}.html`, platforms: {} };
  const changed = entry.hash !== hash;
  if (!entry.hash) created++; else if (changed) updated++; else unchanged++;
  entry.hash = hash; entry.title = item.question;
  for (const [pid, p] of Object.entries(platforms)) {
    const file = path.join("distribution", "out", id, `${pid}.md`);
    fs.mkdirSync(path.join(root, "distribution/out", id), { recursive: true });
    const pr = profile[pid] || { title: (i) => i.question, max: 3000, brand: "full" };
    let body = render(item, p.style);
    // Brand: full block on long-form platforms; one line on short-form ones. Both come from brand-facts.json.
    const NL = "\n";
    if (pr.brand === "short") {
      const cutAt = body.indexOf(`${NL}---${NL}`);
      if (cutAt > 0) body = `${body.slice(0, cutAt)}${NL}${NL}—— ${brand}${NL}原文：${entry.sourceUrl}${NL}`;
    }
    body = clipBody(body, pr.max);
    if (!body.includes(entry.sourceUrl)) body += `${NL}${NL}原文：${entry.sourceUrl}`;
    fs.writeFileSync(path.join(root, file), body, "utf8");
    entry.platforms[pid] ||= { status: "pending", attempts: 0 };
    entry.platforms[pid].title = pr.title(item);
    const s = entry.platforms[pid] ||= { status: "pending", attempts: 0 };
    if (!(routing[item.category] || []).includes(pid)) { if (s.status === "pending") s.status = "skipped"; s.note = "按主题不分发到该平台"; continue; }
    if (s.status === "skipped") s.status = "pending";
    // A changed article must be re-synced; an already-synced, unchanged one is left alone (dedup).
    if (changed && s.status === "synced_draft") { s.status = "needs_update"; s.attempts = 0; }
    s.file = file.replaceAll("\\", "/"); s.contentHash = hash; s.aiLabelReminder = p.aiLabel;
  }
}
fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`);
console.log(`ADAPT_OK created=${created} updated=${updated} unchanged=${unchanged} platforms=${Object.keys(platforms).length}`);
