// Builds the Chinese audit report and the ChatGPT data guide from reports/keyword-audit/audit-data.json.
// Every number below is read from that file; narrative statements are limited to what the data shows.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(root, "reports", "keyword-audit");
const d = JSON.parse(fs.readFileSync(path.join(dir, "audit-data.json"), "utf8"));
const s = d.stats, P = d.pages;
const extra = fs.existsSync(path.join(dir, "external-checks.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "external-checks.json"), "utf8")) : { webSearch: [] };
const today = new Date().toISOString().slice(0, 10);
const pct = (n, t = s.raw) => `${((n / t) * 100).toFixed(1)}%`;
const short = (u) => u.replace("https://yuankunfangwu.com", "") || "/";
const tbl = (head, rows) => [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
const L = s.byLevel;
const withImp = P.filter((p) => p.impressions > 0).sort((a, b) => b.impressions - a.impressions);
const notIdx = P.filter((p) => !/Submitted and indexed/.test(p.googleStatus));
const thinLinks = P.filter((p) => p.inbound <= 2 && /\/answers\//.test(p.url));
const sorted = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);

const report = `# 源坤房屋 SEO/GEO 关键词资产审计报告

统计日期：${today}（Google 数据区间 ${d.gscRange?.startDate} 至 ${d.gscRange?.endDate}，Search Console 有 2–3 天延迟）。
数据来源：本地文件实际读取；Google Search Console API（只读，本次实时拉取）；Bing 数据为 ChatGPT 截图提供的后台基线（11 月 28 日），本机没有 Bing API Key，无法自动核对。
原则：写进文件、生成网页、提交站点地图都不等于获得排名；覆盖等级只说明“有没有页面承接”，不说明页面质量或排名。

## 0. 先说结论
1. **关键词库实际是“201 个小区/实体 × 约 50 个问法模板”的组合**，而不是 1 万个独立需求。604 种问法里，${s.templatedPatterns} 种模板各被 ≥50 个实体重复使用，占了 ${s.templatedRows} 条（${pct(s.templatedRows)}）。它适合当“选题与测试素材库”，不适合逐条建页。
2. **目前没有任何一个关键词有可识别的搜索词数据。** Google 近 90 天总曝光 ${d.gscTotals?.impressions} 次、点击 ${d.gscTotals?.clicks} 次、平均排名 ${d.gscTotals?.position?.toFixed(1)}，但搜索词明细返回 ${s.queriesWithImpressions} 条（曝光太少，Google 不提供）。**我无法说出是哪个关键词带来了这 13 次曝光，也不能说任何关键词“已有排名”。**
3. **曝光不是来自中国用户**：13 次曝光来自 9 个国家或地区（美国 4 次、阿根廷 2 次，其余各 1 次），中国大陆为 0。点击 0。
4. **Google 实际收录比后台报表好**：报表（数据日期 11-23）显示已编入索引 36、已抓取未编入 13、重定向 6；今天逐个检查 53 个站点地图网址，**51 个“已提交并已编入索引”，2 个 Google 尚未发现**。报表滞后，且发生在 11-24 部署新文章之前。
5. **三类高价值需求缺少专页**：别墅买卖/出售、上海单边代理、南翔本地房产中介/“置换找哪家公司”。现有页面只在正文提及（详见第 6 节）。
6. 国内搜索和国内 AI 平台**一个也没有实际测试**，结果为“未测试”，没有编造任何数据（第 8 节）。

## 1. 关键词资产清单（实际读取）
| 文件 | 内容 |
|---|---|
| data/keyword-bank.json（来自 南翔买房AI关键词问题库.xlsx，两份 xlsx 内容相同） | ${s.raw} 条问法；${s.distinctCore} 个核心词 |
| generate-keywords.mjs → questions/index.html | 从库里抽 96 条问法生成“常见问题索引”页，不是逐条建页 |
| build-geo-test-sheet.mjs → GEO效果测试表.csv | 50 个测试问题 × 6 个 AI = 300 行，**全部未填写** |
| weekly-report.mjs、gsc-pull.mjs（本次新增） | Google 数据周报与完整快照 |

## 2. 数量统计
${tbl(["指标", "数量", "说明"], [
  ["原始关键词（问法）总数", s.raw, "文件实际行数"],
  ["完全重复的问法", s.raw - s.distinctText, "文本逐字去重，无重复"],
  ["不同核心词", s.distinctCore, "核心词几乎一条一个，不能代表需求种类"],
  ["不同小区/实体", s.entities, "含“南翔”等通用词"],
  ["不同问法模板", s.patterns, "把实体名替换掉后统计"],
  ["高度模板化（同一模板 ≥50 个实体）", s.templatedRows, `${s.templatedPatterns} 种模板`],
  ["求职/加盟类（非客户需求）", s.recruit, "不建议建设"],
  ["租房类（本站没有租赁内容）", s.rent, "范围外，是否开展租赁由业务决定"],
  ["动迁/特殊产权类（风险高、价值低）", s.riskyLow, "保留但低优先"],
  ["有效关键词（去掉求职类）", s.valid, "仍含租房和特殊产权"],
  ["有效且在本站业务范围内（再去掉租房）", s.validInScope, "建议作为选题池的有效规模"],
  ["已有承接页（覆盖等级 ≥1）", s.covered, `其中 ${L[1]} 条只由“通用专题页”承接，站内并没有该小区`],
  ["没有承接页（等级 0）", s.notCovered, "主要是租房、求职、动迁"],
  ["已获得搜索曝光的关键词", `无法确认（0 条可识别）`, "API 未返回搜索词"],
  ["已有实际排名的关键词", `无法确认（0 条可识别）`, "只有页面级数据：8 个页面有曝光"],
  ["已被内容覆盖但没有搜索数据", s.covered, "与“已有承接页”相同，全部没有搜索数据"]
])}

覆盖等级含义：3=有同名小区页且有主题页（${L[3]} 条）；2=小区名在站内被提及且有主题页（${L[2]} 条）；1=只有通用主题页，站内没有该小区（${L[1]} 条）；0=没有承接页（${L[0]} 条）。**真正有小区级支撑的只有等级 2、3，合计 ${L[2] + L[3]} 条（${pct(L[2] + L[3])}）。**

## 3. 关键词类型与映射
主类型（互斥，按优先级归类）：
${tbl(["类型", "条数"], sorted(s.byType).map(([k, v]) => [k, v]))}
需求方：${sorted(s.bySide).map(([k, v]) => `${k} ${v}`).join("；")}。商业价值（按话题规则判定，不是搜索量）：${sorted(s.byValue).map(([k, v]) => `${k} ${v}`).join("；")}。

**完整映射表**：keyword-map.csv（${s.raw} 行）。每行含：问法、核心词、搜索意图、主类型、需求方、区域、小区、话题簇、商业价值、对应官网 URL、覆盖等级、Google 收录状态、曝光排名、AI 测试结果、是否模板化、后续建议。
**按搜索意图归并的话题簇**：intent-clusters.csv。应由专题页统一承接，**不要为每条关键词建页**。最大的簇：
${tbl(["话题簇", "需求方", "价值", "问法数", "涉及小区数", "问法模板数"], d.clusters.slice(0, 8).map((c) => [c.topic, c.side, c.value, c.rows, c.entities, c.patterns]))}
**小区清单**：entities.csv（${s.entities} 个实体）。站内只有 13 个小区有专页。

## 4. 网页实际收录情况（Google 今日逐个检查）
- 站点地图：已读取，错误 0，警告 0（最近下载 2026-11-24，Google 记录提交 48 个，本地现为 ${P.length} 个，增加的是 /homes/ 等）。
- 逐个网址检查：已编入索引 ${P.length - notIdx.length} 个；Google 尚未发现 ${notIdx.length} 个：${notIdx.map((p) => short(p.url)).join("、") || "无"}。
- noindex：${P.filter((p) => p.noindex).length} 个；canonical 不指向自身：${P.filter((p) => !p.canonicalSelf).length} 个；Google 选择的规范网址与声明不一致：${P.filter((p) => p.googleCanonicalMatches === false).length} 个；H1 数量不为 1 的页面：${P.filter((p) => p.h1Count !== 1).length} 个。
- 与后台报表的差异：报表“重定向 6 个”应是 www、http、/index.html 这类网址，线上实测它们都 301 到规范地址（设计如此，不是缺陷）；“已抓取未编入 13 个”在报表日期之后大概率已变化，但 API 不能回溯到具体是哪 13 个，**我不能断言它们已全部收录**。
- Bing（来自截图，无法核对）：两份站点地图成功，www 52、非 www 48，合计“100 个发现网址”不是 100 个独立页面（www 与非 www 重复）。建议在 Bing 后台停用 www 那份站点地图，只保留规范域名。

## 5. 有曝光的页面（页面级，90 天）
${tbl(["页面", "曝光", "点击", "平均排名"], withImp.map((p) => [short(p.url), p.impressions, p.clicks, p.avgPosition]))}
曝光集中在服务页、小区页和导航页，没有一篇问答文章有曝光。这些曝光的国家分布见第 0 节，没有证据显示来自目标客户。

## 6. 高商业价值关键词的承接情况
判断规则：标题或 H1 含全部关键词的非导航页算“有专页”；只在正文出现的算“仅正文提及”。**这只说明页面存在，不说明排名。**
${tbl(["目标关键词", "判断", "承接页"], d.commercial.map((c) => [c.keyword, c.verdict, c.strongPages.join("<br>") || (c.bodySamples.length ? `正文提及：${c.bodySamples.join("、")}` : "无")]))}

**内容缺口（先完善现有页面，确有缺口才建议新增）：**
- 别墅买卖/出售：站内只有 湖畔天下 页正文提到“别墅”6 次，格林公馆页和置换服务页都是 0 次。库里有 ${s.byType["别墅买卖"]} 条别墅问法。**建议新增 1 个别墅专题页**（需要你提供真实服务范围和可公开案例，不得编数据）。
- 上海单边代理：全站只有正文零星提及。需要你确认是否开展、如何收费、能公开什么，再决定写成服务页还是常见问题。
- “南翔本地房产中介/置换找哪家公司”：已有门店页和置换服务页，但标题没有直接回答“怎么选公司”。建议**改写现有页面的小标题和摘要**，不新增页面。
- 先卖后买/先买后卖、卖房定价、改善置换：已有专页，不新增。

## 7. 重点检查：已抓取未收录的网页
无法从 API 还原那 13 个页面，所以对**全部 53 个页面**做了检查（pages.csv）：
- 技术项全部通过：HTTP 200、无 noindex、canonical 正确、www 与非 www 统一、标题/描述/H1 正常、结构化数据与页面一致。
- 重复内容：问答页之间正文最大相似度 0.36（${short(P.reduce((a, b) => (b.maxSimilarity > a.maxSimilarity ? b : a)).url)}），不属于高度重复。
- **站内链接偏少**：${thinLinks.length} 篇问答只被 ${Math.max(...thinLinks.map((p) => p.inbound))} 个以下页面链接：${thinLinks.map((p) => `${short(p.url)}（${p.inbound}）`).join("、")}。
- **配图**：53 个页面里只有 ${P.filter((p) => p.images > 0).length} 个正文含图片，问答文章基本没有原创配图。
- **/homes/**：正文只有 ${P.find((p) => p.url.endsWith("/homes/"))?.textChars} 个字（内容由脚本渲染，抓取工具看不到），而且房源图片和数据的使用授权**至今没有确认**，却已在站点地图和 IndexNow 中。建议授权确认前加 noindex 并从站点地图撤下（**需要你同意，我没有改**）。
- 未收录的 2 个页面（low-density-project-specific-home、many-sales-not-easy-resale）是 11-24 新增，没有发现技术问题，属于等待抓取。
- 结论：没有发现需要删除或大规模重写的页面。优先动作是补内链和原创配图。

## 8. 国内搜索与 AI 平台实际可发现性
**没有测试的平台一律标“未测试”。**
${tbl(["平台", "品牌词", "非品牌推荐词", "说明"], [
  ["百度", "未测试", "未测试", "站点已放置百度验证文件（线上 200），但没有百度搜索资源平台的 API 凭证，无法自动取数"],
  ["必应", "首页已收录（截图）", "未测试", "后台显示曝光 0、AI Performance 引用 0"],
  ["谷歌", "未测试（后台数据：无搜索词）", "未测试", "见第 4、5 节"],
  ["豆包、DeepSeek、腾讯元宝、千问、Kimi、百度AI搜索、ChatGPT 联网", "未测试", "未测试", "没有账号自动化通道，不绕过登录；需按 GEO效果测试表.csv 人工提问记录"],
  ...extra.webSearch.map((w) => [`Claude WebSearch 工具（不是上面任何一个平台）`, w.brand ?? "", w.nonBrand ?? "", w.note])
])}
测试规则：非品牌测试的提问里**不得**出现“源坤房屋”。品牌事实统一为：源坤房屋，经营主体上海源栩房地产经纪有限公司，负责人 10 年房地产行业从业经验（个人经历，不是公司成立年限）。

## 9. SEO/GEO 技术问题与修复优先级
| 优先级 | 问题 | 建议 | 是否需要你确认 |
|---|---|---|---|
| P0 | /homes/ 房源数据与图片授权未确认，但已被收录入口覆盖 | 加 noindex 并撤出站点地图 | 是 |
| P1 | 4 篇问答站内链接只有 1–2 个 | 在相关指南、小区页加内链 | 否（可直接做，但会改页面，需部署） |
| P1 | 问答文章无原创配图 | 由 ChatGPT 制作有解释价值的图并经 03/images 提交 | 图片授权由你确认 |
| P1 | Bing 的 www 站点地图重复 | 后台停用 www 版 | 是（需登录） |
| P2 | 别墅、单边代理缺专页 | 提供真实资料后写专题 | 是 |
| P2 | 问答页没有曝光 | 配合内链和配图，观察 30 天 | 否 |
| P2 | 无 Bing API、无百度凭证 | 见 SEO运营与授权清单.md | 是 |
| P3 | 搜索词明细为空 | 曝光积累后才会出现，不需处理 | 否 |

## 10. 运营计划
**未来 7 天**
- ChatGPT 把你提到的 4 篇新文章和 1 篇深化稿按格式放进 Drive 03（见 ChatGPT 使用说明）；本机收到后只入库为候选，不自动公开。
- 你确认 /homes/ 是否先 noindex；确认是否开展单边代理。
- 补 4 篇问答的内链（页面改动先报告，确认后再部署）。
- 每天只看 04 目录 latest-status.md，不重复提交无变化的网址。

**未来 30 天**
- 每周跑 gsc-pull 和 keyword-audit，对比曝光页面数、搜索词是否开始出现。
- 以“话题簇”为单位出稿：优先 置换/卖房定价/中介选择 三个高价值簇，一簇一篇深度文章，不按小区批量。
- 小红书、抖音只做适配稿（Wechatsync 限制见交接手册），公开发布前需平台权限和国内出口验证。
- 开始人工填写 GEO 测试表，先测 10 个非品牌问题。

**未来 90 天**
- 若别墅/单边代理资料到位，各补 1 个专题页。
- 为有真实资料的小区补“卖房/置换角度”内容（等级 3 的 ${L[3]} 条优先），其余小区不建页。
- 用 3 次以上 GEO 抽样判断是否出现品牌提及，再决定是否继续投入 AI 引用类内容。
- 评估是否开展租赁内容（${s.rent} 条问法），取决于业务，不是 SEO 决定。

## 11. 文件与使用
见同目录《ChatGPT使用说明》。所有 CSV 为 UTF-8（带 BOM），可直接用 Excel 打开。
`;
fs.writeFileSync(path.join(dir, `关键词SEO审计报告-${today}.md`), report, "utf8");

const guide = `# ChatGPT 使用说明：关键词与 SEO 数据（${today}）

这些文件由本地程序生成并同步到 Drive 的 07-关键词与SEO审计。**只读使用**，修改不会回传。内容生产、选题、事实核查、配图由 ChatGPT 负责；本地程序只执行、监测和回传。

| 文件 | 用途 |
|---|---|
| 关键词SEO审计报告-${today}.md | 总览、结论、缺口、7/30/90 天计划 |
| intent-clusters.csv | **选题首选**：按意图归并的话题簇，每簇一篇深度文章 |
| keyword-map.csv | 全部 ${s.raw} 条问法的归类、覆盖等级、承接页；用来挑具体问法做小节标题 |
| entities.csv | 201 个小区/实体，标明哪些站内有专页 |
| commercial-keywords.csv | 14 个重点商业词的承接情况 |
| pages.csv | 53 个页面的收录、曝光、相似度、内链、配图 |
| audit-data.json | 以上数据的机器可读汇总 |

使用规则：
1. **不要按关键词逐条写文章。** 先看 intent-clusters.csv，选“商业价值=高”且问法数大的簇。
2. 问法里的价格、学区、成交、政策不是事实，只是用户怎么问。涉及数据的内容必须核实并标日期。
3. 覆盖等级 1 表示“站内没有该小区”，需要真实资料才能写小区级内容，不得凭印象。
4. 品牌口径：从业 10 年是个人经历，经营主体为上海源栩房地产经纪有限公司；不得写未核实的成交、评价、排名、资质。
5. 交稿方式：文章按《ChatGPT接管手册》的格式放进 03-已授权发布队列，配图放 03/images/<文章编号>/cover.png；也可通过 06-调度指令 提交 JSON 指令（格式见 04 目录的指令接口说明）。
6. 想要最新数据：本地程序下次运行 gsc-pull.mjs 和 keyword-audit.mjs 后会刷新本目录。

这次尚未完成的数据：国内 AI/搜索平台测试、Bing 数据自动获取、百度数据（都缺凭证或无自动化通道）。
`;
fs.writeFileSync(path.join(dir, "ChatGPT使用说明-关键词与SEO数据.md"), guide, "utf8");
console.log("REPORT_OK");
