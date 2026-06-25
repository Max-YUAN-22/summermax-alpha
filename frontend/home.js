const DEFAULT_API_BASE = `${window.location.origin}`;
const EM_CLIST_URL = "https://82.push2.eastmoney.com/api/qt/clist/get";
const EM_ULIST_URL = "https://push2.eastmoney.com/api/qt/ulist.np/get";
const EM_UT = "bd1d9ddb04089700cf9c27f6f7426281";

function getApiBase() {
  const saved = localStorage.getItem("summermax-alpha-api-base");
  const preferred = location.hostname.includes("onrender.com") ? DEFAULT_API_BASE : (saved || DEFAULT_API_BASE);
  return preferred.trim().replace(/\/+$/, "");
}

function chgClass(v) { const n = Number(v); return isNaN(n) ? "" : n >= 0 ? "up" : "down"; }
function chgText(v)  { const n = Number(v); if (isNaN(n)) return "--"; return (n >= 0 ? "+" : "") + n.toFixed(2) + "%"; }
function fmtPrice(v) { const n = Number(v); if (isNaN(n) || n <= 0) return "--"; return n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ── Market configs ────────────────────────────────────────────────────────────

const MKT_CFG = {
  a: {
    sectorTitle: "今日强势板块",
    sectorLink: "/scan",
    sectorLinkText: "查看全部 →",
  },
  hk: {
    secids: "116.HSI,116.HSTECH,116.HSCEI",
    names: { HSI: "恒生指数", HSTECH: "恒生科技", HSCEI: "国企指数" },
    sectorTitle: "港股今日热门",
    sectorLink: null,
    moverFs: "m:116+t:3",
  },
  us: {
    secids: "100.SPX,100.NDX,100.DJI",
    names: { SPX: "标普 500", NDX: "纳斯达克", DJI: "道琼斯" },
    sectorTitle: "美股今日热门",
    sectorLink: null,
    moverFs: "m:105+t:2,m:106+t:2,m:107+t:2",
  },
};

// ── State ─────────────────────────────────────────────────────────────────────

let currentMkt = "a";
let aIndicesCache = null;
let aTimeCache = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────

const indicesEl      = document.getElementById("homeIndices");
const sectorsEl      = document.getElementById("homeSectors");
const overviewTimeEl = document.getElementById("overviewTime");
const sectorTitleEl  = document.getElementById("sectorCardTitle");
const sectorLinkEl   = document.getElementById("sectorCardLink");
const heroUpEl       = document.getElementById("heroUpCount");

// ── Index row renderer ────────────────────────────────────────────────────────

function indexRowHtml(name, code, price, chgPct) {
  const cls = chgClass(chgPct);
  return `
    <div class="index-row">
      <div class="index-left">
        <span class="index-name">${name}</span>
        <span class="index-code">${code}</span>
      </div>
      <div class="index-right">
        <span class="index-price ${cls}">${fmtPrice(price)}</span>
        <span class="index-chg ${cls}">${chgText(chgPct)}</span>
      </div>
    </div>`;
}

// ── A股 indices (backend → Sina API) ─────────────────────────────────────────

async function loadAIndices() {
  if (aIndicesCache) { renderAIndices(aIndicesCache, aTimeCache); return; }
  try {
    const data = await fetch(`${getApiBase()}/market/overview`).then(r => r.json());
    aIndicesCache = data.indices || [];
    aTimeCache    = data.generated_at || null;
    renderAIndices(aIndicesCache, aTimeCache);
  } catch {
    if (indicesEl) indicesEl.innerHTML = `<span style="color:var(--muted);font-size:0.8rem">指数数据加载中，服务器首次启动约需 30 秒</span>`;
  }
}

function renderAIndices(indices, time) {
  if (overviewTimeEl) overviewTimeEl.textContent = time || "";
  if (indicesEl) indicesEl.innerHTML = indices.map(idx =>
    indexRowHtml(idx.name, idx.code, idx.price, idx.change_percent)
  ).join("");
}

// ── 港股 / 美股 indices (browser → EastMoney direct) ─────────────────────────

async function loadForeignIndices(mkt) {
  const cfg = MKT_CFG[mkt];
  if (overviewTimeEl) overviewTimeEl.textContent = "";
  if (indicesEl) indicesEl.innerHTML = `<div class="skeleton" style="height:90px;border-radius:8px"></div>`;
  try {
    const url = `${EM_ULIST_URL}?secids=${cfg.secids}&fields=f2,f3,f12,f14,f58&fltt=2&invt=2&ut=${EM_UT}`;
    const res  = await fetch(url, {
      headers: { "Referer": "https://quote.eastmoney.com/" },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    const diff = (data.data || {}).diff || [];
    if (!diff.length) throw new Error("empty");
    indicesEl.innerHTML = diff.map(item => {
      const code = String(item.f12 || "");
      const name = cfg.names[code] || String(item.f58 || item.f14 || code);
      return indexRowHtml(name, code, item.f2, item.f3);
    }).join("");
  } catch {
    if (indicesEl) indicesEl.innerHTML = `<span style="color:var(--muted);font-size:0.8rem">数据暂不可用</span>`;
  }
}

// ── A股 hot sectors ───────────────────────────────────────────────────────────

async function loadAHotSectors() {
  if (!sectorsEl) return;
  try {
    const url = new URL(EM_CLIST_URL);
    const params = {
      pn: "1", pz: "10", po: "1", np: "1",
      ut: EM_UT, fltt: "2", invt: "2", fid: "f3",
      fs: "m:90 t:2 f:!50", fields: "f3,f12,f14,f128",
    };
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res  = await fetch(url.toString(), {
      headers: { "Referer": "https://quote.eastmoney.com/center/boardlist.html" },
    });
    const data = await res.json();
    const top5 = ((data.data || {}).diff || []).slice(0, 5);
    if (!top5.length) throw new Error("empty");
    sectorsEl.innerHTML = top5.map(item => {
      const cls = chgClass(item.f3);
      return `<a href="/scan" class="sector-pill">
        <span class="sector-pill-chg ${cls}">${chgText(item.f3)}</span>
        <span>${item.f14 || ""}</span>
        ${item.f128 ? `<span class="sector-pill-leader">${item.f128}</span>` : ""}
      </a>`;
    }).join("");
  } catch { /* fail silently — optional widget */ }
}

// ── 港股 / 美股 hot movers ────────────────────────────────────────────────────

async function loadForeignMovers(mkt) {
  if (!sectorsEl) return;
  const cfg = MKT_CFG[mkt];
  sectorsEl.innerHTML = `<div class="skeleton" style="width:100%;height:26px;border-radius:999px"></div>`;
  try {
    const url = new URL(EM_CLIST_URL);
    const params = {
      pn: "1", pz: "6", po: "1", np: "1",
      ut: EM_UT, fltt: "2", invt: "2", fid: "f3",
      fs: cfg.moverFs, fields: "f2,f3,f12,f14",
    };
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res  = await fetch(url.toString(), {
      headers: { "Referer": "https://quote.eastmoney.com/" },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    const top  = ((data.data || {}).diff || []).slice(0, 6);
    if (!top.length) throw new Error("empty");
    sectorsEl.innerHTML = top.map(item => {
      const cls = chgClass(item.f3);
      return `<span class="sector-pill" style="cursor:default">
        <span class="sector-pill-chg ${cls}">${chgText(item.f3)}</span>
        <span>${item.f14 || item.f12 || ""}</span>
      </span>`;
    }).join("");
  } catch {
    if (sectorsEl) sectorsEl.innerHTML = `<span style="color:var(--muted);font-size:0.78rem">数据暂不可用</span>`;
  }
}

// ── Market switcher ───────────────────────────────────────────────────────────

async function switchMarket(mkt) {
  currentMkt = mkt;
  const cfg  = MKT_CFG[mkt];

  // Update active tab
  document.querySelectorAll(".mkt-sw-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.mkt === mkt)
  );

  // Update sector card header
  if (sectorTitleEl) sectorTitleEl.textContent = cfg.sectorTitle;
  if (sectorLinkEl) {
    if (cfg.sectorLink) {
      sectorLinkEl.href        = cfg.sectorLink;
      sectorLinkEl.textContent = cfg.sectorLinkText || "";
      sectorLinkEl.style.display = "";
    } else {
      sectorLinkEl.style.display = "none";
    }
  }

  // Load indices
  if (mkt === "a") {
    await loadAIndices();
  } else {
    await loadForeignIndices(mkt);
  }

  // Load sectors / movers (non-blocking)
  if (mkt === "a") {
    loadAHotSectors();
  } else {
    loadForeignMovers(mkt);
  }
}

// ── Hero up-count (A股 only) ──────────────────────────────────────────────────

async function loadHeroUpCount() {
  if (!heroUpEl) return;
  try {
    const data   = await fetch(`${getApiBase()}/market/stocks`).then(r => r.json());
    const stocks = Array.isArray(data.stocks) ? data.stocks : [];
    if (!stocks.length) return;
    const up = stocks.filter(s => Number(s.change_percent) > 0).length;
    heroUpEl.textContent = up.toLocaleString();
  } catch {}
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.querySelectorAll(".mkt-sw-btn").forEach(btn =>
  btn.addEventListener("click", () => switchMarket(btn.dataset.mkt))
);

switchMarket("a");
loadHeroUpCount();
