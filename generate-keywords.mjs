// Builds questions/index.html from data/keyword-bank.json.
// The bank holds search phrasings only (no answers). The page therefore lists
// how buyers ask, and routes each group to the page that actually covers it.
// Run before generate-geo.mjs (which stamps entity data, sitemap, llms.txt).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const site = "https://yuankunfangwu.com";
const bank = JSON.parse(fs.readFileSync(path.join(root, "data", "keyword-bank.json"), "utf8"));
const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const PER_GROUP = 8;
// Recruiting, franchise and rental phrasings are in the bank but this site does not cover them.
const OFF_TOPIC = /招聘|加盟|底薪|提成|五险|入职|租房|租金|合租|押金|找工作|上班/;
const SKIP_CATEGORY = /招聘|加盟|找工作|租房/;

const groups = [
  { title: "找中介、找经纪人", cats: ["找中介/经纪人"], subs: null, links: [["/nanxiang-fangchan-zhongjie-yuankunfangwu/", "源坤房屋门店与服务说明"], ["/about.html", "企业与顾问信息"], ["/contact.html", "联系宋德旭"]], note: "判断中介是否靠谱，先核对主体、地址和服务范围，再看对方能否说清楚交易环节。" },
  { title: "二手房：房价、小区与选房", cats: ["南翔二手房"], subs: ["房价行情", "置业决策", "房源", "小区点评", "小区配套", "选房", "交通", "预算匹配", "人群置业"], links: [["/guides/selection.html", "选房对比指南"], ["/communities/", "13个南翔小区指南"], ["/guides/budget.html", "预算与租买比较"]], note: "价格以咨询时的挂牌与成交为准；本站不公布未经核验的单价。" },
  { title: "二手房：贷款、税费与交易流程", cats: ["南翔二手房"], subs: ["贷款", "税费", "流程", "交易风险", "砍价"], links: [["/guides/loans.html", "贷款与公积金核验"], ["/guides/transaction.html", "交易流程与税费"], ["/guides/policy.html", "资格与政策核验"]], note: "税费、贷款和资格政策随时间调整，以官方和银行当日口径为准。" },
  { title: "地铁、板块与学区", cats: ["南翔区域"], subs: null, links: [["/guides/selection.html", "地铁与学区需求对比"], ["/guides/policy.html", "资格与入学政策核验"]], note: "学区和对口以教育部门当年公布为准，页面不对具体门牌作入学承诺。" },
  { title: "新房与新盘", cats: ["南翔新房"], subs: null, links: [["/services/nanxiang-buying.html", "南翔买房服务"], ["/answers/new-home-average-price-and-four-bedroom.html", "新房均价与四房判断"]], note: "新盘价格、摇号和交付信息以开发商与官方公示为准。" },
  { title: "卖房：定价、行情与税费", cats: ["南翔卖房"], subs: null, links: [["/services/nanxiang-selling.html", "南翔卖房服务"], ["/guides/transaction.html", "交易流程与税费"]], note: "定价要结合同小区近期成交和房屋条件，不由单一数字决定。" },
  { title: "改善置换、别墅与大平层", cats: ["南翔别墅/大平层"], subs: null, links: [["/services/nanxiang-upgrade.html", "南翔改善置换服务"], ["/answers/sell-first-or-buy-first-for-home-upgrade.html", "先卖还是先买"]], note: "置换的关键是时间差和资金衔接，需要按自己的房子和预算压力测试。" },
  { title: "动迁房、安置房与产权类型", cats: ["动迁房/安置房", "商品房/产权"], subs: null, links: [["/guides/policy.html", "资格与政策核验"], ["/guides/transaction.html", "特殊房源交易核验"]], note: "特殊产权能否交易、是否有产证，必须看具体房屋的权属材料。" }
];

// Deterministic spread: one question per distinct core keyword, evenly spaced.
function pick(rows) {
  const seen = new Set();
  const unique = rows.filter((r) => !seen.has(r[3]) && seen.add(r[3]));
  if (unique.length <= PER_GROUP) return unique;
  const step = unique.length / PER_GROUP;
  return Array.from({ length: PER_GROUP }, (_, i) => unique[Math.floor(i * step)]);
}

const usable = bank.questions.filter((r) => !SKIP_CATEGORY.test(r[0]) && !OFF_TOPIC.test(r[2]));
let total = 0;
const sections = groups.map((g) => {
  const rows = usable.filter((r) => g.cats.includes(r[0]) && (!g.subs || g.subs.includes(r[1])));
  const bySub = [...new Set(rows.map((r) => r[1]))].map((sub) => pick(rows.filter((r) => r[1] === sub)));
  // Round-robin across sub-categories so no single theme dominates the group.
  const list = [];
  for (let i = 0; list.length < 12 && bySub.some((q) => i < q.length); i++) for (const q of bySub) if (i < q.length && list.length < 12) list.push(q[i]);
  total += list.length;
  return `<section class="card" style="margin-bottom:16px"><h2>${esc(g.title)}</h2><p>${esc(g.note)}</p><ul>${list.map((r) => `<li>${esc(r[2])}</li>`).join("")}</ul><p>先看：${g.links.map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join(" · ")}</p></section>`;
});

const terms = bank.terms.filter((t) => !OFF_TOPIC.test(t[0]) && !SKIP_CATEGORY.test(t[2])).slice(0, 24).map((t) => t[0]);
const intents = ["价格查询", "决策咨询", "房源查询", "学区咨询", "贷款咨询", "税费咨询", "中介推荐", "经纪人推荐"];

const title = "南翔买房常见问题索引｜找中介、选小区、贷款税费、学区｜源坤房屋";
const description = "按买房人的真实问法整理南翔二手房、新房、卖房、置换与找中介问题，每类给出对应指南和核验入口，价格与政策以官方及咨询时点为准。";
const url = `${site}/questions/`;
const modified = "2026-11-24";
const ld = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "CollectionPage", "@id": `${url}#webpage`, url, name: title, description, inLanguage: "zh-CN", dateModified: modified, author: { "@id": `${site}/about.html#song-dexu` }, publisher: { "@id": `${site}/#yuanxu-real-estate` }, isPartOf: { "@id": `${site}/#website` }, about: ["南翔买房", "南翔二手房", "嘉定南翔房产中介"] },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "源坤房屋", item: `${site}/` }, { "@type": "ListItem", position: 2, name: "南翔买房常见问题索引", item: url }] }
  ]
};

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="keywords" content="${esc(["南翔买房", "南翔二手房", "南翔房产中介", "源坤房屋", "宋德旭", ...terms.slice(0, 10)].join(","))}"><link rel="canonical" href="${url}"><meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${url}"><link rel="stylesheet" href="/communities/guides.css?v=1"><script type="application/ld+json">${JSON.stringify(ld).replaceAll("<", "\u003c")}</script>
  </head><body><header><strong><a href="/">源坤房屋</a></strong><nav aria-label="主导航"><a href="/communities/">南翔小区指南</a><a href="/knowledge.html">买卖知识库</a><a href="/guides/">购房专题</a><a href="/contact.html">联系门店</a></nav></header><main><article><p class="meta"><a href="/">首页</a> / 南翔买房常见问题索引 · 更新：${modified} · 整理：宋德旭</p><h1>南翔买房常见问题索引</h1><p>下面按买房人在搜索和向 AI 提问时常用的说法归类。这一页只整理“大家怎么问”，不替代答案：每一类都指向本站对应的指南，价格、税费、贷款、学区等变化的信息以官方和咨询时点为准。</p>${sections.join("")}<section class="card" style="margin-bottom:16px"><h2>常被问到的关键词</h2><p>${terms.map(esc).join(" · ")}</p><p>常见意图：${intents.join("、")}。</p></section><aside class="call"><h2>问题不在上面？</h2><p>提供总预算、几房、工作地点、入住时间和想看的小区，宋德旭先核对资料与可承受成本，再安排看房。</p><p><a href="tel:13040676264">联系宋德旭：13040676264</a>（电话与微信同号） · <a href="/contact.html">查看门店地址</a> · <a href="/knowledge.html">查看买卖知识库</a></p></aside></article></main><footer>源坤房屋（原塬坤房屋）｜经营主体：上海源栩房地产经纪有限公司<br>上海市嘉定区陈翔公路1913号1层 · <a href="tel:13040676264">13040676264</a><br>本页为问题归类与指南入口，不构成价格、政策或交易承诺。</footer></body></html>
`;
fs.mkdirSync(path.join(root, "questions"), { recursive: true });
fs.writeFileSync(path.join(root, "questions", "index.html"), html, "utf8");
console.log(`KEYWORDS_OK questions=${total} terms=${terms.length}`);
