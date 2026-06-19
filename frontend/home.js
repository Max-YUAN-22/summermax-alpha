const DEFAULT_API_BASE = "https://summermax-alpha-api.onrender.com";

function getApiBase() {
  const saved = localStorage.getItem("summermax-alpha-api-base");
  return (saved || DEFAULT_API_BASE).trim().replace(/\/+$/, "");
}

function fmt(value, digits = 2) {
  const n = Number(value);
  return Number.isNaN(n) ? "--" : n.toFixed(digits);
}

function chgClass(value) {
  const n = Number(value);
  return Number.isNaN(n) ? "" : n >= 0 ? "up" : "down";
}

function chgText(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return "--";
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

async function loadOverview() {
  const apiBase = getApiBase();
  const indicesEl = document.getElementById("homeIndices");
  const sectorsEl = document.getElementById("homeSectors");
  const overviewTimeEl = document.getElementById("overviewTime");

  try {
    const res = await fetch(`${apiBase}/market/overview`);
    const data = await res.json();

    if (indicesEl && Array.isArray(data.indices)) {
      indicesEl.innerHTML = data.indices.map((idx) => `
        <div class="index-card">
          <span class="index-name">${idx.name}</span>
          <strong class="index-price ${chgClass(idx.change_percent)}">${fmt(idx.price)}</strong>
          <span class="index-chg ${chgClass(idx.change_percent)}">${chgText(idx.change_percent)}</span>
        </div>
      `).join("");
    }

    if (sectorsEl && Array.isArray(data.hot_sectors)) {
      sectorsEl.innerHTML = data.hot_sectors.map((s) => `
        <a href="scan.html" class="sector-pill ${chgClass(s.change_percent)}" title="${s.leader ? "领涨：" + s.leader : ""}">
          <span class="sector-pill-name">${s.name}</span>
          <strong class="sector-pill-chg">${chgText(s.change_percent)}</strong>
          ${s.leader ? `<span class="sector-pill-leader">${s.leader}</span>` : ""}
        </a>
      `).join("");
    }

    if (overviewTimeEl && data.generated_at) {
      overviewTimeEl.textContent = data.generated_at;
    }
  } catch {
    if (indicesEl) indicesEl.innerHTML = `<span style="color:var(--muted);font-size:0.8rem">行情数据加载失败，后端可能正在唤醒中</span>`;
  }
}

loadOverview();
