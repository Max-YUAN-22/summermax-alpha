// SummerMax Alpha — theme · market status · sidebar navigation
(function () {
  const KEY = "summermax-theme";

  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    document.querySelectorAll(".theme-toggle").forEach((btn) => {
      btn.textContent = t === "light" ? "🌙" : "☀";
      btn.title = t === "light" ? "切换深色模式" : "切换浅色模式";
    });
  }

  // Apply before first paint to prevent flash
  applyTheme(localStorage.getItem(KEY) || "dark");

  window.__toggleTheme = function () {
    const next = (document.documentElement.getAttribute("data-theme") || "dark") === "dark" ? "light" : "dark";
    localStorage.setItem(KEY, next);
    applyTheme(next);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Market status (A-share, Beijing time UTC+8)
  // ─────────────────────────────────────────────────────────────────────────────
  window.__marketStatus = function () {
    const now = new Date();
    const cst = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
    const dow = cst.getDay();
    const hm  = cst.getHours() * 100 + cst.getMinutes();
    if (dow === 0 || dow === 6)      return { s: "closed",        label: "休市 周末" };
    if (hm >= 915  && hm < 925)     return { s: "auction",       label: "集合竞价" };
    if (hm >= 925  && hm < 930)     return { s: "pre",           label: "即将开市" };
    if (hm >= 930  && hm < 1130)    return { s: "open",          label: "交易中" };
    if (hm >= 1130 && hm < 1300)    return { s: "lunch",         label: "午间休市" };
    if (hm >= 1300 && hm < 1457)    return { s: "open",          label: "交易中" };
    if (hm >= 1457 && hm < 1500)    return { s: "close_auction", label: "收盘竞价" };
    if (hm >= 1500)                  return { s: "closed",        label: "已收盘" };
    return { s: "closed", label: "开市前" };
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // SVG icon set (18×18 stroke)
  // ─────────────────────────────────────────────────────────────────────────────
  const I = {
    home:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    scan:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    workspace: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    chat:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    picker:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
    quadrant:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
    backtest:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-5"/></svg>',
    settings:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  };

  const NAV = [
    { href: "scan.html",      label: "市场扫描",  icon: I.scan },
    { href: "workspace.html", label: "工作台",    icon: I.workspace },
    { href: "chat.html",      label: "AI 分析师", icon: I.chat },
    { href: "picker.html",    label: "选股器",    icon: I.picker },
    { href: "quadrant.html",  label: "四象限",    icon: I.quadrant },
    { href: "backtest.html",  label: "回测",      icon: I.backtest },
    // divider then settings
    { href: "settings.html",  label: "设置",      icon: I.settings, divider: true },
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  // Sidebar CSS (injected once)
  // ─────────────────────────────────────────────────────────────────────────────
  const SIDEBAR_CSS = `
    /* Push page content right to make room for sidebar */
    body[data-sb] { padding-left: 56px; box-sizing: border-box; }

    /* Hide topbar nav links & brand name on pages with sidebar */
    body[data-sb] .page-nav  { display: none !important; }
    body[data-sb] .brand-name { display: none !important; }
    body[data-sb] .brand-sep,
    body[data-sb] .topbar-divider:first-of-type { display: none !important; }

    /* ── Sidebar shell ── */
    #__sb {
      position: fixed; left: 0; top: 0; bottom: 0;
      width: 56px;
      background: rgba(5, 11, 22, 0.97);
      border-right: 1px solid rgba(102,209,255,0.09);
      display: flex; flex-direction: column;
      z-index: 300; overflow: hidden;
      transition: width 0.22s cubic-bezier(.4,0,.2,1);
      box-shadow: 3px 0 24px rgba(0,0,0,0.28);
    }
    #__sb:hover { width: 220px; }

    /* ── Logo ── */
    .sb-logo {
      display: flex; align-items: center; gap: 11px;
      height: 52px; padding: 0 15px;
      border-bottom: 1px solid rgba(102,209,255,0.08);
      flex-shrink: 0; overflow: hidden; text-decoration: none;
    }
    .sb-logo-mark {
      width: 26px; height: 26px; border-radius: 7px; flex-shrink: 0;
      background: linear-gradient(135deg, rgba(102,209,255,0.28), rgba(36,163,135,0.32));
      border: 1px solid rgba(102,209,255,0.26);
      font-size: 0.66rem; font-weight: 900; letter-spacing: 0.02em;
      display: grid; place-items: center; color: #66d1ff;
    }
    .sb-logo-text {
      font-size: 0.82rem; font-weight: 700; color: #edf4ff;
      white-space: nowrap; opacity: 0; transition: opacity 0.14s 0.05s;
      letter-spacing: 0.02em;
    }
    #__sb:hover .sb-logo-text { opacity: 1; }

    /* ── Nav ── */
    .sb-nav {
      flex: 1; overflow-y: auto; overflow-x: hidden;
      padding: 8px 0 4px;
      display: flex; flex-direction: column;
      scrollbar-width: none;
    }
    .sb-nav::-webkit-scrollbar { display: none; }

    .sb-item {
      display: flex; align-items: center; gap: 13px;
      padding: 0 16px; height: 42px;
      text-decoration: none; color: rgba(142,163,189,0.75);
      border-left: 2px solid transparent;
      transition: color 0.13s, background 0.13s, border-left-color 0.13s;
      white-space: nowrap; overflow: hidden;
      flex-shrink: 0;
    }
    .sb-item:hover {
      color: #edf4ff;
      background: rgba(102,209,255,0.06);
      border-left-color: rgba(102,209,255,0.28);
    }
    .sb-item.act {
      color: #66d1ff; font-weight: 700;
      background: rgba(102,209,255,0.10);
      border-left-color: #66d1ff;
    }

    .sb-icon { width: 18px; height: 18px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
    .sb-icon svg { width: 18px; height: 18px; display: block; }

    .sb-label {
      font-size: 0.82rem; font-weight: 500;
      opacity: 0; transition: opacity 0.12s 0.05s;
      user-select: none;
    }
    #__sb:hover .sb-label { opacity: 1; }

    .sb-div { height: 1px; background: rgba(102,209,255,0.07); margin: 5px 12px; flex-shrink: 0; }

    /* ── Market status pill at bottom ── */
    .sb-bottom {
      padding: 8px 0;
      border-top: 1px solid rgba(102,209,255,0.08);
      flex-shrink: 0;
    }
    .sb-mkt {
      display: flex; align-items: center; gap: 12px;
      padding: 0 16px; height: 38px; overflow: hidden;
      cursor: default;
    }
    .sb-mkt-dot {
      width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
      background: #5a7490; transition: background 0.3s;
    }
    .sb-mkt.open .sb-mkt-dot, .sb-mkt.close_auction .sb-mkt-dot {
      background: #2ed09a; box-shadow: 0 0 7px rgba(46,208,154,.65);
      animation: sbPulse 2s infinite;
    }
    .sb-mkt.auction .sb-mkt-dot { background: #66d1ff; }
    .sb-mkt.pre .sb-mkt-dot { background: #f3b14b; }
    .sb-mkt-label {
      font-size: 0.75rem; white-space: nowrap;
      color: rgba(142,163,189,0.6);
      opacity: 0; transition: opacity 0.12s 0.05s;
    }
    .sb-mkt.open .sb-mkt-label,
    .sb-mkt.close_auction .sb-mkt-label { color: #2ed09a; }
    .sb-mkt.auction .sb-mkt-label { color: #66d1ff; }
    .sb-mkt.pre .sb-mkt-label { color: #f3b14b; }
    #__sb:hover .sb-mkt-label { opacity: 1; }

    @keyframes sbPulse { 0%,100%{opacity:1} 50%{opacity:.35} }

    /* ── Market status badge in topbar ── */
    .mkt-badge {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 3px 9px; border-radius: 99px; border: 1px solid;
      font-size: 0.68rem; font-weight: 700; letter-spacing: 0.03em;
      white-space: nowrap; flex-shrink: 0;
    }
    .mkt-badge-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

    .mkt-badge.open, .mkt-badge.close_auction {
      border-color: rgba(46,208,154,0.28); background: rgba(46,208,154,0.07); color: #2ed09a;
    }
    .mkt-badge.open .mkt-badge-dot, .mkt-badge.close_auction .mkt-badge-dot {
      background: #2ed09a; box-shadow: 0 0 6px rgba(46,208,154,.65); animation: sbPulse 2s infinite;
    }
    .mkt-badge.auction {
      border-color: rgba(102,209,255,0.26); background: rgba(102,209,255,0.07); color: #66d1ff;
    }
    .mkt-badge.auction .mkt-badge-dot { background: #66d1ff; }
    .mkt-badge.pre {
      border-color: rgba(243,177,75,0.24); background: rgba(243,177,75,0.07); color: #f3b14b;
    }
    .mkt-badge.pre .mkt-badge-dot { background: #f3b14b; }
    .mkt-badge.closed, .mkt-badge.lunch {
      border-color: rgba(90,116,144,0.22); background: rgba(90,116,144,0.06); color: #8ea3bd;
    }
    .mkt-badge.closed .mkt-badge-dot, .mkt-badge.lunch .mkt-badge-dot { background: #5a7490; }

    /* ── Light mode overrides ── */
    [data-theme="light"] #__sb {
      background: rgba(240, 246, 255, 0.99);
      border-right-color: rgba(50,80,130,0.11);
      box-shadow: 3px 0 20px rgba(0,0,0,0.07);
    }
    [data-theme="light"] .sb-logo   { border-bottom-color: rgba(50,80,130,0.10); }
    [data-theme="light"] .sb-logo-text { color: #0e1d2e; }
    [data-theme="light"] .sb-div    { background: rgba(50,80,130,0.09); }
    [data-theme="light"] .sb-bottom { border-top-color: rgba(50,80,130,0.10); }
    [data-theme="light"] .sb-item   { color: #849ab2; }
    [data-theme="light"] .sb-item:hover  { color: #0e1d2e; background: rgba(0,136,204,0.06); border-left-color: rgba(0,136,204,0.22); }
    [data-theme="light"] .sb-item.act   { color: #0088cc; background: rgba(0,136,204,0.10); border-left-color: #0088cc; }
    [data-theme="light"] .sb-mkt-label  { color: #849ab2; }
    [data-theme="light"] .sb-mkt.open .sb-mkt-label { color: #1a9c6a; }
    [data-theme="light"] .sb-mkt.open .sb-mkt-dot   { background: #1a9c6a; box-shadow: 0 0 7px rgba(26,156,106,.55); }

    /* Mobile: hide sidebar, restore topbar nav */
    @media (max-width: 768px) {
      #__sb { display: none !important; }
      body[data-sb] { padding-left: 0 !important; }
      body[data-sb] .page-nav  { display: flex !important; }
      body[data-sb] .brand-name { display: block !important; }
      body[data-sb] .brand-sep,
      body[data-sb] .topbar-divider:first-of-type { display: block !important; }
    }
  `;

  // ─────────────────────────────────────────────────────────────────────────────
  // Inject sidebar (skips landing/auth pages)
  // ─────────────────────────────────────────────────────────────────────────────
  function injectSidebar() {
    const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (["index.html", "", "auth.html", "debug.html"].includes(page)) return;
    if (document.getElementById("__sb")) return;

    // Inject CSS
    const styleEl = document.createElement("style");
    styleEl.id = "__sb-css";
    styleEl.textContent = SIDEBAR_CSS;
    document.head.appendChild(styleEl);

    // Mark body to apply padding/overrides
    document.body.setAttribute("data-sb", "true");

    // Build nav HTML
    let navHtml = "";
    NAV.forEach(n => {
      if (n.divider) navHtml += `<div class="sb-div"></div>`;
      const isActive = page === n.href.toLowerCase();
      navHtml += `<a href="${n.href}" class="sb-item${isActive ? " act" : ""}" title="${n.label}">
        <span class="sb-icon">${n.icon}</span>
        <span class="sb-label">${n.label}</span>
      </a>`;
    });

    // Build sidebar element
    const sb = document.createElement("aside");
    sb.id = "__sb";
    sb.setAttribute("aria-label", "Sidebar navigation");
    sb.innerHTML = `
      <a href="index.html" class="sb-logo" title="首页">
        <div class="sb-logo-mark">Sα</div>
        <span class="sb-logo-text">SummerMax Alpha</span>
      </a>
      <nav class="sb-nav">${navHtml}</nav>
      <div class="sb-bottom">
        <div class="sb-mkt" id="__sb-mkt">
          <span class="sb-mkt-dot"></span>
          <span class="sb-mkt-label">--</span>
        </div>
      </div>
    `;

    document.body.prepend(sb);

    // Sync market status
    function syncMkt() {
      const el = document.getElementById("__sb-mkt");
      if (!el) return;
      const m = window.__marketStatus();
      el.className = `sb-mkt ${m.s}`;
      el.querySelector(".sb-mkt-label").textContent = m.label;
    }
    syncMkt();
    setInterval(syncMkt, 60000);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Inject market-status badge into topbar
  // ─────────────────────────────────────────────────────────────────────────────
  function injectMarketBadge() {
    const topbar = document.querySelector(".topbar");
    if (!topbar || document.getElementById("__mkt-badge")) return;

    const badge = document.createElement("div");
    badge.id = "__mkt-badge";

    function syncBadge() {
      const m = window.__marketStatus();
      badge.className = `mkt-badge ${m.s}`;
      badge.innerHTML = `<span class="mkt-badge-dot"></span>${m.label}`;
    }
    syncBadge();
    setInterval(syncBadge, 60000);

    // Insert just before the theme-toggle button, or at end
    const toggle = topbar.querySelector(".theme-toggle");
    if (toggle) topbar.insertBefore(badge, toggle);
    else topbar.appendChild(badge);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DOMContentLoaded
  // ─────────────────────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(localStorage.getItem(KEY) || "dark");
    injectSidebar();
    injectMarketBadge();
  });
})();
