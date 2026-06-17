// redeploy pages

const apiBaseInput = document.getElementById("apiBase");
const stockCodeInput = document.getElementById("stockCode");
const useLlmInput = document.getElementById("useLlm");
const analyzeBtn = document.getElementById("analyzeBtn");
const statusEl = document.getElementById("status");
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
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
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
    createMetric("Volume", formatNumber(indicators.volume)),
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
  const signals = analysis.signals || [];
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
    llmOutputEl.textContent = `${content.summary || "No summary"}: ${content.detail || "No detail"}`;
    return;
  }

  if (llmAnalysis.content?.detail) {
    llmOutputEl.textContent = llmAnalysis.content.detail;
    return;
  }

  llmOutputEl.textContent = "GPT analysis did not return usable content.";
}

function renderCloseSignal(closeSignal = {}) {
  if (!closeSignal.note) {
    closeSignalOutputEl.textContent = "No close-session bias yet.";
    return;
  }

  closeSignalOutputEl.textContent = `${closeSignal.bias}: ${closeSignal.note}`;
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
    setStatus("Please enter your backend API base URL.", true);
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
    const stockUrl = `${apiBase}/stock?code=${encodeURIComponent(code)}&use_llm=${useLlm}`;
    const closeUrl = `${apiBase}/analysis/close?code=${encodeURIComponent(code)}&use_llm=${useLlm}`;

    const [stockResponse, closeResponse] = await Promise.all([
      fetch(stockUrl),
      fetch(closeUrl),
    ]);

    const stockData = await stockResponse.json();
    const closeData = await closeResponse.json();

    if (!stockResponse.ok) {
      throw new Error(stockData.detail || "Stock analysis request failed.");
    }
    if (!closeResponse.ok) {
      throw new Error(closeData.detail || "Close analysis request failed.");
    }

    renderRealtime(stockData.realtime);
    renderIndicators(stockData.indicators);
    renderRuleAnalysis(stockData.analysis);
    renderLlmAnalysis(stockData.llm_analysis);
    renderCloseSignal(closeData.close_signal);
    jsonOutputEl.textContent = JSON.stringify({ stock: stockData, close: closeData }, null, 2);
    setStatus(`Loaded ${stockData.code} ${stockData.name || ""} at ${stockData.realtime.quote_time}.`);
  } catch (error) {
    setStatus(error.message || "Unknown error.", true);
    renderRealtime({});
    renderIndicators({});
    renderRuleAnalysis({});
    renderLlmAnalysis(null);
    renderCloseSignal({});
    jsonOutputEl.textContent = "Request failed.";
  } finally {
    analyzeBtn.disabled = false;
  }
}

analyzeBtn.addEventListener("click", analyzeStock);

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
