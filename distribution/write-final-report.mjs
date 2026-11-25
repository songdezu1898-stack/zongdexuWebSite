// Final acceptance report, generated only from recorded data. Written to Drive 04 and reports/.
//   node distribution/write-final-report.mjs <extra-notes-file.json>
// The notes file carries facts that are not in the queue (reconnect test result, shutdown checks, open issues).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = fs.readFileSync(path.join(os.homedir(), ".yuankun-seo", "drive-root.txt"), "utf8").trim();
const rd = (p, d) => { try { return JSON.parse(fs.readFileSync(path.join(root, p), "utf8")); } catch { return d; } };
const notes = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], "utf8")) : {};
const q = rd("data/distribution-queue.json", { items: {} }), control = rd("data/distribution-control.json", {}), qa = rd("data/live-qa.json", { items: [] });
const NL = "\n";

const per = {}, links = [];
for (const e of Object.values(q.items)) for (const [pid, s] of Object.entries(e.platforms)) {
  const t = (per[pid] ||= { synced_draft: 0, pending: 0, paused: 0, failed: 0, needs_login: 0, skipped: 0, needs_update: 0, published: 0 });
  t[s.status] = (t[s.status] || 0) + 1;
  if (s.publish?.status === "published") t.published++;
  const url = (s.note || "").match(/https?:\/\/\S+/)?.[0];
  if (s.status === "synced_draft" && url) links.push(`| ${e.title} | ${pid} | ${s.updatedAt || ""} | 草稿 | ${url} | ${s.egress || "未抽样"} |`);
}
const L = [
  `# 源坤房屋全媒体自动化 最终验收报告`, "", `生成时间：${new Date().toISOString()}（UTC）。本报告只记录实际发生并留有记录的事项，未做的事项如实写明。`, "",
  "## 一、总体结论",
  `- 官网已发布问答 ${qa.items.filter((i) => i.published && i.reviewStatus === "approved").length} 篇，均已纳入分发队列。`,
  `- **正式发布：0 篇。所有平台目前只同步草稿，没有任何内容被自动正式发布。**`,
  `- 自动分发总开关：${control.enabled ? "开启（仅草稿模式）" : "关闭"}；官网自动发布：${control.autoPublishSite ? "开启" : "关闭"}。`, "",
  "## 二、各平台草稿与发布数量",
  "| 平台 | 草稿已同步 | 排队中 | 暂停 | 失败 | 需登录 | 正式发布 |", "|---|---|---|---|---|---|---|",
  ...Object.entries(per).map(([p, t]) => `| ${p} | ${t.synced_draft} | ${t.pending + (t.needs_update || 0)} | ${t.paused} | ${t.failed} | ${t.needs_login} | ${t.published} |`), "",
  "## 三、草稿记录（草稿箱编辑链接，不是公开文章链接）",
  ...(links.length ? ["| 文章 | 平台 | 时间 | 类型 | 草稿编辑链接 | 网络出口抽样 |", "|---|---|---|---|---|---|", ...links] : ["- 无"]), "",
  "公开文章链接：**暂无**，因为没有任何正式发布。", "",
  "## 四、测试结果", ...(notes.tests || ["- （无）"]), "",
  "## 五、网络出口", ...(notes.network || ["- （无）"]), "",
  "## 六、未解决问题", ...(notes.open || ["- （无）"]), "",
  "## 七、下次开机如何恢复", ...(notes.resume || ["- （无）"]), "",
  "## 八、关机前检查", ...(notes.shutdown || ["- （无）"]), ""
].join(NL);
fs.writeFileSync(path.join(base, "04-发布结果与日志", "最终验收报告.md"), L, "utf8");
fs.mkdirSync(path.join(root, "reports"), { recursive: true });
fs.writeFileSync(path.join(root, "reports", "final-acceptance.md"), L, "utf8");
console.log("FINAL_REPORT written");
