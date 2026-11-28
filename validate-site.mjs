import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(root, "data", "live-qa.json"), "utf8"));
const publishedItems = data.items.filter(
  (item) => item.published === true && item.reviewStatus === "approved"
);
const answerPages = publishedItems.map((item) => `answers/${item.slug}.html`);
const serviceArticle = "nanxiang-fangchan-zhongjie-yuankunfangwu/index.html";
const skipDirs = new Set([".git", "node_modules", "final-site-ready", "zongdexuWebSite", "wechat-drafts", "assets", "data", "deploy"]);
function listHtml(dir = root) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return skipDirs.has(entry.name) ? [] : listHtml(full);
    return entry.name.endsWith(".html") ? [path.relative(root, full).split(path.sep).join("/")] : [];
  });
}
// Every page on disk is checked, so new sections are covered automatically.
const pages = listHtml().sort();
const errors = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function jsonLdNodes(html) {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap((match) => {
    try {
      const value = JSON.parse(match[1]);
      return value["@graph"] || [value];
    } catch {
      return [];
    }
  });
}

// Text a reader or a non-rendering crawler actually sees.
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, "");
}

for (const page of pages) {
  const absolute = path.join(root, page);
  if (!fs.existsSync(absolute)) {
    errors.push(`missing page: ${page}`);
    continue;
  }

  const html = read(page);
  if (page !== "404.html" && !/<link rel="canonical" href="https:\/\/(?:www\.)?yuankunfangwu\.com\//.test(html)) {
    errors.push(`missing canonical: ${page}`);
  }
  if (page !== "404.html" && !/og:image/.test(html)) {
    errors.push(`missing social image metadata: ${page}`);
  }
  // /homes/ is intentionally noindex until its data/image rights are confirmed.
  if (page !== "404.html" && page !== "homes/index.html" && !/<meta name="robots" content="index,follow/.test(html)) {
    errors.push(`missing index/follow robots meta: ${page}`);
  }
  if (!/rel="icon"/.test(html)) errors.push(`missing site icon: ${page}`);

  for (const match of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(match[1]);
    } catch (error) {
      errors.push(`invalid JSON-LD: ${page} (${error.message})`);
    }
  }
}

const requiredIds = {
  "index.html": ["services", "contact", "service-details"],
  "about.html": ["company-title", "song-dexu", "adviser-title", "boundary-title", "about-contact-title"],
  "contact.html": ["contact-title", "visit-title"],
  "knowledge.html": ["library", "qa-list", "qa-search-input", "qa-prev", "qa-next", "qa-page-status"]
};
for (const [page, ids] of Object.entries(requiredIds)) {
  const html = read(page);
  const present = new Set([...html.matchAll(/\sid=["']([^"']+)/g)].map((match) => match[1]));
  for (const id of ids) if (!present.has(id)) errors.push(`missing id: ${page}#${id}`);
}

const statuses = new Set(["candidate", "approved", "rejected"]);
const categories = new Set(["买房", "卖房", "置换", "产品"]);
const idsAreUnique = new Set(data.items.map((item) => item.id)).size === data.items.length;
const slugsAreUnique = new Set(data.items.map((item) => item.slug)).size === data.items.length;
const dataIsValid =
  data.version === 1 &&
  idsAreUnique &&
  slugsAreUnique &&
  data.items.every(
    (item) =>
      statuses.has(item.reviewStatus) &&
      categories.has(item.category) &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug || "") &&
      item.question.length >= 6 &&
      item.answer.length >= 20 &&
      item.takeaway.length >= 6 &&
      (!item.sourceDate || /^\d{4}-\d{2}-\d{2}$/.test(item.sourceDate)) &&
      (!item.datePublished || /^\d{4}-\d{2}-\d{2}$/.test(item.datePublished)) &&
      (!item.dateModified || /^\d{4}-\d{2}-\d{2}$/.test(item.dateModified)) &&
      (!item.decisionPoints || (item.decisionPoints.length >= 2 && item.decisionPoints.length <= 6))
  );
if (!dataIsValid) errors.push("knowledge data is invalid");

const requiredFiles = [
  "styles.css",
  "about.html",
  "contact.html",
  serviceArticle,
  "live-qa.js",
  "robots.txt",
  "sitemap.xml",
  "feed.xml",
  "llms.txt",
  "assets/song-profile-original.jpg",
  "assets/og-yuankun-song-dexu.png",
  "data/live-qa.json"
];
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) errors.push(`missing file: ${file}`);
}

const sitemap = fs.existsSync(path.join(root, "sitemap.xml")) ? read("sitemap.xml") : "";
for (const page of pages) {
  if (read(page).includes("https://www.yuankunfangwu.com")) errors.push(`inconsistent canonical host: ${page}`);
}
for (const [page, limit] of [["knowledge.html", publishedItems.length]]) {
  const html = read(page);
  if (/正在读取|qa-card-loading/.test(html)) errors.push(`static HTML still shows a loading placeholder: ${page}`);
  if (!visibleText(html).includes(`已收录${publishedItems.length}个问题`)) errors.push(`stale static article count: ${page}`);
  const sorted = [...publishedItems].sort((a, b) => String(b.datePublished || b.date).localeCompare(String(a.datePublished || a.date)));
  for (const item of sorted.slice(0, limit)) {
    if (!html.includes(`href="./answers/${item.slug}.html"`)) errors.push(`missing static article link: ${page} ${item.slug}`);
  }
  if (!html.includes('id="geo-question-index"')) errors.push(`missing structured question index: ${page}`);
}
for (const item of publishedItems) {
  const html = read(`answers/${item.slug}.html`);
  const graphs = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap((match) => {
    try { const value = JSON.parse(match[1]); return value["@graph"] || [value]; } catch { return []; }
  });
  const article = graphs.find((node) => node["@type"] === "Article");
  if (article?.articleBody !== item.answer) errors.push(`article body mismatch: ${item.slug}`);
  if (!graphs.some((node) => node["@type"] === "WebPage" && node.mainEntity?.["@id"] === article?.["@id"])) errors.push(`missing article entity relationship: ${item.slug}`);
}
for (const item of publishedItems) {
  const url = `https://yuankunfangwu.com/answers/${item.slug}.html`;
  if (!sitemap.includes(url)) errors.push(`missing sitemap URL: ${url}`);
}
if (!read("robots.txt").includes("https://yuankunfangwu.com/sitemap.xml")) {
  errors.push("robots.txt is missing sitemap URL");
}
for (const bot of [
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "Claude-SearchBot",
  "Claude-User",
  "ClaudeBot",
  "PerplexityBot",
  "Googlebot",
  "Google-Extended",
  "Bingbot",
  "Baiduspider",
  "Applebot",
  "CCBot"
]) {
  if (!read("robots.txt").includes(`User-agent: ${bot}`)) errors.push(`robots.txt is missing ${bot}`);
}
for (const url of [
  "https://yuankunfangwu.com/about.html",
  "https://yuankunfangwu.com/contact.html",
  "https://yuankunfangwu.com/knowledge.html",
  "https://yuankunfangwu.com/nanxiang-fangchan-zhongjie-yuankunfangwu/"
]) {
  if (!sitemap.includes(url)) errors.push(`missing sitemap URL: ${url}`);
}

const serviceHtml = read(serviceArticle);
for (const text of ["13040676264", "上海源栩房地产经纪有限公司", "上海市嘉定区陈翔公路1913号1层", "源坤房屋"]) {
  if (!serviceHtml.includes(text)) errors.push(`service article missing visible text: ${text}`);
}
for (const page of ["about.html", "contact.html"]) {
  if (!/href="(?:\.\/|\/)nanxiang-fangchan-zhongjie-yuankunfangwu\/"/.test(read(page))) {
    errors.push(`missing service article link: ${page}`);
  }
}
for (const service of ["nanxiang-buying", "nanxiang-selling", "nanxiang-upgrade"]) {
  if (!read("index.html").includes(`/services/${service}.html`)) errors.push(`home page does not link services/${service}.html`);
}
{
  const article = jsonLdNodes(serviceHtml).find((node) => node["@type"] === "Article");
  if (!article?.datePublished || !article?.dateModified) errors.push("service article dates are missing");
  else if (article.dateModified < article.datePublished) errors.push("service article dateModified is earlier than datePublished");
}
if (!jsonLdNodes(read("contact.html")).some((node) => node["@type"] === "RealEstateAgent" && node.telephone === "+86-13040676264")) {
  errors.push("contact page is missing machine-readable telephone");
}

for (const page of answerPages) {
  const html = read(page);
  if (!html.includes('"datePublished"') || !html.includes('"dateModified"')) {
    errors.push(`missing article dates: ${page}`);
  }
  if (!html.includes("继续阅读相关问题")) errors.push(`missing related questions: ${page}`);
}

// The business, adviser and website entities must be defined once per page and
// be identical everywhere, so answer engines never see conflicting facts.
const entityIds = [
  "https://yuankunfangwu.com/#yuanxu-real-estate",
  "https://yuankunfangwu.com/about.html#song-dexu",
  "https://yuankunfangwu.com/#website"
];
const entityReference = {};
for (const page of pages.filter((name) => name !== "404.html")) {
  const html = read(page);
  const nodes = jsonLdNodes(html);
  for (const id of entityIds) {
    const definitions = nodes.filter((node) => node["@id"] === id && node["@type"]);
    if (definitions.length !== 1) {
      errors.push(`entity ${id} is defined ${definitions.length} times: ${page}`);
      continue;
    }
    const serialized = JSON.stringify(definitions[0]);
    entityReference[id] ??= serialized;
    if (entityReference[id] !== serialized) errors.push(`entity ${id} differs between pages: ${page}`);
  }

  // Every in-site @id reference must resolve on the same page or be a page-level id of another page.
  const defined = new Set(nodes.filter((node) => node["@type"]).map((node) => node["@id"]));
  const references = [...JSON.stringify(nodes).matchAll(/\{"@id":"([^"]+)"\}/g)].map((match) => match[1]);
  for (const reference of references) {
    if (!defined.has(reference) && reference !== "https://yuankunfangwu.com/knowledge.html#webpage") {
      errors.push(`unresolved @id reference ${reference}: ${page}`);
    }
  }

  // FAQ markup may only repeat questions and answers that are visible on the page.
  const text = visibleText(html);
  for (const faq of nodes.filter((node) => node["@type"] === "FAQPage")) {
    for (const question of faq.mainEntity || []) {
      const answer = question.acceptedAnswer?.text || "";
      if (!text.includes(question.name.replace(/\s+/g, "")) || !text.includes(answer.replace(/\s+/g, ""))) {
        errors.push(`FAQ markup does not match visible text: ${page} "${question.name}"`);
      }
    }
  }
}

const wechatManifestPath = path.join(root, "wechat-drafts", "manifest.json");
if (!fs.existsSync(wechatManifestPath)) {
  errors.push("missing WeChat draft manifest");
} else {
  const manifest = JSON.parse(fs.readFileSync(wechatManifestPath, "utf8"));
  if (manifest.mode !== "draft-only" || manifest.items.length !== publishedItems.length) {
    errors.push("WeChat draft manifest does not match approved website content");
  }
  for (const item of manifest.items) {
    if (!fs.existsSync(path.join(root, "wechat-drafts", item.htmlFile))) {
      errors.push(`missing WeChat draft: ${item.htmlFile}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Whole-site checks: self-canonical, internal links, discovery files.
// ---------------------------------------------------------------------------
const siteUrl = "https://yuankunfangwu.com";
const urlOf = (rel) =>
  rel === "index.html" ? `${siteUrl}/` : rel.endsWith("/index.html") ? `${siteUrl}/${rel.slice(0, -"index.html".length)}` : `${siteUrl}/${rel}`;
const indexable = pages.filter((rel) => rel !== "404.html");

for (const rel of indexable) {
  const html = read(rel);
  const canonical = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
  if (canonical !== urlOf(rel)) errors.push(`canonical does not point at the page itself: ${rel} (${canonical})`);
  if (!/<title>[^<]{6,}<\/title>/.test(html)) errors.push(`missing or too short <title>: ${rel}`);
  if (!/<meta name="description" content="[^"]{20,}"/.test(html)) errors.push(`missing or too short description: ${rel}`);
  if ((html.replace(/<script(?![^>]*ld\+json)[\s\S]*?<\/script>/gi, "").match(/<h1[\s>]/g) || []).length !== 1) errors.push(`page should have exactly one h1: ${rel}`);
}

// Every local link and asset must resolve to a file.
for (const rel of pages) {
  const html = read(rel);
  const dir = path.posix.dirname(rel);
  for (const match of html.replace(/<script(?![^>]*ld\+json)[\s\S]*?<\/script>/gi, "").matchAll(/(?:href|src)="([^"#?]+)/g)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|tel:|data:|\/\/)/.test(target)) continue;
    let resolved = target.startsWith("/") ? target.slice(1) : path.posix.normalize(path.posix.join(dir, target));
    if (resolved === "" || resolved.endsWith("/")) resolved += "index.html";
    if (!fs.existsSync(path.join(root, resolved))) errors.push(`broken local reference in ${rel}: ${target}`);
  }
}

// The deploy package must contain every page and every file the pages load.
// A page that exists locally but is missing from deploy/publish.ps1 would never go live.
{
  const script = read("deploy/publish.ps1");
  const list = script.match(/\$publicFiles\s*=\s*@\(([\s\S]*?)\)/);
  const shipped = list ? [...list[1].matchAll(/'([^']+)'/g)].map((match) => match[1]) : [];
  if (!shipped.length) errors.push("deploy/publish.ps1: cannot read the $publicFiles list");
  const covered = (file) => shipped.some((entry) => file === entry || file.startsWith(`${entry}/`));
  const needed = new Set(pages);
  for (const rel of pages) {
    const dir = path.posix.dirname(rel);
    for (const match of read(rel).matchAll(/(?:href|src)="([^"#?]+)/g)) {
      const target = match[1];
      if (/^(?:https?:|mailto:|tel:|data:|\/\/)/.test(target) || target.endsWith("/")) continue;
      if (/\.(?:css|js|png|jpe?g|webp|svg|ico|xml|txt|json)$/.test(target)) {
        needed.add(target.startsWith("/") ? target.slice(1) : path.posix.normalize(path.posix.join(dir, target)));
      }
    }
  }
  for (const file of ["sitemap.xml", "feed.xml", "llms.txt", "robots.txt"]) needed.add(file);
  for (const file of needed) if (shipped.length && !covered(file)) errors.push(`not in the deploy package (deploy/publish.ps1): ${file}`);
}

// sitemap.xml must list exactly the indexable pages, and nothing that is missing.
const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
// A page that declares noindex must NOT be listed; every other page must be.
for (const rel of indexable) {
  const noindexed = /<meta name="robots" content="[^"]*noindex/i.test(read(rel));
  const listed = sitemapLocs.includes(urlOf(rel));
  if (noindexed && listed) errors.push(`noindex page is listed in the sitemap: ${rel}`);
  if (!noindexed && !listed) errors.push(`page missing from sitemap: ${rel}`);
}
for (const loc of sitemapLocs) if (!indexable.some((rel) => urlOf(rel) === loc)) errors.push(`sitemap lists a URL with no page: ${loc}`);
for (const match of sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(match[1])) errors.push(`invalid sitemap lastmod: ${match[1]}`);
}

// llms.txt and feed.xml must not point at pages that do not exist.
const linkedFrom = (file) => [...read(file).matchAll(/https:\/\/yuankunfangwu\.com\/[^\s)"<]*/g)].map((match) => match[0]);
for (const url of new Set([...linkedFrom("llms.txt"), ...linkedFrom("feed.xml")])) {
  const known = sitemapLocs.includes(url) || fs.existsSync(path.join(root, url.slice(siteUrl.length + 1)));
  if (!known) errors.push(`discovery file links to a missing URL: ${url}`);
}
const feedLinks = new Set(linkedFrom("feed.xml"));
for (const item of publishedItems) {
  if (!feedLinks.has(`${siteUrl}/answers/${item.slug}.html`)) errors.push(`feed.xml missing article: ${item.slug}`);
}

// Brand facts: personal experience must match data/brand-facts.json and must never be
// phrased as the company's age. Scans every page plus the content data and WeChat drafts.
{
  const facts = JSON.parse(read("data/brand-facts.json"));
  const years = facts.personExperienceYears.value;
  const scan = [...pages.map((rel) => [rel, read(rel)]), ["data/live-qa.json", read("data/live-qa.json")]];
  for (const [name, text] of scan) {
    for (const m of text.matchAll(/从业\s*(\d+)\s*\+?\s*年/g)) {
      if (Number(m[1]) !== years) errors.push(`brand fact mismatch: ${name} says 从业${m[1]}年, brand-facts.json says ${years}`);
    }
    if (/(公司|企业|品牌|源栩|源坤)[^。，<]{0,6}(成立|创立|创办)[^。，<]{0,6}(10|十|8|八)\s*(多)?年/.test(text)) errors.push(`brand fact: ${name} ties company age to years of experience`);
  }
}

if (errors.length) {
  console.error(JSON.stringify({ errors }, null, 2));
  process.exit(1);
}

console.log(`HTML_OK pages=${pages.length}`);
console.log(`DATA_OK published=${publishedItems.length}`);
console.log(`DISCOVERY_OK sitemap=${sitemapLocs.length} feed articles=${[...feedLinks].filter((url) => url.includes("/answers/")).length}`);
console.log(`WECHAT_OK drafts=${publishedItems.length} mode=draft-only`);
