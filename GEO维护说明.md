# GEO 维护说明

GEO 的目标是帮助搜索及回答系统发现、理解和引用真实内容，不保证收录、排名或引用。只有执行部署后，本地变更才会对线上抓取生效。

## 网站结构

- 手写页面：首页、关于、联系、门店服务页、services/（买房、卖房、置换三个服务页）、communities/（13 个小区指南和目录页）、guides/（6 个专题指南和目录页）、sitemap.html（全站导航）、两篇独立文章。
- 数据驱动页面：data/live-qa.json 经 generate-geo.mjs 生成 answers/ 下的问答文章页和 knowledge.html 的文章列表。
- 脚本不再手工列出页面：generate-geo.mjs 和 validate-site.mjs 会扫描磁盘上的全部 .html 文件。新增页面放进任意目录即可被站点地图、llms.txt、校验覆盖。

## 已实现

- 统一公开页面为 https://yuankunfangwu.com。企业、顾问和网站三个实体只在 generate-geo.mjs 的 entityGraph 定义一次，生成时写入每个页面（id 为 geo-entity 的 JSON-LD），各页面的电话、地址、职务不会再出现不同写法。手写页面里只能用 `{"@id": ...}` 引用这三个实体，不要再写完整定义，否则校验不通过。
- 知识库页面生成全部问答的静态 HTML 和“最近更新、已收录数量”，不执行脚本的抓取也能拿到每篇文章的链接。交互搜索与分页继续工作；live-qa.js 不再保存手工复制的备用数据。
- 问答文章带 WebPage、面包屑、作者、正文、图片和实体关联；文章显示作者链接和真实的内容修改日期，不因重新生成而刷新发布日期。
- 缺少站点图标、社交分享图或 Open Graph / Twitter 标签的页面，生成时自动补齐；页面已有的标签不会被改动。
- sitemap.xml 由磁盘上的页面生成。lastmod 取“上一版站点地图的值、页面自身 dateModified、问答数据更新日期”中最新的一个，只会向后走，重新生成不会把日期刷新成今天。
- feed.xml 包含问答文章（带正文和核对要点）和 answers/ 下的手写文章；llms.txt 列出服务页、小区指南、专题指南和全部文章。
- 校验覆盖：域名一致性；每页 canonical 指向自己、有 title、description 和唯一的 h1；JSON-LD 可解析；实体定义在各页面一致、站内 @id 引用能解析；FAQ 标记与可见文字一致；站内链接和资源都能找到文件；站点地图与页面一一对应；llms.txt 和 feed.xml 没有死链；部署清单覆盖所有页面和页面加载的文件。

## 改动网站信息时

- 电话、邮箱、地址、服务区域、公司或顾问介绍有变化：改 generate-geo.mjs 的 entityGraph，同时改页面上的可见文字，再重新生成。
- 修改页面的常见问题：可见文字和同页 FAQ 标记要一起改，否则校验不通过。
- 修改 styles.css、live-qa.js 或其他样式文件后，把引用它的页面里的 ?v= 版本号加一（生成脚本的文章模板也要同步），否则服务器 7 天缓存会让访客继续拿到旧文件。
- 新增页面或新增被页面引用的 css、js、图片：确认它在 deploy/publish.ps1 的 $publicFiles 清单里。校验脚本会报出“not in the deploy package”。
- 不要在服务器上直接改生成出来的页面（answers/ 下由数据生成的文章、sitemap.xml、feed.xml、llms.txt）。下次部署会覆盖，改动应该写进 generate-geo.mjs 的模板。

## 内容维护

在 data/live-qa.json 维护内容，仅 approved 且 published=true 的条目进入生成页面。每个问题围绕一种具体决策，先给结论，再解释条件和核对步骤。

涉及价格、税费、贷款、学区、规划等可变事实时，先核对原始官方材料，并在正文写明适用时间及条件。当前文章是决策方法与经验判断，不应包装为政策事实或市场统计。不得虚构来源、评价、成交数据或资质。

更新后运行：

```powershell
node generate-geo.mjs
node generate-wechat.mjs
node validate-site.mjs
```

deploy/publish.ps1 已包含上述步骤。

## 部署前后检查

部署前：线上站点可能有本仓库之外的改动（别人或别的电脑上改过）。先对比线上和本地，确认本地不是旧版本，避免覆盖线上较新的页面。

部署后：

1. 检查首页、各类页面、robots.txt、sitemap.xml 是否返回 200，确认 CDN 或服务器没有拦截搜索爬虫。
2. 抽查线上文件与本地是否一致，确认没有停留在旧版本。
3. 确认重定向仍然生效（2026-11-13 已在服务器配置）：`https://www.yuankunfangwu.com/...`、`http://...`、`/index.html`、`/xxx/index.html` 都应返回 301 到不带 www、不带 index.html 的规范地址，而正常页面返回 200。
4. 在 Google Search Console、Bing Webmaster Tools 提交站点地图，查看抓取与索引状态。
5. 记录品牌、服务地区及具体问题的展示、访问与咨询变化；AI 回答会变化，单次是否引用不代表稳定效果。

## 服务器与访问

- 服务器：阿里云 ECS（华东2 上海），网站目录 /var/www/yuankun，属主 deploy:deploy；`deploy` 账号没有 sudo，改 /etc/nginx 要用阿里云 Workbench（root）。
- nginx 主配置 /etc/nginx/nginx.conf，安全头和缓存规则在 /etc/nginx/default.d/yuankun.conf（对应仓库的 deploy/nginx-default.conf）。www 与 index.html 的 301 写在主配置里，生成它的脚本是 deploy/apply-nginx-redirect.py（已执行，原配置备份为 /etc/nginx/nginx.conf.before-redirect-20261113）。
- 从本机用 SSH 部署前，22 端口要在两处同时放行本机公网 IP，缺一处都会超时：
  1. 阿里云安全组入方向 22 端口那条规则的授权对象；
  2. 服务器 firewalld：`firewall-cmd --add-rich-rule='rule family="ipv4" source address="新IP/32" service name="ssh" accept'`，删除旧 IP 用 `--remove-rich-rule`，最后 `firewall-cmd --runtime-to-permanent`（不要用 --reload，会丢掉未保存的 Workbench 规则）。
- 本机公网 IP 要用 `curl --noproxy '*' https://icanhazip.com` 查；开着 Clash 等代理时，普通 curl 查到的是代理节点的 IP。家庭宽带 IP 会变，变了就要重新放行。
- 从 Windows 部署用系统自带的 PowerShell 5.1 运行 deploy/publish.ps1（脚本已带 BOM）。脚本现在固定使用 System32 里的 tar.exe，在 Git Bash 里启动也能打包；流程为 generate-keywords、generate-geo、generate-wechat、validate-site，再打包上传。
- 部署前先对比线上和本地。2026-11-13 发现过线上比仓库新，直接部署会覆盖新页面。线上快照备份在本机 C:/Users/ykfw/live-snapshot-20261113/。

## 官方参考

- Google AI features：https://developers.google.com/search/docs/appearance/ai-features
- Google canonical：https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls

Google 说明 AI 搜索功能沿用基础 SEO 要求，无需特殊的 AI 文件或专用结构化标记。llms.txt 可作为补充说明，但不能替代可索引页面、真实内容和清晰内链。

## IndexNow 自动推送

- 密钥文件 199864da2cfe47ad866ac58c5257bf4a.txt 在网站根目录（内容即密钥），已在部署清单中；线上必须返回 200，否则推送脚本会跳过。
- `indexnow.mjs` 在 deploy/publish.ps1 发布成功之后自动运行，向 https://api.indexnow.org/indexnow 批量提交新增、实质修改和已删除的页面。它永远以退出码 0 结束，推送失败不影响发布。
- 变化判断：对比 data/indexnow-state.json 里记录的页面内容指纹（忽略脚本、结构化数据、?v= 版本号和空白）。没有变化的页面不会重复提交；未审核或未公开的问答、noindex 页面不提交。
- 失败处理：429 和 5xx 最多重试 4 次（2、4、8 秒递增）；400、403、422 不重试。只有接口返回 200 或 202 的批次才会更新状态文件。
- 日志在 deploy/indexnow.log（不进 Git）。预览用 `node indexnow.mjs --dry-run`，强制全量重推用 `--force`。
- 每次部署后，data/indexnow-state.json 会变化，记得随下一次提交一起入库，否则换电脑部署会被当成首次推送。
- IndexNow 只通知 Bing 等参与的搜索引擎，Google 不参与，不要因此改用 Google Indexing API（它只适用于招聘和直播页面）。
