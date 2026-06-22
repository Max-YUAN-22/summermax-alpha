const DEFAULT_API_BASE = "https://summermax-alpha-api.onrender.com";

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

// ── Retry helper ──────────────────────────────────────────────────────────────

async function apiFetch(path, retries = 4, delayMs = 8000) {
  const url = `${getApiBase()}${path}`;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(50000) });
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const sectorListEl = document.getElementById("sectorList");
const sectorLoadingEl = document.getElementById("sectorLoading");
const stockPanelEl = document.getElementById("stockPanel");
const stockPanelTitleEl = document.getElementById("stockPanelTitle");
const stockTableEl = document.getElementById("stockTable");
const stockLoadingEl = document.getElementById("stockLoading");

let activeSectorRow = null;

// ── Load sector list via backend proxy ────────────────────────────────────────

async function loadSectors() {
  if (sectorLoadingEl) {
    sectorLoadingEl.style.display = "block";
    sectorLoadingEl.textContent = "正在连接服务器…（首次加载约需 30 秒）";
  }
  if (sectorListEl) sectorListEl.innerHTML = "";

  // Update loading text after first retry to signal cold start
  const wakeTimer = setTimeout(() => {
    if (sectorLoadingEl && sectorLoadingEl.style.display !== "none") {
      sectorLoadingEl.textContent = "服务器正在唤醒，请稍等…";
    }
  }, 15000);

  try {
    const res = await apiFetch("/market/sectors");
    clearTimeout(wakeTimer);
    const data = await res.json();
    const sectors = data.sectors || [];

    if (sectorLoadingEl) sectorLoadingEl.style.display = "none";

    if (!sectors.length) {
      if (sectorListEl) sectorListEl.innerHTML = `<div class="empty-note">暂无板块数据（非交易时段可能无数据）</div>`;
      return;
    }

    sectorListEl.innerHTML = sectors.map((s, i) => {
      const cls = chgClass(s.change_percent);
      const leaderCls = chgClass(s.leader_change);
      return `
        <button type="button" class="sector-row" data-sector="${encodeURIComponent(s.name)}">
          <span class="sr-rank">${i + 1}</span>
          <span class="sr-name">${s.name}</span>
          <span class="sr-chg ${cls}">${chgText(s.change_percent)}</span>
          <span class="sr-amount">${fmtAmount(s.amount)}</span>
          <span class="sr-counts">
            <span class="up">↑${s.rise_count || 0}</span>
            <span class="down"> ↓${s.fall_count || 0}</span>
          </span>
          <span class="sr-leader ${leaderCls}">${s.leader || ""} ${s.leader_change != null ? chgText(s.leader_change) : ""}</span>
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
      loadSectorStocks(decodeURIComponent(btn.dataset.sector || ""));
    });

  } catch (err) {
    clearTimeout(wakeTimer);
    if (sectorLoadingEl) sectorLoadingEl.style.display = "none";
    if (sectorListEl) sectorListEl.innerHTML = `
      <div class="empty-note">
        <p>加载失败：${err.message}</p>
        <button type="button" class="btn-retry" id="retrySectorsBtn">重新加载</button>
      </div>`;
    const btn = document.getElementById("retrySectorsBtn");
    if (btn) btn.addEventListener("click", loadSectors);
  }
}

// ── Load stocks in a sector via backend proxy ─────────────────────────────────

async function loadSectorStocks(sectorName) {
  if (stockPanelEl) stockPanelEl.style.display = "flex";
  const placeholder = document.getElementById("stockPlaceholder");
  if (placeholder) placeholder.style.display = "none";
  if (stockPanelTitleEl) stockPanelTitleEl.textContent = sectorName;
  if (stockTableEl) stockTableEl.innerHTML = "";
  if (stockLoadingEl) stockLoadingEl.style.display = "block";

  try {
    const res = await apiFetch(`/market/sector/stocks?name=${encodeURIComponent(sectorName)}`);
    const data = await res.json();
    const stocks = data.stocks || [];

    if (stockLoadingEl) stockLoadingEl.style.display = "none";

    if (!stocks.length) {
      if (stockTableEl) stockTableEl.innerHTML = `<div class="empty-note">该板块暂无个股数据</div>`;
      return;
    }

    const sorted = [...stocks].sort((a, b) => (b.change_percent ?? -999) - (a.change_percent ?? -999));

    stockTableEl.innerHTML = `
      <div class="stock-col-head">
        <span>代码 / 名称</span>
        <span>现价</span>
        <span>涨跌幅</span>
        <span>成交额</span>
        <span>换手率</span>
        <span></span>
      </div>
      ${sorted.map((s) => {
        const cls = chgClass(s.change_percent);
        return `
          <div class="stock-row">
            <div class="sr2-id">
              <span class="sr2-code">${s.code}</span>
              <span class="sr2-name">${s.name}</span>
            </div>
            <span class="sr2-price ${cls}">${s.price != null ? Number(s.price).toFixed(2) : "--"}</span>
            <span class="sr2-chg ${cls}">${chgText(s.change_percent)}</span>
            <span class="sr2-amount">${fmtAmount(s.amount)}</span>
            <span class="sr2-turn">${s.turnover_rate != null ? Number(s.turnover_rate).toFixed(1) + "%" : "--"}</span>
            <a href="stock.html?code=${s.code}" class="btn-analyze-stock">分析</a>
          </div>
        `;
      }).join("")}
    `;
  } catch (err) {
    if (stockLoadingEl) stockLoadingEl.style.display = "none";
    if (stockTableEl) stockTableEl.innerHTML = `<div class="empty-note">加载失败：${err.message}</div>`;
  }
}

loadSectors();

// Keep-alive ping every 10 minutes so Render doesn't sleep
setInterval(() => {
  fetch(`${getApiBase()}/ping`).catch(() => {});
}, 10 * 60 * 1000);
