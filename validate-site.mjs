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
const pages = ["index.html", "about.html", "contact.html", "knowledge.html", serviceArticle, "404.html", ...answerPages];
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
  if (page !== "404.html" && !/<meta name="robots" content="index,follow/.test(html)) {
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
  "index.html": ["knowledge-preview", "expertise", "method", "about", "contact", "qa-list", "qa-search-input", "entity-title"],
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
for (const [page, limit] of [["index.html", 4], ["knowledge.html", publishedItems.length]]) {
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
for (const page of ["index.html", "about.html", "contact.html"]) {
  if (!read(page).includes('href="./nanxiang-fangchan-zhongjie-yuankunfangwu/"')) {
    errors.push(`missing service article link: ${page}`);
  }
}
if (!serviceHtml.includes('"datePublished": "2026-09-11"') || !serviceHtml.includes('"dateModified": "2026-09-11"')) {
  errors.push("service article dates are missing or incorrect");
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

if (errors.length) {
  console.error(JSON.stringify({ errors }, null, 2));
  process.exit(1);
}

console.log(`HTML_OK pages=${pages.length}`);
console.log(`DATA_OK published=${publishedItems.length}`);
console.log(`DISCOVERY_OK sitemap=${publishedItems.length + 5} feed=${publishedItems.length}`);
console.log(`WECHAT_OK drafts=${publishedItems.length} mode=draft-only`);
