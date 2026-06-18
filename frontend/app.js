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

const savedApiBase = localStorage.getItem("summermax-alpha-api-base");
if (savedApiBase) {
  apiBaseInput.value = savedApiBase;
} else if (DEFAULT_API_BASE) {
  apiBaseInput.value = DEFAULT_API_BASE;
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
  if (apiBase) {
    setupNoteEl.hidden = true;
    return;
  }

  setupNoteEl.hidden = false;
}

function normalizeApiBase(input) {
  return input.trim().replace(/\/+$/, "");
}

function buildWaizaoUrl(apiBase) {
  const mode = waizaoModeEl.value;
  const code = waizaoCodeEl.value.trim();
  const start = waizaoStartEl.value.trim();
  const end = waizaoEndEl.value.trim();

  if (!code) {
    throw new Error("Please enter a Waizao code or symbol.");
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
      if (!start || !end) {
        throw new Error("Day K-Line requires start and end dates.");
      }
      params.set("code", code);
      params.set("start_date", start);
      params.set("end_date", end);
      return `${apiBase}/waizao/day-kline?${params.toString()}`;
    case "hour-kline":
      if (!start || !end) {
        throw new Error("Hour K-Line requires start and end datetimes.");
      }
      params.set("code", code);
      params.set("start_date", start);
      params.set("end_date", end);
      params.set("ktype", "60");
      return `${apiBase}/waizao/hour-kline?${params.toString()}`;
    case "minute-kline":
      if (!start || !end) {
        throw new Error("Minute K-Line requires start and end datetimes.");
      }
      params.set("code", code);
      params.set("start_date", start);
      params.set("end_date", end);
      return `${apiBase}/waizao/minute-kline?${params.toString()}`;
    default:
      throw new Error("Unsupported Waizao dataset.");
  }
}

function formatNumber(value) {
  const num = Number(value);
  if (Number.isNaN(num)) {
    return "-";
  }
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
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
    createMetric("Price", formatNumber(realtime.price)),
    createMetric("Change %", formatNumber(realtime.change_percent)),
    createMetric("Open", formatNumber(realtime.open)),
    createMetric("Pre Close", formatNumber(realtime.pre_close)),
    createMetric("High", formatNumber(realtime.high)),
    createMetric("Low", formatNumber(realtime.low)),
    createMetric("Volume", formatNumber(realtime.volume)),
    createMetric("Amount", formatNumber(realtime.amount)),
  ].join("");
}

function renderIndicators(indicators = {}) {
  indicatorMetricsEl.innerHTML = [
    createMetric("Close", formatNumber(indicators.close)),
    createMetric("MA5", formatNumber(indicators.ma5)),
    createMetric("MA10", formatNumber(indicators.ma10)),
    createMetric("MA20", formatNumber(indicators.ma20)),
    createMetric("MA25", formatNumber(indicators.ma25)),
    createMetric("MA55", formatNumber(indicators.ma55)),
    createMetric("RSI14", formatNumber(indicators.rsi14)),
    createMetric("VOL5", formatNumber(indicators.vol5)),
    createMetric("VOL60", formatNumber(indicators.vol60)),
    createMetric("Date", indicators.date || "-"),
  ].join("");
}

function renderRuleAnalysis(analysis = {}) {
  if (!analysis.detail) {
    analysisOutputEl.textContent = "No rule analysis available.";
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

function renderLlmAnalysis(llmAnalysis) {
  if (!useLlmInput.checked) {
    llmOutputEl.textContent = "GPT analysis is disabled.";
    return;
  }

  if (!llmAnalysis) {
    llmOutputEl.textContent = "GPT analysis was requested but no result was returned.";
    return;
  }

  if (llmAnalysis.status === "ok" && llmAnalysis.content) {
    const content = llmAnalysis.content;
    const support = Array.isArray(content.key_levels?.support)
      ? content.key_levels.support.join(", ")
      : "-";
    const resistance = Array.isArray(content.key_levels?.resistance)
      ? content.key_levels.resistance.join(", ")
      : "-";
    const catalysts = Array.isArray(content.catalysts) ? content.catalysts.join("; ") : "-";
    const risks = Array.isArray(content.risks) ? content.risks.join("; ") : "-";
    const modelScorecard = content.scorecard || {};

    llmOutputEl.textContent = [
      `Direction: ${content.direction || "-"}`,
      `Confidence: ${content.confidence ?? "-"}/100`,
      `Timeframe: ${content.timeframe || "-"}`,
      `Model Scorecard: trend ${modelScorecard.trend ?? "-"} | momentum ${modelScorecard.momentum ?? "-"} | flow ${modelScorecard.flow ?? "-"} | risk ${modelScorecard.risk ?? "-"} | overall ${modelScorecard.overall ?? "-"}`,
      `Action Bias: ${content.action_bias || "-"}`,
      `Thesis: ${content.thesis || "No thesis."}`,
      `Bull: ${content.bull_case || "No bull case."}`,
      `Bear: ${content.bear_case || "No bear case."}`,
      `Support: ${support}`,
      `Resistance: ${resistance}`,
      `Catalysts: ${catalysts}`,
      `Risks: ${risks}`,
      `Referee: ${content.referee || "No referee summary."}`,
    ].join("\n");
    return;
  }

  if (llmAnalysis.content?.detail) {
    llmOutputEl.textContent = llmAnalysis.content.detail;
    return;
  }

  llmOutputEl.textContent = "GPT analysis did not return usable content.";
}

function renderCloseSignal(closeSignal = {}, riskAssessment = {}, finalDecision = {}, scorecard = {}, intraday = {}) {
  if (!closeSignal.note && !finalDecision.note) {
    closeSignalOutputEl.textContent = "No decision signal yet.";
    return;
  }

  const lines = [];
  if (finalDecision.bias) {
    lines.push(`Decision: ${finalDecision.bias} | ${finalDecision.note || ""}`);
  }
  if (riskAssessment.level || Array.isArray(riskAssessment.items)) {
    lines.push(`Risk: ${riskAssessment.level || "-"} | ${(riskAssessment.items || []).join(" ")}`);
  }
  if (scorecard.total != null) {
    lines.push(`Scorecard: ${scorecard.total} | Grade ${scorecard.grading || "-"}`);
  }
  if (intraday && intraday.last_bar_time) {
    lines.push(`Intraday: ${intraday.intraday_trend || "-"} | ${intraday.session_change_percent ?? "-"}% | ${intraday.last_bar_time}`);
  }
  if (closeSignal.note) {
    lines.push(`Close: ${closeSignal.bias} | ${closeSignal.note}`);
  }
  closeSignalOutputEl.textContent = lines.join("\n");
}

async function analyzeStock() {
  const code = stockCodeInput.value.trim();
  const apiBase = normalizeApiBase(apiBaseInput.value);
  const useLlm = useLlmInput.checked;

  if (!/^\d{6}$/.test(code)) {
    setStatus("Please enter a valid 6-digit A-share stock code.", true);
    return;
  }

  if (!apiBase) {
    setStatus("No realtime backend is connected. Enter a live backend API base URL first.", true);
    updateSetupNote();
    return;
  }

  localStorage.setItem("summermax-alpha-api-base", apiBase);

  analyzeBtn.disabled = true;
  setStatus("Loading realtime quote and analysis...");
  jsonOutputEl.textContent = "Loading...";
  analysisOutputEl.textContent = "Loading...";
  llmOutputEl.textContent = useLlm ? "Loading GPT analysis..." : "GPT analysis is disabled.";
  closeSignalOutputEl.textContent = "Loading...";
  realtimeMetricsEl.innerHTML = "";
  indicatorMetricsEl.innerHTML = "";
  signalsOutputEl.innerHTML = "";

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

    if (realtimeResponse.ok) {
      renderRealtime(realtimeData.realtime);
    } else {
      renderRealtime({});
    }

    if (!stockResponse.ok || !closeResponse.ok) {
      const stockError = stockData.detail || "Stock analysis request failed.";
      const closeError = closeData.detail || "Close analysis request failed.";

      if (realtimeResponse.ok) {
        setStatus(`Realtime quote loaded, but analysis failed: ${stockError}${closeResponse.ok ? "" : ` | ${closeError}`}`, true);
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
      stockData.intraday,
    );
    jsonOutputEl.textContent = JSON.stringify({ stock: stockData, close: closeData }, null, 2);
    setStatus(`Loaded ${stockData.code} ${stockData.name || ""} at ${stockData.realtime.quote_time}.`);
  } catch (error) {
    setStatus(error.message || "Unknown error.", true);
    renderRealtime({});
    renderIndicators({});
    renderRuleAnalysis({});
    renderLlmAnalysis(null);
    renderCloseSignal({}, {}, {});
    jsonOutputEl.textContent = "Request failed.";
  } finally {
    analyzeBtn.disabled = false;
  }
}

async function fetchWaizaoData() {
  const apiBase = normalizeApiBase(apiBaseInput.value);
  if (!apiBase) {
    setWaizaoStatus("Enter a backend API base URL first.", true);
    return;
  }

  waizaoBtn.disabled = true;
  waizaoOutputEl.textContent = "Loading...";
  setWaizaoStatus("Loading Waizao dataset...");

  try {
    const url = buildWaizaoUrl(apiBase);
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "Waizao request failed.");
    }
    waizaoOutputEl.textContent = JSON.stringify(data, null, 2);
    setWaizaoStatus(`Loaded ${waizaoModeEl.value} successfully.`);
  } catch (error) {
    waizaoOutputEl.textContent = "Request failed.";
    setWaizaoStatus(error.message || "Unknown error.", true);
  } finally {
    waizaoBtn.disabled = false;
  }
}

analyzeBtn.addEventListener("click", analyzeStock);
waizaoBtn.addEventListener("click", fetchWaizaoData);
apiBaseInput.addEventListener("input", updateSetupNote);

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

updateSetupNote();
