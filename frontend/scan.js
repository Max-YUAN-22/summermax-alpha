const DEFAULT_API_BASE = "https://summermax-alpha-api.onrender.com";
const EM_URL = "https://82.push2.eastmoney.com/api/qt/clist/get";
const EM_HEADERS = {
  "Referer": "https://quote.eastmoney.com/center/boardlist.html",
};

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

// Cache board code (BK...) by name, populated when sector list loads
const sectorCodeMap = {};

async function emFetch(params) {
  const url = new URL(EM_URL);
  const base = {
    pn: "1", pz: "100", po: "1", np: "1",
    ut: "bd1d9ddb04089700cf9c27f6f7426281",
    fltt: "2", invt: "2", fid: "f3",
  };
  Object.entries({ ...base, ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: EM_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.data || {}).diff || [];
}

const sectorListEl = document.getElementById("sectorList");
const sectorLoadingEl = document.getElementById("sectorLoading");
const stockPanelEl = document.getElementById("stockPanel");
const stockPanelTitleEl = document.getElementById("stockPanelTitle");
const stockTableEl = document.getElementById("stockTable");
const stockLoadingEl = document.getElementById("stockLoading");

let activeSectorRow = null;

async function loadSectors() {
  if (sectorLoadingEl) sectorLoadingEl.style.display = "block";
  if (sectorListEl) sectorListEl.innerHTML = "";

  try {
    const diffs = await emFetch({
      fs: "m:90 t:2 f:!50",
      fields: "f3,f6,f12,f14,f104,f105,f128,f136",
    });

    if (sectorLoadingEl) sectorLoadingEl.style.display = "none";

    if (!diffs.length) {
      if (sectorListEl) sectorListEl.innerHTML = `<div class="empty-note">暂无板块数据（非交易时段可能无数据）</div>`;
      return;
    }

    diffs.forEach((item) => {
      const name = String(item.f14 || "");
      const code = String(item.f12 || "");
      if (name && code) sectorCodeMap[name] = code;
    });

    const sorted = [...diffs].sort((a, b) => (Number(b.f3) || 0) - (Number(a.f3) || 0));

    sectorListEl.innerHTML = sorted.map((item, i) => {
      const name = String(item.f14 || "");
      const cls = chgClass(item.f3);
      const leaderCls = chgClass(item.f136);
      return `
        <button type="button" class="sector-row" data-sector="${encodeURIComponent(name)}">
          <span class="sr-rank">${i + 1}</span>
          <span class="sr-name">${name}</span>
          <span class="sr-chg ${cls}">${chgText(item.f3)}</span>
          <span class="sr-amount">${fmtAmount(item.f6)}</span>
          <span class="sr-counts">
            <span class="up">↑${item.f104 || 0}</span>
            <span class="down"> ↓${item.f105 || 0}</span>
          </span>
          <span class="sr-leader ${leaderCls}">${item.f128 || ""} ${item.f136 != null ? chgText(item.f136) : ""}</span>
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

async function loadSectorStocks(sectorName) {
  const boardCode = sectorCodeMap[sectorName];

  if (stockPanelEl) stockPanelEl.style.display = "flex";
  const placeholder = document.getElementById("stockPlaceholder");
  if (placeholder) placeholder.style.display = "none";
  if (stockPanelTitleEl) stockPanelTitleEl.textContent = sectorName;
  if (stockTableEl) stockTableEl.innerHTML = "";
  if (stockLoadingEl) stockLoadingEl.style.display = "block";

  try {
    if (!boardCode) throw new Error("未找到板块代码，请重新加载板块列表");

    const diffs = await emFetch({
      fs: `b:${boardCode}+f:!50+s:z`,
      fields: "f2,f3,f5,f6,f8,f12,f14",
    });

    if (stockLoadingEl) stockLoadingEl.style.display = "none";

    if (!diffs.length) {
      if (stockTableEl) stockTableEl.innerHTML = `<div class="empty-note">该板块暂无个股数据</div>`;
      return;
    }

    const sorted = [...diffs].sort((a, b) => (Number(b.f3) || 0) - (Number(a.f3) || 0));

    stockTableEl.innerHTML = `
      <div class="stock-col-head">
        <span>代码 / 名称</span>
        <span>现价</span>
        <span>涨跌幅</span>
        <span>成交额</span>
        <span>换手率</span>
        <span></span>
      </div>
      ${sorted.map((item) => {
        const cls = chgClass(item.f3);
        const code = String(item.f12 || "").padStart(6, "0");
        return `
          <div class="stock-row">
            <div class="sr2-id">
              <span class="sr2-code">${code}</span>
              <span class="sr2-name">${item.f14 || ""}</span>
            </div>
            <span class="sr2-price ${cls}">${fmt(item.f2)}</span>
            <span class="sr2-chg ${cls}">${chgText(item.f3)}</span>
            <span class="sr2-amount">${fmtAmount(item.f6)}</span>
            <span class="sr2-turn">${item.f8 != null ? fmt(item.f8) + "%" : "--"}</span>
            <a href="stock.html?code=${code}" class="btn-analyze-stock">分析</a>
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
