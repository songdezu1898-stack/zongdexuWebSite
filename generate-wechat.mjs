import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const siteUrl = "https://yuankunfangwu.com";
const outputDir = path.join(root, "wechat-drafts");
const data = JSON.parse(fs.readFileSync(path.join(root, "data", "live-qa.json"), "utf8"));
const items = data.items
  .filter((item) => item.published === true && item.reviewStatus === "approved")
  .sort((a, b) => String(b.date).localeCompare(String(a.date)));

fs.mkdirSync(outputDir, { recursive: true });

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function articleUrl(item) {
  return `${siteUrl}/answers/${item.slug}.html`;
}

function draftHtml(item) {
  return `<section style="font-size:16px;line-height:1.85;color:#263238;letter-spacing:.02em;">
  <p style="margin:0 0 18px;color:#6b7b83;font-size:14px;">客户买卖决策知识 · ${escapeHtml(item.category)} · ${escapeHtml(item.region || "上海")}</p>
  <p style="margin:0 0 22px;font-size:18px;line-height:1.75;color:#183b45;"><strong>${escapeHtml(item.takeaway)}</strong></p>
  <h2 style="margin:28px 0 12px;font-size:19px;color:#1f5e69;">先说判断</h2>
  <p style="margin:0 0 18px;">${escapeHtml(item.answer)}</p>
  <h2 style="margin:28px 0 12px;font-size:19px;color:#1f5e69;">做决定前，还要核对什么</h2>
  <p style="margin:0 0 18px;">预算、通勤、家庭成员、当前住房、目标区域和交易时间，都会改变最终判断。涉及税费、贷款、学区、规划和交易政策，请以咨询时点的官方信息与房屋核验结果为准。</p>
  <blockquote style="margin:24px 0;padding:14px 16px;border-left:4px solid #6faab2;background:#f2f7f7;color:#37565d;">问题来自一线客户交流与公开案例观察，已做归纳、脱敏和重新表达，不对应任何具体咨询者。</blockquote>
  <p style="margin:28px 0 0;padding-top:18px;border-top:1px solid #dbe7e8;color:#66777d;font-size:14px;">宋德旭｜源坤房屋<br>上海嘉定、南翔房产顾问<br>运营主体：上海源栩房地产经纪有限公司</p>
</section>`;
}

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: "data/live-qa.json",
  mode: "draft-only",
  items: items.map((item) => {
    const filename = `${item.date}-${item.slug}.html`;
    fs.writeFileSync(path.join(outputDir, filename), draftHtml(item), "utf8");
    return {
      id: item.id,
      slug: item.slug,
      date: item.date,
      title: item.question,
      author: "宋德旭",
      digest: item.takeaway,
      contentSourceUrl: articleUrl(item),
      htmlFile: filename,
      reviewStatus: item.reviewStatus
    };
  })
};

fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`WECHAT_DRAFTS_OK drafts=${manifest.items.length}`);
