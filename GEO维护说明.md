# GEO 维护说明

本轮完成本地代码优化，未执行服务器部署。GEO 的目标是帮助搜索及回答系统发现、理解和引用真实内容，不保证收录、排名或引用。

## 已实现

- 统一公开页面为 https://yuankunfangwu.com。企业、顾问和网站三个实体只在 generate-geo.mjs 的 entityGraph 定义一次，生成时写入每个页面，各页面的电话、地址、职务不会再出现不同写法。
- 首页生成最新 4 条问答的静态 HTML，知识库页面生成全部问答的静态 HTML 和“最近更新、已收录数量”，不执行脚本的抓取也能拿到每篇文章的链接。交互搜索与分页继续工作。
- 静态卡片与脚本渲染后的卡片结构一致；live-qa.js 不再保存一份手工复制的备用数据。
- 生成与可见问答一致的 ItemList，文章补充 WebPage、面包屑、作者信息、正文、图片和实体关联。
- 首页和门店服务页的 FAQ 标记与页面可见的问答逐条一致。
- 联系页和门店服务页补齐页面类型、面包屑与社交分享信息。
- 文章显示作者链接和真实的内容修改日期；不因重新生成而刷新发布日期。
- feed.xml 带文章正文和核对要点，llms.txt 列出门店服务页、联系页和每篇文章的分类与地区。
- 校验覆盖静态文章链接、域名一致性、JSON-LD 解析、文章正文对应关系、实体定义在各页面是否一致、站内 @id 引用是否能解析、FAQ 标记是否与可见文字一致。

## 改动网站信息时

- 电话、邮箱、地址、服务区域、公司或顾问介绍有变化：改 generate-geo.mjs 的 entityGraph，同时改页面上的可见文字，再重新生成。
- 手写页面（首页、关于、联系、知识库、门店服务页）的可见内容、链接或结构化数据有实际变化：把 generate-geo.mjs 里 pageLastmod 对应的日期改为当天，sitemap 才会更新。只重新生成不要改日期。
- 修改首页或门店服务页的常见问题：可见文字和同页 FAQ 标记要一起改，否则校验不通过。
- 修改 styles.css 或 live-qa.js 后，把页面和 generate-geo.mjs 模板里的 ?v= 版本号加一，否则服务器 7 天缓存会让访客继续拿到旧文件。

## 内容维护

在 data/live-qa.json 维护内容，仅 approved 且 published=true 的条目进入生成页面。每个问题围绕一种具体决策，先给结论，再解释条件和核对步骤。

涉及价格、税费、贷款、学区、规划等可变事实时，先核对原始官方材料，并在正文写明适用时间及条件。当前文章是决策方法与经验判断，不应包装为政策事实或市场统计。不得虚构来源、评价、成交数据或资质。

更新后运行：

```powershell
node generate-geo.mjs
node generate-wechat.mjs
node validate-site.mjs
```

deploy/publish.ps1 已包含上述步骤。只有执行部署后，本地变更才会对线上抓取生效。

## 上线后验证

1. 检查主页、文章、robots.txt、sitemap.xml 是否返回 200，确认 CDN 或服务器没有拦截搜索爬虫。
2. 确保 www 域名与 /index.html 重复入口通过永久重定向归并到规范地址。当前项目没有完整服务器域名及 TLS 配置，不能仅凭本地文件确认重定向状态。
3. 在 Google Search Console、Bing Webmaster Tools 提交站点地图，查看抓取与索引状态。
4. 记录品牌、服务地区及具体问题的展示、访问与咨询变化；AI 回答会变化，单次是否引用不代表稳定效果。

## 官方参考

- Google AI features：https://developers.google.com/search/docs/appearance/ai-features
- Google canonical：https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls

Google 说明 AI 搜索功能沿用基础 SEO 要求，无需特殊的 AI 文件或专用结构化标记。llms.txt 可作为补充说明，但不能替代可索引页面、真实内容和清晰内链。
