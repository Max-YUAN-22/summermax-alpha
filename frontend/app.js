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
    navWorkspace: "工作台",
    navDebug: "调试台",
    controlTitle: "控制台",
    controlText: "先填后端地址和股票代码，再决定是否启用 GPT 分析。",
    stockCodeLabel: "股票代码",
    apiBaseLabel: "后端 API 地址",
    gptToggleTitle: "启用 GPT 5.5 分析",
    gptToggleText: "需要后端已配置 OpenAI API Key。",
    analyzeBtn: "开始分析",
    openDebugBtn: "查看原始 JSON",
    setupTitle: "为什么现在可能还不能跑？",
    setupText: "这个前端只是工作台。真正抓行情、算指标、调用 GPT 的地方在后端 API。你需要先部署或启动后端。",
    apiGuideTitle: "GPT API 在哪里设置",
    apiGuideText: "不是在这个网页里填，是在后端环境变量里设置。",
    apiGuideItem1Title: "必填 Key",
    apiGuideItem2Title: "模型名称",
    apiGuideItem3Title: "兼容网关可选",
    apiGuideItem4Title: "本地启动示例",
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
    assistantPlaceholder: "例如：这个位置是回调买点还是该继续观望？",
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
    navWorkspace: "Workspace",
    navDebug: "Debug",
    controlTitle: "Control Panel",
    controlText: "Enter your backend URL and stock code first, then decide whether to enable GPT.",
    stockCodeLabel: "Stock Code",
    apiBaseLabel: "Backend API Base URL",
    gptToggleTitle: "Enable GPT 5.5 Analysis",
    gptToggleText: "Requires the backend to already have an OpenAI API key configured.",
    analyzeBtn: "Run Analysis",
    openDebugBtn: "Open Raw JSON",
    setupTitle: "Why may it still not run?",
    setupText: "This page is only the workstation. Quote fetching, indicator calculation, and GPT calls all happen in the backend API. You need to deploy or start the backend first.",
    apiGuideTitle: "Where to set the GPT API",
    apiGuideText: "You do not enter it in this page. You set it in backend environment variables.",
    apiGuideItem1Title: "Required API Key",
    apiGuideItem2Title: "Model Name",
    apiGuideItem3Title: "Compatible Gateway Optional",
    apiGuideItem4Title: "Local Start Example",
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
    assistantPlaceholder: "For example: Is this a buy-on-pullback area or still a wait-and-see setup?",
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
  realtimeMetricsEl.innerHTML = [
    createMetric(t("metricPrice"), formatNumber(realtime.price)),
    createMetric(t("metricChange"), formatNumber(realtime.change_percent)),
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
    llmOutputEl.textContent = t("unknownError");
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
  if (!apiBase || !/^\d{6}$/.test(code) || question.length < 2) {
    return;
  }

  appendAssistantMessage("user", question);
  assistantQuestionEl.value = "";
  appendAssistantMessage("assistant", t("assistantLoading"));
  assistantAskBtn.disabled = true;

  try {
    const response = await fetch(`${apiBase}/assistant/chat?code=${encodeURIComponent(code)}&question=${encodeURIComponent(question)}`);
    const data = await response.json();
    const history = JSON.parse(localStorage.getItem("summermax-alpha-assistant-history") || "[]");
    if (history.length) {
      history.pop();
    }
    history.push({ role: "assistant", content: response.ok ? (data.content || t("unknownError")) : (data.detail || t("unknownError")) });
    localStorage.setItem("summermax-alpha-assistant-history", JSON.stringify(history));
    renderAssistantLog(history);
  } catch {
    const history = JSON.parse(localStorage.getItem("summermax-alpha-assistant-history") || "[]");
    if (history.length) {
      history.pop();
    }
    history.push({ role: "assistant", content: t("unknownError") });
    localStorage.setItem("summermax-alpha-assistant-history", JSON.stringify(history));
    renderAssistantLog(history);
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

async function searchStocks() {
  const keyword = stockCodeInput.value.trim();
  const apiBase = normalizeApiBase(apiBaseInput.value);
  if (!apiBase || keyword.length < 2) {
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
  renderChart({});
  renderHeroSummary({});
  renderFundFlow({});

  try {
    const realtimeUrl = `${apiBase}/quote/realtime?code=${encodeURIComponent(code)}`;
    const stockUrl = `${apiBase}/stock?code=${encodeURIComponent(code)}&use_llm=${useLlm}`;
    const closeUrl = `${apiBase}/analysis/close?code=${encodeURIComponent(code)}&use_llm=${useLlm}`;
    const fundFlowUrl = `${apiBase}/fund-flow/stock?code=${encodeURIComponent(code)}`;

    const [realtimeResponse, stockResponse, closeResponse, fundFlowResponse] = await Promise.all([
      fetch(realtimeUrl),
      fetch(stockUrl),
      fetch(closeUrl),
      fetch(fundFlowUrl),
    ]);

    const realtimeData = await realtimeResponse.json();
    const stockData = await stockResponse.json();
    const closeData = await closeResponse.json();
    const fundFlowData = await fundFlowResponse.json();

    renderRealtime(realtimeResponse.ok ? realtimeData.realtime : {});

    if (!stockResponse.ok || !closeResponse.ok) {
      const stockError = stockData.detail || t("unknownError");
      const closeError = closeData.detail || t("unknownError");

      if (realtimeResponse.ok) {
        setStatus(`${t("quoteLoadedButAnalysisFailed")} ${stockError}${closeResponse.ok ? "" : ` | ${closeError}`}`, true);
        localStorage.setItem(
          "summermax-alpha-last-json",
          JSON.stringify(
            {
              realtime: realtimeData,
              stock_error: stockError,
              close_error: closeResponse.ok ? null : closeError,
            },
            null,
            2,
          ),
        );
        renderIndicators({});
        renderRuleAnalysis({});
        renderLlmAnalysis(null);
        renderCloseSignal({}, {}, {});
        renderFundFlow({});
        return;
      }

      throw new Error(`${stockError}${closeResponse.ok ? "" : ` | ${closeError}`}`);
    }

    renderRealtime(stockData.realtime);
    renderIndicators(stockData.indicators);
    renderChart(stockData.chart);
    renderRuleAnalysis(stockData.analysis);
    renderLlmAnalysis(stockData.llm_analysis);
    renderFundFlow(fundFlowResponse.ok ? fundFlowData : {});
    renderCloseSignal(
      closeData.close_signal,
      stockData.risk_assessment,
      stockData.final_decision,
      stockData.scorecard,
      stockData.intraday || {},
    );
    renderHeroSummary(stockData);
    currentStockContext = stockData;
    localStorage.setItem("summermax-alpha-last-json", JSON.stringify({ stock: stockData, close: closeData }, null, 2));
    localStorage.setItem("summermax-alpha-assistant-history", JSON.stringify([]));
    renderAssistantLog([]);
    setStatus(`${t("loadedPrefix")} ${stockData.code} ${stockData.name || ""} ${t("at")} ${stockData.realtime.quote_time}.`);
    if (currentPeriod !== "daily") {
      await loadChartPeriod(currentPeriod, code);
    }
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
  } finally {
    analyzeBtn.disabled = false;
  }
}

analyzeBtn.addEventListener("click", analyzeStock);
apiBaseInput.addEventListener("input", updateSetupNote);
apiBaseInput.addEventListener("change", loadMarketQuicklists);
stockCodeInput.addEventListener("input", searchStocks);
langZhBtn.addEventListener("click", () => setLanguage("zh"));
langEnBtn.addEventListener("click", () => setLanguage("en"));
assistantAskBtn.addEventListener("click", askAssistant);
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
loadMarketQuicklists();
