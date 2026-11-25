// Turns files in distribution/inbox/*.md into CANDIDATE items in data/live-qa.json. Never publishes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inbox = path.join(root, "distribution/inbox"), done = path.join(inbox, "done");
const dataFile = path.join(root, "data/live-qa.json");
const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
const provFile = path.join(root, "data/content-provenance.json");
const prov = fs.existsSync(provFile) ? JSON.parse(fs.readFileSync(provFile, "utf8")) : {};
const today = new Date().toISOString().slice(0, 10);
const PII = /1[3-9]\d{9}|\d{17}[\dXx]|[0-9]+号[0-9]+室/;
let added = 0;
for (const f of fs.readdirSync(inbox).filter((n) => n.endsWith(".md") && n !== "README.md")) {
  const slug = f.replace(/\.md$/, "");
  try {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("文件名只能是小写英文、数字和短横线");
    if (data.items.some((i) => i.slug === slug)) throw new Error("同名 slug 已存在");
    const text = fs.readFileSync(path.join(inbox, f), "utf8").replace(/\r/g, "");
    const sec = {};
    let cur = null;
    for (const line of text.split("\n")) {
      const m = line.match(/^#{1,2}\s*(问题|结论|回答|要点|分类|关键词|依据)\s*$/);
      if (m) { cur = m[1]; sec[cur] = []; } else if (cur) sec[cur].push(line);
    }
    const get = (k) => (sec[k] || []).join("\n").trim();
    const category = get("分类");
    if (!["买房", "卖房", "置换", "产品"].includes(category)) throw new Error("分类必须是 买房/卖房/置换/产品");
    const item = {
      id: `inbox-${today.replaceAll("-", "")}-${slug}`.slice(0, 80), slug, date: today, sourceDate: today, category, region: "上海",
      question: get("问题"), answer: get("回答"), takeaway: get("结论"),
      keywords: get("关键词").split(/[,，、\s]+/).filter((k) => k.length >= 2),
      decisionPoints: get("要点").split("\n").map((l) => l.replace(/^[-*\d.\s]+/, "").trim()).filter(Boolean),
      reviewStatus: "candidate", published: false
    };
    if (item.question.length < 6 || item.answer.length < 20 || item.takeaway.length < 6) throw new Error("问题/结论/回答长度不足");
    if (PII.test(`${item.question}${item.answer}${item.takeaway}`)) throw new Error("疑似含手机号、证件号或门牌号，请脱敏");
    data.items.push(item);
    prov[item.id] = { source: get("依据") || "未填写", ingestedAt: new Date().toISOString(), via: "inbox" };
    fs.mkdirSync(done, { recursive: true });
    fs.renameSync(path.join(inbox, f), path.join(done, f));
    added++; console.log(`INGEST candidate ${slug}`);
  } catch (e) { console.log(`INGEST rejected ${f}: ${e.message}`); }
}
if (added) { data.updatedAt = today; fs.writeFileSync(dataFile, `${JSON.stringify(data, null, 2)}\n`); fs.writeFileSync(provFile, `${JSON.stringify(prov, null, 2)}\n`); }
console.log(`INGEST_OK added=${added}`);
