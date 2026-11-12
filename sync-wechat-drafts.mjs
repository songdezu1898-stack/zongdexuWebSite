import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const draftsDir = path.join(root, "wechat-drafts");
const manifestPath = path.join(draftsDir, "manifest.json");
const statePath = path.join(root, "data", "wechat-sync-state.json");
const args = new Set(process.argv.slice(2));
const slugArg = process.argv.slice(2).find((arg) => arg.startsWith("--slug="));
const requestedSlug = slugArg?.slice("--slug=".length);
const shouldPush = args.has("--push");
const pushAll = args.has("--all");

if (!fs.existsSync(manifestPath)) {
  throw new Error("请先运行 generate-wechat.mjs 生成公众号草稿包。");
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const state = fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath, "utf8"))
  : { version: 1, drafts: {} };

let selected = manifest.items;
if (requestedSlug) selected = selected.filter((item) => item.slug === requestedSlug);
if (!pushAll && !requestedSlug) selected = selected.slice(0, 1);

if (!selected.length) throw new Error("没有找到需要同步的草稿。");

const plan = selected.map((item) => ({
  slug: item.slug,
  title: item.title,
  source: item.contentSourceUrl,
  alreadySynced: Boolean(state.drafts[item.slug])
}));

if (!shouldPush) {
  console.log(JSON.stringify({ mode: "dry-run", note: "未连接公众号，不会上传或发布。", plan }, null, 2));
  process.exit(0);
}

const appId = process.env.WECHAT_APP_ID;
const appSecret = process.env.WECHAT_APP_SECRET;
const thumbMediaId = process.env.WECHAT_THUMB_MEDIA_ID;
if (!appId || !appSecret || !thumbMediaId) {
  throw new Error("缺少 WECHAT_APP_ID、WECHAT_APP_SECRET 或 WECHAT_THUMB_MEDIA_ID。请只保存在服务器环境变量中，不要写入项目文件或聊天记录。");
}

async function wechatJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok || body.errcode) {
    throw new Error(`微信接口调用失败：${body.errcode ?? response.status} ${body.errmsg ?? response.statusText}`);
  }
  return body;
}

const tokenResult = await wechatJson("https://api.weixin.qq.com/cgi-bin/stable_token", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ grant_type: "client_credential", appid: appId, secret: appSecret, force_refresh: false })
});

for (const item of selected) {
  const content = fs.readFileSync(path.join(draftsDir, item.htmlFile), "utf8");
  const sourceHash = crypto.createHash("sha256").update(content).digest("hex");
  if (state.drafts[item.slug]?.sourceHash === sourceHash) {
    console.log(`SKIP unchanged=${item.slug}`);
    continue;
  }

  const result = await wechatJson(
    `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${encodeURIComponent(tokenResult.access_token)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        articles: [
          {
            article_type: "news",
            title: item.title,
            author: item.author,
            digest: item.digest,
            content,
            content_source_url: item.contentSourceUrl,
            thumb_media_id: thumbMediaId,
            show_cover_pic: 0
          }
        ]
      })
    }
  );

  state.drafts[item.slug] = {
    mediaId: result.media_id,
    sourceHash,
    syncedAt: new Date().toISOString(),
    status: "draft"
  };
  console.log(`WECHAT_DRAFT_CREATED slug=${item.slug}`);
}

fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
console.log("WECHAT_SYNC_OK status=draft-only");
