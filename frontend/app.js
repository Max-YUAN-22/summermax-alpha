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
const jsonOutputEl = document.getElementById("jsonOutput");
const waizaoModeEl = document.getElementById("waizaoMode");
const waizaoCodeEl = document.getElementById("waizaoCode");
const waizaoStartEl = document.getElementById("waizaoStart");
const waizaoEndEl = document.getElementById("waizaoEnd");
const waizaoBtn = document.getElementById("waizaoBtn");
const waizaoStatusEl = document.getElementById("waizaoStatus");
const waizaoOutputEl = document.getElementById("waizaoOutput");
const heroDirectionEl = document.getElementById("heroDirection");
const heroConfidenceEl = document.getElementById("heroConfidence");
const heroTimeframeEl = document.getElementById("heroTimeframe");
const heroScoreEl = document.getElementById("heroScore");
const heroDecisionTagEl = document.getElementById("heroDecisionTag");
const langZhBtn = document.getElementById("langZh");
const langEnBtn = document.getElementById("langEn");

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
    controlTitle: "控制台",
    controlText: "先填后端地址和股票代码，再决定是否启用 GPT 分析。",
    stockCodeLabel: "股票代码",
    apiBaseLabel: "后端 API 地址",
    gptToggleTitle: "启用 GPT 5.5 分析",
    gptToggleText: "需要后端已配置 OpenAI API Key。",
    analyzeBtn: "开始分析",
    setupTitle: "为什么现在可能还不能跑？",
    setupText: "这个前端只是工作台。真正抓行情、算指标、调用 GPT 的地方在后端 API。你需要先部署或启动后端。",
    apiGuideTitle: "GPT API 在哪里设置",
    apiGuideText: "不是在这个网页里填，是在后端环境变量里设置。",
    apiGuideItem1Title: "必填 Key",
    apiGuideItem2Title: "模型名称",
    apiGuideItem3Title: "兼容网关可选",
    apiGuideItem4Title: "本地启动示例",
    waizaoTitle: "Waizao 数据浏览",
    waizaoText: "如果你要看原始数据、分钟线或盘口，就在这里单独查。",
    waizaoDatasetLabel: "数据类型",
    waizaoCodeLabel: "代码 / 符号",
    waizaoStartLabel: "开始",
    waizaoEndLabel: "结束",
    waizaoBtn: "查询原始数据",
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
    waizaoOutputTitle: "Waizao 输出",
    waizaoOutputText: "如果你在左侧查了原始数据，结果显示在这里。",
    jsonTitle: "原始 JSON",
    jsonText: "如果想核对字段、调试接口或复制数据，看这里。",
    noDecision: "还没有决策结果。",
    noAnalysis: "还没有分析结果。",
    gptDisabled: "GPT 分析当前未启用。",
    invalidCode: "请输入合法的 6 位 A 股股票代码。",
    missingApi: "请先填写后端 API 地址。",
    loading: "正在加载实时行情与分析...",
    gptLoading: "正在等待 GPT 5.5 分析...",
    unknownError: "请求失败。",
    quoteLoadedButAnalysisFailed: "实时行情已获取，但分析失败：",
    waizaoMissingApi: "请先填写后端 API 地址。",
    waizaoLoading: "正在加载 Waizao 数据...",
    waizaoMissingCode: "请输入 Waizao 代码或符号。",
    waizaoLoaded: "Waizao 数据已加载：",
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
    controlTitle: "Control Panel",
    controlText: "Enter your backend URL and stock code first, then decide whether to enable GPT.",
    stockCodeLabel: "Stock Code",
    apiBaseLabel: "Backend API Base URL",
    gptToggleTitle: "Enable GPT 5.5 Analysis",
    gptToggleText: "Requires the backend to already have an OpenAI API key configured.",
    analyzeBtn: "Run Analysis",
    setupTitle: "Why may it still not run?",
    setupText: "This page is only the workstation. Quote fetching, indicator calculation, and GPT calls all happen in the backend API. You need to deploy or start the backend first.",
    apiGuideTitle: "Where to set the GPT API",
    apiGuideText: "You do not enter it in this page. You set it in backend environment variables.",
    apiGuideItem1Title: "Required API Key",
    apiGuideItem2Title: "Model Name",
    apiGuideItem3Title: "Compatible Gateway Optional",
    apiGuideItem4Title: "Local Start Example",
    waizaoTitle: "Waizao Data Explorer",
    waizaoText: "Use this section when you want raw datasets, minute bars, or order-book style data.",
    waizaoDatasetLabel: "Dataset",
    waizaoCodeLabel: "Code / Symbol",
    waizaoStartLabel: "Start",
    waizaoEndLabel: "End",
    waizaoBtn: "Fetch Raw Data",
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
    waizaoOutputTitle: "Waizao Output",
    waizaoOutputText: "If you query raw data on the left, results show here.",
    jsonTitle: "Raw JSON",
    jsonText: "Use this to inspect fields, debug the API, or copy response data.",
    noDecision: "No decision signal yet.",
    noAnalysis: "No analysis yet.",
    gptDisabled: "GPT analysis is currently disabled.",
    invalidCode: "Please enter a valid 6-digit China A-share stock code.",
    missingApi: "Please enter a backend API base URL first.",
    loading: "Loading realtime quote and analysis...",
    gptLoading: "Waiting for GPT 5.5 analysis...",
    unknownError: "Request failed.",
    quoteLoadedButAnalysisFailed: "Realtime quote loaded, but analysis failed:",
    waizaoMissingApi: "Please enter a backend API base URL first.",
    waizaoLoading: "Loading Waizao dataset...",
    waizaoMissingCode: "Please enter a Waizao code or symbol.",
    waizaoLoaded: "Waizao data loaded:",
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
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function setWaizaoStatus(message, isError = false) {
  waizaoStatusEl.textContent = message;
  waizaoStatusEl.classList.toggle("error", isError);
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

function createMetric(label, value) {
  return `
    <div class="metric">
      <span class="metric-label">${label}</span>
      <span class="metric-value">${value}</span>
    </div>
  `;
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

function buildWaizaoUrl(apiBase) {
  const mode = waizaoModeEl.value;
  const code = waizaoCodeEl.value.trim();
  const start = waizaoStartEl.value.trim();
  const end = waizaoEndEl.value.trim();

  if (!code) {
    throw new Error(t("waizaoMissingCode"));
  }

  const params = new URLSearchParams();
  switch (mode) {
    case "base-info":
      params.set("code", code);
      return `${apiBase}/waizao/base-info?${params.toString()}`;
    case "pankou":
      params.set("code", code);
      return `${apiBase}/waizao/pankou?${params.toString()}`;
    case "day-kline":
      params.set("code", code);
      params.set("start_date", start);
      params.set("end_date", end);
      return `${apiBase}/waizao/day-kline?${params.toString()}`;
    case "hour-kline":
      params.set("code", code);
      params.set("start_date", start);
      params.set("end_date", end);
      params.set("ktype", "60");
      return `${apiBase}/waizao/hour-kline?${params.toString()}`;
    case "minute-kline":
      params.set("code", code);
      params.set("start_date", start);
      params.set("end_date", end);
      return `${apiBase}/waizao/minute-kline?${params.toString()}`;
    default:
      throw new Error("Unsupported Waizao dataset.");
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

  analyzeBtn.disabled = true;
  setStatus(t("loading"));
  jsonOutputEl.textContent = "Loading...";
  analysisOutputEl.textContent = t("loading");
  llmOutputEl.textContent = useLlm ? t("gptLoading") : t("gptDisabled");
  closeSignalOutputEl.textContent = t("loading");
  realtimeMetricsEl.innerHTML = "";
  indicatorMetricsEl.innerHTML = "";
  signalsOutputEl.innerHTML = "";
  renderHeroSummary({});

  try {
    const realtimeUrl = `${apiBase}/quote/realtime?code=${encodeURIComponent(code)}`;
    const stockUrl = `${apiBase}/stock?code=${encodeURIComponent(code)}&use_llm=${useLlm}`;
    const closeUrl = `${apiBase}/analysis/close?code=${encodeURIComponent(code)}&use_llm=${useLlm}`;

    const [realtimeResponse, stockResponse, closeResponse] = await Promise.all([
      fetch(realtimeUrl),
      fetch(stockUrl),
      fetch(closeUrl),
    ]);

    const realtimeData = await realtimeResponse.json();
    const stockData = await stockResponse.json();
    const closeData = await closeResponse.json();

    renderRealtime(realtimeResponse.ok ? realtimeData.realtime : {});

    if (!stockResponse.ok || !closeResponse.ok) {
      const stockError = stockData.detail || t("unknownError");
      const closeError = closeData.detail || t("unknownError");

      if (realtimeResponse.ok) {
        setStatus(`${t("quoteLoadedButAnalysisFailed")} ${stockError}${closeResponse.ok ? "" : ` | ${closeError}`}`, true);
        jsonOutputEl.textContent = JSON.stringify(
          {
            realtime: realtimeData,
            stock_error: stockError,
            close_error: closeResponse.ok ? null : closeError,
          },
          null,
          2,
        );
        renderIndicators({});
        renderRuleAnalysis({});
        renderLlmAnalysis(null);
        renderCloseSignal({}, {}, {});
        return;
      }

      throw new Error(`${stockError}${closeResponse.ok ? "" : ` | ${closeError}`}`);
    }

    renderRealtime(stockData.realtime);
    renderIndicators(stockData.indicators);
    renderRuleAnalysis(stockData.analysis);
    renderLlmAnalysis(stockData.llm_analysis);
    renderCloseSignal(
      closeData.close_signal,
      stockData.risk_assessment,
      stockData.final_decision,
      stockData.scorecard,
      stockData.intraday || {},
    );
    renderHeroSummary(stockData);
    jsonOutputEl.textContent = JSON.stringify({ stock: stockData, close: closeData }, null, 2);
    setStatus(`${t("loadedPrefix")} ${stockData.code} ${stockData.name || ""} ${t("at")} ${stockData.realtime.quote_time}.`);
  } catch (error) {
    setStatus(error.message || t("unknownError"), true);
    renderRealtime({});
    renderIndicators({});
    renderRuleAnalysis({});
    renderLlmAnalysis(null);
    renderCloseSignal({}, {}, {});
    jsonOutputEl.textContent = t("unknownError");
  } finally {
    analyzeBtn.disabled = false;
  }
}

async function fetchWaizaoData() {
  const apiBase = normalizeApiBase(apiBaseInput.value);
  if (!apiBase) {
    setWaizaoStatus(t("waizaoMissingApi"), true);
    return;
  }

  waizaoBtn.disabled = true;
  waizaoOutputEl.textContent = "Loading...";
  setWaizaoStatus(t("waizaoLoading"));

  try {
    const url = buildWaizaoUrl(apiBase);
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || t("unknownError"));
    }
    waizaoOutputEl.textContent = JSON.stringify(data, null, 2);
    setWaizaoStatus(`${t("waizaoLoaded")} ${waizaoModeEl.value}`);
  } catch (error) {
    waizaoOutputEl.textContent = t("unknownError");
    setWaizaoStatus(error.message || t("unknownError"), true);
  } finally {
    waizaoBtn.disabled = false;
  }
}

analyzeBtn.addEventListener("click", analyzeStock);
waizaoBtn.addEventListener("click", fetchWaizaoData);
apiBaseInput.addEventListener("input", updateSetupNote);
langZhBtn.addEventListener("click", () => setLanguage("zh"));
langEnBtn.addEventListener("click", () => setLanguage("en"));

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

waizaoCodeEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    fetchWaizaoData();
  }
});

setLanguage(currentLang);
updateSetupNote();
renderHeroSummary({});
renderRuleAnalysis({});
renderLlmAnalysis(null);
renderCloseSignal({}, {}, {});
