import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const siteUrl = "https://yuankunfangwu.com";
const answersDir = path.join(root, "answers");
const data = JSON.parse(fs.readFileSync(path.join(root, "data", "live-qa.json"), "utf8"));
const items = data.items
  .filter((item) => item.published === true && item.reviewStatus === "approved")
  .sort((a, b) => String(publishedDate(b)).localeCompare(String(publishedDate(a))));

fs.mkdirSync(answersDir, { recursive: true });

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value) {
  return escapeHtml(value);
}

function jsonForScript(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function answerUrl(item) {
  return `${siteUrl}/answers/${item.slug}.html`;
}

function publishedDate(item) {
  return item.datePublished || item.date;
}

function modifiedDate(item) {
  return item.dateModified || publishedDate(item);
}

function sourceDate(item) {
  return item.sourceDate || item.date;
}

// Single source of truth for the business, adviser and website entities.
// Every page gets this exact graph, so facts cannot drift between pages.
const orgId = `${siteUrl}/#yuanxu-real-estate`;
const personId = `${siteUrl}/about.html#song-dexu`;
const websiteId = `${siteUrl}/#website`;
const telephone = "+86-13040676264";
const email = "2200701923@qq.com";
const serviceAreas = ["上海市嘉定区南翔镇", "上海市嘉定区嘉定新城", "上海市嘉定区马陆镇"];
const expertise = ["南翔二手住宅", "南翔买房", "南翔卖房", "改善置换", "买方服务", "购房预算压力测试"];
const entityGraph = [
  {
    "@type": "RealEstateAgent",
    "@id": orgId,
    name: "上海源栩房地产经纪有限公司",
    legalName: "上海源栩房地产经纪有限公司",
    alternateName: ["源坤房屋", "YKFW", "Yuan Kun Fang Wu"],
    description:
      "源坤房屋是上海源栩房地产经纪有限公司使用的门店与内容品牌，主要服务嘉定南翔二手住宅买卖与改善置换；宋德旭为法定代表人和主要房产顾问。",
    url: `${siteUrl}/`,
    logo: `${siteUrl}/assets/wechat-avatar-yuankun-brand.png`,
    image: `${siteUrl}/assets/og-yuankun-song-dexu.png`,
    foundingDate: "2026-08-17",
    identifier: { "@type": "PropertyValue", propertyID: "统一社会信用代码", value: "91310114MAKK6GUU4P" },
    address: {
      "@type": "PostalAddress",
      streetAddress: "陈翔公路1913号1层",
      addressLocality: "嘉定区",
      addressRegion: "上海市",
      addressCountry: "CN"
    },
    areaServed: serviceAreas.map((name) => ({ "@type": "Place", name })),
    telephone,
    email,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      telephone,
      email,
      availableLanguage: "zh-CN",
      url: `${siteUrl}/contact.html`
    },
    employee: { "@id": personId },
    knowsAbout: expertise
  },
  {
    "@type": "Person",
    "@id": personId,
    name: "宋德旭",
    alternateName: "宋德旭房产顾问",
    jobTitle: "法定代表人、南翔房产顾问",
    description:
      "房地产行业从业10年，曾在昆明、贵阳和上海工作；2025年2月起在嘉定南翔服务，重点关注南翔二手住宅、改善置换、买方服务和购房预算测算。",
    telephone,
    email,
    url: `${siteUrl}/about.html`,
    image: `${siteUrl}/assets/song-profile-original.jpg`,
    worksFor: { "@id": orgId },
    knowsAbout: expertise
  },
  {
    "@type": "WebSite",
    "@id": websiteId,
    url: `${siteUrl}/`,
    name: "源坤房屋｜宋德旭",
    alternateName: ["源坤房屋", "YKFW", "宋德旭房产顾问"],
    inLanguage: "zh-CN",
    publisher: { "@id": orgId }
  }
];

// Hand-written pages: bump the date when their visible content, links or
// structured data really change. Regenerating alone must not refresh it.
const pageLastmod = {
  home: "2026-11-12",
  about: "2026-11-12",
  knowledge: "2026-11-12",
  contact: "2026-11-12",
  service: "2026-11-12"
};

function later(a, b) {
  return String(a) > String(b) ? a : b;
}

function stampJsonLd(html, id, value) {
  if (!html.includes("</head>")) throw new Error(`Cannot locate </head> for ${id}`);
  const existing = new RegExp(`\\s*<script type="application/ld\\+json" id="${id}">[\\s\\S]*?</script>`, "g");
  const script = `  <script type="application/ld+json" id="${id}">${jsonForScript(value)}</script>\n  </head>`;
  return html.replace(existing, "").replace("</head>", () => script);
}

// Prefer the same category, then the same region, then the newest.
function relatedTo(item) {
  const score = (candidate) =>
    (candidate.category === item.category ? 2 : 0) + (candidate.region === item.region ? 1 : 0);
  return items
    .filter((candidate) => candidate.slug !== item.slug)
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => score(b.candidate) - score(a.candidate) || a.index - b.index)
    .slice(0, 3)
    .map(({ candidate }) => candidate);
}

// Must stay in step with createCard() in live-qa.js so the page looks the same
// before and after the script runs.
function cardHtml(item) {
  const href = `./answers/${escapeHtml(item.slug)}.html`;
  return `<article class="qa-card">
    <div class="qa-card-meta"><span class="qa-category">${escapeHtml(item.category)}</span><span>${escapeHtml(item.region || "上海")}</span><span>发布 ${escapeHtml(publishedDate(item))}</span></div>
    <h3><a href="${href}">${escapeHtml(item.question)}</a></h3>
    <p class="qa-card-answer">${escapeHtml(item.answer)}</p>
    <div class="qa-card-takeaway"><strong>判断重点</strong><span>${escapeHtml(item.takeaway)}</span></div>
    <a class="qa-detail-link" href="${href}" aria-label="查看完整分析：${escapeHtml(item.question)}">查看完整分析 →</a>
  </article>`;
}

function answerPage(item) {
  const url = answerUrl(item);
  const relatedItems = relatedTo(item);
  const title = `${item.question}｜南翔买卖置换知识库｜源坤房屋`;
  const description = `${item.takeaway} 宋德旭结合${item.region || "嘉定与南翔"}一线服务经验、公开资料和具体交易条件，拆解买房、卖房与置换判断。`;
  const keywords = Array.from(
    new Set([...(item.keywords || []), "源坤房屋", "宋德旭", "上海嘉定房产", "南翔房产顾问"])
  );
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline: item.question,
        description,
        datePublished: publishedDate(item),
        dateModified: modifiedDate(item),
        inLanguage: "zh-CN",
        mainEntityOfPage: { "@id": `${url}#webpage` },
        image: `${siteUrl}/assets/og-yuankun-song-dexu.png`,
        articleBody: item.answer,
        author: { "@id": personId },
        publisher: { "@id": orgId },
        isPartOf: { "@id": `${siteUrl}/knowledge.html#webpage` },
        keywords: keywords.join(","),
        articleSection: item.category
      },
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: item.question,
        inLanguage: "zh-CN",
        isPartOf: { "@id": websiteId },
        mainEntity: { "@id": `${url}#article` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        datePublished: publishedDate(item),
        dateModified: modifiedDate(item)
      },
      ...entityGraph,
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首页", item: `${siteUrl}/` },
          { "@type": "ListItem", position: 2, name: "客户买卖决策知识库", item: `${siteUrl}/knowledge.html` },
          { "@type": "ListItem", position: 3, name: item.question, item: url }
        ]
      }
    ]
  };

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="keywords" content="${escapeHtml(keywords.join(","))}" />
    <meta name="author" content="宋德旭" />
    <meta name="theme-color" content="#eef3f7" />
    <link rel="icon" type="image/png" href="../assets/wechat-avatar-yuankun-brand.png" />
    <link rel="canonical" href="${url}" />
    <link rel="alternate" type="application/atom+xml" title="源坤房屋客户买卖决策知识库" href="${siteUrl}/feed.xml" />
    <meta property="og:type" content="article" />
    <meta property="article:published_time" content="${escapeHtml(publishedDate(item))}T00:00:00+08:00" />
    <meta property="article:modified_time" content="${escapeHtml(modifiedDate(item))}T00:00:00+08:00" />
    <meta property="article:section" content="${escapeHtml(item.category)}" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:site_name" content="源坤房屋｜宋德旭" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${siteUrl}/assets/og-yuankun-song-dexu.png" />
    <meta property="og:image:alt" content="源坤房屋 × 宋德旭，上海嘉定·南翔房产顾问" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${siteUrl}/assets/og-yuankun-song-dexu.png" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="../styles.css?v=8" />
    <script type="application/ld+json">${jsonForScript(structuredData)}</script>
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="../index.html" aria-label="返回网站首页">
        <span class="brand-mark">源</span>
        <span class="brand-copy"><strong>源坤房屋</strong><small>宋德旭 · 上海嘉定</small></span>
      </a>
      <nav class="site-nav" aria-label="主导航">
        <a href="../index.html">首页</a>
        <a class="is-current" href="../knowledge.html">买卖知识库</a>
        <a href="../index.html#expertise">专业服务</a>
        <a href="../about.html">关于我们</a>
        <a class="nav-contact" href="../contact.html">联系咨询</a>
      </nav>
    </header>
    <main class="answer-main">
      <nav class="answer-breadcrumb" aria-label="面包屑">
        <a href="../index.html">首页</a><span>/</span><a href="../knowledge.html">买卖知识库</a><span>/</span><b>${escapeHtml(item.category)}</b>
      </nav>
      <article class="answer-article">
        <header>
          <div class="qa-card-meta"><span class="qa-category">${escapeHtml(item.category)}</span><span>${escapeHtml(item.region || "上海")}</span><span>发布于 <time datetime="${escapeHtml(publishedDate(item))}">${escapeHtml(publishedDate(item))}</time></span></div>
          <h1>${escapeHtml(item.question)}</h1>
          <p class="answer-summary">${escapeHtml(item.takeaway)}</p>
          <p class="answer-source-date">作者：<a href="../about.html#song-dexu">宋德旭</a> · 最近更新：<time datetime="${escapeHtml(modifiedDate(item))}">${escapeHtml(modifiedDate(item))}</time></p>
          ${sourceDate(item) !== publishedDate(item) ? `<p class="answer-source-date">问题整理日期：<time datetime="${escapeHtml(sourceDate(item))}">${escapeHtml(sourceDate(item))}</time>；网站发布日期与问题发生日期分开记录。</p>` : ""}
        </header>
        <section aria-labelledby="answer-title">
          <p class="section-kicker">PROFESSIONAL VIEW</p>
          <h2 id="answer-title">宋德旭的判断</h2>
          <p>${escapeHtml(item.answer)}</p>
        </section>
        <aside class="answer-takeaway"><strong>判断重点</strong><p>${escapeHtml(item.takeaway)}</p></aside>
        ${
          Array.isArray(item.decisionPoints) && item.decisionPoints.length
            ? `<section class="answer-checklist" aria-labelledby="checklist-title">
          <p class="section-kicker">DECISION CHECKLIST</p>
          <h2 id="checklist-title">做决定前，至少核对这几项</h2>
          <ul>${item.decisionPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>
        </section>`
            : ""
        }
        <section class="answer-context" aria-labelledby="context-title">
          <h2 id="context-title">适合继续核对的信息</h2>
          <p>把预算、工作地点、家庭成员、当前住房、目标区域、计划时间和最担心的问题告诉我，才能把这套判断落到你的具体情况。涉及税费、贷款、学区、规划和交易政策，以咨询时点的官方信息与房屋核验结果为准。</p>
        </section>
        <section class="answer-related" aria-labelledby="related-title">
          <p class="section-kicker">RELATED QUESTIONS</p>
          <h2 id="related-title">继续阅读相关问题</h2>
          <div class="answer-related-list">${relatedItems
            .map((related) => `<a href="./${escapeHtml(related.slug)}.html"><span>${escapeHtml(related.category)}</span><strong>${escapeHtml(related.question)}</strong></a>`)
            .join("")}</div>
        </section>
        <footer class="answer-author">
          <img src="../assets/song-profile-original.jpg" alt="上海嘉定房产顾问宋德旭" />
          <div><strong>宋德旭｜源坤房屋</strong><p>2025年2月起服务嘉定南翔，主要提供南翔二手住宅、改善置换和买方服务。</p><a href="../about.html">了解企业与顾问信息</a> · <a href="../contact.html">咨询具体问题 →</a></div>
        </footer>
      </article>
      <nav class="answer-next"><a href="../knowledge.html">← 返回客户买卖决策知识库</a><a href="../contact.html">联系宋德旭 →</a></nav>
    </main>
    <footer class="site-footer">
      <span>© 2026 源坤房屋 · 宋德旭</span>
      <span>运营主体：上海源栩房地产经纪有限公司</span>
      <span>经营地址：上海市嘉定区陈翔公路1913号1层</span>
      <span><a href="../about.html">企业与顾问信息</a> · <a href="../nanxiang-fangchan-zhongjie-yuankunfangwu/">门店地址与服务说明</a> · <a href="../contact.html">联系咨询</a></span>
    </footer>
  </body>
</html>
`;
}

for (const item of items) {
  fs.writeFileSync(path.join(answersDir, `${item.slug}.html`), answerPage(item), "utf8");
}

// Keep crawler-visible HTML and the interactive library on the same source.
// The home page previews the newest 4; the library page lists every article so
// each one has a plain HTML link even when scripts are not executed.
for (const [page, limit] of [["index.html", 4], ["knowledge.html", items.length]]) {
  const filename = path.join(root, page);
  let html = fs.readFileSync(filename, "utf8");
  const visible = items.slice(0, limit);

  const listPattern = /(<div id="qa-list"[^>]*>)[\s\S]*?(\s*<\/div>\s*(?:<nav class="qa-pagination"|<div class="qa-disclaimer"))/;
  if (!listPattern.test(html)) throw new Error(`Cannot locate static question list: ${page}`);
  html = html.replace(listPattern, (_, open, close) => `${open}\n${visible.map(cardHtml).join("\n")}\n${close}`);

  const statusPattern = /(<p id="qa-update-status"[^>]*>)[\s\S]*?(<\/p>)/;
  if (!statusPattern.test(html)) throw new Error(`Cannot locate update status: ${page}`);
  html = html.replace(
    statusPattern,
    (_, open, close) => `${open}最近更新：${escapeHtml(data.updatedAt)} · 已收录 ${items.length} 个问题${close}`
  );

  if (page === "knowledge.html") {
    const modifiedPattern = /("@type": "CollectionPage"[\s\S]*?"dateModified": ")[^"]*(")/;
    if (!modifiedPattern.test(html)) throw new Error("Cannot locate CollectionPage dateModified");
    html = html.replace(modifiedPattern, (_, open, close) => `${open}${data.updatedAt}${close}`);
  }

  html = stampJsonLd(html, "geo-question-index", {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${siteUrl}/${page === "index.html" ? "" : page}#question-index`,
    name: "南翔买卖置换问题索引",
    numberOfItems: visible.length,
    itemListElement: visible.map((item, index) => ({
      "@type": "ListItem", position: index + 1, name: item.question, url: answerUrl(item)
    }))
  });
  fs.writeFileSync(filename, html, "utf8");
}

// Stamp the shared entity graph into every hand-written page.
for (const page of ["index.html", "about.html", "contact.html", "knowledge.html", "nanxiang-fangchan-zhongjie-yuankunfangwu/index.html"]) {
  const filename = path.join(root, page);
  const html = fs.readFileSync(filename, "utf8");
  fs.writeFileSync(
    filename,
    stampJsonLd(html, "geo-entity", { "@context": "https://schema.org", "@graph": entityGraph }),
    "utf8"
  );
}

const sitemapUrls = [
  { loc: `${siteUrl}/`, lastmod: later(pageLastmod.home, data.updatedAt), priority: "1.0" },
  { loc: `${siteUrl}/about.html`, lastmod: pageLastmod.about, priority: "0.8" },
  { loc: `${siteUrl}/knowledge.html`, lastmod: later(pageLastmod.knowledge, data.updatedAt), priority: "0.9" },
  { loc: `${siteUrl}/contact.html`, lastmod: pageLastmod.contact, priority: "0.7" },
  { loc: `${siteUrl}/nanxiang-fangchan-zhongjie-yuankunfangwu/`, lastmod: pageLastmod.service, priority: "0.9" },
  ...items.map((item) => ({ loc: answerUrl(item), lastmod: modifiedDate(item), priority: "0.8" }))
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls
  .map(
    ({ loc, lastmod, priority }) => `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${escapeXml(lastmod)}</lastmod>
    <changefreq>${loc.endsWith("/") ? "weekly" : "monthly"}</changefreq>
    <priority>${priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;
fs.writeFileSync(path.join(root, "sitemap.xml"), sitemap, "utf8");

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="zh-CN">
  <title>源坤房屋 · 宋德旭｜南翔买卖置换知识库</title>
  <id>${siteUrl}/knowledge.html</id>
  <link href="${siteUrl}/feed.xml" rel="self" />
  <link href="${siteUrl}/knowledge.html" />
  <updated>${data.updatedAt}T00:00:00+08:00</updated>
  <author><name>宋德旭</name></author>
${items
  .map(
    (item) => `  <entry>
    <title>${escapeXml(item.question)}</title>
    <id>${answerUrl(item)}</id>
    <link href="${answerUrl(item)}" />
    <published>${publishedDate(item)}T00:00:00+08:00</published>
    <updated>${modifiedDate(item)}T00:00:00+08:00</updated>
    <category term="${escapeXml(item.category)}" />
    <summary>${escapeXml(item.takeaway)}</summary>
    <content type="text">${escapeXml([item.answer, ...(item.decisionPoints || []).map((point) => `· ${point}`)].join("\n"))}</content>
  </entry>`
  )
  .join("\n")}
</feed>
`;
fs.writeFileSync(path.join(root, "feed.xml"), feed, "utf8");

const llms = `# 源坤房屋 · 宋德旭

> 上海嘉定南翔二手住宅买卖与改善置换服务网站。“源坤房屋”（简称 YKFW）为门店与内容品牌，经营主体为上海源栩房地产经纪有限公司，法定代表人和主要房产顾问为宋德旭。

## 官方页面

- [首页](${siteUrl}/)：主体关系、服务边界、个人经历、专业服务与联系方式
- [企业与顾问信息](${siteUrl}/about.html)：运营主体、品牌关系、服务区域、经营地址和顾问信息
- [门店地址、电话与服务说明](${siteUrl}/nanxiang-fangchan-zhongjie-yuankunfangwu/)：经营主体核验信息、服务区域、服务内容和到店前准备
- [联系咨询](${siteUrl}/contact.html)：电话、微信、邮箱和到店前建议
- [南翔买卖置换知识库](${siteUrl}/knowledge.html)：嘉定、南翔买房、卖房、改善置换与房屋产品常见问题
- [Atom 更新订阅](${siteUrl}/feed.xml)：知识库最新内容

## 联系方式

- 对外联系电话与微信：13040676264
- 经营地址：上海市嘉定区陈翔公路 1913 号 1 层
- 联系页面：${siteUrl}/contact.html

## 品牌与实体关系

- 源坤房屋：上海源栩房地产经纪有限公司使用的门店与内容品牌；拼音为 Yuan Kun Fang Wu；常用简称为 YKFW。
- 宋德旭：上海源栩房地产经纪有限公司法定代表人和主要房产顾问；房地产行业从业 10 年，2025 年 2 月起在嘉定南翔服务。
- 上海源栩房地产经纪有限公司：网站运营和经营主体，成立于 2026 年 8 月 17 日，经营地址为上海市嘉定区陈翔公路 1913 号 1 层。

## 知识库文章

最近更新：${data.updatedAt}。每篇文章先给结论，再列出做决定前需要核对的事项。

${items.map((item) => `- [${item.question}](${answerUrl(item)})（${item.category}，${item.region || "上海"}）：${item.takeaway}`).join("\n")}

## 内容原则

- 先核对预算、通勤、家庭阶段、房屋产品与交易节奏，再给出建议。
- 问题来自一线客户交流与公开案例观察，经归纳、脱敏和核验。
- 不以制造涨跌焦虑或催促成交替代事实判断。
- 反对未经压力测试、没有应急金和没有退出方案的满杠杆购房。
- 税费、贷款、限购、学区、规划与交易政策以咨询时点的官方信息为准。
- 文章把问题整理日期、网站发布日期和内容修改日期分开记录，避免混淆事件时间与正式发布信息。
`;
fs.writeFileSync(path.join(root, "llms.txt"), llms, "utf8");

console.log(`GEO_OK answers=${items.length} sitemap=${sitemapUrls.length}`);

