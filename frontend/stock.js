const DEFAULT_API_BASE = `${window.location.origin}`;

function getApiBase() {
  const saved = localStorage.getItem("summermax-alpha-api-base");
  const preferred = location.hostname.includes("onrender.com") ? DEFAULT_API_BASE : (saved || DEFAULT_API_BASE);
  return preferred.trim().replace(/\/+$/, "");
}

function getToken() {
  return localStorage.getItem("summermax-token") || "";
}

function getAuthHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── URL param ─────────────────────────────────────────────────────────────────

const params = new URLSearchParams(location.search);
const CODE = (params.get("code") || "").replace(/\D/g, "").padStart(6, "0").slice(0, 6);

if (!CODE || CODE === "000000") {
  document.body.innerHTML = `<div style="padding:60px;text-align:center;color:#8ea3bd">无效的股票代码，请从市场扫描页进入。<br><a href="/scan" style="color:#66d1ff">返回市场扫描</a></div>`;
  throw new Error("No valid stock code");
}

// ── Fetch with cold-start retry ───────────────────────────────────────────────

async function fetchWithRetry(url, opts = {}, retries = 2, delayMs = 8000) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function checkAuth() {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(`${getApiBase()}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      localStorage.removeItem("summermax-token");
    } else if (res.ok) {
      const data = await res.json();
      renderUserBadge(data.email, data.role);
    }
  } catch {}
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
    window.location.href = "/auth";
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

function fmtN(v, d = 2) {
  const n = Number(v);
  return Number.isNaN(n) ? "--" : n.toFixed(d);
}

// ── HiDPI canvas helper ───────────────────────────────────────────────────────

function setupCanvas(canvas, cssW, cssH) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  return ctx;
}

// ── K-line chart ──────────────────────────────────────────────────────────────

function drawKline(canvas, volCanvas, bars) {
  const W = canvas.parentElement.clientWidth - 24;
  const KH = 260, VH = 80;
  const ctx = setupCanvas(canvas, W, KH);
  const vCtx = setupCanvas(volCanvas, W, VH);

  const PAD = { top: 20, right: 12, bottom: 28, left: 52 };
  const VP  = { top: 6, right: 12, bottom: 20, left: 52 };

  const n = Math.min(bars.length, 90);
  const slice = bars.slice(bars.length - n);

  const highs  = slice.map(b => b.high);
  const lows   = slice.map(b => b.low);
  const vols   = slice.map(b => b.volume || 0);
  const priceH = Math.max(...highs);
  const priceL = Math.min(...lows);
  const pRange = priceH - priceL || priceH * 0.01;
  const volMax = Math.max(...vols) || 1;

  const chartW = W - PAD.left - PAD.right;
  const chartH = KH - PAD.top - PAD.bottom;
  const vChartH = VH - VP.top - VP.bottom;

  function xPos(i) { return PAD.left + (i + 0.5) * (chartW / n); }
  function yPrice(p) { return PAD.top + (1 - (p - priceL) / pRange) * chartH; }
  function yVol(v) { return VP.top + (1 - v / volMax) * vChartH; }

  // ── Price chart ──

  // Grid lines + price labels
  ctx.strokeStyle = "rgba(132,157,189,0.1)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "rgba(132,157,189,0.45)";
  ctx.font = "10px 'PingFang SC',sans-serif";
  ctx.textAlign = "right";
  for (let g = 0; g <= 4; g++) {
    const p = priceL + (pRange * g / 4);
    const y = yPrice(p);
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
    ctx.fillText(p.toFixed(2), PAD.left - 4, y + 3.5);
  }

  // Date labels (every ~15 bars)
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(132,157,189,0.4)";
  const step = Math.max(1, Math.floor(n / 6));
  for (let i = 0; i < n; i += step) {
    const b = slice[i];
    const dateStr = b.date ? String(b.date).slice(5) : "";
    if (dateStr) ctx.fillText(dateStr, xPos(i), KH - 6);
  }

  // MA lines
  function drawMa(arr, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.beginPath();
    let started = false;
    arr.forEach((v, i) => {
      if (v == null) return;
      const x = xPos(i), y = yPrice(v);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  const ma5 = computeMA(slice.map(b => b.close), 5);
  const ma20 = computeMA(slice.map(b => b.close), 20);
  drawMa(ma5, "rgba(255,195,50,0.8)");
  drawMa(ma20, "rgba(166,107,250,0.8)");

  // Candles
  const barW = Math.max(2, (chartW / n) * 0.65);
  slice.forEach((b, i) => {
    const isUp = b.close >= b.open;
    const color = isUp ? "#2ed09a" : "#ff6b7e";
    const x = xPos(i);
    const openY = yPrice(b.open);
    const closeY = yPrice(b.close);
    const highY = yPrice(b.high);
    const lowY = yPrice(b.low);

    // Wick
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, highY); ctx.lineTo(x, lowY); ctx.stroke();

    // Body
    const bodyTop = Math.min(openY, closeY);
    const bodyH = Math.max(1, Math.abs(openY - closeY));
    ctx.fillStyle = isUp ? "rgba(46,208,154,0.85)" : "rgba(255,107,126,0.85)";
    ctx.fillRect(x - barW / 2, bodyTop, barW, bodyH);
  });

  // ── Volume chart ──
  slice.forEach((b, i) => {
    const isUp = b.close >= b.open;
    vCtx.fillStyle = isUp ? "rgba(46,208,154,0.6)" : "rgba(255,107,126,0.5)";
    const x = xPos(i);
    const y = yVol(b.volume || 0);
    const bh = vChartH - (y - VP.top);
    vCtx.fillRect(x - barW / 2, y, barW, bh > 0 ? bh : 1);
  });

  // Vol grid
  vCtx.strokeStyle = "rgba(132,157,189,0.08)";
  vCtx.lineWidth = 1;
  for (let g = 0; g <= 2; g++) {
    const y = VP.top + (vChartH * g / 2);
    vCtx.beginPath(); vCtx.moveTo(VP.left, y); vCtx.lineTo(W - VP.right, y); vCtx.stroke();
  }

  // Vol label
  vCtx.fillStyle = "rgba(132,157,189,0.35)";
  vCtx.font = "9px 'PingFang SC',sans-serif";
  vCtx.textAlign = "left";
  vCtx.fillText("VOL", 4, VP.top + 10);

  // MA legend
  ctx.font = "10px 'PingFang SC',sans-serif"; ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,195,50,0.85)"; ctx.fillText("MA5", PAD.left + 4, 14);
  ctx.fillStyle = "rgba(166,107,250,0.85)"; ctx.fillText("MA20", PAD.left + 36, 14);
}

function computeMA(closes, period) {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    const sum = closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    return sum / period;
  });
}

// ── Capital flow chart ────────────────────────────────────────────────────────

function drawFlowChart(canvas, series) {
  const W = canvas.parentElement.clientWidth - 24;
  const H = 180;
  const ctx = setupCanvas(canvas, W, H);

  const PAD = { top: 16, right: 16, bottom: 24, left: 60 };
  const n = series.length;
  if (!n) return;

  const flows = series.map(s => s.main_net_inflow || 0);
  const closes = series.map(s => s.close || 0);
  const absMax = Math.max(...flows.map(Math.abs), 1);
  const closeMin = Math.min(...closes.filter(Boolean)) * 0.995;
  const closeMax = Math.max(...closes.filter(Boolean)) * 1.005;
  const closeRange = closeMax - closeMin || closeMax * 0.01;

  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const midY = PAD.top + chartH / 2;

  function xPos(i) { return PAD.left + (i + 0.5) * (chartW / n); }
  function yFlow(v) { return midY - (v / absMax) * (chartH / 2) * 0.92; }
  function yClose(v) { return PAD.top + (1 - (v - closeMin) / closeRange) * chartH; }

  // Grid
  ctx.strokeStyle = "rgba(132,157,189,0.09)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD.left, midY); ctx.lineTo(W - PAD.right, midY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(PAD.left, PAD.top); ctx.lineTo(W - PAD.right, PAD.top); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(PAD.left, H - PAD.bottom); ctx.lineTo(W - PAD.right, H - PAD.bottom); ctx.stroke();

  // Amount labels
  const fmt = v => v >= 1e8 ? `${(v/1e8).toFixed(1)}亿` : v >= 1e4 ? `${(v/1e4).toFixed(0)}万` : String(v);
  ctx.fillStyle = "rgba(132,157,189,0.38)"; ctx.font = "9px sans-serif"; ctx.textAlign = "right";
  ctx.fillText("+" + fmt(absMax), PAD.left - 3, PAD.top + 9);
  ctx.fillText("-" + fmt(absMax), PAD.left - 3, H - PAD.bottom - 2);

  // Flow bars
  const barW = Math.max(4, (chartW / n) * 0.55);
  flows.forEach((v, i) => {
    const x = xPos(i);
    const barH = Math.abs(yFlow(v) - midY);
    const top = v >= 0 ? midY - barH : midY;
    ctx.fillStyle = v >= 0 ? "rgba(46,208,154,0.75)" : "rgba(255,107,126,0.7)";
    ctx.fillRect(x - barW / 2, top, barW, barH || 1);
  });

  // Close price line
  const validCloses = closes.filter(Boolean);
  if (validCloses.length) {
    ctx.strokeStyle = "rgba(102,209,255,0.7)"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    closes.forEach((v, i) => {
      if (!v) return;
      const x = xPos(i), y = yClose(v);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // Date labels
  ctx.fillStyle = "rgba(132,157,189,0.38)"; ctx.font = "9px sans-serif"; ctx.textAlign = "center";
  series.forEach((s, i) => {
    if (i === 0 || i === n - 1 || i === Math.floor(n / 2)) {
      ctx.fillText(String(s.date).slice(5), xPos(i), H - 5);
    }
  });
}

// ── Render hero ───────────────────────────────────────────────────────────────

function renderHero(snap, code) {
  const rt = snap.realtime || {};
  const price = rt.price;
  const chg = rt.change_percent;
  const cls = chgClass(chg);

  document.title = `${rt.name || code} · SummerMax Alpha`;
  document.getElementById("heroCode").textContent = code;
  document.getElementById("heroName").textContent = rt.name || code;

  const priceEl = document.getElementById("heroPrice");
  priceEl.textContent = price != null ? Number(price).toFixed(2) : "--";
  priceEl.className = `hero-price ${cls}`;

  const chgEl = document.getElementById("heroChg");
  chgEl.textContent = chgText(chg);
  chgEl.className = `hero-chg ${cls}`;

  const metaEl = document.getElementById("heroMeta");
  const metaItems = [
    { label: "今开", val: fmtN(rt.open) },
    { label: "最高", val: fmtN(rt.high) },
    { label: "最低", val: fmtN(rt.low) },
    { label: "昨收", val: fmtN(rt.pre_close) },
    { label: "成交额", val: fmtAmt(rt.amount) },
    { label: "换手率", val: rt.turnover_rate != null ? fmtN(rt.turnover_rate) + "%" : "--" },
    { label: "PE(动态)", val: rt.pe_ratio != null ? fmtN(rt.pe_ratio, 1) : "--" },
    { label: "市净率", val: rt.pb_ratio != null ? fmtN(rt.pb_ratio, 2) : "--" },
  ];
  metaEl.innerHTML = metaItems.map(it => `
    <div class="hero-stat">
      <span class="hero-stat-label">${it.label}</span>
      <span class="hero-stat-val">${it.val}</span>
    </div>`).join("");

  // Score
  const sc = snap.scorecard || {};
  const score = sc.total != null ? Number(sc.total).toFixed(1) : "--";
  document.getElementById("heroScore").textContent = score;

  // Animate score ring (scorecard.total is 0-100)
  if (sc.total != null) {
    const pct = Math.min(1, sc.total / 100);
    const circ = 226;
    const offset = circ - circ * pct;
    setTimeout(() => {
      const arc = document.getElementById("scoreArc");
      const color = pct >= 0.7 ? "#2ed09a" : pct >= 0.45 ? "#f5c26b" : "#ff6b7e";
      if (arc) { arc.style.strokeDashoffset = offset; arc.style.stroke = color; }
      const txt = document.getElementById("scoreRingText");
      if (txt) txt.textContent = score;
    }, 300);
  }

  // Decision badge
  const fd = snap.final_decision || {};
  const decEl = document.getElementById("heroDecision");
  const bias = fd.bias || "";
  const biasMap = {
    bullish_watch: { label: "看多观察", cls: "bull" },
    strong_buy: { label: "强烈看多", cls: "bull" },
    neutral: { label: "中性观望", cls: "neutral" },
    cautious: { label: "谨慎", cls: "neutral" },
    reduce_risk: { label: "规避风险", cls: "bear" },
    bearish: { label: "偏空", cls: "bear" },
  };
  const mapped = biasMap[bias] || { label: bias || "评估中", cls: "neutral" };
  decEl.textContent = mapped.label;
  decEl.className = `hero-decision ${mapped.cls}`;
}

// ── Render signal grid ────────────────────────────────────────────────────────

function renderSignals(snap) {
  const ind = snap.indicators || {};
  const rt = snap.realtime || {};
  const analysis = snap.technical_analysis || snap.analysis || {};

  const signals = [
    {
      name: "RSI14",
      val: fmtN(ind.rsi14),
      sub: ind.rsi14 != null ? (ind.rsi14 > 70 ? "超买区" : ind.rsi14 < 30 ? "超卖区" : "正常区间") : "--",
      cls: ind.rsi14 > 70 ? "bear" : ind.rsi14 < 30 ? "bull" : "neutral",
    },
    {
      name: "MACD 柱",
      val: fmtN(ind.macd_hist, 4),
      sub: ind.macd_hist > 0 ? "红柱 · 多头" : ind.macd_hist < 0 ? "绿柱 · 空头" : "--",
      cls: ind.macd_hist > 0 ? "bull" : ind.macd_hist < 0 ? "bear" : "neutral",
    },
    {
      name: "KDJ J值",
      val: fmtN(ind.kdj_j),
      sub: ind.kdj_j != null ? (ind.kdj_j > 80 ? "顶背离风险" : ind.kdj_j < 20 ? "超跌反弹" : "运行中") : "--",
      cls: ind.kdj_j > 80 ? "bear" : ind.kdj_j < 20 ? "bull" : "neutral",
    },
    {
      name: "MA趋势",
      val: (ind.ma5 && ind.ma20) ? (ind.ma5 > ind.ma20 ? "MA5>MA20" : "MA5<MA20") : "--",
      sub: (ind.ma5 && ind.ma20) ? (ind.ma5 > ind.ma20 ? "均线多头排列" : "均线空头排列") : "--",
      cls: (ind.ma5 && ind.ma20) ? (ind.ma5 > ind.ma20 ? "bull" : "bear") : "neutral",
    },
    {
      name: "量比",
      val: fmtN(ind.volume_ratio),
      sub: ind.volume_ratio != null ? (ind.volume_ratio >= 2 ? "放量" : ind.volume_ratio >= 1.2 ? "温和放量" : "缩量") : "--",
      cls: ind.volume_ratio >= 1.5 ? "bull" : "neutral",
    },
    {
      name: "综合评分",
      val: snap.scorecard?.total_score != null ? Number(snap.scorecard.total_score).toFixed(1) + " / 10" : "--",
      sub: analysis.summary ? analysis.summary.slice(0, 20) + "…" : "--",
      cls: (snap.scorecard?.total || 0) >= 70 ? "bull" : (snap.scorecard?.total || 0) >= 40 ? "neutral" : "bear",
    },
  ];

  document.getElementById("signalGrid").innerHTML = signals.map(s => `
    <div class="signal-item ${s.cls}">
      <span class="signal-name">${s.name}</span>
      <span class="signal-val ${s.cls === "bull" ? "up" : s.cls === "bear" ? "down" : ""}">${s.val}</span>
      <span class="signal-label" style="color:var(--muted-2)">${s.sub}</span>
    </div>
  `).join("");
}

// ── Render indicators sidebar ─────────────────────────────────────────────────

function renderIndicators(snap) {
  const ind = snap.indicators || {};
  const rows = [
    { key: "MA5", val: fmtN(ind.ma5) },
    { key: "MA20", val: fmtN(ind.ma20) },
    { key: "MA55", val: fmtN(ind.ma55) },
    { key: "RSI14", val: fmtN(ind.rsi14) },
    { key: "MACD DIF", val: fmtN(ind.macd_diff, 4) },
    { key: "MACD DEA", val: fmtN(ind.macd_dea, 4) },
    { key: "KDJ K", val: fmtN(ind.kdj_k) },
    { key: "KDJ D", val: fmtN(ind.kdj_d) },
    { key: "KDJ J", val: fmtN(ind.kdj_j) },
  ];
  document.getElementById("indTable").innerHTML = rows.map(r => `
    <div class="ind-row">
      <span class="ind-key">${r.key}</span>
      <span class="ind-val">${r.val}</span>
    </div>`).join("");

  const risk = snap.risk_assessment || {};
  const riskRows = [
    { key: "风险等级", val: risk.level || "--" },
    { key: "持仓建议", val: risk.position_suggestion || "--" },
  ];
  document.getElementById("riskTable").innerHTML = riskRows.map(r => `
    <div class="ind-row">
      <span class="ind-key">${r.key}</span>
      <span class="ind-val" style="font-size:0.75rem;color:var(--muted)">${r.val}</span>
    </div>`).join("");
}

// ── Load K-line chart data ────────────────────────────────────────────────────

let currentPeriod = "daily";
let chartDataCache = {};

async function loadChart(period) {
  currentPeriod = period;
  const kCanvas = document.getElementById("klineCanvas");
  const vCanvas = document.getElementById("volumeCanvas");
  const loadingEl = document.getElementById("chartLoading");

  loadingEl.style.display = "flex";
  loadingEl.textContent = "正在加载K线数据…";
  kCanvas.style.display = "none";
  vCanvas.style.display = "none";

  if (chartDataCache[period]) {
    renderChart(chartDataCache[period], period);
    return;
  }

  try {
    const res = await fetchWithRetry(`${getApiBase()}/chart/multiperiod?code=${CODE}&period=${period}`);
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const d = await res.json(); detail = d.detail || detail; } catch {}
      throw new Error(detail);
    }
    const data = await res.json();
    chartDataCache[period] = data;
    renderChart(data, period);
  } catch (err) {
    const msg = String(err.message || err).slice(0, 120);
    loadingEl.textContent = `K线加载失败: ${msg}`;
  }
}

function renderChart(data, period) {
  const kCanvas = document.getElementById("klineCanvas");
  const vCanvas = document.getElementById("volumeCanvas");
  const loadingEl = document.getElementById("chartLoading");

  const bars = data.chart?.series || data.bars || [];
  if (!bars.length) {
    loadingEl.textContent = "暂无K线数据";
    return;
  }

  loadingEl.style.display = "none";
  kCanvas.style.display = "block";
  vCanvas.style.display = "block";

  drawKline(kCanvas, vCanvas, bars);
}

// ── Load capital flow ─────────────────────────────────────────────────────────

async function loadCapitalFlow() {
  const flowCanvas = document.getElementById("flowCanvas");
  const flowLoading = document.getElementById("flowLoading");

  try {
    const res = await fetchWithRetry(`${getApiBase()}/fund-flow/stock?code=${CODE}`);
    const data = await res.json();
    const series = data.series || [];
    if (!series.length) {
      flowLoading.textContent = "暂无资金流向数据";
      return;
    }
    flowLoading.style.display = "none";
    flowCanvas.style.display = "block";
    drawFlowChart(flowCanvas, series);
  } catch (err) {
    flowLoading.textContent = `资金数据加载失败: ${err.message}`;
  }
}

// ── AI report ─────────────────────────────────────────────────────────────────

const aiBtn = document.getElementById("aiReportBtn");
const aiContent = document.getElementById("aiReportContent");

aiBtn.addEventListener("click", async () => {
  if (aiContent.classList.contains("visible")) {
    aiContent.classList.remove("visible");
    aiBtn.textContent = "生成 AI 分析报告";
    return;
  }
  aiBtn.disabled = true;
  aiBtn.textContent = "AI 分析中…";
  aiContent.innerHTML = '<span style="color:var(--muted-2);font-style:italic">正在调用 AI 深度分析…</span>';
  aiContent.classList.add("visible");

  try {
    const res = await fetch(
      `${getApiBase()}/assistant/chat?code=${CODE}&question=请对这只股票做完整的短中线分析：当前趋势判断、关键支撑阻力位、近期操作建议（买入价区间、目标价、止损位），以及主要风险提示。`,
      { headers: getAuthHeaders() }
    );
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.detail || res.statusText);
    }
    const data = await res.json();
    aiContent.innerHTML = renderMd(data.content || data.reply || "AI 未返回内容");
  } catch (err) {
    aiContent.innerHTML = `<span style="color:var(--bear)">AI 报告生成失败：${err.message}</span>`;
  } finally {
    aiBtn.disabled = false;
    aiBtn.textContent = "关闭报告";
  }
});

// ── Simple markdown renderer (reused from chat.js) ───────────────────────────

function renderMd(raw) {
  const esc = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = esc.split("\n");
  const out = [];
  let listOpen = false;
  const inline = s => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  for (const line of lines) {
    const tr = line.trim();
    const isList = /^[-•*] /.test(tr) || /^\d+\. /.test(tr);
    if (!isList && listOpen) { out.push("</div>"); listOpen = false; }
    if (/^-{3,}$/.test(tr)) { out.push('<div style="height:1px;background:rgba(132,157,189,0.15);margin:6px 0"></div>'); continue; }
    if (/^#{1,3} /.test(tr)) { out.push(`<div style="font-weight:700;color:var(--accent);margin:8px 0 3px">${inline(tr.replace(/^#{1,3} /,""))}</div>`); continue; }
    if (isList) {
      if (!listOpen) { out.push('<div style="padding-left:4px;margin:4px 0">'); listOpen = true; }
      out.push(`<div style="padding-left:11px;position:relative;margin:2px 0"><span style="position:absolute;left:2px;color:var(--accent);font-weight:900">·</span>${inline(tr.replace(/^[-•*\d.]+ +/,""))}</div>`);
      continue;
    }
    if (!tr) { out.push('<div style="height:5px"></div>'); continue; }
    out.push(`<div style="margin:2px 0">${inline(tr)}</div>`);
  }
  if (listOpen) out.push("</div>");
  return out.join("");
}

// ── Chart tab switching ───────────────────────────────────────────────────────

document.querySelectorAll(".chart-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".chart-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    loadChart(btn.dataset.period);
  });
});

// Re-draw on resize
window.addEventListener("resize", () => {
  if (chartDataCache[currentPeriod]) renderChart(chartDataCache[currentPeriod], currentPeriod);
});

// ── Update nav links with code ────────────────────────────────────────────────

document.getElementById("workspaceLink").href = `workspace.html?code=${CODE}`;
document.getElementById("chatLink").href = `chat.html`;
const backBtn = document.getElementById("backBtn");
const ref = document.referrer;
if (ref && ref.includes("scan.html")) backBtn.href = "scan.html";
else if (ref && ref.includes("chat.html")) backBtn.href = "chat.html";
else backBtn.href = "scan.html";

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  checkAuth();

  document.getElementById("heroName").textContent = "连接服务器中…";

  let snap = null;
  try {
    const res = await fetchWithRetry(`${getApiBase()}/stock?code=${CODE}`);
    snap = await res.json();
  } catch (err) {
    document.getElementById("heroName").textContent = "加载失败（服务器冷启动，请刷新重试）";
    document.getElementById("heroName").style.fontSize = "0.9rem";
    document.getElementById("heroName").style.color = "var(--muted-2)";
  }

  if (snap) {
    renderHero(snap, CODE);
    renderSignals(snap);
    renderIndicators(snap);
  }

  // Load chart and capital flow in parallel (non-blocking)
  loadChart("daily");
  loadCapitalFlow();
}

init();
