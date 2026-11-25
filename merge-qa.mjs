// Safe merge of live-qa.json: adds items that exist only in the other file,
// never overwrites an item that exists in both (reports differences instead).
//   node merge-qa.mjs <other-live-qa.json>          dry run
//   node merge-qa.mjs <other-live-qa.json> --write  apply
import fs from "node:fs";
const [, , otherPath, flag] = process.argv;
const mine = JSON.parse(fs.readFileSync("data/live-qa.json", "utf8"));
const other = JSON.parse(fs.readFileSync(otherPath, "utf8"));
const have = new Map(mine.items.map((i) => [i.slug, i]));
const added = [], conflicts = [];
for (const item of other.items) {
  if (!have.has(item.slug)) added.push(item);
  else if (JSON.stringify(have.get(item.slug)) !== JSON.stringify(item)) conflicts.push(item.slug);
}
console.log(`add=${added.map((i) => i.slug).join(",") || "-"} conflicts=${conflicts.join(",") || "-"}`);
if (conflicts.length) { console.log("MERGE_BLOCKED: same slug with different content; resolve by hand"); process.exit(2); }
if (flag === "--write" && added.length) {
  mine.items.push(...added);
  mine.updatedAt = [mine.updatedAt, other.updatedAt].sort().at(-1);
  fs.writeFileSync("data/live-qa.json", `${JSON.stringify(mine, null, 2)}\n`);
  console.log(`MERGED ${added.length}, updatedAt=${mine.updatedAt}`);
}
