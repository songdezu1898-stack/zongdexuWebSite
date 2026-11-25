// Intake for content written by the content-operations lead (ChatGPT) via the Drive relay.
// Files arrive in distribution/inbox/*.md (copied from Drive folder 03 by drive-bridge.mjs).
//   授权: 否 / missing  -> stored as CANDIDATE (not public)
//   授权: 是            -> must also pass every automatic gate, then stored as approved+published data.
// Approved data only reaches the live site when the site is deployed; deploying is a separate, switchable step.
// Every decision, with reasons, is appended to data/intake-report.json so ChatGPT can read it from Drive 04.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inbox = path.join(root, "distribution/inbox"), done = path.join(inbox, "done"), rejected = path.join(inbox, "rejected");
const dataFile = path.join(root, "data/live-qa.json");
const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
const provFile = path.join(root, "data/content-provenance.json");
const prov = fs.existsSync(provFile) ? JSON.parse(fs.readFileSync(provFile, "utf8")) : {};
const reportFile = path.join(root, "data/intake-report.json");
const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, "utf8")) : [];
const facts = JSON.parse(fs.readFileSync(path.join(root, "data/brand-facts.json"), "utf8"));
const today = new Date().toISOString().slice(0, 10);

const PII = /1[3-9]\d{9}|\d{17}[\dXx]|\d+\s*号\s*\d+\s*室|\d+\s*幢\s*\d+\s*室/;
// Claims the site cannot back with verified material; blocked from automatic approval.
const UNVERIFIED = [
  [/成交(了)?\s*\d+\s*(套|笔|单)|累计成交|成交量第一|销冠|排名第一|行业第一|NO\.?1/i, "含未经核实的成交/排名表述"],
  [/(保证|包).{0,6}(上涨|升值|成交|学区|入学|落户)|一定(涨|赚)|稳赚|只涨不跌/, "含承诺性或保证性表述"],
  [/(客户|业主|买家|房东)[^。，]{0,6}(好评|五星|推荐我们|表示感谢)/, "含未经核实的客户评价"],
  [/(今日|本周|最新)?(均价|成交价|挂牌价)[^。，]{0,6}\d{4,6}\s*(元|万)/, "含具体价格数字，需附日期与来源后人工确认"]
];

const text0 = (f) => fs.readFileSync(path.join(inbox, f), "utf8").replace(/\r/g, "");
const norm = (s) => s.replace(/[\s，。？！、,.?!]/g, "").toLowerCase();
const existingQ = new Set(data.items.map((i) => norm(i.question)));
let approved = 0, candidates = 0, rejectedN = 0;

for (const f of fs.readdirSync(inbox).filter((n) => n.endsWith(".md") && n !== "README.md")) {
  const slug = f.replace(/\.md$/, "");
  const entry = { at: new Date().toISOString(), file: f, slug, result: "", reasons: [] };
  try {
    const sec = {}; let cur = null;
    for (const line of text0(f).split("\n")) {
      const m = line.match(/^#{1,2}\s*(问题|结论|回答|要点|分类|关键词|依据|授权|审核人)\s*$/);
      if (m) { cur = m[1]; sec[cur] = []; } else if (cur) sec[cur].push(line);
    }
    const get = (k) => (sec[k] || []).join("\n").trim();
    const why = entry.reasons;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) why.push("文件名只能是小写英文、数字和短横线");
    const category = get("分类");
    if (!["买房", "卖房", "置换", "产品"].includes(category)) why.push("分类必须是 买房/卖房/置换/产品");
    const q = get("问题"), a = get("回答"), t = get("结论");
    if (q.length < 6 || a.length < 20 || t.length < 6) why.push("问题/结论/回答长度不足");
    const all = `${q}\n${a}\n${t}\n${get("要点")}`;
    if (PII.test(all)) why.push("疑似含手机号、证件号或门牌号，请脱敏");
    for (const m of all.matchAll(/从业\s*(\d+)\s*\+?\s*年/g)) if (Number(m[1]) !== facts.personExperienceYears.value) why.push(`从业年限必须是${facts.personExperienceYears.value}年`);
    if (/(公司|品牌|源栩|源坤)[^。，]{0,6}(成立|创立)[^。，]{0,6}(10|十)\s*年/.test(all)) why.push("不得把负责人从业年限写成公司成立年限");
    for (const [re, msg] of UNVERIFIED) if (re.test(all)) why.push(msg);
    const duplicate = data.items.some((i) => i.slug === slug) || existingQ.has(norm(q));
    if (duplicate) why.push("与已有文章重复（同名或同一问题）");

    const authorized = /^(是|yes|true)$/i.test(get("授权").split("\n")[0].trim());
    const hardFail = why.length > 0;
    if (hardFail && duplicate && why.length === 1) { entry.result = "duplicate"; }
    else if (hardFail) { entry.result = "rejected"; }
    else {
      const item = {
        id: `inbox-${today.replaceAll("-", "")}-${slug}`.slice(0, 80), slug, date: today, sourceDate: today, datePublished: today, dateModified: today,
        category, region: "上海", question: q, answer: a, takeaway: t,
        keywords: get("关键词").split(/[,，、\s]+/).filter((k) => k.length >= 2),
        decisionPoints: get("要点").split("\n").map((l) => l.replace(/^[-*\d.\s]+/, "").trim()).filter(Boolean),
        reviewStatus: authorized ? "approved" : "candidate", published: authorized
      };
      data.items.push(item); existingQ.add(norm(q));
      prov[item.id] = { source: get("依据") || "未填写", reviewer: get("审核人") || "ChatGPT内容运营", ingestedAt: entry.at, via: "drive-inbox", authorized };
      entry.result = authorized ? "approved" : "candidate";
    }
    fs.mkdirSync(entry.result === "rejected" || entry.result === "duplicate" ? rejected : done, { recursive: true });
    fs.renameSync(path.join(inbox, f), path.join(entry.result === "rejected" || entry.result === "duplicate" ? rejected : done, f));
    if (entry.result === "approved") approved++; else if (entry.result === "candidate") candidates++; else rejectedN++;
  } catch (e) { entry.result = "error"; entry.reasons.push(e.message); rejectedN++; }
  report.push(entry);
  console.log(`INGEST ${entry.result} ${slug}${entry.reasons.length ? ` — ${entry.reasons.join("；")}` : ""}`);
}
if (approved || candidates) { data.updatedAt = today; fs.writeFileSync(dataFile, `${JSON.stringify(data, null, 2)}\n`); fs.writeFileSync(provFile, `${JSON.stringify(prov, null, 2)}\n`); }
fs.writeFileSync(reportFile, `${JSON.stringify(report.slice(-200), null, 2)}\n`);
console.log(`INGEST_OK approved=${approved} candidate=${candidates} rejected=${rejectedN}`);
