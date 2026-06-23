const DEFAULT_API_BASE = "https://summermax-alpha-api.onrender.com";
const EM_URL = "https://82.push2.eastmoney.com/api/qt/clist/get";
const HISTORY_KEY = "summermax-alpha-chat-history";

// ── Auth state ────────────────────────────────────────────────────────────────

let isLoggedIn = false;

function getApiBase() {
  const saved = localStorage.getItem("summermax-alpha-api-base");
  return (saved || DEFAULT_API_BASE).trim().replace(/\/+$/, "");
}

function getToken() {
  return localStorage.getItem("summermax-token") || "";
}

function getAuthHeaders() {
  const token = getToken();
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

async function checkAuth() {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(`${getApiBase()}/auth/me`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (res.status === 401) {
      localStorage.removeItem("summermax-token");
      localStorage.removeItem("summermax-email");
      window.location.href = "auth.html";
    } else if (res.ok) {
      const data = await res.json();
      renderUserBadge(data.email, data.role);
      isLoggedIn = true;
    }
  } catch { /* network error, continue */ }
}

function renderUserBadge(email, role) {
  const badge = document.getElementById("userBadge");
  if (!badge) return;
  const label = role === "admin" ? "管理员" : "用户";
  badge.innerHTML = `
    <span class="user-email">${email}</span>
    <span class="user-role ${role === "admin" ? "admin" : ""}">${label}</span>
    <button class="logout-btn" id="logoutBtn">退出</button>
  `;
  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("summermax-token");
    localStorage.removeItem("summermax-email");
    localStorage.removeItem("summermax-role");
    window.location.href = "auth.html";
  });
}

// ── Format helpers ────────────────────────────────────────────────────────────

function chgClass(v) {
  const n = Number(v);
  return Number.isNaN(n) ? "" : n >= 0 ? "up" : "down";
}

function chgText(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return "--";
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

function fmtAmt(v) {
  const n = Number(v);
  if (Number.isNaN(n) || n === 0) return "--";
  if (n >= 1e8) return (n / 1e8).toFixed(1) + "亿";
  if (n >= 1e4) return (n / 1e4).toFixed(0) + "万";
  return n.toFixed(0);
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderMd(raw) {
  const esc = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const lines = esc.split("\n");
  const out = [];
  let listOpen = false;

  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  for (const line of lines) {
    const trimmed = line.trim();
    const isListItem = /^[-•*] /.test(trimmed) || /^\d+\. /.test(trimmed);
    const isTableRow = trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 2;

    if (!isListItem && listOpen) { out.push("</div>"); listOpen = false; }

    if (/^-{3,}$/.test(trimmed)) { out.push('<div class="md-sep"></div>'); continue; }

    if (/^#{1,3} /.test(trimmed)) {
      out.push(`<div class="md-h">${inline(trimmed.replace(/^#{1,3} /, ""))}</div>`);
      continue;
    }

    if (isTableRow) {
      if (/^\|[\s|:-]+\|$/.test(trimmed)) continue;
      const cells = trimmed.split("|").map((c) => c.trim()).filter(Boolean);
      out.push(`<div class="md-tr">${cells.map((c) => `<span>${inline(c)}</span>`).join("")}</div>`);
      continue;
    }

    if (isListItem) {
      if (!listOpen) { out.push('<div class="md-list">'); listOpen = true; }
      out.push(`<div class="md-li">${inline(trimmed.replace(/^[-•*\d.]+ +/, ""))}</div>`);
      continue;
    }

    if (!trimmed) { out.push('<div class="md-br"></div>'); continue; }

    out.push(`<div class="md-p">${inline(trimmed)}</div>`);
  }

  if (listOpen) out.push("</div>");
  return out.join("");
}

// ── EastMoney fetch helper ────────────────────────────────────────────────────

async function emGet(params) {
  const url = new URL(EM_URL);
  const base = {
    np: "1", fltt: "2", invt: "2",
    ut: "bd1d9ddb04089700cf9c27f6f7426281",
  };
  Object.entries({ ...base, ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { "Referer": "https://quote.eastmoney.com/center/boardlist.html" },
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json();
  return (data.data || {}).diff || [];
}

// ── Full A-share fetch (via backend proxy, falls back to EastMoney direct) ────

const ALL_STOCK_FS = [
  "m:0+t:6+f:!50",
  "m:0+t:13+f:!50",
  "m:0+t:80+f:!50",
  "m:1+t:2+f:!50",
  "m:1+t:23+f:!50",
].join(",");

const STOCK_FIELDS = "f2,f3,f6,f8,f10,f11,f12,f14";

async function fetchAllStocks() {
  // Retry backend up to 3 times — market cache warms in ~20s after server restart.
  // If the server just restarted and /market/stocks returns [] (cache still building),
  // we wait and retry rather than falling to EastMoney (which may CORS-block on GH Pages).
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      if (matrixLoadingEl) {
        matrixLoadingEl.innerHTML = `<div>市场缓存预热中，稍后自动重试（${attempt}/2）…<div style="margin-top:6px;font-size:0.72rem;color:var(--muted-2)">服务器已启动，数据约需 20-30 秒完成加载</div></div>`;
      }
      await new Promise(r => setTimeout(r, 20000));
    }
    try {
      const res = await fetch(`${getApiBase()}/market/stocks`, {
        signal: AbortSignal.timeout(25000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.stocks) && data.stocks.length > 10) return data.stocks;
      }
    } catch { /* timeout or network, retry */ }
  }

  // Backend gave empty 3× — try EastMoney direct as last resort
  if (matrixLoadingEl) {
    matrixLoadingEl.innerHTML = `<div>正在从备用数据源加载…</div>`;
  }
  const PAGE_SIZE = 500;
  const PAGES = 9;
  const pages = await Promise.all(
    Array.from({ length: PAGES }, (_, i) =>
      emGet({ pn: String(i + 1), pz: String(PAGE_SIZE), po: "1", fid: "f3", fs: ALL_STOCK_FS, fields: STOCK_FIELDS })
        .catch(() => [])
    )
  );

  const seen = new Set();
  const stocks = [];
  for (const diff of pages.flat()) {
    const code = String(diff.f12 || "").padStart(6, "0");
    if (!code || code === "000000" || seen.has(code)) continue;
    seen.add(code);
    stocks.push({
      code,
      name: String(diff.f14 || ""),
      price: Number(diff.f2) || 0,
      change_percent: Number(diff.f3) ?? 0,
      amount: Number(diff.f6) || 0,
      turnover_rate: Number(diff.f8) || 0,
      vol_ratio: Number(diff.f10) || 0,
      rise_speed: Number(diff.f11) || 0,
    });
  }
  return stocks;
}

function selectForAI(stocks) {
  const tradeable = stocks.filter((s) => s.price > 0 && s.name);
  const gainers = [...tradeable]
    .filter((s) => s.change_percent > 0.5 && s.change_percent < 9.9)
    .sort((a, b) => b.change_percent - a.change_percent)
    .slice(0, 120);
  const byAmount = [...tradeable].sort((a, b) => b.amount - a.amount).slice(0, 50);
  const byTurnover = [...tradeable]
    .filter((s) => s.turnover_rate > 0)
    .sort((a, b) => b.turnover_rate - a.turnover_rate)
    .slice(0, 30);
  const beaten = [...tradeable]
    .filter((s) => s.change_percent < -3)
    .sort((a, b) => a.change_percent - b.change_percent)
    .slice(0, 20);
  const seen = new Set();
  const result = [];
  for (const s of [...gainers, ...byAmount, ...byTurnover, ...beaten]) {
    if (!seen.has(s.code)) { seen.add(s.code); result.push(s); }
  }
  return result;
}

// ── Matrix UI ─────────────────────────────────────────────────────────────────

let allStocks = [];
let displayStocks = [];
let currentSort = "chg";
let searchQuery = "";
const DISPLAY_LIMIT = 500;

const matrixListEl = document.getElementById("matrixList");
const matrixLoadingEl = document.getElementById("matrixLoading");
const matrixStatsEl = document.getElementById("matrixStats");
const aiContextNoteEl = document.getElementById("aiContextNote");
const stockSearchEl = document.getElementById("stockSearch");

function sortAndFilter() {
  const q = searchQuery.toLowerCase();
  let result = q
    ? allStocks.filter((s) => s.code.includes(q) || s.name.includes(q))
    : [...allStocks];
  switch (currentSort) {
    case "amount":  result.sort((a, b) => b.amount - a.amount); break;
    case "turn":    result.sort((a, b) => b.turnover_rate - a.turnover_rate); break;
    case "volr":    result.sort((a, b) => b.vol_ratio - a.vol_ratio); break;
    default:        result.sort((a, b) => b.change_percent - a.change_percent); break;
  }
  displayStocks = result;
}

function renderMatrix() {
  if (!allStocks.length) return;
  sortAndFilter();

  const up = allStocks.filter((s) => s.change_percent > 0).length;
  const down = allStocks.filter((s) => s.change_percent < 0).length;
  const flat = allStocks.length - up - down;

  matrixStatsEl.innerHTML = `
    <span class="stat-total">${allStocks.length}</span>
    <span class="mkt-label">只 A股</span>
    <span class="mkt-divider" style="width:1px;height:10px;background:var(--line);display:inline-block;margin:0 2px"></span>
    <span class="stat-chip"><span class="stat-count up">${up}</span><span class="mkt-label">涨</span></span>
    <span class="stat-chip"><span class="stat-count down">${down}</span><span class="mkt-label">跌</span></span>
    <span class="stat-chip"><span class="stat-count" style="color:var(--muted-2)">${flat}</span><span class="mkt-label">平</span></span>
  `;

  const shown = displayStocks.slice(0, DISPLAY_LIMIT);
  const fragment = document.createDocumentFragment();
  shown.forEach((s, i) => {
    const cls = chgClass(s.change_percent);
    const row = document.createElement("div");
    row.className = "matrix-row";
    row.innerHTML = `
      <span class="mx-rank">${i + 1}</span>
      <div class="mx-id">
        <span class="mx-code">${s.code}</span>
        <span class="mx-name">${s.name}</span>
      </div>
      <span class="mx-price ${cls}">${s.price > 0 ? s.price.toFixed(2) : "--"}</span>
      <span class="mx-chg ${cls}">${chgText(s.change_percent)}</span>
      <span class="mx-amount">${fmtAmt(s.amount)}</span>
      <span class="mx-turn">${s.turnover_rate > 0 ? s.turnover_rate.toFixed(1) + "%" : "--"}</span>
      <a href="stock.html?code=${s.code}" class="btn-analyze-sm">分析</a>
    `;
    fragment.appendChild(row);
  });

  matrixListEl.innerHTML = "";
  matrixListEl.appendChild(fragment);

  if (displayStocks.length > DISPLAY_LIMIT) {
    const moreEl = document.createElement("div");
    moreEl.className = "matrix-empty";
    moreEl.textContent = `已显示前 ${DISPLAY_LIMIT} 只，搜索可精准定位`;
    matrixListEl.appendChild(moreEl);
  } else if (displayStocks.length === 0) {
    matrixListEl.innerHTML = `<div class="matrix-empty">未找到匹配的股票</div>`;
  }
}

async function initMatrix() {
  try {
    matrixLoadingEl.innerHTML = `<div>正在加载全市场行情数据…<div style="margin-top:6px;font-size:0.72rem;color:var(--muted-2)">服务器首次启动后数据约需 20-30 秒完成缓存，自动重试中</div></div>`;
    allStocks = await fetchAllStocks();
    matrixLoadingEl.style.display = "none";
    renderMatrix();
    const aiStocks = selectForAI(allStocks);
    const aiCtx = buildAIStockContext(aiStocks);
    marketCtx = { ...marketCtx, top_movers: aiCtx, total_stocks: allStocks.length };
    aiContextNoteEl.textContent = `AI 已读取 ${allStocks.length} 只 · 精选 ${aiCtx.length} 只入上下文`;
    // Unlock send button once market data is ready
    sendBtnEl.disabled = false;
    chatInputEl.placeholder = "问我任何关于今日A股的问题，或让我直接推荐票…";
  } catch (err) {
    matrixLoadingEl.innerHTML = `<div>加载失败：${err.message}<br><button onclick="initMatrix()" style="margin-top:10px;padding:6px 14px;border-radius:7px;border:1px solid rgba(102,209,255,0.22);background:rgba(102,209,255,0.08);color:var(--accent);cursor:pointer;font-size:0.78rem">重试</button></div>`;
    // Allow sending even without market data
    sendBtnEl.disabled = false;
    chatInputEl.placeholder = "问我任何关于今日A股的问题，或让我直接推荐票…";
  }
}

function buildAIStockContext(stocks) {
  return stocks.map((s) => ({
    code: s.code, name: s.name, price: s.price,
    change_percent: s.change_percent, amount: s.amount,
    turnover_rate: s.turnover_rate, vol_ratio: s.vol_ratio,
  }));
}

document.querySelectorAll(".sort-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sort-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentSort = btn.dataset.sort;
    renderMatrix();
  });
});

stockSearchEl.addEventListener("input", () => {
  searchQuery = stockSearchEl.value.trim();
  renderMatrix();
});

// ── Market bar ────────────────────────────────────────────────────────────────

let marketCtx = null;
const marketBarEl = document.getElementById("marketBar");

async function loadMarketBar() {
  const apiBase = getApiBase();
  let indices = [];
  let hotSectors = [];
  try {
    const r = await fetch(`${apiBase}/market/overview`);
    const d = await r.json();
    if (Array.isArray(d.indices)) indices = d.indices;
    if (Array.isArray(d.hot_sectors)) hotSectors = d.hot_sectors.slice(0, 5);
  } catch { /* ignore – backend may be cold-starting */ }

  marketCtx = { indices, hot_sectors: hotSectors, generated_at: new Date().toLocaleString("zh-CN") };

  if (!indices.length && !hotSectors.length) {
    marketBarEl.innerHTML = `<span class="mkt-loading">市场数据暂不可用（非交易时段或服务器启动中）</span>`;
    return;
  }

  const idxHtml = indices.map((idx) => {
    const cls = chgClass(idx.change_percent);
    return `<div class="mkt-idx"><span class="mkt-idx-name">${idx.name || idx.code}</span><span class="mkt-idx-price ${cls}">${Number(idx.price || 0).toFixed(2)}</span><span class="${cls}">${chgText(idx.change_percent)}</span></div>`;
  }).join('<div class="mkt-divider"></div>');

  const divider = indices.length && hotSectors.length ? '<div class="mkt-divider"></div>' : "";
  const secHtml = hotSectors.length
    ? `<span class="mkt-label">热板块</span>` + hotSectors.map((s) => `<div class="mkt-sector"><span>${s.name}</span><span class="${chgClass(s.change_percent)}">${chgText(s.change_percent)}</span></div>`).join("")
    : "";

  marketBarEl.innerHTML = idxHtml + divider + secHtml;
}

// ── Server history ────────────────────────────────────────────────────────────

async function loadServerHistory() {
  if (!isLoggedIn) return false;
  try {
    const res = await fetch(`${getApiBase()}/user/history`, { headers: getAuthHeaders() });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.messages && data.messages.length > 0) {
      saveHistory(data.messages);
      return true;
    }
    return false;
  } catch { return false; }
}

async function saveMessageToServer(msg) {
  if (!isLoggedIn) return;
  try {
    await fetch(`${getApiBase()}/user/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ messages: [msg] }),
    });
  } catch {}
}

async function clearServerHistory() {
  if (!isLoggedIn) return;
  try {
    await fetch(`${getApiBase()}/user/history`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
  } catch {}
}

// ── Portfolio ─────────────────────────────────────────────────────────────────

let portfolioPositions = [];

const portfolioListEl = document.getElementById("portfolioList");
const addPosBtnEl = document.getElementById("addPosBtn");
const addPosFormEl = document.getElementById("addPosForm");
const posCodeEl = document.getElementById("posCode");
const posBuyPriceEl = document.getElementById("posBuyPrice");
const posSharesEl = document.getElementById("posShares");
const posSubmitBtnEl = document.getElementById("posSubmitBtn");
const posCancelBtnEl = document.getElementById("posCancelBtn");

async function loadPortfolio() {
  if (!isLoggedIn) {
    portfolioListEl.innerHTML = `<div class="pos-empty">请先登录后使用持仓跟踪功能</div>`;
    return;
  }
  try {
    const res = await fetch(`${getApiBase()}/user/portfolio`, { headers: getAuthHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    portfolioPositions = data.positions || [];
    renderPortfolio();
    if (portfolioPositions.length > 0) refreshPortfolioPrices();
  } catch {}
}

async function addPortfolioPosition(code, name, buyPrice, shares) {
  try {
    const res = await fetch(`${getApiBase()}/user/portfolio`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ code, name, buy_price: buyPrice, shares }),
    });
    return res.ok;
  } catch { return false; }
}

async function deletePortfolioPosition(id) {
  try {
    const res = await fetch(`${getApiBase()}/user/portfolio/${id}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    return res.ok;
  } catch { return false; }
}

function renderPortfolio() {
  if (!portfolioPositions.length) {
    portfolioListEl.innerHTML = `<div class="pos-empty">暂无持仓记录<br>点击「+ 添加持仓」开始跟踪</div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  portfolioPositions.forEach((pos) => {
    const el = document.createElement("div");
    el.className = "pos-row";

    const plPct = (pos._current_price && pos._current_price > 0)
      ? ((pos._current_price - pos.buy_price) / pos.buy_price * 100)
      : null;
    const plClass = plPct === null ? "" : plPct >= 0 ? "up" : "down";
    const plText = plPct === null ? "获取中…" : `${plPct >= 0 ? "+" : ""}${plPct.toFixed(2)}%`;
    const currentPriceText = (pos._current_price && pos._current_price > 0) ? pos._current_price.toFixed(2) : "---";
    const sharesText = pos.shares > 0 ? ` · ${pos.shares}手` : "";

    el.innerHTML = `
      <div class="pos-row-top">
        <div class="pos-stock">
          <span class="pos-code">${pos.code}</span>
          <span class="pos-name">${pos.name}</span>
        </div>
        <span class="pos-pl ${plClass}">${plText}</span>
      </div>
      <div class="pos-row-bottom">
        <span class="pos-buy-info">买入 ${pos.buy_price.toFixed(2)} → 现价 ${currentPriceText}${sharesText} · ${pos.buy_date}</span>
        <button class="pos-delete" data-id="${pos.id}">删除</button>
      </div>
    `;
    frag.appendChild(el);
  });

  portfolioListEl.innerHTML = "";
  portfolioListEl.appendChild(frag);

  portfolioListEl.querySelectorAll(".pos-delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      btn.disabled = true;
      btn.textContent = "…";
      const ok = await deletePortfolioPosition(id);
      if (ok) {
        portfolioPositions = portfolioPositions.filter((p) => p.id !== id);
        renderPortfolio();
      } else {
        btn.disabled = false;
        btn.textContent = "删除";
      }
    });
  });
}

async function refreshPortfolioPrices() {
  for (const pos of portfolioPositions) {
    // First try from already-loaded allStocks (free, instant)
    const cached = allStocks.find((s) => s.code === pos.code);
    if (cached && cached.price > 0) {
      pos._current_price = cached.price;
      continue;
    }
    // Fallback: backend stock endpoint
    try {
      const res = await fetch(`${getApiBase()}/stock?code=${pos.code}`);
      if (res.ok) {
        const d = await res.json();
        const price = d?.realtime?.price;
        if (price && price > 0) pos._current_price = price;
      }
    } catch {}
  }
  renderPortfolio();
}

addPosBtnEl?.addEventListener("click", () => {
  if (!isLoggedIn) { window.location.href = "auth.html"; return; }
  const isOpen = addPosFormEl.style.display !== "none";
  addPosFormEl.style.display = isOpen ? "none" : "";
  if (!isOpen) posCodeEl?.focus();
});

posCancelBtnEl?.addEventListener("click", () => {
  addPosFormEl.style.display = "none";
  if (posCodeEl) posCodeEl.value = "";
  if (posBuyPriceEl) posBuyPriceEl.value = "";
  if (posSharesEl) posSharesEl.value = "";
});

posSubmitBtnEl?.addEventListener("click", async () => {
  const code = posCodeEl?.value.trim();
  const buyPrice = parseFloat(posBuyPriceEl?.value);
  const shares = parseFloat(posSharesEl?.value || "0") || 0;

  if (!code || !/^\d{6}$/.test(code)) { alert("请输入正确的6位股票代码"); return; }
  if (isNaN(buyPrice) || buyPrice <= 0) { alert("请输入正确的买入价格"); return; }

  posSubmitBtnEl.disabled = true;
  posSubmitBtnEl.textContent = "添加中…";

  // Try to get stock name from allStocks first, then backend
  let name = allStocks.find((s) => s.code === code)?.name || "";
  if (!name) {
    try {
      const res = await fetch(`${getApiBase()}/stock?code=${code}`);
      if (res.ok) {
        const d = await res.json();
        name = d?.realtime?.name || code;
      } else { name = code; }
    } catch { name = code; }
  }

  const ok = await addPortfolioPosition(code, name, buyPrice, shares);
  if (ok) {
    if (posCodeEl) posCodeEl.value = "";
    if (posBuyPriceEl) posBuyPriceEl.value = "";
    if (posSharesEl) posSharesEl.value = "";
    addPosFormEl.style.display = "none";
    await loadPortfolio();
  } else {
    alert("添加失败，请重试");
  }
  posSubmitBtnEl.disabled = false;
  posSubmitBtnEl.textContent = "确认添加";
});

// Enter key in posCode moves to price
posCodeEl?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") posBuyPriceEl?.focus();
});
posBuyPriceEl?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") posSubmitBtnEl?.click();
});

// ── Left panel tab switching ──────────────────────────────────────────────────

document.querySelectorAll(".left-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".left-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const matrixView = document.getElementById("matrixView");
    const portfolioView = document.getElementById("portfolioView");
    if (tab.dataset.tab === "matrix") {
      matrixView.style.display = "";
      portfolioView.style.display = "none";
    } else {
      matrixView.style.display = "none";
      portfolioView.style.display = "flex";
      loadPortfolio();
    }
  });
});

// ── Chat ──────────────────────────────────────────────────────────────────────

let sending = false;
let currentAbortController = null;

const messagesEl = document.getElementById("messages");
const emptyStateEl = document.getElementById("emptyState");
const chatInputEl = document.getElementById("chatInput");
const sendBtnEl = document.getElementById("sendBtn");
const clearBtnEl = document.getElementById("clearBtn");
const abortBtnEl = document.getElementById("abortBtn");

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
  catch { return []; }
}

function saveHistory(h) { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); }

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function buildMsgEl(role, content, ts) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  const avatar = role === "assistant" ? "Sα" : "你";
  const label = role === "assistant" ? "AI 分析师" : "你";
  const bubbleContent = role === "assistant"
    ? renderMd(content)
    : `<div class="md-p">${content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`;
  div.innerHTML = `
    <div class="msg-avatar">${avatar}</div>
    <div class="msg-body">
      <div class="msg-meta"><span>${label}</span>${ts ? `<span>${fmtTime(ts)}</span>` : ""}</div>
      <div class="msg-bubble">${bubbleContent}</div>
    </div>`;
  return div;
}

function buildThinkingEl() {
  const div = document.createElement("div");
  div.className = "msg assistant thinking";
  div.innerHTML = `
    <div class="msg-avatar">Sα</div>
    <div class="msg-body">
      <div class="msg-meta"><span>AI 分析师</span></div>
      <div class="msg-bubble">
        <span style="color:var(--muted-2);font-style:italic;font-size:0.85rem">正在调用工具分析市场数据</span>
        <span class="thinking-dots"><span></span><span></span><span></span></span>
      </div>
    </div>`;
  return div;
}

function appendMsg(role, content, ts) {
  if (emptyStateEl) emptyStateEl.style.display = "none";
  const el = buildMsgEl(role, content, ts);
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

function renderMessages() {
  const history = getHistory();
  if (!history.length) { if (emptyStateEl) emptyStateEl.style.display = "flex"; return; }
  if (emptyStateEl) emptyStateEl.style.display = "none";
  messagesEl.querySelectorAll(".msg").forEach((el) => el.remove());
  history.forEach((item) => messagesEl.appendChild(buildMsgEl(item.role, item.content, item.ts)));
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setSending(active) {
  sending = active;
  sendBtnEl.disabled = active;
  if (abortBtnEl) {
    abortBtnEl.classList.toggle("visible", active);
  }
}

async function sendMessage(text) {
  if (sending || !text.trim()) return;
  setSending(true);

  const ts = Date.now();
  const userMsg = { role: "user", content: text, ts };
  const history = getHistory();
  history.push(userMsg);
  saveHistory(history);
  appendMsg("user", text, ts);
  saveMessageToServer(userMsg);

  const thinkEl = buildThinkingEl();
  if (emptyStateEl) emptyStateEl.style.display = "none";
  messagesEl.appendChild(thinkEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  // 150-second timeout with AbortController
  currentAbortController = new AbortController();
  const timeoutId = setTimeout(() => currentAbortController.abort(), 150000);

  // Streaming bubble placeholder (created once first token arrives)
  let streamBubble = null;
  let streamContent = "";
  const replyTs = Date.now();

  function getOrCreateBubble() {
    if (streamBubble) return streamBubble;
    thinkEl.remove();
    streamBubble = appendMsg("assistant", "", replyTs);
    return streamBubble;
  }

  function updateBubble(text) {
    streamContent += text;
    const el = getOrCreateBubble();
    const bubbleEl = el.querySelector(".msg-bubble");
    if (bubbleEl) bubbleEl.innerHTML = renderMd(streamContent);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  try {
    const apiBase = getApiBase();
    const response = await fetch(`${apiBase}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        message: text,
        history: history.slice(-12).map((h) => ({ role: h.role, content: h.content })),
        market_context: marketCtx || undefined,
      }),
      signal: currentAbortController.signal,
    });

    if (response.status === 401) {
      thinkEl.remove();
      window.location.href = "auth.html";
      return;
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || `HTTP ${response.status}`);
    }

    // Read SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        let evt;
        try { evt = JSON.parse(line.slice(6)); } catch { continue; }
        if (evt.type === "token") {
          updateBubble(evt.text);
        } else if (evt.type === "status") {
          // Update thinking bubble text to show what tool is running
          const statusEl = thinkEl.querySelector("span[style]");
          if (statusEl && !streamBubble) statusEl.textContent = evt.msg;
        } else if (evt.type === "done") {
          clearTimeout(timeoutId);
          const assistantMsg = { role: "assistant", content: streamContent, ts: replyTs };
          const updated = getHistory();
          updated.push(assistantMsg);
          saveHistory(updated);
          saveMessageToServer(assistantMsg);
        } else if (evt.type === "error") {
          throw new Error(evt.message || "服务器错误");
        }
      }
    }

    // If no token was received at all, remove think bubble
    if (!streamBubble) thinkEl.remove();

  } catch (err) {
    clearTimeout(timeoutId);
    if (streamBubble) {
      // Already showing partial content — append error note
      if (!streamContent) {
        const bubbleEl = streamBubble.querySelector(".msg-bubble");
        const isAbort = err.name === "AbortError";
        if (bubbleEl) bubbleEl.textContent = isAbort
          ? "请求超时（150秒）或已取消。请重试，或换用更快的模型（Haiku / GPT-4o Mini）。"
          : `请求失败：${err.message}`;
      }
    } else {
      thinkEl.remove();
      const isAbort = err.name === "AbortError";
      const errContent = isAbort
        ? "请求超时（150秒）或已取消。请重试，或换用更快的模型（Haiku / GPT-4o Mini）。"
        : `网络错误：${err.message}`;
      const errMsg = { role: "assistant", content: errContent, ts: Date.now() };
      const updated = getHistory();
      updated.push(errMsg);
      saveHistory(updated);
      appendMsg("assistant", errContent, errMsg.ts);
    }
  } finally {
    currentAbortController = null;
    setSending(false);
    chatInputEl.focus();
  }
}

// ── Input handling ────────────────────────────────────────────────────────────

function autoResize() {
  chatInputEl.style.height = "auto";
  chatInputEl.style.height = Math.min(chatInputEl.scrollHeight, 140) + "px";
}

chatInputEl.addEventListener("input", autoResize);

abortBtnEl?.addEventListener("click", () => {
  if (currentAbortController) currentAbortController.abort();
});

chatInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    const text = chatInputEl.value.trim();
    if (text) { chatInputEl.value = ""; autoResize(); sendMessage(text); }
  }
});

sendBtnEl.addEventListener("click", () => {
  const text = chatInputEl.value.trim();
  if (text) { chatInputEl.value = ""; autoResize(); sendMessage(text); }
});

clearBtnEl.addEventListener("click", () => {
  if (!getHistory().length || confirm("确定清空所有对话记录？")) {
    localStorage.removeItem(HISTORY_KEY);
    messagesEl.querySelectorAll(".msg").forEach((el) => el.remove());
    if (emptyStateEl) emptyStateEl.style.display = "flex";
    clearServerHistory();
  }
});

document.querySelectorAll(".suggestion-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const q = chip.dataset.q;
    if (q) sendMessage(q);
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  await checkAuth();

  if (isLoggedIn) {
    // Try to load history from server; fallback to localStorage
    const serverLoaded = await loadServerHistory();
    if (!serverLoaded) {
      // Sync any existing local history to server
      const localH = getHistory();
      if (localH.length > 0) {
        try {
          await fetch(`${getApiBase()}/user/history`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            body: JSON.stringify({ messages: localH }),
          });
        } catch {}
      }
    }
  }

  renderMessages();
  loadMarketBar();
  sendBtnEl.disabled = true;
  chatInputEl.placeholder = "正在加载全市场数据，请稍候…";
  initMatrix();
  chatInputEl.focus();
}

init();

setInterval(() => { fetch(`${getApiBase()}/ping`).catch(() => {}); }, 10 * 60 * 1000);

// ── Mobile panel toggle ────────────────────────────────────────────────────────

function switchMobilePanel(panel) {
  const shell = document.getElementById("mainShell");
  if (!shell) return;
  const btnChat = document.getElementById("mobileTabChat");
  const btnMatrix = document.getElementById("mobileTabMatrix");
  if (panel === "matrix") {
    shell.classList.add("show-matrix");
    if (btnMatrix) btnMatrix.classList.add("active");
    if (btnChat) btnChat.classList.remove("active");
  } else {
    shell.classList.remove("show-matrix");
    if (btnChat) btnChat.classList.add("active");
    if (btnMatrix) btnMatrix.classList.remove("active");
    chatInputEl.focus();
  }
}
