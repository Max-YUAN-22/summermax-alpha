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
    llmOutputEl.textContent = [
      `Bull: ${content.bull_case || "No bull case."}`,
      `Bear: ${content.bear_case || "No bear case."}`,
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

function renderCloseSignal(closeSignal = {}, riskAssessment = {}, finalDecision = {}) {
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
    renderCloseSignal(closeData.close_signal, stockData.risk_assessment, stockData.final_decision);
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

analyzeBtn.addEventListener("click", analyzeStock);
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

updateSetupNote();
