# 内容交换入口（ChatGPT / 研究资料 → 候选内容）

ChatGPT 和本项目不会自动共享数据。这里是人工放入的中转站：把 ChatGPT 整理好的内容按下面格式存成 .md 放进本目录，
运行 `node distribution/ingest-inbox.mjs`，会转成“候选”条目写入 data/live-qa.json（reviewStatus=candidate，published=false），
不会对外公开。你核验后把该条目改为 approved + published=true，再发布，才会进入官网和多平台队列。

文件名用小写英文和短横线，例如 `nanxiang-500w-three-bedroom.md`，它会成为网页地址。格式：

```
# 问题
南翔500万预算可以买哪些三房？
## 结论
一句话判断（至少6个字）
## 回答
正文（至少20个字，不写未核实的价格、成交、学区承诺）
## 要点
- 核对要点一
- 核对要点二
## 分类
买房            （只能是：买房 / 卖房 / 置换 / 产品）
## 关键词
南翔买房, 南翔三房
## 依据
内部核验用：资料来源、日期（不会公开）
```
已处理的文件会移到 done/。客户姓名、电话、门牌号、房东信息不要放进来。
