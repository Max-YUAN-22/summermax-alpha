const DEFAULT_API_BASE = "https://summermax-alpha-api.onrender.com";
const EM_CLIST_URL = "https://82.push2.eastmoney.com/api/qt/clist/get";

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
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
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

// ── EastMoney direct sector fetch (browser fallback when backend cache is cold) ─

async function fetchSectorsFromEM() {
  // Build URL as a raw string to avoid URLSearchParams encoding + and ! characters
  const url = `${EM_CLIST_URL}?pn=1&pz=100&po=1&np=1` +
    `&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3` +
    `&fs=m:90+t:2&fields=f3,f6,f12,f14,f104,f105,f128,f136`;
  const res = await fetch(url, {
    headers: { "Referer": "https://quote.eastmoney.com/center/boardlist.html" },
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json();
  const diff = (data.data || {}).diff || [];
  return diff
    .map((item) => ({
      code: String(item.f12 || ""),
      name: String(item.f14 || ""),
      change_percent: Number(item.f3) || 0,
      amount: Number(item.f6) || 0,
      rise_count: Number(item.f104) || 0,
      fall_count: Number(item.f105) || 0,
      leader: String(item.f128 || ""),
      leader_change: Number(item.f136) || 0,
    }))
    .filter((s) => s.name);
}

// ── Render sectors into the DOM ───────────────────────────────────────────────

function renderSectorList(sectors) {
  if (!sectorListEl) return;
  sectorListEl.innerHTML = sectors.map((s, i) => {
    const cls = chgClass(s.change_percent);
    const leaderCls = chgClass(s.leader_change);
    return `
      <button type="button" class="sector-row" data-sector="${encodeURIComponent(s.name)}" data-code="${s.code || ""}">
        <span class="sr-rank">${i + 1}</span>
        <span class="sr-name">${s.name}</span>
        <span class="sr-chg ${cls}">${chgText(s.change_percent)}</span>
        <span class="sr-amount">${fmtAmount(s.amount)}</span>
        <span class="sr-counts">
          <span class="cnt-up">↑${s.rise_count || 0}</span>
          <span class="cnt-down">↓${s.fall_count || 0}</span>
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
    loadSectorStocks(decodeURIComponent(btn.dataset.sector || ""), btn.dataset.code || "");
  });
}

// ── Load sector list via backend proxy ────────────────────────────────────────

async function loadSectors() {
  if (sectorLoadingEl) {
    sectorLoadingEl.style.display = "block";
    sectorLoadingEl.textContent = "正在连接服务器…（首次加载约需 30 秒）";
  }
  if (sectorListEl) sectorListEl.innerHTML = "";
  const badge = document.getElementById("sectorCountBadge");
  if (badge) badge.textContent = "加载中…";

  const wakeTimer = setTimeout(() => {
    if (sectorLoadingEl && sectorLoadingEl.style.display !== "none") {
      sectorLoadingEl.textContent = "服务器正在唤醒，请稍等…";
    }
  }, 15000);

  let sectors = [];

  try {
    const res = await apiFetch("/market/sectors", 1, 4000);
    clearTimeout(wakeTimer);
    const data = await res.json();
    sectors = data.sectors || [];
  } catch {
    clearTimeout(wakeTimer);
  }

  // Backend empty or failed — try EastMoney directly
  if (!sectors.length) {
    if (sectorLoadingEl) {
      sectorLoadingEl.style.display = "block";
      sectorLoadingEl.textContent = "正在从备用数据源加载板块数据…";
    }
    try {
      sectors = await fetchSectorsFromEM();
    } catch { /* both paths failed */ }
  }

  if (sectorLoadingEl) sectorLoadingEl.style.display = "none";

  if (!sectors.length) {
    if (sectorListEl) sectorListEl.innerHTML = `
      <div class="empty-note">
        <p>暂无板块数据（非交易时段可能无数据）</p>
        <button type="button" class="btn-retry" id="retrySectorsBtn">重新加载</button>
      </div>`;
    const btn = document.getElementById("retrySectorsBtn");
    if (btn) btn.addEventListener("click", loadSectors);
    return;
  }

  renderSectorList(sectors);

  if (badge) badge.textContent = sectors.length + " 板块";
}

// ── EastMoney direct sector-member stock fetch ────────────────────────────────

async function fetchSectorStocksFromEM(bkCode) {
  // Raw URL string — avoids URLSearchParams encoding b:BK0xxx+f:!50
  const url = `${EM_CLIST_URL}?pn=1&pz=200&po=1&np=1` +
    `&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3` +
    `&fs=b:${bkCode}+f:!50&fields=f2,f3,f6,f8,f12,f14`;
  const res = await fetch(url, {
    headers: { "Referer": "https://quote.eastmoney.com/center/boardlist.html" },
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  const diff = (data.data || {}).diff || [];
  return diff
    .map((item) => ({
      code: String(item.f12 || "").padStart(6, "0"),
      name: String(item.f14 || ""),
      price: Number(item.f2) || 0,
      change_percent: Number(item.f3) ?? 0,
      amount: Number(item.f6) || 0,
      turnover_rate: Number(item.f8) || 0,
    }))
    .filter((s) => s.code && s.code !== "000000" && s.name);
}

// ── Load stocks in a sector via backend proxy ─────────────────────────────────

async function loadSectorStocks(sectorName, sectorCode) {
  if (stockPanelEl) stockPanelEl.style.display = "flex";
  const placeholder = document.getElementById("stockPlaceholder");
  if (placeholder) placeholder.style.display = "none";
  if (stockPanelTitleEl) stockPanelTitleEl.textContent = sectorName;
  if (stockTableEl) stockTableEl.innerHTML = "";
  if (stockLoadingEl) stockLoadingEl.style.display = "block";

  try {
    let stocks = [];

    try {
      const res = await apiFetch(`/market/sector/stocks?name=${encodeURIComponent(sectorName)}`);
      const data = await res.json();
      stocks = data.stocks || [];
    } catch { /* backend failed — will try EastMoney */ }

    // Backend failed or returned nothing — fetch directly from EastMoney via BK code
    if (!stocks.length && sectorCode) {
      if (stockLoadingEl) stockLoadingEl.innerHTML = `<span class="spin"></span> 正在从东方财富直接获取个股数据…`;
      try {
        stocks = await fetchSectorStocksFromEM(sectorCode);
      } catch (emErr) {
        if (stockTableEl) stockTableEl.innerHTML = `<div class="empty-note">加载失败：${emErr.message}</div>`;
        if (stockLoadingEl) stockLoadingEl.style.display = "none";
        return;
      }
    }

    if (stockLoadingEl) stockLoadingEl.style.display = "none";

    if (!stocks.length) {
      if (stockTableEl) stockTableEl.innerHTML = `<div class="empty-note">该板块暂无个股数据</div>`;
      return;
    }

    const sorted = [...stocks].sort((a, b) => (b.change_percent ?? -999) - (a.change_percent ?? -999));

    stockTableEl.innerHTML = sorted.map((s) => {
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
            <a href="workspace.html?code=${s.code}" class="btn-analyze-stock">分析</a>
          </div>
        `;
      }).join("");
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
