(function () {
  "use strict";

  // The page already contains generator-written cards, so when the data file
  // cannot be fetched (for example a file:// preview) that static HTML stays.

  const mode = document.body.dataset.qaMode || "preview";
  const pageSize = mode === "library" ? 6 : 4;
  const state = { category: "全部", query: "", page: 1, data: null };

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

    // Keep this markup in step with cardHtml() in generate-geo.mjs.
    const heading = document.createElement("h3");
    if (item.slug) {
      const titleLink = createTextElement("a", "", item.question);
      titleLink.href = `./answers/${encodeURIComponent(item.slug)}.html`;
      heading.appendChild(titleLink);
    } else {
      heading.textContent = item.question;
    }
    article.appendChild(meta);
    article.appendChild(heading);
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
    if (!state.data) return;
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

  function updateStatus() {
    const count = (state.data.items || []).filter(
      (item) => item.published === true && item.reviewStatus === "approved"
    ).length;
    status.textContent = `最近更新：${state.data.updatedAt || "待更新"} · 已收录 ${count} 个问题`;
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
      if (!state.data) return;
      const totalPages = Math.max(1, Math.ceil(getFilteredItems().length / pageSize));
      if (state.page >= totalPages) return;
      state.page += 1;
      render();
      list.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function load() {
    try {
      const response = await fetch("./data/live-qa.json", { cache: "no-store" });
      if (!response.ok) throw new Error("knowledge data unavailable");
      const data = await response.json();
      if (!data || !Array.isArray(data.items)) throw new Error("invalid knowledge data");
      state.data = data;
    } catch (_error) {
      return;
    }

    updateStatus();
    render();
  }

  load();
})();
