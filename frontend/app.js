const DEFAULT_API_BASE = "https://summermax-alpha-api.onrender.com";

const apiBaseInput = document.getElementById("apiBase");
const stockCodeInput = document.getElementById("stockCode");
const useLlmInput = document.getElementById("useLlm");
const analyzeBtn = document.getElementById("analyzeBtn");
const statusEl = document.getElementById("status");
const setupNoteEl = document.getElementById("setupNote");
const realtimeMetricsEl = document.getElementById("realtimeMetrics");
const indicatorMetricsEl = document.getElementById("indicatorMetrics");
const analysisOutputEl = document.getElementById("analysisOutput");
const signalsOutputEl = document.getElementById("signalsOutput");
const llmOutputEl = document.getElementById("llmOutput");
const closeSignalOutputEl = document.getElementById("closeSignalOutput");
const stockSearchResultsEl = document.getElementById("stockSearchResults");
const priceChartEl = document.getElementById("priceChart");
const heroDirectionEl = document.getElementById("heroDirection");
const heroConfidenceEl = document.getElementById("heroConfidence");
const heroTimeframeEl = document.getElementById("heroTimeframe");
const heroScoreEl = document.getElementById("heroScore");
const heroDecisionTagEl = document.getElementById("heroDecisionTag");
const langZhBtn = document.getElementById("langZh");
const langEnBtn = document.getElementById("langEn");
const quicklistGainersEl = document.getElementById("quicklistGainers");
const quicklistLosersEl = document.getElementById("quicklistLosers");
const quicklistActiveEl = document.getElementById("quicklistActive");
const quicklistCapsEl = document.getElementById("quicklistCaps");
const chartMetaLeftEl = document.getElementById("chartMetaLeft");
const chartMetaRightEl = document.getElementById("chartMetaRight");
const periodDailyBtn = document.getElementById("periodDaily");
const period60Btn = document.getElementById("period60");
const period15Btn = document.getElementById("period15");
const fundFlowMetricsEl = document.getElementById("fundFlowMetrics");
const fundFlowSignalsEl = document.getElementById("fundFlowSignals");
const assistantLogEl = document.getElementById("assistantLog");
const assistantQuestionEl = document.getElementById("assistantQuestion");
const assistantAskBtn = document.getElementById("assistantAskBtn");
const addWatchBtn = document.getElementById("addWatchBtn");
const refreshWatchlistBtn = document.getElementById("refreshWatchlistBtn");
const toggleWatchlistAutoBtn = document.getElementById("toggleWatchlistAutoBtn");
const watchlistGridEl = document.getElementById("watchlistGrid");
const watchlistMetaEl = document.getElementById("watchlistMeta");
const centerCodeEl = document.getElementById("centerCode");
const centerNameEl = document.getElementById("centerName");
const centerPriceEl = document.getElementById("centerPrice");
const centerChangeEl = document.getElementById("centerChange");
const gptStatusDotEl = document.getElementById("gptStatusDot");
const gptStatusLabelEl = document.getElementById("gptStatusLabel");

const I18N = {
  zh: {
    brandTitle: "SummerMax Alpha Terminal",
    brandSubtitle: "实时股票预测分析台，面向 A 股研究与 GPT 5.5 结构化判断。",
    heroTitle: "做实时判断，不做花哨堆砌。",
    heroText: "这个界面把信息重组为三层：先看方向和风险，再看技术和盘中结构，最后再看 GPT 5.5 的结构化解释。目标不是“看起来很 AI”，而是更接近专业分析工作台。",
    badge1: "实时行情",
    badge2: "盘中上下文",
    badge3: "评分卡",
    badge4: "GPT 5.5 分析",
    miniApiLabel: "GPT API 设置位置",
    miniApiValue: "后端环境变量",
    miniKeysLabel: "必填",
    miniOptionalLabel: "可选",
    navHome: "首页",
    navWorkspace: "工作台",
    navScan: "扫描",
    navDebug: "调试台",
    gptStatusChecking: "GPT 检测中…",
    gptStatusOk: "GPT-5.5 已就绪",
    gptStatusErr: "GPT 不可用",
    controlTitle: "查股票",
    controlText: "输入股票代码或公司名称，支持全部 A 股搜索。",
    stockCodeLabel: "股票代码或名称",
    apiBaseLabel: "后端 API 地址",
    gptToggleTitle: "启用 GPT 分析",
    gptToggleText: "需要后端已配置 API Key。",
    analyzeBtn: "开始分析",
    addWatchBtn: "加入关注",
    openDebugBtn: "查看原始数据",
    advancedLabel: "高级设置",
    setupTitle: "无法分析？",
    setupText: "后端服务可能正在唤醒（免费版首次访问约需 30 秒），稍候再试即可。",
    overviewTitle: "分析总览",
    overviewText: "先看方向、评分和风险，再决定要不要继续细读。",
    overviewDirection: "方向",
    overviewConfidence: "置信度",
    overviewTimeframe: "时间框架",
    overviewScore: "综合评分",
    overviewDecision: "决策偏向",
    riskTitle: "风险与盘中结构",
    riskText: "风险等级、盘中趋势、最后一根 bar 时间都在这里。",
    quoteTitle: "实时行情",
    quoteText: "实时价格、涨跌、开高低与成交额。",
    techTitle: "技术指标",
    techText: "日线均线、RSI、成交量基线。",
    ruleTitle: "规则引擎",
    ruleText: "给你一个不依赖 GPT 的基础判断层。",
    gptTitle: "GPT 5.5 结构化分析",
    gptText: "不是只给一段话，而是方向、时间框架、关键位、催化与风险。",
    chartTitle: "价格走势主图",
    chartText: "把历史走势放到中心区域，先看趋势，再看 AI 解释。",
    legendClose: "收盘价",
    legendMa5: "MA5",
    legendMa20: "MA20",
    chartMetaLeft: "K线 + MA5 + MA20 + 成交量",
    chartMetaRight: "近 60 个交易日",
    periodDaily: "日线",
    period60: "60 分钟",
    period15: "15 分钟",
    watchlistTitle: "关注股票监控",
    watchlistText: "对你关注的股票做批量刷新和实时跟踪，点卡片即可切换到单股分析。",
    watchlistRefreshBtn: "刷新关注列表",
    watchlistAutoBtn: "开启自动刷新",
    watchlistAutoStopBtn: "关闭自动刷新",
    watchlistEmpty: "还没有关注股票。先分析一只股票，再点“加入关注列表”。",
    watchlistTracked: "已关注",
    watchlistRefreshing: "关注列表刷新中...",
    watchlistRemoved: "移除",
    watchPrice: "现价",
    watchChange: "涨跌",
    watchScore: "评分",
    watchBias: "偏向",
    watchRisk: "风险",
    quicklistsTitle: "市场快速选股",
    quicklistsText: "不需要先记代码。直接从强势、弱势、活跃和大市值列表里点选开始分析。",
    quicklistGainers: "涨幅榜",
    quicklistLosers: "跌幅榜",
    quicklistActive: "活跃成交",
    quicklistCaps: "大市值",
    quickAmount: "成交额",
    quickMcap: "市值",
    fundFlowTitle: "资金流与主力净流入",
    fundFlowText: "看主力、超大单、大单资金方向，避免只看价格不看资金。",
    mainNetInflow: "主力净流入",
    mainNetRatio: "主力净占比",
    superNetInflow: "超大单净流入",
    largeNetInflow: "大单净流入",
    mediumNetInflow: "中单净流入",
    smallNetInflow: "小单净流入",
    assistantTitle: "AI 助手追问",
    assistantText: "围绕当前股票继续追问，不需要每次重新组织上下文。",
    assistantAskBtn: "继续追问",
    assistantPlaceholder: "直接问：我看好比亚迪，应该买吗？系统会自动抓取实时数据。",
    assistantEmpty: "还没有追问记录。",
    assistantYou: "你",
    assistantModel: "AI 助手",
    assistantLoading: "AI 助手正在思考...",
    noDecision: "还没有决策结果。",
    noAnalysis: "还没有分析结果。",
    gptDisabled: "GPT 分析当前未启用。",
    invalidCode: "请输入合法的 6 位 A 股股票代码。",
    missingApi: "请先填写后端 API 地址。",
    loading: "正在加载实时行情与分析...",
    gptLoading: "正在等待 GPT 5.5 分析...",
    unknownError: "请求失败。",
    quoteLoadedButAnalysisFailed: "实时行情已获取，但分析失败：",
    loadedPrefix: "已加载",
    at: "时间",
    metricPrice: "现价",
    metricChange: "涨跌幅",
    metricOpen: "今开",
    metricPreClose: "昨收",
    metricHigh: "最高",
    metricLow: "最低",
    metricVolume: "成交量",
    metricAmount: "成交额",
    metricClose: "收盘",
    metricMA5: "MA5",
    metricMA10: "MA10",
    metricMA20: "MA20",
    metricMA25: "MA25",
    metricMA55: "MA55",
    metricRSI14: "RSI14",
    metricVOL5: "VOL5",
    metricVOL60: "VOL60",
    metricDate: "日期",
    overviewNeutral: "未分析",
    decisionBullish: "偏多",
    decisionBearish: "偏空",
    decisionNeutral: "观望",
    direction: "方向",
    confidence: "置信度",
    timeframe: "时间框架",
    modelScorecard: "模型评分卡",
    actionBias: "动作偏向",
    thesis: "核心判断",
    bullCase: "看多逻辑",
    bearCase: "看空逻辑",
    support: "支撑位",
    resistance: "压力位",
    catalysts: "催化因素",
    risks: "风险点",
    referee: "平衡结论",
    finalDecision: "最终决策",
    risk: "风险",
    scorecard: "评分卡",
    intraday: "盘中结构",
    close: "尾盘建议",
  },
  en: {
    brandTitle: "SummerMax Alpha Terminal",
    brandSubtitle: "Realtime stock prediction desk for China A-shares with structured GPT 5.5 judgment.",
    heroTitle: "Built for fast judgment, not decorative noise.",
    heroText: "The layout is now organized in three layers: direction and risk first, technical and intraday structure second, and GPT 5.5 interpretation last. The goal is a professional workflow, not an AI gimmick.",
    badge1: "Realtime Quote",
    badge2: "Intraday Context",
    badge3: "Scorecard",
    badge4: "GPT 5.5 Analysis",
    miniApiLabel: "Where GPT API is set",
    miniApiValue: "Backend environment variables",
    miniKeysLabel: "Required",
    miniOptionalLabel: "Optional",
    navHome: "Home",
    navWorkspace: "Workspace",
    navScan: "Scan",
    navDebug: "Debug",
    gptStatusChecking: "Checking GPT…",
    gptStatusOk: "GPT-5.5 Ready",
    gptStatusErr: "GPT Unavailable",
    controlTitle: "Search Stock",
    controlText: "Enter a stock code or company name. All A-shares supported.",
    stockCodeLabel: "Code or Company Name",
    apiBaseLabel: "Backend API URL",
    gptToggleTitle: "Enable GPT Analysis",
    gptToggleText: "Requires an API key configured on the backend.",
    analyzeBtn: "Analyze",
    addWatchBtn: "Watch",
    openDebugBtn: "Raw Data",
    advancedLabel: "Advanced",
    setupTitle: "Not working?",
    setupText: "The backend may be waking up (free tier takes ~30 s on first hit). Wait a moment and try again.",
    overviewTitle: "Analysis Overview",
    overviewText: "Read direction, score, and risk first before going deeper.",
    overviewDirection: "Direction",
    overviewConfidence: "Confidence",
    overviewTimeframe: "Timeframe",
    overviewScore: "Overall Score",
    overviewDecision: "Action Bias",
    riskTitle: "Risk & Intraday Structure",
    riskText: "Risk level, intraday trend, and the last bar timestamp live here.",
    quoteTitle: "Realtime Quote",
    quoteText: "Price, move, open-high-low, and turnover values.",
    techTitle: "Technical Indicators",
    techText: "Daily moving averages, RSI, and volume baselines.",
    ruleTitle: "Rule Engine",
    ruleText: "A non-GPT baseline judgment layer.",
    gptTitle: "Structured GPT 5.5 Analysis",
    gptText: "Not just a paragraph. Direction, timeframe, key levels, catalysts, and risks.",
    chartTitle: "Primary Price Chart",
    chartText: "Put price action in the center. Read the trend first, then the AI explanation.",
    legendClose: "Close",
    legendMa5: "MA5",
    legendMa20: "MA20",
    chartMetaLeft: "Candles + MA5 + MA20 + Volume",
    chartMetaRight: "Last 60 Trading Days",
    periodDaily: "Daily",
    period60: "60 Min",
    period15: "15 Min",
    watchlistTitle: "Watchlist Monitor",
    watchlistText: "Refresh and monitor your tracked stocks in one place. Click any card to jump into single-stock analysis.",
    watchlistRefreshBtn: "Refresh Watchlist",
    watchlistAutoBtn: "Enable Auto Refresh",
    watchlistAutoStopBtn: "Disable Auto Refresh",
    watchlistEmpty: "No tracked stocks yet. Analyze one stock first, then add it to your watchlist.",
    watchlistTracked: "Tracked",
    watchlistRefreshing: "Refreshing watchlist...",
    watchlistRemoved: "Remove",
    watchPrice: "Price",
    watchChange: "Change",
    watchScore: "Score",
    watchBias: "Bias",
    watchRisk: "Risk",
    quicklistsTitle: "Market Quick Picks",
    quicklistsText: "No need to remember stock codes first. Start from gainers, losers, active turnover, or large caps.",
    quicklistGainers: "Top Gainers",
    quicklistLosers: "Top Losers",
    quicklistActive: "Active Turnover",
    quicklistCaps: "Large Caps",
    quickAmount: "Amount",
    quickMcap: "Mkt Cap",
    fundFlowTitle: "Capital Flow",
    fundFlowText: "Read main-force and block-order flow so price is not your only signal.",
    mainNetInflow: "Main Net Inflow",
    mainNetRatio: "Main Net Ratio",
    superNetInflow: "Super Large Inflow",
    largeNetInflow: "Large Order Inflow",
    mediumNetInflow: "Medium Order Inflow",
    smallNetInflow: "Small Order Inflow",
    assistantTitle: "AI Follow-up Assistant",
    assistantText: "Ask follow-up questions about the current stock without rebuilding context every time.",
    assistantAskBtn: "Ask Follow-up",
    assistantPlaceholder: "Ask anything: Should I buy BYD now? System auto-fetches real-time data.",
    assistantEmpty: "No follow-up messages yet.",
    assistantYou: "You",
    assistantModel: "AI Assistant",
    assistantLoading: "AI assistant is thinking...",
    noDecision: "No decision signal yet.",
    noAnalysis: "No analysis yet.",
    gptDisabled: "GPT analysis is currently disabled.",
    invalidCode: "Please enter a valid 6-digit China A-share stock code.",
    missingApi: "Please enter a backend API base URL first.",
    loading: "Loading realtime quote and analysis...",
    gptLoading: "Waiting for GPT 5.5 analysis...",
    unknownError: "Request failed.",
    quoteLoadedButAnalysisFailed: "Realtime quote loaded, but analysis failed:",
    loadedPrefix: "Loaded",
    at: "at",
    metricPrice: "Price",
    metricChange: "Change %",
    metricOpen: "Open",
    metricPreClose: "Pre Close",
    metricHigh: "High",
    metricLow: "Low",
    metricVolume: "Volume",
    metricAmount: "Amount",
    metricClose: "Close",
    metricMA5: "MA5",
    metricMA10: "MA10",
    metricMA20: "MA20",
    metricMA25: "MA25",
    metricMA55: "MA55",
    metricRSI14: "RSI14",
    metricVOL5: "VOL5",
    metricVOL60: "VOL60",
    metricDate: "Date",
    overviewNeutral: "Not analyzed",
    decisionBullish: "Bullish",
    decisionBearish: "Bearish",
    decisionNeutral: "Neutral",
    direction: "Direction",
    confidence: "Confidence",
    timeframe: "Timeframe",
    modelScorecard: "Model Scorecard",
    actionBias: "Action Bias",
    thesis: "Thesis",
    bullCase: "Bull Case",
    bearCase: "Bear Case",
    support: "Support",
    resistance: "Resistance",
    catalysts: "Catalysts",
    risks: "Risks",
    referee: "Referee",
    finalDecision: "Decision",
    risk: "Risk",
    scorecard: "Scorecard",
    intraday: "Intraday",
    close: "Close Bias",
  },
};

let currentLang = localStorage.getItem("summermax-alpha-lang") || "zh";
let currentPeriod = localStorage.getItem("summermax-alpha-period") || "daily";
let currentStockContext = null;
let watchlistTimer = null;
let watchlistAutoEnabled = localStorage.getItem("summermax-alpha-watchlist-auto") === "true";

function t(key) {
  return I18N[currentLang][key] || I18N.zh[key] || key;
}

const savedApiBase = localStorage.getItem("summermax-alpha-api-base");
if (savedApiBase) {
  apiBaseInput.value = savedApiBase;
} else {
  apiBaseInput.value = DEFAULT_API_BASE;
}

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem("summermax-alpha-lang", lang);
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  langZhBtn.classList.toggle("active", lang === "zh");
  langEnBtn.classList.toggle("active", lang === "en");

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  if (chartMetaLeftEl) {
    chartMetaLeftEl.textContent = t("chartMetaLeft");
  }
  if (chartMetaRightEl && !chartMetaRightEl.dataset.dynamic) {
    chartMetaRightEl.textContent = t("chartMetaRight");
  }
  if (assistantQuestionEl) {
    assistantQuestionEl.placeholder = t("assistantPlaceholder");
  }
  if (assistantAskBtn) {
    assistantAskBtn.textContent = t("assistantAskBtn");
  }
  if (addWatchBtn) {
    addWatchBtn.textContent = t("addWatchBtn");
  }
  if (refreshWatchlistBtn) {
    refreshWatchlistBtn.textContent = t("watchlistRefreshBtn");
  }
  if (toggleWatchlistAutoBtn) {
    toggleWatchlistAutoBtn.textContent = watchlistAutoEnabled ? t("watchlistAutoStopBtn") : t("watchlistAutoBtn");
  }
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function updateSetupNote() {
  const apiBase = normalizeApiBase(apiBaseInput.value);
  setupNoteEl.hidden = Boolean(apiBase);
}

function normalizeApiBase(input) {
  return input.trim().replace(/\/+$/, "");
}

function formatNumber(value) {
  const num = Number(value);
  if (Number.isNaN(num)) {
    return "-";
  }
  return num.toLocaleString(currentLang === "zh" ? "zh-CN" : "en-US", { maximumFractionDigits: 2 });
}

function formatCompactNumber(value) {
  const num = Number(value);
  if (Number.isNaN(num)) {
    return "-";
  }
  return new Intl.NumberFormat(currentLang === "zh" ? "zh-CN" : "en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(num);
}

function createMetric(label, value) {
  return `
    <div class="metric">
      <span class="metric-label">${label}</span>
      <span class="metric-value">${value}</span>
    </div>
  `;
}

function formatSignedNumber(value) {
  const num = Number(value);
  if (Number.isNaN(num)) {
    return "-";
  }
  const text = formatCompactNumber(num);
  return num > 0 ? `+${text}` : text;
}

function renderRealtime(realtime = {}) {
  if (centerPriceEl) {
    const chg = Number(realtime.change_percent);
    centerPriceEl.textContent = realtime.price != null ? formatNumber(realtime.price) : "--";
    centerPriceEl.className = "price-big" + (!Number.isNaN(chg) && realtime.price != null ? (chg >= 0 ? " up" : " down") : "");
  }
  if (centerChangeEl) {
    const chg = Number(realtime.change_percent);
    if (realtime.change_percent != null && !Number.isNaN(chg)) {
      centerChangeEl.textContent = `${chg >= 0 ? "+" : ""}${formatNumber(chg)}%`;
      centerChangeEl.className = "price-change" + (chg >= 0 ? " up" : " down");
    } else {
      centerChangeEl.textContent = "--";
      centerChangeEl.className = "price-change";
    }
  }
  realtimeMetricsEl.innerHTML = [
    createMetric(t("metricOpen"), formatNumber(realtime.open)),
    createMetric(t("metricPreClose"), formatNumber(realtime.pre_close)),
    createMetric(t("metricHigh"), formatNumber(realtime.high)),
    createMetric(t("metricLow"), formatNumber(realtime.low)),
    createMetric(t("metricVolume"), formatNumber(realtime.volume)),
    createMetric(t("metricAmount"), formatNumber(realtime.amount)),
  ].join("");
}

function renderIndicators(indicators = {}) {
  indicatorMetricsEl.innerHTML = [
    createMetric(t("metricClose"), formatNumber(indicators.close)),
    createMetric(t("metricMA5"), formatNumber(indicators.ma5)),
    createMetric(t("metricMA10"), formatNumber(indicators.ma10)),
    createMetric(t("metricMA20"), formatNumber(indicators.ma20)),
    createMetric(t("metricMA25"), formatNumber(indicators.ma25)),
    createMetric(t("metricMA55"), formatNumber(indicators.ma55)),
    createMetric(t("metricRSI14"), formatNumber(indicators.rsi14)),
    createMetric(t("metricVOL5"), formatNumber(indicators.vol5)),
    createMetric(t("metricVOL60"), formatNumber(indicators.vol60)),
    createMetric(t("metricDate"), indicators.date || "-"),
  ].join("");
}

function buildPolyline(points, width, height, min, max) {
  if (!points.length || min === max) {
    return "";
  }
  return points.map((value, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * width;
    const y = height - ((value - min) / (max - min)) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

function renderChart(chart = {}) {
  const series = Array.isArray(chart.series) ? chart.series : [];
  if (!series.length) {
    priceChartEl.innerHTML = "";
    if (chartMetaRightEl) {
      chartMetaRightEl.textContent = t("chartMetaRight");
      chartMetaRightEl.dataset.dynamic = "";
    }
    return;
  }

  const width = 860;
  const height = 470;
  const padding = 24;
  const priceSectionHeight = 300;
  const volumeSectionTop = 338;
  const volumeSectionHeight = 84;
  const values = series.flatMap((item) => [item.high, item.low]).filter((value) => typeof value === "number");
  const min = Math.min(...values);
  const max = Math.max(...values);
  const chartWidth = width - padding * 2;
  const chartHeight = priceSectionHeight;
  const candleSlot = chartWidth / Math.max(series.length, 1);
  const candleWidth = Math.max(3, Math.min(10, candleSlot * 0.55));

  const ma5Values = series.map((item) => item.ma5).filter((value) => typeof value === "number");
  const ma20Values = series.map((item) => item.ma20).filter((value) => typeof value === "number");
  const volumes = series.map((item) => Number(item.volume) || 0);
  const maxVolume = Math.max(...volumes, 1);

  const yForPrice = (price) => padding + (chartHeight - ((price - min) / Math.max(max - min, 0.0001)) * chartHeight);

  const candles = series.map((item, index) => {
    const xCenter = padding + candleSlot * index + candleSlot / 2;
    const openY = yForPrice(item.open);
    const closeY = yForPrice(item.close);
    const highY = yForPrice(item.high);
    const lowY = yForPrice(item.low);
    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(Math.abs(openY - closeY), 1.5);
    const isUp = item.close >= item.open;
    const color = isUp ? "#2ed09a" : "#ff6b7e";

    return `
      <line x1="${xCenter.toFixed(2)}" y1="${highY.toFixed(2)}" x2="${xCenter.toFixed(2)}" y2="${lowY.toFixed(2)}" stroke="${color}" stroke-width="1.2" />
      <rect x="${(xCenter - candleWidth / 2).toFixed(2)}" y="${bodyTop.toFixed(2)}" width="${candleWidth.toFixed(2)}" height="${bodyHeight.toFixed(2)}" fill="${color}" rx="1.5" />
    `;
  }).join("");

  const volumeBars = series.map((item, index) => {
    const xCenter = padding + candleSlot * index + candleSlot / 2;
    const barHeight = ((Number(item.volume) || 0) / maxVolume) * volumeSectionHeight;
    const y = volumeSectionTop + volumeSectionHeight - barHeight;
    const isUp = item.close >= item.open;
    const color = isUp ? "rgba(46, 208, 154, 0.55)" : "rgba(255, 107, 126, 0.55)";
    return `<rect x="${(xCenter - candleWidth / 2).toFixed(2)}" y="${y.toFixed(2)}" width="${candleWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" fill="${color}" rx="1.2" />`;
  }).join("");

  const ma5Polyline = ma5Values.length
    ? `<polyline points="${buildPolyline(series.map((item) => item.ma5 ?? item.close), chartWidth, chartHeight, min, max)}" fill="none" stroke="#35d39a" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" transform="translate(${padding},${padding})" />`
    : "";

  const ma20Polyline = ma20Values.length
    ? `<polyline points="${buildPolyline(series.map((item) => item.ma20 ?? item.close), chartWidth, chartHeight, min, max)}" fill="none" stroke="#f3b14b" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" transform="translate(${padding},${padding})" />`
    : "";

  const grid = Array.from({ length: 5 }).map((_, index) => {
    const y = padding + (chartHeight / 4) * index;
    return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="rgba(142,163,189,0.16)" stroke-width="1" />`;
  }).join("");

  const volumeDivider = `<line x1="${padding}" y1="${volumeSectionTop - 10}" x2="${width - padding}" y2="${volumeSectionTop - 10}" stroke="rgba(142,163,189,0.18)" stroke-width="1" />`;

  const labels = [
    series[0]?.date || "",
    series[Math.floor(series.length / 2)]?.date || "",
    series[series.length - 1]?.date || "",
  ].map((label, index) => {
    const x = [padding, width / 2, width - padding][index];
    return `<text x="${x}" y="${height - 10}" fill="#8ea3bd" font-size="12" text-anchor="${index === 0 ? "start" : index === 1 ? "middle" : "end"}">${label}</text>`;
  }).join("");

  const volumeLabel = `<text x="${padding}" y="${volumeSectionTop - 16}" fill="#8ea3bd" font-size="11">VOL</text>`;

  priceChartEl.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>
    ${grid}
    ${candles}
    ${ma5Polyline}
    ${ma20Polyline}
    ${volumeDivider}
    ${volumeBars}
    ${volumeLabel}
    ${labels}
  `;

  if (chartMetaRightEl) {
    const period = chart.summary?.period_days ? `${chart.summary.period_days} ${currentLang === "zh" ? "个交易日" : "trading days"}` : t("chartMetaRight");
    const range = chart.summary?.high != null && chart.summary?.low != null
      ? `${period} | ${currentLang === "zh" ? "区间" : "range"} ${formatNumber(chart.summary.low)} - ${formatNumber(chart.summary.high)}`
      : period;
    chartMetaRightEl.textContent = range;
    chartMetaRightEl.dataset.dynamic = "true";
  }
}

function renderRuleAnalysis(analysis = {}) {
  if (!analysis.detail) {
    analysisOutputEl.textContent = t("noAnalysis");
    signalsOutputEl.innerHTML = "";
    return;
  }

  analysisOutputEl.textContent = `${analysis.summary}: ${analysis.detail}`;
  const signals = [...(analysis.signals || [])];
  if (Array.isArray(analysis.models)) {
    analysis.models.forEach((model) => {
      signals.push(`${model.name}: ${model.bias} (score ${model.score})`);
    });
  }
  signalsOutputEl.innerHTML = signals.map((signal) => `<li>${signal}</li>`).join("");
}

function decorateDecisionTag(direction, actionBias, scorecard) {
  const text = [
    direction || t("overviewNeutral"),
    actionBias || "-",
    scorecard?.grading ? `Grade ${scorecard.grading}` : null,
  ].filter(Boolean).join(" | ");

  heroDecisionTagEl.textContent = text;
  heroDecisionTagEl.className = "decision-tag";

  if (direction === "bullish") {
    heroDecisionTagEl.classList.add("decision-bullish");
  } else if (direction === "bearish") {
    heroDecisionTagEl.classList.add("decision-bearish");
  } else {
    heroDecisionTagEl.classList.add("decision-neutral");
  }
}

function renderHeroSummary(stockData = {}) {
  const llm = stockData.llm_analysis?.content || {};
  const scorecard = stockData.scorecard || {};
  const direction = llm.direction || stockData.final_decision?.bias || t("overviewNeutral");

  heroDirectionEl.textContent = direction;
  heroConfidenceEl.textContent = llm.confidence != null ? `${llm.confidence}/100` : "-";
  heroTimeframeEl.textContent = llm.timeframe || "-";
  heroScoreEl.textContent = scorecard.total != null ? `${scorecard.total} | ${scorecard.grading || "-"}` : "-";
  decorateDecisionTag(llm.direction, llm.action_bias || stockData.final_decision?.bias, scorecard);
}

function renderLlmAnalysis(llmAnalysis) {
  if (!useLlmInput.checked) {
    llmOutputEl.textContent = t("gptDisabled");
    return;
  }

  if (!llmAnalysis) {
    llmOutputEl.textContent = t("noAnalysis");
    return;
  }

  if (llmAnalysis.status === "ok" && llmAnalysis.content) {
    const content = llmAnalysis.content;
    const support = Array.isArray(content.key_levels?.support) ? content.key_levels.support.join(", ") : "-";
    const resistance = Array.isArray(content.key_levels?.resistance) ? content.key_levels.resistance.join(", ") : "-";
    const catalysts = Array.isArray(content.catalysts) ? content.catalysts.join("; ") : "-";
    const risks = Array.isArray(content.risks) ? content.risks.join("; ") : "-";
    const scorecard = content.scorecard || {};

    llmOutputEl.textContent = [
      `${t("direction")}: ${content.direction || "-"}`,
      `${t("confidence")}: ${content.confidence ?? "-"}/100`,
      `${t("timeframe")}: ${content.timeframe || "-"}`,
      `${t("modelScorecard")}: trend ${scorecard.trend ?? "-"} | momentum ${scorecard.momentum ?? "-"} | flow ${scorecard.flow ?? "-"} | risk ${scorecard.risk ?? "-"} | overall ${scorecard.overall ?? "-"}`,
      `${t("actionBias")}: ${content.action_bias || "-"}`,
      `${t("thesis")}: ${content.thesis || "-"}`,
      `${t("bullCase")}: ${content.bull_case || "-"}`,
      `${t("bearCase")}: ${content.bear_case || "-"}`,
      `${t("support")}: ${support}`,
      `${t("resistance")}: ${resistance}`,
      `${t("catalysts")}: ${catalysts}`,
      `${t("risks")}: ${risks}`,
      `${t("referee")}: ${content.referee || "-"}`,
    ].join("\n");
    return;
  }

  if (llmAnalysis.content?.detail) {
    llmOutputEl.textContent = llmAnalysis.content.detail;
    return;
  }

  llmOutputEl.textContent = t("unknownError");
}

function renderCloseSignal(closeSignal = {}, riskAssessment = {}, finalDecision = {}, scorecard = {}, intraday = {}) {
  const lines = [];
  if (finalDecision.bias) {
    lines.push(`${t("finalDecision")}: ${finalDecision.bias} | ${finalDecision.note || ""}`);
  }
  if (riskAssessment.level || Array.isArray(riskAssessment.items)) {
    lines.push(`${t("risk")}: ${riskAssessment.level || "-"} | ${(riskAssessment.items || []).join(" ")}`);
  }
  if (scorecard.total != null) {
    lines.push(`${t("scorecard")}: ${scorecard.total} | Grade ${scorecard.grading || "-"}`);
  }
  if (intraday.last_bar_time) {
    lines.push(`${t("intraday")}: ${intraday.intraday_trend || "-"} | ${intraday.session_change_percent ?? "-"}% | ${intraday.last_bar_time}`);
  }
  if (closeSignal.note) {
    lines.push(`${t("close")}: ${closeSignal.bias || "-"} | ${closeSignal.note}`);
  }

  closeSignalOutputEl.textContent = lines.length ? lines.join("\n") : t("noDecision");
}

function renderFundFlow(payload = {}) {
  const latest = payload.latest || {};
  fundFlowMetricsEl.innerHTML = [
    createMetric(t("mainNetInflow"), formatSignedNumber(latest.main_net_inflow)),
    createMetric(t("mainNetRatio"), latest.main_net_ratio != null ? `${formatNumber(latest.main_net_ratio)}%` : "-"),
    createMetric(t("superNetInflow"), formatSignedNumber(latest.super_net_inflow)),
    createMetric(t("largeNetInflow"), formatSignedNumber(latest.large_net_inflow)),
  ].join("");

  const signals = [];
  if (payload.status === "fallback_rank" && payload.ranking) {
    signals.push(`Rank: ${payload.ranking.today_rank || "-"} | ${t("mainNetRatio")}: ${payload.latest.main_net_ratio ?? "-"}%`);
    signals.push(`5D: ${payload.ranking.five_day_main_ratio ?? "-"}% | 10D: ${payload.ranking.ten_day_main_ratio ?? "-"}%`);
    signals.push(`Sector: ${payload.ranking.sector || "-"}`);
  } else if (Array.isArray(payload.series) && payload.series.length) {
    const last3 = payload.series.slice(-3).map((item) => `${item.date}: ${formatSignedNumber(item.main_net_inflow)} | ${item.main_net_ratio ?? "-"}%`);
    signals.push(...last3);
  } else if (payload.detail) {
    signals.push(payload.detail);
  }

  fundFlowSignalsEl.innerHTML = signals.map((signal) => `<li>${signal}</li>`).join("");
}

function setActivePeriod(period) {
  currentPeriod = period;
  localStorage.setItem("summermax-alpha-period", period);
  [periodDailyBtn, period60Btn, period15Btn].forEach((button) => {
    if (!button) {
      return;
    }
    button.classList.toggle("active", button.dataset.period === period);
  });
}

async function loadChartPeriod(period, code = stockCodeInput.value.trim()) {
  const apiBase = normalizeApiBase(apiBaseInput.value);
  if (!apiBase || !/^\d{6}$/.test(code)) {
    return;
  }

  setActivePeriod(period);

  if (period === "daily") {
    try {
      const response = await fetch(`${apiBase}/chart/multiperiod?code=${encodeURIComponent(code)}&period=${encodeURIComponent(period)}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || t("unknownError"));
      }
      renderChart(data.chart);
    } catch {
      renderChart({});
    }
    return;
  }

  // 60 / 15-min: call EastMoney push2his directly (CORS: Access-Control-Allow-Origin: *)
  try {
    const klt = period === "60" ? "60" : "15";
    const market = /^[69]/.test(code) ? "1" : "0";
    const secid = `${market}.${code}`;

    const today = new Date();
    const end = today.toISOString().slice(0, 10).replace(/-/g, "");
    const past = new Date(today);
    past.setDate(past.getDate() - 10);
    const beg = past.toISOString().slice(0, 10).replace(/-/g, "");

    const url = new URL("https://push2his.eastmoney.com/api/qt/stock/kline/get");
    const params = {
      secid, klt, fqt: "1", beg, end,
      fields1: "f1,f2,f3,f4,f5,f6",
      fields2: "f51,f52,f53,f54,f55,f56",
      lmt: "1000",
      ut: "fa5fd1943c7b386f172d6893dbfba10b",
    };
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString(), {
      headers: { "Referer": "https://quote.eastmoney.com/" },
    });
    const data = await res.json();
    const klines = ((data.data) || {}).klines || [];

    if (!klines.length) {
      renderChart({});
      return;
    }

    const series = klines.map((line) => {
      const [date, open, close, high, low, volume] = line.split(",");
      return {
        date,
        open: Number(open),
        close: Number(close),
        high: Number(high),
        low: Number(low),
        volume: Number(volume),
      };
    });

    for (let i = 0; i < series.length; i++) {
      if (i >= 4) {
        series[i].ma5 = series.slice(i - 4, i + 1).reduce((s, x) => s + x.close, 0) / 5;
      }
      if (i >= 19) {
        series[i].ma20 = series.slice(i - 19, i + 1).reduce((s, x) => s + x.close, 0) / 20;
      }
    }

    renderChart({ series });
  } catch {
    renderChart({});
  }
}

function renderAssistantLog(items) {
  if (!assistantLogEl) {
    return;
  }

  if (!items.length) {
    assistantLogEl.innerHTML = `<div class="assistant-msg"><span class="assistant-role">${t("assistantModel")}</span><p class="assistant-content">${t("assistantEmpty")}</p></div>`;
    return;
  }

  assistantLogEl.innerHTML = items.map((item) => `
    <div class="assistant-msg">
      <span class="assistant-role">${item.role === "user" ? t("assistantYou") : t("assistantModel")}</span>
      <p class="assistant-content">${item.content}</p>
    </div>
  `).join("");
  assistantLogEl.scrollTop = assistantLogEl.scrollHeight;
}

function getWatchlistCodes() {
  return JSON.parse(localStorage.getItem("summermax-alpha-watchlist") || "[]");
}

function saveWatchlistCodes(codes) {
  localStorage.setItem("summermax-alpha-watchlist", JSON.stringify(codes));
}

function renderWatchlist(results = []) {
  if (!watchlistGridEl || !watchlistMetaEl) {
    return;
  }

  const codes = getWatchlistCodes();
  if (!codes.length) {
    watchlistGridEl.innerHTML = `<div class="inline-note">${t("watchlistEmpty")}</div>`;
    watchlistMetaEl.textContent = `0 ${t("watchlistTracked")}`;
    return;
  }

  const resultMap = new Map(results.map((item) => [item.code, item]));
  watchlistGridEl.innerHTML = codes.map((code) => {
    const item = resultMap.get(code);
    const change = Number(item?.realtime?.change_percent);
    const changeClass = Number.isNaN(change) ? "" : change >= 0 ? "up" : "down";
    const changeText = item?.realtime?.change_percent != null && !Number.isNaN(change)
      ? `${change >= 0 ? "+" : ""}${formatNumber(change)}%`
      : "-";
    return `
      <div class="watch-row" data-watch-code="${code}">
        <div class="watch-row-id">
          <span class="watch-row-code">${code}</span>
          <span class="watch-row-name">${item?.name || "-"}</span>
        </div>
        <span class="watch-row-price ${changeClass}">${formatNumber(item?.realtime?.price)}</span>
        <span class="watch-row-chg ${changeClass}">${changeText}</span>
        <button type="button" class="watch-row-del" data-remove-code="${code}">×</button>
      </div>
    `;
  }).join("");

  watchlistMetaEl.textContent = `${codes.length} ${t("watchlistTracked")}`;
}

async function refreshWatchlist() {
  const apiBase = normalizeApiBase(apiBaseInput.value);
  const codes = getWatchlistCodes();
  if (!apiBase || !codes.length) {
    renderWatchlist([]);
    return;
  }

  watchlistMetaEl.textContent = t("watchlistRefreshing");
  try {
    const response = await fetch(`${apiBase}/watchlist/analyze?codes=${encodeURIComponent(codes.join(","))}&use_llm=true`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || t("unknownError"));
    }
    renderWatchlist(Array.isArray(data.results) ? data.results : []);
  } catch {
    renderWatchlist([]);
  }
}

function syncWatchlistAutoState() {
  localStorage.setItem("summermax-alpha-watchlist-auto", String(watchlistAutoEnabled));
  if (toggleWatchlistAutoBtn) {
    toggleWatchlistAutoBtn.textContent = watchlistAutoEnabled ? t("watchlistAutoStopBtn") : t("watchlistAutoBtn");
  }
  if (watchlistTimer) {
    clearInterval(watchlistTimer);
    watchlistTimer = null;
  }
  if (watchlistAutoEnabled) {
    watchlistTimer = setInterval(() => {
      refreshWatchlist();
    }, 60000);
  }
}

function addCurrentStockToWatchlist() {
  const code = stockCodeInput.value.trim();
  if (!/^\d{6}$/.test(code)) {
    setStatus(t("invalidCode"), true);
    return;
  }
  const codes = getWatchlistCodes();
  if (!codes.includes(code)) {
    codes.unshift(code);
    saveWatchlistCodes(codes.slice(0, 30));
  }
  refreshWatchlist();
}

function removeFromWatchlist(code) {
  saveWatchlistCodes(getWatchlistCodes().filter((item) => item !== code));
  refreshWatchlist();
}

function appendAssistantMessage(role, content) {
  const history = JSON.parse(localStorage.getItem("summermax-alpha-assistant-history") || "[]");
  history.push({ role, content });
  localStorage.setItem("summermax-alpha-assistant-history", JSON.stringify(history));
  renderAssistantLog(history);
}

async function askAssistant() {
  const code = stockCodeInput.value.trim();
  const apiBase = normalizeApiBase(apiBaseInput.value);
  const question = assistantQuestionEl.value.trim();
  if (!apiBase || question.length < 2) {
    return;
  }

  const history = JSON.parse(localStorage.getItem("summermax-alpha-assistant-history") || "[]");
  appendAssistantMessage("user", question);
  assistantQuestionEl.value = "";
  appendAssistantMessage("assistant", t("assistantLoading"));
  assistantAskBtn.disabled = true;

  try {
    const response = await fetch(`${apiBase}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: question,
        history: history.slice(-10),
      }),
    });
    const data = await response.json();
    const updated = JSON.parse(localStorage.getItem("summermax-alpha-assistant-history") || "[]");
    if (updated.length) updated.pop();
    updated.push({ role: "assistant", content: response.ok ? (data.content || t("unknownError")) : (data.detail || t("unknownError")) });
    localStorage.setItem("summermax-alpha-assistant-history", JSON.stringify(updated));
    renderAssistantLog(updated);
  } catch {
    const updated = JSON.parse(localStorage.getItem("summermax-alpha-assistant-history") || "[]");
    if (updated.length) updated.pop();
    updated.push({ role: "assistant", content: t("unknownError") });
    localStorage.setItem("summermax-alpha-assistant-history", JSON.stringify(updated));
    renderAssistantLog(updated);
  } finally {
    assistantAskBtn.disabled = false;
  }
}

function renderQuicklist(el, items = [], mode = "change") {
  if (!el) {
    return;
  }

  if (!items.length) {
    el.innerHTML = `<div class="inline-note">${t("noAnalysis")}</div>`;
    return;
  }

  el.innerHTML = items.map((item) => {
    const change = Number(item.change_percent);
    const sideClass = Number.isNaN(change) ? "" : change >= 0 ? "up" : "down";
    const secondary = mode === "amount"
      ? `${t("quickAmount")}: ${formatCompactNumber(item.amount)}`
      : mode === "cap"
        ? `${t("quickMcap")}: ${formatCompactNumber(item.market_cap)}`
        : `${formatNumber(item.change_percent)}%`;

    return `
      <button type="button" class="quick-item" data-code="${item.code}">
        <div class="quick-main">
          <strong>${item.code} ${item.name || ""}</strong>
          <span>${formatNumber(item.price)}</span>
        </div>
        <div class="quick-side">
          <strong class="${sideClass}">${secondary}</strong>
          <span>${formatNumber(item.turnover_rate)}%</span>
        </div>
      </button>
    `;
  }).join("");
}

async function loadMarketQuicklists() {
  const apiBase = normalizeApiBase(apiBaseInput.value);
  if (!apiBase) {
    return;
  }

  try {
    const response = await fetch(`${apiBase}/market/quicklists?limit=6`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || t("unknownError"));
    }

    const lists = data.lists || {};
    renderQuicklist(quicklistGainersEl, lists.top_gainers || [], "change");
    renderQuicklist(quicklistLosersEl, lists.top_losers || [], "change");
    renderQuicklist(quicklistActiveEl, lists.active_turnover || [], "amount");
    renderQuicklist(quicklistCapsEl, lists.large_caps || [], "cap");
  } catch {
    renderQuicklist(quicklistGainersEl, []);
    renderQuicklist(quicklistLosersEl, []);
    renderQuicklist(quicklistActiveEl, []);
    renderQuicklist(quicklistCapsEl, []);
  }
}

async function checkGptStatus() {
  const apiBase = normalizeApiBase(apiBaseInput.value);
  if (!apiBase) {
    return;
  }
  if (gptStatusDotEl) gptStatusDotEl.className = "gpt-dot";
  if (gptStatusLabelEl) gptStatusLabelEl.textContent = t("gptStatusChecking");
  try {
    const response = await fetch(`${apiBase}/health`);
    const data = await response.json();
    if (response.ok && data.llm_configured) {
      if (gptStatusDotEl) gptStatusDotEl.className = "gpt-dot ok";
      if (gptStatusLabelEl) gptStatusLabelEl.textContent = t("gptStatusOk");
    } else {
      if (gptStatusDotEl) gptStatusDotEl.className = "gpt-dot err";
      if (gptStatusLabelEl) gptStatusLabelEl.textContent = t("gptStatusErr");
    }
  } catch {
    if (gptStatusDotEl) gptStatusDotEl.className = "gpt-dot err";
    if (gptStatusLabelEl) gptStatusLabelEl.textContent = t("gptStatusErr");
  }
}

async function searchStocks() {
  const keyword = stockCodeInput.value.trim();
  const apiBase = normalizeApiBase(apiBaseInput.value);
  if (!apiBase || keyword.length < 1) {
    stockSearchResultsEl.classList.remove("show");
    stockSearchResultsEl.innerHTML = "";
    return;
  }

  try {
    const response = await fetch(`${apiBase}/stocks/search?q=${encodeURIComponent(keyword)}`);
    const data = await response.json();
    const results = Array.isArray(data.results) ? data.results : [];
    if (!results.length) {
      stockSearchResultsEl.classList.remove("show");
      stockSearchResultsEl.innerHTML = "";
      return;
    }

    stockSearchResultsEl.innerHTML = results.map((item) => `
      <button type="button" class="search-item" data-code="${item.code}" data-name="${item.name}">
        <span class="search-code">${item.code}</span>
        <span class="search-name">${item.name}</span>
      </button>
    `).join("");
    stockSearchResultsEl.classList.add("show");
  } catch {
    stockSearchResultsEl.classList.remove("show");
    stockSearchResultsEl.innerHTML = "";
  }
}

async function analyzeStock() {
  const code = stockCodeInput.value.trim();
  const apiBase = normalizeApiBase(apiBaseInput.value);
  const useLlm = useLlmInput.checked;

  if (!/^\d{6}$/.test(code)) {
    setStatus(t("invalidCode"), true);
    return;
  }

  if (!apiBase) {
    setStatus(t("missingApi"), true);
    updateSetupNote();
    return;
  }

  localStorage.setItem("summermax-alpha-api-base", apiBase);
  localStorage.setItem("summermax-alpha-last-code", code);

  analyzeBtn.disabled = true;
  setStatus(t("loading"));
  analysisOutputEl.textContent = t("loading");
  llmOutputEl.textContent = useLlm ? t("gptLoading") : t("gptDisabled");
  closeSignalOutputEl.textContent = t("loading");
  realtimeMetricsEl.innerHTML = "";
  indicatorMetricsEl.innerHTML = "";
  signalsOutputEl.innerHTML = "";
  if (centerCodeEl) centerCodeEl.textContent = code;
  if (centerNameEl) centerNameEl.textContent = "";
  if (centerPriceEl) { centerPriceEl.textContent = "--"; centerPriceEl.className = "price-big"; }
  if (centerChangeEl) { centerChangeEl.textContent = "--"; centerChangeEl.className = "price-change"; }
  renderChart({});
  renderHeroSummary({});
  renderFundFlow({});

  // ── Phase 1: fast data (no LLM) ─────────────────────────────────────────
  try {
    const fastStockUrl = `${apiBase}/stock?code=${encodeURIComponent(code)}&use_llm=false`;
    const fundFlowUrl  = `${apiBase}/fund-flow/stock?code=${encodeURIComponent(code)}`;

    const [stockResponse, fundFlowResponse] = await Promise.all([
      fetch(fastStockUrl),
      fetch(fundFlowUrl),
    ]);

    const stockData    = await stockResponse.json();
    const fundFlowData = await fundFlowResponse.json();

    if (!stockResponse.ok) {
      throw new Error(stockData.detail || t("unknownError"));
    }

    renderRealtime(stockData.realtime);
    renderIndicators(stockData.indicators);
    renderChart(stockData.chart);
    renderRuleAnalysis(stockData.analysis);
    renderFundFlow(fundFlowResponse.ok ? fundFlowData : {});
    renderCloseSignal(
      stockData.close_signal || {},
      stockData.risk_assessment,
      stockData.final_decision,
      stockData.scorecard,
      stockData.intraday || {},
    );
    renderHeroSummary(stockData);
    if (centerCodeEl) centerCodeEl.textContent = stockData.code || code;
    if (centerNameEl) centerNameEl.textContent = stockData.name || "";
    currentStockContext = stockData;
    localStorage.setItem("summermax-alpha-last-json", JSON.stringify({ stock: stockData }, null, 2));
    localStorage.setItem("summermax-alpha-assistant-history", JSON.stringify([]));
    renderAssistantLog([]);

    const fastAt = stockData.realtime?.quote_time || "";
    setStatus(`${t("loadedPrefix")} ${stockData.code} ${stockData.name || ""} ${t("at")} ${fastAt}${useLlm ? " — AI 分析中…" : ""}`);
    analyzeBtn.disabled = false;

    if (currentPeriod !== "daily") {
      loadChartPeriod(currentPeriod, code);
    }
    refreshWatchlist();
  } catch (error) {
    setStatus(error.message || t("unknownError"), true);
    renderRealtime({});
    renderIndicators({});
    renderChart({});
    renderRuleAnalysis({});
    renderLlmAnalysis(null);
    renderCloseSignal({}, {}, {});
    renderFundFlow({});
    localStorage.setItem("summermax-alpha-last-json", t("unknownError"));
    analyzeBtn.disabled = false;
    return;
  }

  // ── Phase 2: LLM analysis (background, non-blocking) ────────────────────
  if (!useLlm) {
    renderLlmAnalysis(null);
    return;
  }

  try {
    const llmResponse = await fetch(`${apiBase}/stock?code=${encodeURIComponent(code)}&use_llm=true`);
    const llmData = await llmResponse.json();

    if (llmResponse.ok) {
      renderLlmAnalysis(llmData.llm_analysis);
      renderHeroSummary(llmData);
      currentStockContext = llmData;
      localStorage.setItem("summermax-alpha-last-json", JSON.stringify({ stock: llmData }, null, 2));
      const at = llmData.realtime?.quote_time || "";
      setStatus(`${t("loadedPrefix")} ${llmData.code} ${llmData.name || ""} ${t("at")} ${at}.`);
    } else {
      renderLlmAnalysis({ status: "error", content: { detail: llmData.detail || t("unknownError") } });
    }
  } catch {
    llmOutputEl.textContent = currentLang === "zh" ? "AI 分析请求失败，技术数据已正常加载。" : "AI analysis failed; technical data loaded.";
  }
}

analyzeBtn.addEventListener("click", analyzeStock);
apiBaseInput.addEventListener("input", updateSetupNote);
apiBaseInput.addEventListener("change", loadMarketQuicklists);
apiBaseInput.addEventListener("change", checkGptStatus);

// Debounced search — avoids hammering /stocks/search on every keypress
let _searchDebounce = null;
stockCodeInput.addEventListener("input", () => {
  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(searchStocks, 200);
});
langZhBtn.addEventListener("click", () => setLanguage("zh"));
langEnBtn.addEventListener("click", () => setLanguage("en"));
assistantAskBtn.addEventListener("click", askAssistant);
addWatchBtn.addEventListener("click", addCurrentStockToWatchlist);
refreshWatchlistBtn.addEventListener("click", refreshWatchlist);
toggleWatchlistAutoBtn.addEventListener("click", () => {
  watchlistAutoEnabled = !watchlistAutoEnabled;
  syncWatchlistAutoState();
});
periodDailyBtn.addEventListener("click", () => loadChartPeriod("daily"));
period60Btn.addEventListener("click", () => loadChartPeriod("60"));
period15Btn.addEventListener("click", () => loadChartPeriod("15"));

stockCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    analyzeStock();
  }
});

apiBaseInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    analyzeStock();
  }
});

assistantQuestionEl.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    askAssistant();
  }
});

stockSearchResultsEl.addEventListener("click", (event) => {
  const button = event.target.closest(".search-item");
  if (!button) {
    return;
  }
  stockCodeInput.value = button.dataset.code || "";
  stockSearchResultsEl.classList.remove("show");
  stockSearchResultsEl.innerHTML = "";
  analyzeStock();
});

document.addEventListener("click", (event) => {
  if (!stockSearchResultsEl.contains(event.target) && event.target !== stockCodeInput) {
    stockSearchResultsEl.classList.remove("show");
  }
});

document.addEventListener("click", (event) => {
  const button = event.target.closest(".quick-item");
  if (!button) {
    return;
  }
  stockCodeInput.value = button.dataset.code || "";
  analyzeStock();
});

document.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-code]");
  if (removeButton) {
    removeFromWatchlist(removeButton.dataset.removeCode || "");
    event.stopPropagation();
    return;
  }

  const watchCard = event.target.closest("[data-watch-code]");
  if (!watchCard) {
    return;
  }
  stockCodeInput.value = watchCard.dataset.watchCode || "";
  analyzeStock();
});

document.querySelectorAll(".mkt-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mkt-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const listKey = btn.dataset.list || "";
    const id = `quicklist${listKey.charAt(0).toUpperCase() + listKey.slice(1)}`;
    document.querySelectorAll(".quick-list").forEach((l) => l.classList.remove("show"));
    const target = document.getElementById(id);
    if (target) target.classList.add("show");
  });
});

setLanguage(currentLang);
updateSetupNote();
renderChart({});
renderHeroSummary({});
renderRuleAnalysis({});
renderLlmAnalysis(null);
renderCloseSignal({}, {}, {});
renderFundFlow({});
renderAssistantLog(JSON.parse(localStorage.getItem("summermax-alpha-assistant-history") || "[]"));
setActivePeriod(currentPeriod);
syncWatchlistAutoState();
renderWatchlist([]);
refreshWatchlist();
loadMarketQuicklists();
checkGptStatus();

// Keep backend alive (Render free tier sleeps after 15 min inactivity)
const _apiBase = () => normalizeApiBase(apiBaseInput.value);
setInterval(() => { fetch(`${_apiBase()}/ping`).catch(() => {}); }, 10 * 60 * 1000);

// If quicklists came back empty (server still warming up), retry once after 35s
setTimeout(() => {
  if (quicklistGainersEl && !quicklistGainersEl.querySelector(".quick-item")) {
    loadMarketQuicklists();
  }
}, 35000);

// Auto-analyze on page load so users see live data immediately, not placeholders.
// Priority: URL ?code= param → last viewed stock → default 300059
const urlCode = new URLSearchParams(location.search).get("code");
const lastCode = localStorage.getItem("summermax-alpha-last-code");
const autoCode = (urlCode || lastCode || "300059").trim();
if (/^\d{6}$/.test(autoCode)) {
  stockCodeInput.value = autoCode;
  analyzeStock();
}
