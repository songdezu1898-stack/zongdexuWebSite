// One-off import: reads the unzipped sheets (JSON dumped from the xlsx) and
// writes data/keyword-bank.json. Usage: node build-keyword-bank.mjs <dir-with-s2.json-s3.json>
import fs from "node:fs";
import path from "node:path";
const dir = process.argv[2] || ".kwtmp";
const rows = JSON.parse(fs.readFileSync(path.join(dir, "s2.json"), "utf8")).slice(1);
const terms = JSON.parse(fs.readFileSync(path.join(dir, "s3.json"), "utf8")).slice(1);
fs.writeFileSync(
  path.join("data", "keyword-bank.json"),
  JSON.stringify({ source: "南翔买房AI关键词问题库.xlsx", imported: "2026-11-24", questions: rows.map((r) => r.slice(1, 6)), terms: terms.map((t) => [t[0], Number(t[1]), t[2], t[3]]) })
);
console.log("rows", rows.length, "terms", terms.length);
