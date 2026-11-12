(function () {
  "use strict";

  const fallbackData = {
    updatedAt: "2026-09-01",
    sourceLabel: "客户买卖问题整理",
    items: [
      {
        id: "live-20260713-family-decision",
        slug: "family-budget-and-location-decision",
        date: "2026-07-13",
        sourceDate: "2026-07-13",
        datePublished: "2026-09-01",
        dateModified: "2026-09-01",
        category: "买房",
        region: "上海",
        question: "父母出钱给孩子买房，应该由谁来决定板块？",
        answer:
          "先让真正居住的人确认生活半径和通勤。父母更在意资产与未来，孩子更在意每天几点起床、怎么到公司。居住者没有认同之前，急着比较板块和价格，往往只会增加家庭分歧。",
        takeaway: "先解决出资者与居住者的需求冲突，再选板块。",
        reviewStatus: "approved",
        published: true
      },
      {
        id: "live-20260713-top-duplex-price",
        slug: "walk-up-top-duplex-pricing",
        date: "2026-07-13",
        sourceDate: "2026-07-13",
        datePublished: "2026-09-01",
        dateModified: "2026-09-01",
        category: "卖房",
        region: "上海",
        question: "无电梯五复六面积很大，为什么不能直接按面积定价？",
        answer:
          "这类房子的真正买家，通常是愿意用爬楼换空间的年轻家庭，而不是需要老人同住的三代家庭。定价应先看同小区标准三房的成交总价，再为复式空间、两卫和可改造性增加有限溢价。",
        takeaway: "特殊房源先找目标客群，再用总价带定价。",
        reviewStatus: "approved",
        published: true
      },
      {
        id: "live-20260713-average-price",
        slug: "new-home-average-price-and-four-bedroom",
        date: "2026-07-13",
        sourceDate: "2026-07-13",
        datePublished: "2026-09-01",
        dateModified: "2026-09-01",
        category: "产品",
        region: "上海",
        question: "新房整盘均价低，为什么想买的四房不一定便宜？",
        answer:
          "小户型可能拉低整盘均价，而稀缺四房可能位于更好的楼栋、面积段和总价带。比较时要把四房单独拿出来，看套数、楼栋、梯户比、得房、交付标准和最终总价。",
        takeaway: "不要被平均数带偏，要核算目标户型。",
        reviewStatus: "approved",
        published: true
      },
      {
        id: "live-20260713-replacement-order",
        slug: "sell-first-or-buy-first-for-home-upgrade",
        date: "2026-07-13",
        sourceDate: "2026-07-13",
        datePublished: "2026-09-01",
        dateModified: "2026-09-01",
        category: "置换",
        region: "嘉定·南翔",
        question: "改善置换到底应该先卖旧房，还是先买新房？",
        answer:
          "先看首付是否依赖旧房回款、旧房预计成交周期、目标房源稀缺程度，以及两套房并行时的现金流。如果回款决定首付，优先把旧房出售方案做扎实；资金充足时，再评估先锁定目标房的必要性。",
        takeaway: "先排现金流和时间节点，不用一句话套所有家庭。",
        reviewStatus: "approved",
        published: true
      }
    ]
  };

  const mode = document.body.dataset.qaMode || "preview";
  const pageSize = mode === "library" ? 6 : 4;
  const state = { category: "全部", query: "", page: 1, data: fallbackData };

  const list = document.getElementById("qa-list");
  const status = document.getElementById("qa-update-status");
  const search = document.getElementById("qa-search-input");
  const filterButtons = Array.from(document.querySelectorAll("[data-category]"));
  const shortcutLinks = Array.from(document.querySelectorAll("[data-shortcut-category]"));
  const prevButton = document.getElementById("qa-prev");
  const nextButton = document.getElementById("qa-next");
  const pageStatus = document.getElementById("qa-page-status");

  if (!list || !status || !search) return;

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getFilteredItems() {
    const query = normalize(state.query);
    return (state.data.items || [])
      .filter((item) => item.published === true && item.reviewStatus === "approved")
      .filter((item) => state.category === "全部" || item.category === state.category)
      .filter((item) => {
        if (!query) return true;
        return normalize(
          [item.question, item.answer, item.takeaway, item.category, item.region].join(" ")
        ).includes(query);
      })
      .sort((a, b) => String(b.datePublished || b.date).localeCompare(String(a.datePublished || a.date)));
  }

  function createTextElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text;
    return element;
  }

  function createCard(item) {
    const article = document.createElement("article");
    article.className = "qa-card";

    const meta = document.createElement("div");
    meta.className = "qa-card-meta";
    meta.appendChild(createTextElement("span", "qa-category", item.category));
    meta.appendChild(createTextElement("span", "", item.region || "上海"));
    meta.appendChild(createTextElement("span", "", `发布 ${item.datePublished || item.date}`));

    article.appendChild(meta);
    article.appendChild(createTextElement("h3", "", item.question));
    article.appendChild(createTextElement("p", "qa-card-answer", item.answer));

    const takeaway = document.createElement("div");
    takeaway.className = "qa-card-takeaway";
    takeaway.appendChild(createTextElement("strong", "", "判断重点"));
    takeaway.appendChild(createTextElement("span", "", item.takeaway));
    article.appendChild(takeaway);

    if (item.slug) {
      const link = document.createElement("a");
      link.className = "qa-detail-link";
      link.href = `./answers/${encodeURIComponent(item.slug)}.html`;
      link.textContent = "查看完整分析 →";
      link.setAttribute("aria-label", `查看完整分析：${item.question}`);
      article.appendChild(link);
    }
    return article;
  }

  function updatePagination(totalItems) {
    if (!pageStatus || !prevButton || !nextButton) return;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    state.page = Math.min(state.page, totalPages);
    pageStatus.textContent = `第 ${state.page} / ${totalPages} 页 · 共 ${totalItems} 条`;
    prevButton.disabled = state.page <= 1;
    nextButton.disabled = state.page >= totalPages;
  }

  function render() {
    const filteredItems = getFilteredItems();
    const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
    state.page = Math.min(state.page, totalPages);
    const start = (state.page - 1) * pageSize;
    const visibleItems = filteredItems.slice(start, start + pageSize);
    list.replaceChildren();

    if (!visibleItems.length) {
      list.appendChild(
        createTextElement(
          "div",
          "qa-empty",
          "暂时没有匹配的问题。你可以换个关键词，或者把问题直接发给宋德旭。"
        )
      );
    } else {
      visibleItems.forEach((item) => list.appendChild(createCard(item)));
    }

    updatePagination(filteredItems.length);
  }

  function chooseCategory(category) {
    state.category = category || "全部";
    state.page = 1;
    filterButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.category === state.category);
    });
    render();
  }

  function updateStatus(usingFallback) {
    const count = (state.data.items || []).filter(
      (item) => item.published === true && item.reviewStatus === "approved"
    ).length;
    const suffix = usingFallback ? " · 本地预览" : "";
    status.textContent = `最近更新：${state.data.updatedAt || "待更新"} · 已收录 ${count} 个问题${suffix}`;
  }

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => chooseCategory(button.dataset.category));
  });

  shortcutLinks.forEach((link) => {
    link.addEventListener("click", () => chooseCategory(link.dataset.shortcutCategory));
  });

  search.addEventListener("input", () => {
    state.query = search.value;
    state.page = 1;
    render();
  });

  if (prevButton) {
    prevButton.addEventListener("click", () => {
      if (state.page <= 1) return;
      state.page -= 1;
      render();
      list.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", () => {
      const totalPages = Math.max(1, Math.ceil(getFilteredItems().length / pageSize));
      if (state.page >= totalPages) return;
      state.page += 1;
      render();
      list.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function load() {
    let usingFallback = true;
    try {
      const response = await fetch("./data/live-qa.json", { cache: "no-store" });
      if (!response.ok) throw new Error("knowledge data unavailable");
      const data = await response.json();
      if (!data || !Array.isArray(data.items)) throw new Error("invalid knowledge data");
      state.data = data;
      usingFallback = false;
    } catch (_error) {
      state.data = fallbackData;
    }

    updateStatus(usingFallback);
    render();
  }

  load();
})();
