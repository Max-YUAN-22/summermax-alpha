const DEFAULT_API_BASE = "https://summermax-alpha-api.onrender.com";
const EM_URL = "https://82.push2.eastmoney.com/api/qt/clist/get";

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

function fmtSigned(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return "--";
  return (n >= 0 ? "+" : "") + n.toFixed(2);
}

async function loadOverview() {
  const apiBase = getApiBase();
  const indicesEl = document.getElementById("homeIndices");
  const sectorsEl = document.getElementById("homeSectors");
  const overviewTimeEl = document.getElementById("overviewTime");

  // Fetch indices from backend (Sina API, works from Render)
  fetch(`${apiBase}/market/overview`)
    .then((r) => r.json())
    .then((data) => {
      if (indicesEl && Array.isArray(data.indices)) {
        indicesEl.innerHTML = data.indices.map((idx) => {
          const cls = chgClass(idx.change_percent);
          return `
            <div class="index-row">
              <div class="index-name-wrap">
                <span class="index-code">${idx.code}</span>
                <span class="index-name">${idx.name}</span>
              </div>
              <span class="index-price ${cls}">${fmt(idx.price)}</span>
              <div class="index-chg-wrap">
                <span class="index-chg ${cls}">${chgText(idx.change_percent)}</span>
                <span class="index-change">${idx.change != null ? fmtSigned(idx.change) : "--"}</span>
              </div>
            </div>
          `;
        }).join("");
      }
      if (overviewTimeEl && data.generated_at) {
        overviewTimeEl.textContent = data.generated_at;
      }
    })
    .catch(() => {
      if (indicesEl) {
        indicesEl.innerHTML = `<span style="color:var(--muted);font-size:0.8rem">指数数据加载中，后端首次访问约需 30 秒</span>`;
      }
    });

  // Fetch hot sectors directly from EastMoney (browser → no geo-block)
  try {
    const url = new URL(EM_URL);
    const params = {
      pn: "1", pz: "10", po: "1", np: "1",
      ut: "bd1d9ddb04089700cf9c27f6f7426281",
      fltt: "2", invt: "2", fid: "f3",
      fs: "m:90 t:2 f:!50",
      fields: "f3,f12,f14,f128,f136",
    };
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), {
      headers: { "Referer": "https://quote.eastmoney.com/center/boardlist.html" },
    });
    const data = await res.json();
    const diffs = (data.data || {}).diff || [];
    const top5 = [...diffs]
      .sort((a, b) => (Number(b.f3) || 0) - (Number(a.f3) || 0))
      .slice(0, 5);

    if (sectorsEl && top5.length) {
      sectorsEl.innerHTML = top5.map((item) => {
        const cls = chgClass(item.f3);
        return `
          <a href="/scan" class="sector-pill">
            <span class="sector-pill-chg ${cls}">${chgText(item.f3)}</span>
            <span>${item.f14 || ""}</span>
            ${item.f128 ? `<span class="sector-pill-leader">${item.f128}</span>` : ""}
          </a>
        `;
      }).join("");
    }
  } catch {
    // Sector pills are optional on the home page — fail silently
  }
}

loadOverview();
