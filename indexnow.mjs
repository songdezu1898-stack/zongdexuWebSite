// IndexNow submission after a deploy. Never throws to the caller: every failure
// is logged and the process still exits 0, so a failed ping cannot break a publish.
//
//   node indexnow.mjs            submit changes since the last successful run
//   node indexnow.mjs --dry-run  show what would be submitted, change nothing
//   node indexnow.mjs --force    resubmit every sitemap URL
//
// Changes are found by comparing a content hash of each page (scripts, JSON-LD,
// asset version numbers and whitespace ignored) with data/indexnow-state.json.
// New and changed pages come from sitemap.xml; pages in the state file but no
// longer in the sitemap are submitted as removed. State is only advanced for
// batches the API accepted (200/202).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const host = "yuankunfangwu.com";
const site = `https://${host}`;
const key = "199864da2cfe47ad866ac58c5257bf4a";
const keyLocation = `${site}/${key}.txt`;
const endpoint = "https://api.indexnow.org/indexnow";
const stateFile = path.join(root, "data", "indexnow-state.json");
const logFile = path.join(root, "deploy", "indexnow.log");
const BATCH = 10000;
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force");

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(`INDEXNOW ${message}`);
  if (!dryRun) {
    try { fs.appendFileSync(logFile, `${line}\n`); } catch { /* logging must never fail the run */ }
  }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fileFor(url) {
  const rel = decodeURIComponent(url.slice(site.length + 1));
  const withIndex = rel === "" || rel.endsWith("/") ? `${rel}index.html` : rel;
  return path.join(root, withIndex);
}

function contentHash(file) {
  const html = fs.readFileSync(file, "utf8")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\?v=\d+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return crypto.createHash("sha256").update(html).digest("hex").slice(0, 32);
}

// Pages that must never be submitted: noindex pages, and Q&A articles whose
// data entry is not approved and published.
const qa = JSON.parse(fs.readFileSync(path.join(root, "data", "live-qa.json"), "utf8")).items || [];
const hidden = new Set(qa.filter((i) => !(i.published === true && i.reviewStatus === "approved")).map((i) => i.slug));
function eligible(url, file) {
  if (!fs.existsSync(file)) return false;
  const html = fs.readFileSync(file, "utf8");
  if (/<meta[^>]+name="robots"[^>]+noindex/i.test(html)) return false;
  const slug = (url.match(/\/answers\/([^/]+)\.html$/) || [])[1];
  return !(slug && hidden.has(slug));
}

const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => u.startsWith(`${site}/`));
const current = new Map();
for (const url of new Set(sitemapUrls)) {
  const file = fileFor(url);
  if (eligible(url, file)) current.set(url, contentHash(file));
}

const firstRun = !fs.existsSync(stateFile);
const state = firstRun ? { key, urls: {} } : JSON.parse(fs.readFileSync(stateFile, "utf8"));
const previous = new Map(Object.entries(state.urls));

const added = [], changed = [], removed = [];
for (const [url, hash] of current) {
  if (!previous.has(url)) added.push(url);
  else if (force || previous.get(url) !== hash) changed.push(url);
}
for (const url of previous.keys()) if (!current.has(url)) removed.push(url);
const toSubmit = [...new Set([...added, ...changed, ...removed])];

log(`${firstRun ? "first run (initial push)" : "run"}: sitemap=${sitemapUrls.length} eligible=${current.size} added=${added.length} changed=${changed.length} removed=${removed.length}`);
if (!toSubmit.length) { log("nothing to submit"); process.exit(0); }
if (dryRun) { for (const u of toSubmit) console.log(`  ${added.includes(u) ? "new    " : removed.includes(u) ? "removed" : "changed"} ${u}`); process.exit(0); }

async function keyIsLive() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(keyLocation, { redirect: "manual" });
      const body = (await res.text()).trim();
      if (res.status === 200 && body === key) return true;
      log(`key file check ${attempt}/3: status=${res.status} body_ok=${body === key}`);
    } catch (error) { log(`key file check ${attempt}/3 failed: ${error.message}`); }
    await sleep(2000 * attempt);
  }
  return false;
}

async function submit(urlList) {
  const body = JSON.stringify({ host, key, keyLocation, urlList });
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body });
      const detail = (await res.text()).slice(0, 200).replace(/\s+/g, " ");
      log(`POST ${urlList.length} urls -> HTTP ${res.status}${detail ? ` ${detail}` : ""} (attempt ${attempt})`);
      if (res.status === 200 || res.status === 202) return true;
      // 400 bad request, 403 key mismatch, 422 URL/host mismatch: retrying will not help.
      if ([400, 403, 422].includes(res.status)) return false;
    } catch (error) { log(`POST failed (attempt ${attempt}): ${error.message}`); }
    await sleep(2000 * 2 ** (attempt - 1));
  }
  return false;
}

try {
  if (!(await keyIsLive())) {
    log("SKIPPED: key file is not live at " + keyLocation + "; state unchanged");
  } else {
    let accepted = 0, failed = 0;
    for (let i = 0; i < toSubmit.length; i += BATCH) {
      const batch = toSubmit.slice(i, i + BATCH);
      if (await submit(batch)) {
        accepted += batch.length;
        for (const url of batch) { if (current.has(url)) state.urls[url] = current.get(url); else delete state.urls[url]; }
      } else failed += batch.length;
    }
    state.key = key;
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    log(`done: accepted=${accepted} failed=${failed}`);
  }
} catch (error) {
  log(`unexpected error: ${error.stack || error.message}`);
}
process.exit(0);
