// Pre-publish safety gate. Exit 1 blocks the deploy.
// Stops a stale checkout from overwriting newer work, from this or any other window/AI:
//   1. local branch is behind origin
//   2. live data/live-qa.json has Q&A items missing locally, or same slug with different content
//   3. live sitemap lists pages that the local sitemap does not
//   4. live homes/listings.json differs from the local one
// Fix hints are printed with each failure. Network failures are reported as warnings,
// not blocks, so an outage on this side cannot stop an emergency fix (override with SKIP_PREFLIGHT=1).
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = "https://yuankunfangwu.com";
const blocks = [], warns = [];
if (process.env.SKIP_PREFLIGHT === "1") { console.log("PREFLIGHT_SKIPPED (SKIP_PREFLIGHT=1)"); process.exit(0); }

const get = async (p) => {
  const res = await fetch(`${site}/${p}?_=${Date.now()}`, { headers: { "Cache-Control": "no-cache" } });
  if (!res.ok) throw new Error(`${p} -> HTTP ${res.status}`);
  return res.text();
};
const local = (p) => fs.readFileSync(path.join(root, p), "utf8");

// 1. git: behind origin
try {
  execSync("git fetch -q", { cwd: root, stdio: "pipe", timeout: 30000 });
  const behind = Number(execSync("git rev-list --count HEAD..@{u}", { cwd: root }).toString().trim());
  if (behind > 0) blocks.push(`本地落后远端 ${behind} 个提交。先 git pull，确认没有冲突后再发布。`);
} catch (e) { warns.push(`无法检查 git 远端（${e.message.split("\n")[0]}）`); }

// 2. Q&A data
try {
  const live = JSON.parse(await get("data/live-qa.json")).items || [];
  const mine = new Map(JSON.parse(local("data/live-qa.json")).items.map((i) => [i.slug, i]));
  const missing = live.filter((i) => !mine.has(i.slug)).map((i) => i.slug);
  const differ = live.filter((i) => mine.has(i.slug) && JSON.stringify(mine.get(i.slug)) !== JSON.stringify(i)).map((i) => i.slug);
  if (missing.length) blocks.push(`线上有 ${missing.length} 篇问答本地没有：${missing.join("、")}。运行 node merge-qa.mjs <线上 live-qa.json> --write 合并。`);
  if (differ.length) blocks.push(`同名问答内容线上与本地不同：${differ.join("、")}。需要人工确认哪边是新版，不要直接覆盖。`);
} catch (e) { warns.push(`无法读取线上知识库数据（${e.message}）`); }

// 3. sitemap
try {
  const urls = (s) => new Set([...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  const live = urls(await get("sitemap.xml")), mine = urls(local("sitemap.xml"));
  const missing = [...live].filter((u) => !mine.has(u));
  if (missing.length) blocks.push(`线上站点地图有 ${missing.length} 个页面本地没有：${missing.join("、")}。本地可能不是最新，先同步线上内容。`);
} catch (e) { warns.push(`无法读取线上站点地图（${e.message}）`); }

// 4. homes listings
try {
  if (fs.existsSync(path.join(root, "homes", "listings.json"))) {
    const norm = (t) => JSON.stringify(JSON.parse(t));
    const live = norm(await get("homes/listings.json"));
    if (live !== norm(local("homes/listings.json"))) blocks.push("线上 homes/listings.json 与本地不同。房源状态可能在别处更新过，先对比再发布。");
  }
} catch (e) { warns.push(`无法核对线上房源数据（${e.message}）`); }

for (const w of warns) console.log(`PREFLIGHT_WARN ${w}`);
for (const b of blocks) console.log(`PREFLIGHT_BLOCK ${b}`);
if (blocks.length) { console.log("PREFLIGHT_FAILED：已停止发布，线上未做任何修改。"); process.exit(1); }
console.log(`PREFLIGHT_OK${warns.length ? `（${warns.length} 条警告）` : ""}`);
