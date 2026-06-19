const DEFAULT_API_BASE = "https://summermax-alpha-api.onrender.com";

const debugApiBaseInput = document.getElementById("debugApiBase");
const debugStockCodeInput = document.getElementById("debugStockCode");
const debugFetchBtn = document.getElementById("debugFetchBtn");
const debugStatusEl = document.getElementById("debugStatus");
const jsonOutputEl = document.getElementById("jsonOutput");
const waizaoModeEl = document.getElementById("waizaoMode");
const waizaoCodeEl = document.getElementById("waizaoCode");
const waizaoStartEl = document.getElementById("waizaoStart");
const waizaoEndEl = document.getElementById("waizaoEnd");
const waizaoBtn = document.getElementById("waizaoBtn");
const waizaoStatusEl = document.getElementById("waizaoStatus");
const waizaoOutputEl = document.getElementById("waizaoOutput");
const langZhBtn = document.getElementById("langZh");
const langEnBtn = document.getElementById("langEn");

const I18N = {
  zh: {
    debugTitle: "调试控制台",
    debugSubtitle: "原始 JSON、Waizao 数据和接口调试放到单独页面，不干扰主工作台。",
    backHome: "返回主页面",
    jsonCardTitle: "原始 JSON",
    jsonCardText: "这里展示主页面最近一次分析结果的原始响应，也可以手动重新拉取。",
    apiBaseLabel: "后端 API 地址",
    stockCodeLabel: "股票代码",
    debugFetchBtn: "重新拉取主分析 JSON",
    jsonPanelTitle: "原始 JSON 输出",
    jsonPanelText: "用于核对字段、复制结构、调试接口返回。",
    waizaoTitle: "Waizao 数据浏览",
    waizaoText: "Waizao 不再放在主工作台，这里作为高级数据工具保留。",
    waizaoDatasetLabel: "数据类型",
    waizaoCodeLabel: "代码 / 符号",
    waizaoStartLabel: "开始",
    waizaoEndLabel: "结束",
    waizaoBtn: "查询 Waizao 数据",
    waizaoPanelTitle: "Waizao 输出",
    waizaoPanelText: "高级原始数据查询结果。",
    invalidCode: "请输入合法的 6 位 A 股股票代码。",
    missingApi: "请先填写后端 API 地址。",
    loading: "正在加载原始 JSON...",
    unknownError: "请求失败。",
    loaded: "已加载调试数据。",
    waizaoLoading: "正在加载 Waizao 数据...",
    waizaoMissingCode: "请输入 Waizao 代码或符号。",
    waizaoLoaded: "Waizao 数据已加载。",
  },
  en: {
    debugTitle: "Debug Console",
    debugSubtitle: "Raw JSON, Waizao data, and API diagnostics live here instead of the main workstation.",
    backHome: "Back To Main",
    jsonCardTitle: "Raw JSON",
    jsonCardText: "This shows the latest analysis payload from the main page, and you can also refetch it manually.",
    apiBaseLabel: "Backend API Base URL",
    stockCodeLabel: "Stock Code",
    debugFetchBtn: "Refetch Analysis JSON",
    jsonPanelTitle: "Raw JSON Output",
    jsonPanelText: "Use this for field inspection, response copying, and API debugging.",
    waizaoTitle: "Waizao Data Explorer",
    waizaoText: "Waizao is no longer on the main workstation. It remains here as an advanced data tool.",
    waizaoDatasetLabel: "Dataset",
    waizaoCodeLabel: "Code / Symbol",
    waizaoStartLabel: "Start",
    waizaoEndLabel: "End",
    waizaoBtn: "Fetch Waizao Data",
    waizaoPanelTitle: "Waizao Output",
    waizaoPanelText: "Advanced raw data query output.",
    invalidCode: "Please enter a valid 6-digit China A-share stock code.",
    missingApi: "Please enter a backend API base URL first.",
    loading: "Loading raw JSON...",
    unknownError: "Request failed.",
    loaded: "Debug data loaded.",
    waizaoLoading: "Loading Waizao dataset...",
    waizaoMissingCode: "Please enter a Waizao code or symbol.",
    waizaoLoaded: "Waizao data loaded.",
  },
};

let currentLang = localStorage.getItem("summermax-alpha-lang") || "zh";

function t(key) {
  return I18N[currentLang][key] || I18N.zh[key] || key;
}

function normalizeApiBase(input) {
  return input.trim().replace(/\/+$/, "");
}

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem("summermax-alpha-lang", lang);
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  langZhBtn.classList.toggle("active", lang === "zh");
  langEnBtn.classList.toggle("active", lang === "en");

  document.getElementById("debugTitle").textContent = t("debugTitle");
  document.getElementById("debugSubtitle").textContent = t("debugSubtitle");
  document.getElementById("jsonCardTitle").textContent = t("jsonCardTitle");
  document.getElementById("jsonCardText").textContent = t("jsonCardText");
  document.getElementById("apiBaseLabel").textContent = t("apiBaseLabel");
  document.getElementById("stockCodeLabel").textContent = t("stockCodeLabel");
  debugFetchBtn.textContent = t("debugFetchBtn");
  document.getElementById("jsonPanelTitle").textContent = t("jsonPanelTitle");
  document.getElementById("jsonPanelText").textContent = t("jsonPanelText");
  document.getElementById("waizaoTitle").textContent = t("waizaoTitle");
  document.getElementById("waizaoText").textContent = t("waizaoText");
  document.getElementById("waizaoDatasetLabel").textContent = t("waizaoDatasetLabel");
  document.getElementById("waizaoCodeLabel").textContent = t("waizaoCodeLabel");
  document.getElementById("waizaoStartLabel").textContent = t("waizaoStartLabel");
  document.getElementById("waizaoEndLabel").textContent = t("waizaoEndLabel");
  waizaoBtn.textContent = t("waizaoBtn");
  document.getElementById("waizaoPanelTitle").textContent = t("waizaoPanelTitle");
  document.getElementById("waizaoPanelText").textContent = t("waizaoPanelText");
}

function setDebugStatus(message, isError = false) {
  debugStatusEl.textContent = message;
  debugStatusEl.classList.toggle("error", isError);
}

function setWaizaoStatus(message, isError = false) {
  waizaoStatusEl.textContent = message;
  waizaoStatusEl.classList.toggle("error", isError);
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

async function fetchDebugJson() {
  const code = debugStockCodeInput.value.trim();
  const apiBase = normalizeApiBase(debugApiBaseInput.value);

  if (!/^\d{6}$/.test(code)) {
    setDebugStatus(t("invalidCode"), true);
    return;
  }

  if (!apiBase) {
    setDebugStatus(t("missingApi"), true);
    return;
  }

  localStorage.setItem("summermax-alpha-api-base", apiBase);
  localStorage.setItem("summermax-alpha-debug-code", code);
  debugFetchBtn.disabled = true;
  setDebugStatus(t("loading"));
  jsonOutputEl.textContent = "Loading...";

  try {
    const stockUrl = `${apiBase}/stock?code=${encodeURIComponent(code)}&use_llm=true`;
    const closeUrl = `${apiBase}/analysis/close?code=${encodeURIComponent(code)}&use_llm=true`;

    const [stockResponse, closeResponse] = await Promise.all([fetch(stockUrl), fetch(closeUrl)]);
    const stockData = await stockResponse.json();
    const closeData = await closeResponse.json();

    if (!stockResponse.ok || !closeResponse.ok) {
      throw new Error(stockData.detail || closeData.detail || t("unknownError"));
    }

    const payload = { stock: stockData, close: closeData };
    jsonOutputEl.textContent = JSON.stringify(payload, null, 2);
    localStorage.setItem("summermax-alpha-last-json", JSON.stringify(payload));
    setDebugStatus(t("loaded"));
  } catch (error) {
    jsonOutputEl.textContent = t("unknownError");
    setDebugStatus(error.message || t("unknownError"), true);
  } finally {
    debugFetchBtn.disabled = false;
  }
}

async function fetchWaizaoData() {
  const apiBase = normalizeApiBase(debugApiBaseInput.value);
  if (!apiBase) {
    setWaizaoStatus(t("missingApi"), true);
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
    setWaizaoStatus(t("waizaoLoaded"));
  } catch (error) {
    waizaoOutputEl.textContent = t("unknownError");
    setWaizaoStatus(error.message || t("unknownError"), true);
  } finally {
    waizaoBtn.disabled = false;
  }
}

function loadStoredState() {
  const savedApiBase = localStorage.getItem("summermax-alpha-api-base");
  const savedCode = localStorage.getItem("summermax-alpha-debug-code") || localStorage.getItem("summermax-alpha-last-code") || "300059";
  const savedJson = localStorage.getItem("summermax-alpha-last-json");

  debugApiBaseInput.value = savedApiBase || DEFAULT_API_BASE;
  debugStockCodeInput.value = savedCode;
  jsonOutputEl.textContent = savedJson || "No data yet.";
}

debugFetchBtn.addEventListener("click", fetchDebugJson);
waizaoBtn.addEventListener("click", fetchWaizaoData);
langZhBtn.addEventListener("click", () => setLanguage("zh"));
langEnBtn.addEventListener("click", () => setLanguage("en"));

debugStockCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    fetchDebugJson();
  }
});

waizaoCodeEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    fetchWaizaoData();
  }
});

setLanguage(currentLang);
loadStoredState();
