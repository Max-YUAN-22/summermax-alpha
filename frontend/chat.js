const DEFAULT_API_BASE = "https://summermax-alpha-api.onrender.com";
const EM_URL = "https://82.push2.eastmoney.com/api/qt/clist/get";
const HISTORY_KEY = "summermax-alpha-chat-history";

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

// If backend requires auth and we're not logged in, redirect
async function checkAuth() {
  const token = getToken();
  if (!token) return; // no token → server will 401 on /chat if REQUIRE_AUTH is on; let user try first

  // Validate token silently; if 401 clear and redirect
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

// ── Simple markdown renderer ─────────────────────────────────────────────────

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

// ── EastMoney fetch helper ───────────────────────────────────────────────────

async function emGet(params) {
  const url = new URL(EM_URL);
  const base = {
    np: "1", fltt: "2", invt: "2",
    ut: "bd1d9ddb04089700cf9c27f6f7426281",
  };
  Object.entries({ ...base, ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { "Referer": "https://quote.eastmoney.com/center/boardlist.html" },
  });
  const data = await res.json();
  return (data.data || {}).diff || [];
}

// ── Full A-share fetch (parallel pages) ─────────────────────────────────────

const ALL_STOCK_FS = [
  "m:0+t:6+f:!50",   // Shenzhen Main Board
  "m:0+t:13+f:!50",  // ChiNext 创业板
  "m:0+t:80+f:!50",  // SME 中小板 (legacy)
  "m:1+t:2+f:!50",   // Shanghai Main Board
  "m:1+t:23+f:!50",  // STAR 科创板
].join(",");

const STOCK_FIELDS = "f2,f3,f6,f8,f10,f11,f12,f14";

async function fetchAllStocks() {
  // Fetch 9 pages of 500 in parallel → up to 4500 stocks
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

// ── Smart selection of ~200 stocks to pass to AI ────────────────────────────

function selectForAI(stocks) {
  const tradeable = stocks.filter((s) => s.price > 0 && s.name);

  // Top 120 positive movers (not at limit)
  const gainers = [...tradeable]
    .filter((s) => s.change_percent > 0.5 && s.change_percent < 9.9)
    .sort((a, b) => b.change_percent - a.change_percent)
    .slice(0, 120);

  // Top 50 by amount (heavy money flow)
  const byAmount = [...tradeable]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 50);

  // Top 30 by turnover (high activity)
  const byTurnover = [...tradeable]
    .filter((s) => s.turnover_rate > 0)
    .sort((a, b) => b.turnover_rate - a.turnover_rate)
    .slice(0, 30);

  // Top 20 beaten-down (potential reversal candidates, position not high)
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

// ── Matrix UI ────────────────────────────────────────────────────────────────

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
      <a href="workspace.html?code=${s.code}" class="btn-analyze-sm">分析</a>
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
    allStocks = await fetchAllStocks();
    matrixLoadingEl.style.display = "none";
    renderMatrix();

    const aiStocks = selectForAI(allStocks);
    const aiCtx = buildAIStockContext(aiStocks);
    marketCtx = { ...marketCtx, top_movers: aiCtx, total_stocks: allStocks.length };

    aiContextNoteEl.textContent = `AI 已读取 ${allStocks.length} 只 · 精选 ${aiCtx.length} 只入上下文`;
  } catch (err) {
    matrixLoadingEl.innerHTML = `<div>加载失败：${err.message}<br><button onclick="initMatrix()" style="margin-top:10px;padding:6px 14px;border-radius:7px;border:1px solid rgba(102,209,255,0.22);background:rgba(102,209,255,0.08);color:var(--accent);cursor:pointer;font-size:0.78rem">重试</button></div>`;
  }
}

function buildAIStockContext(stocks) {
  return stocks.map((s) => ({
    code: s.code,
    name: s.name,
    price: s.price,
    change_percent: s.change_percent,
    amount: s.amount,
    turnover_rate: s.turnover_rate,
    vol_ratio: s.vol_ratio,
  }));
}

// Sort tab events
document.querySelectorAll(".sort-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sort-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentSort = btn.dataset.sort;
    renderMatrix();
  });
});

// Search
stockSearchEl.addEventListener("input", () => {
  searchQuery = stockSearchEl.value.trim();
  renderMatrix();
});

// ── Market bar (indices + sectors) ──────────────────────────────────────────

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
  } catch { /* ignore */ }

  try {
    const diffs = await emGet({
      fid: "f3", pn: "1", pz: "10", po: "1",
      fs: "m:90 t:2 f:!50", fields: "f3,f12,f14",
    });
    hotSectors = [...diffs]
      .sort((a, b) => (Number(b.f3) || 0) - (Number(a.f3) || 0))
      .slice(0, 5)
      .map((item) => ({ name: String(item.f14 || ""), change_percent: Number(item.f3) || 0 }));
  } catch { /* ignore */ }

  marketCtx = { indices, hot_sectors: hotSectors, generated_at: new Date().toLocaleString("zh-CN") };

  if (!indices.length && !hotSectors.length) {
    marketBarEl.innerHTML = `<span class="mkt-loading">市场数据暂不可用（非交易时段）</span>`;
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

// ── Chat ─────────────────────────────────────────────────────────────────────

let sending = false;

const messagesEl = document.getElementById("messages");
const emptyStateEl = document.getElementById("emptyState");
const chatInputEl = document.getElementById("chatInput");
const sendBtnEl = document.getElementById("sendBtn");
const clearBtnEl = document.getElementById("clearBtn");

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

async function sendMessage(text) {
  if (sending || !text.trim()) return;
  sending = true;
  sendBtnEl.disabled = true;

  const ts = Date.now();
  const history = getHistory();
  history.push({ role: "user", content: text, ts });
  saveHistory(history);
  appendMsg("user", text, ts);

  const thinkEl = appendMsg("assistant", "正在分析全市场数据…", null);
  thinkEl.classList.add("thinking");

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
    });
    const data = await response.json();
    if (response.status === 401) {
      thinkEl.remove();
      window.location.href = "auth.html";
      return;
    }
    const reply = response.ok ? (data.content || "无法获取回复") : (data.detail || "请求失败");
    thinkEl.remove();
    const replyTs = Date.now();
    const updated = getHistory();
    updated.push({ role: "assistant", content: reply, ts: replyTs });
    saveHistory(updated);
    appendMsg("assistant", reply, replyTs);
  } catch {
    thinkEl.remove();
    const updated = getHistory();
    updated.push({ role: "assistant", content: "网络错误，请检查连接后重试。", ts: Date.now() });
    saveHistory(updated);
    appendMsg("assistant", "网络错误，请检查连接后重试。", Date.now());
  } finally {
    sending = false;
    sendBtnEl.disabled = false;
    chatInputEl.focus();
  }
}

// ── Input handling ────────────────────────────────────────────────────────────

function autoResize() {
  chatInputEl.style.height = "auto";
  chatInputEl.style.height = Math.min(chatInputEl.scrollHeight, 140) + "px";
}

chatInputEl.addEventListener("input", autoResize);

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
  }
});

document.querySelectorAll(".suggestion-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const q = chip.dataset.q;
    if (q) sendMessage(q);
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────

checkAuth();
renderMessages();
loadMarketBar();
initMatrix();
chatInputEl.focus();
