// Pulls real Search Console data (read-only scope) into reports/gsc-snapshot-<date>.json.
// Credentials stay in ~/.yuankun-seo; nothing secret is printed or written. Google is reached through the local proxy.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (!process.env.NODE_USE_ENV_PROXY && (process.env.HTTPS_PROXY || process.env.https_proxy)) {
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  process.exit(r.status ?? 1);
}
const root = path.dirname(fileURLToPath(import.meta.url));
const site = "sc-domain:yuankunfangwu.com";
const today = new Date().toISOString().slice(0, 10);
const day = (o) => new Date(Date.now() + o * 864e5).toISOString().slice(0, 10);
const sa = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".yuankun-seo", "gsc-service-account.json"), "utf8"));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const h = b64({ alg: "RS256", typ: "JWT" }), p = b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/webmasters.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3000 });
const sig = crypto.sign("RSA-SHA256", Buffer.from(`${h}.${p}`), sa.private_key).toString("base64url");
const tok = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${h}.${p}.${sig}` }) })).json();
if (!tok.access_token) { console.log("GSC_FAIL token:", tok.error); process.exit(1); }
const A = { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" };
const call = async (u, body) => { const r = await fetch(u, { method: body ? "POST" : "GET", headers: A, body: body && JSON.stringify(body), signal: AbortSignal.timeout(40000) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`HTTP ${r.status} ${j.error?.message || ""}`); return j; };
const api = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}`;
const range = { startDate: day(-90), endDate: day(-1) };
const out = { pulledAt: new Date().toISOString(), range, note: "Search Console data lags 2-3 days; anonymized queries are not returned by the API." };
const step = async (k, fn) => { try { out[k] = await fn(); } catch (e) { out[k] = { error: e.message }; } };
await step("totals", async () => (await call(`${api}/searchAnalytics/query`, { ...range, dimensions: [] })).rows?.[0] || null);
await step("byDate", async () => (await call(`${api}/searchAnalytics/query`, { ...range, dimensions: ["date"], rowLimit: 200 })).rows || []);
await step("queries", async () => (await call(`${api}/searchAnalytics/query`, { ...range, dimensions: ["query"], rowLimit: 1000 })).rows || []);
await step("pages", async () => (await call(`${api}/searchAnalytics/query`, { ...range, dimensions: ["page"], rowLimit: 1000 })).rows || []);
await step("queryPage", async () => (await call(`${api}/searchAnalytics/query`, { ...range, dimensions: ["query", "page"], rowLimit: 1000 })).rows || []);
await step("countries", async () => (await call(`${api}/searchAnalytics/query`, { ...range, dimensions: ["country"], rowLimit: 50 })).rows || []);
await step("sitemaps", async () => (await call(`${api}/sitemaps`)).sitemap || []);
const urls = [...fs.readFileSync(path.join(root, "sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
out.inspection = {};
let i = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (i < urls.length) {
    const u = urls[i++];
    try {
      const j = await call("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", { inspectionUrl: u, siteUrl: site });
      const r = j.inspectionResult?.indexStatusResult || {};
      out.inspection[u] = { verdict: r.verdict, coverage: r.coverageState, robots: r.robotsTxtState, indexing: r.indexingState, lastCrawl: r.lastCrawlTime, googleCanonical: r.googleCanonical, userCanonical: r.userCanonical, crawledAs: r.crawledAs, pageFetch: r.pageFetchState };
    } catch (e) { out.inspection[u] = { error: e.message }; }
  }
}));
fs.mkdirSync(path.join(root, "reports"), { recursive: true });
const file = path.join(root, "reports", `gsc-snapshot-${today}.json`);
fs.writeFileSync(file, JSON.stringify(out));
console.log("GSC_OK", "queries=" + (out.queries.length ?? out.queries.error), "pages=" + (out.pages.length ?? out.pages.error), "inspected=" + Object.keys(out.inspection).length, "->", path.basename(file));
