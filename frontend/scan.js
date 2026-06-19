const DEFAULT_API_BASE = "https://summermax-alpha-api.onrender.com";
const FETCH_TIMEOUT_MS = 25000;
const MAX_RETRIES = 2;

function getApiBase() {
  const saved = localStorage.getItem("summermax-alpha-api-base");
  return (saved || DEFAULT_API_BASE).trim().replace(/\/+$/, "");
}

function fmt(value, digits = 2) {
  const n = Number(value);
  return Number.isNaN(n) ? "--" : n.toFixed(digits);
}

function chgClass(value) {
  const n = Number(value);
  return Number.isNaN(n) ? "" : n >= 0 ? "up" : "down";
}

function chgText(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return "--";
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

function fmtAmount(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return "--";
  if (n >= 1e8) return (n / 1e8).toFixed(1) + "亿";
  if (n >= 1e4) return (n / 1e4).toFixed(0) + "万";
  return n.toFixed(0);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url, retries = MAX_RETRIES) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

const sectorListEl = document.getElementById("sectorList");
const sectorLoadingEl = document.getElementById("sectorLoading");
const stockPanelEl = document.getElementById("stockPanel");
const stockPanelTitleEl = document.getElementById("stockPanelTitle");
const stockTableEl = document.getElementById("stockTable");
const stockLoadingEl = document.getElementById("stockLoading");

let activeSectorRow = null;

async function loadSectors() {
  const apiBase = getApiBase();
  if (sectorLoadingEl) sectorLoadingEl.style.display = "block";
  if (sectorListEl) sectorListEl.innerHTML = "";

  try {
    const res = await fetchWithRetry(`${apiBase}/market/sectors`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Failed to load sectors");

    const sectors = data.sectors || [];
    if (sectorLoadingEl) sectorLoadingEl.style.display = "none";

    if (!sectors.length) {
      if (sectorListEl) sectorListEl.innerHTML = `<div class="empty-note">暂无板块数据</div>`;
      return;
    }

    sectorListEl.innerHTML = sectors.map((s, i) => {
      const cls = chgClass(s.change_percent);
      return `
        <button type="button" class="sector-row" data-sector="${encodeURIComponent(s.name)}" data-index="${i}">
          <span class="sr-rank">${i + 1}</span>
          <span class="sr-name">${s.name}</span>
          <span class="sr-chg ${cls}">${chgText(s.change_percent)}</span>
          <span class="sr-amount">${fmtAmount(s.amount)}</span>
          <span class="sr-counts">
            <span class="up">↑${s.rise_count}</span>
            <span class="down"> ↓${s.fall_count}</span>
          </span>
          <span class="sr-leader ${chgClass(s.leader_change)}">${s.leader || ""} ${s.leader_change != null ? chgText(s.leader_change) : ""}</span>
          <span class="sr-arrow">›</span>
        </button>
      `;
    }).join("");

    sectorListEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".sector-row");
      if (!btn) return;

      if (activeSectorRow) activeSectorRow.classList.remove("active");
      btn.classList.add("active");
      activeSectorRow = btn;

      const name = decodeURIComponent(btn.dataset.sector || "");
      loadSectorStocks(name);
    });
  } catch (err) {
    if (sectorLoadingEl) sectorLoadingEl.style.display = "none";
    const msg = err.name === "AbortError"
      ? "请求超时，后端正在唤醒中（免费服务首次启动约需 30–60 秒）。"
      : `加载失败（${err.message}），后端可能正在唤醒中。`;
    if (sectorListEl) sectorListEl.innerHTML = `
      <div class="empty-note">
        <p>${msg}</p>
        <button type="button" class="btn-retry" id="retrySectorsBtn">重新加载</button>
      </div>`;
    const retryBtn = document.getElementById("retrySectorsBtn");
    if (retryBtn) retryBtn.addEventListener("click", loadSectors);
  }
}

async function loadSectorStocks(sectorName) {
  const apiBase = getApiBase();
  if (stockPanelEl) { stockPanelEl.style.display = "flex"; }
  const placeholder = document.getElementById("stockPlaceholder");
  if (placeholder) placeholder.style.display = "none";
  if (stockPanelTitleEl) stockPanelTitleEl.textContent = sectorName;
  if (stockTableEl) stockTableEl.innerHTML = "";
  if (stockLoadingEl) stockLoadingEl.style.display = "block";

  try {
    const res = await fetchWithRetry(`${apiBase}/market/sector/stocks?name=${encodeURIComponent(sectorName)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Failed to load stocks");

    if (stockLoadingEl) stockLoadingEl.style.display = "none";
    const stocks = data.stocks || [];

    if (!stocks.length) {
      if (stockTableEl) stockTableEl.innerHTML = `<div class="empty-note">该板块暂无个股数据</div>`;
      return;
    }

    stockTableEl.innerHTML = `
      <div class="stock-col-head">
        <span>代码 / 名称</span>
        <span>现价</span>
        <span>涨跌幅</span>
        <span>成交额</span>
        <span>换手率</span>
        <span></span>
      </div>
      ${stocks.map((s) => {
        const cls = chgClass(s.change_percent);
        return `
          <div class="stock-row">
            <div class="sr2-id">
              <span class="sr2-code">${s.code}</span>
              <span class="sr2-name">${s.name}</span>
            </div>
            <span class="sr2-price ${cls}">${fmt(s.price)}</span>
            <span class="sr2-chg ${cls}">${chgText(s.change_percent)}</span>
            <span class="sr2-amount">${fmtAmount(s.amount)}</span>
            <span class="sr2-turn">${s.turnover_rate != null ? fmt(s.turnover_rate) + "%" : "--"}</span>
            <a href="workspace.html?code=${s.code}" class="btn-analyze-stock">分析</a>
          </div>
        `;
      }).join("")}
    `;
  } catch (err) {
    if (stockLoadingEl) stockLoadingEl.style.display = "none";
    const msg = err.name === "AbortError" ? "请求超时，请重试。" : `加载失败：${err.message}`;
    if (stockTableEl) stockTableEl.innerHTML = `<div class="empty-note">${msg}</div>`;
  }
}

loadSectors();
