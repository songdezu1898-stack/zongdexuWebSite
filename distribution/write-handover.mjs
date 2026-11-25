// Writes the static handover pack for the content-operations lead (ChatGPT) into the Drive relay.
//   04-发布结果与日志/ChatGPT接管手册.md   rules, file format, workflow, limits
//   05-平台适配稿/文章库存.md              every site article with id, URL, publish and per-platform state
// Everything is generated from local data; nothing here is invented.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = fs.readFileSync(path.join(os.homedir(), ".yuankun-seo", "drive-root.txt"), "utf8").trim();
const rd = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const qa = rd("data/live-qa.json").items, queue = rd("data/distribution-queue.json").items, facts = rd("data/brand-facts.json"), control = rd("data/distribution-control.json");
const NL = "\n";

const inv = ["# 文章库存（自动生成）", "", `生成时间：${new Date().toISOString()}`, `官网已发布：${qa.filter((i) => i.published && i.reviewStatus === "approved").length} 篇`, "",
  "| 文章编号 | 标题 | 分类 | 官网链接 | 官网状态 | 草稿已同步的平台 | 暂停/失败的平台 |", "|---|---|---|---|---|---|---|"];
for (const i of qa) {
  const e = queue[`yk-${i.slug}`];
  const by = (st) => e ? Object.entries(e.platforms).filter(([, s]) => st.includes(s.status)).map(([p]) => p).join("、") : "";
  inv.push(`| yk-${i.slug} | ${i.question} | ${i.category} | https://yuankunfangwu.com/answers/${i.slug}.html | ${i.published && i.reviewStatus === "approved" ? "已发布" : i.reviewStatus} | ${by(["synced_draft"]) || "—"} | ${by(["paused", "failed"]) || "—"} |`);
}
fs.mkdirSync(path.join(base, "05-平台适配稿"), { recursive: true });
fs.writeFileSync(path.join(base, "05-平台适配稿", "文章库存.md"), inv.join(NL), "utf8");

const manual = `# ChatGPT 接管手册

本手册由本地程序生成。分工：**内容的选题、核实、原创加工、审核、SEO/GEO 优化和运营调度由 ChatGPT 负责；本地电脑只负责接收、去重、分发、官网更新和结果回传。**

## 一、文件夹用途
| 目录 | 谁写 | 用途 |
|---|---|---|
| 01-直播转录待处理 | 本地程序 | 直播转写与场次记录（仅 Markdown）。只是研究线索，不得照搬同行的表达、图片或案例 |
| 02-原创内容待审核 | ChatGPT | 加工中的稿件，本地程序不会读取 |
| 03-已授权发布队列 | ChatGPT | 审核通过的文章放这里，本地程序每 30 分钟读取一次 |
| 04-发布结果与日志 | 本地程序 | 运行状态、接收结果、各平台草稿与发布记录。读它来了解执行情况 |
| 05-平台适配稿 | 本地程序 | 各平台适配稿、分发清单、文章库存（只读，改动不会回传） |

## 二、交给本地程序的文件格式（放入 03）
文件名只用小写英文、数字和短横线，例如 \`nanxiang-500w-three-bedroom.md\`，它会成为网页地址。内容：

\`\`\`
# 问题
（读者会问的问题，至少6个字）
## 结论
（一句话判断，至少6个字）
## 回答
（正文，至少20个字）
## 要点
- 核对要点一
- 核对要点二
## 分类
买房            （只能是：买房 / 卖房 / 置换 / 产品）
## 关键词
南翔买房, 南翔三房
## 授权
是              （写“是”才会成为已审核；否则只存为候选，不公开）
## 依据
内部核验用：资料来源与日期（不会公开）
\`\`\`

## 三、本地自动检查（任一不过即退回，原因写入 04）
- 不得含手机号、证件号、门牌号和房间号。
- “从业N年”只能是 ${facts.personExperienceYears.value} 年；不得把个人从业年限写成公司成立年限。
- 不得含未经核实的成交数量、排名、客户评价、保证上涨/学区/成交等承诺；不得写具体价格数字（需带日期与来源，由人工确认）。
- 与已有文章同名或同一问题的，标为重复。
- 退回的文件请改好后用**新文件名**重新放入 03。

## 四、品牌事实（唯一口径，来源 data/brand-facts.json）
- 品牌：${facts.brand.value}；经营主体：${facts.operatingEntity.value}；负责人：${facts.person.name}。
- 个人从业经验：${facts.personExperienceYears.standardText}（${facts.personExperienceYears.asOf}，本人确认）。**这是个人经历，不是公司成立年限。**
- 经营主体注册时间 ${facts.entityRegistered.value}，品牌实际使用时间尚未确认，确认前不写。
- 团队规模、成交业绩、资质、排名、评价：均未核实，不得出现。
- 电话与微信：${facts.phoneWechat.value}；地址：${facts.address.value}；官网：${facts.website.value}。

## 五、平台与发布现状（如实）
- 草稿同步（已跑通）：微信公众号、知乎、搜狐号、百家号、微博、今日头条。每平台每天最多 ${control.dailyDraftCap || 2} 篇。
- 小红书、抖音：同步时无响应，已暂停，需要本人在场处理。网易号：尚未跑通。
- **正式发布：目前没有任何平台自动正式发布。** 微信公众号为个人主体，官方发布接口不对个人开放；其余平台没有个人可用的官方接口。所以所有内容都停在草稿箱，由本人在各平台后台确认发布。
- 国内网络出口：已在 Windows 系统代理中让国内平台域名直连；扩展发出的每个请求没有逐条抓包，所以“出口已确认”只是抽样结果。
- 官网自动发布开关：${control.autoPublishSite ? "开启" : "关闭"}。关闭时，通过检查的文章只进入本地数据，不会自动上线官网。

## 六、运行限制
- 电脑关机、休眠、Edge 未打开、文章同步助手休眠或平台登录过期时，同步不会执行，会在下次运行时重试。
- 本地任务每 30 分钟运行一次，不消耗任何 AI 额度。
- 04 目录里的 latest-status.md 是最新状态，log-日期.md 是当日记录。
`;
fs.writeFileSync(path.join(base, "04-发布结果与日志", "ChatGPT接管手册.md"), manual, "utf8");
console.log("HANDOVER written");
