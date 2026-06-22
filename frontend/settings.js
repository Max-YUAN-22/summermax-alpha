const DEFAULT_API_BASE = "https://summermax-alpha-api.onrender.com";

function getApiBase() {
  const saved = localStorage.getItem("summermax-alpha-api-base");
  return (saved || DEFAULT_API_BASE).trim().replace(/\/+$/, "");
}

function getToken() {
  return localStorage.getItem("summermax-token") || "";
}

function getAuthHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Models catalog ────────────────────────────────────────────────────────────

const MODELS = [
  {
    id: "claude-sonnet-4-6",
    provider: "claude",
    name: "Claude Sonnet 4.6",
    desc: "Anthropic 最新旗舰推理模型，分析深度最强，工具调用最稳定",
    badge: "推荐",
    badgeCls: "badge-rec",
  },
  {
    id: "claude-opus-4-7",
    provider: "claude",
    name: "Claude Opus 4.7",
    desc: "Anthropic 超强推理，适合复杂多步骤分析任务",
    badge: "强力",
    badgeCls: "badge-fast",
  },
  {
    id: "claude-haiku-4-5-20251001",
    provider: "claude",
    name: "Claude Haiku 4.5",
    desc: "Anthropic 轻量快速，响应最快，消耗积分最少",
    badge: "省点",
    badgeCls: "badge-eco",
  },
  {
    id: "gpt-4o",
    provider: "openai",
    name: "GPT-4o",
    desc: "OpenAI 旗舰多模态模型，综合能力均衡，适合通用分析",
    badge: "GPT",
    badgeCls: "badge-fast",
  },
  {
    id: "gpt-4o-mini",
    provider: "openai",
    name: "GPT-4o Mini",
    desc: "OpenAI 轻量版，速度快、成本低，日常行情问答首选",
    badge: "省点",
    badgeCls: "badge-eco",
  },
];

// ── State ─────────────────────────────────────────────────────────────────────

let currentUser = null;
let selectedModel = "";

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const token = getToken();
  if (!token) {
    window.location.href = "auth.html";
    return;
  }

  try {
    const res = await fetch(`${getApiBase()}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      localStorage.removeItem("summermax-token");
      window.location.href = "auth.html";
      return;
    }
    if (!res.ok) throw new Error("无法获取用户信息");
    currentUser = await res.json();
  } catch (err) {
    showStatus("pwStatus", "err", "连接服务器失败，请刷新重试");
    return;
  }

  renderUserBadge();
  populateAccountTab();
  renderModelGrid();

  if (currentUser.role === "admin") {
    document.querySelectorAll(".admin-only").forEach((el) => (el.style.display = ""));
    loadAdminUsers();
  }

  // Load balance tab data when user switches to it
  loadBalanceTab();
}

// ── User badge ────────────────────────────────────────────────────────────────

function renderUserBadge() {
  const badge = document.getElementById("userBadge");
  if (!badge || !currentUser) return;
  const label = currentUser.role === "admin" ? "管理员" : "用户";
  const balance = currentUser.role === "admin" ? "∞" : (currentUser.balance ?? "--");
  badge.innerHTML = `
    <span style="font-size:0.76rem;color:var(--muted)">${currentUser.email}</span>
    <span style="font-size:0.7rem;color:var(--accent);font-weight:700">${balance} 积分</span>
    <span class="user-role ${currentUser.role === "admin" ? "admin" : ""}">${label}</span>
    <button class="logout-btn" id="logoutBtn">退出</button>
  `;
  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("summermax-token");
    localStorage.removeItem("summermax-email");
    localStorage.removeItem("summermax-role");
    window.location.href = "auth.html";
  });
}

// ── Tab switching ─────────────────────────────────────────────────────────────

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

// ── Account tab ───────────────────────────────────────────────────────────────

function populateAccountTab() {
  const emailEl = document.getElementById("accountEmail");
  const roleEl = document.getElementById("accountRole");
  if (emailEl) emailEl.value = currentUser.email || "";
  if (roleEl) roleEl.value = currentUser.role === "admin" ? "管理员" : "普通用户";
}

document.getElementById("changePwBtn").addEventListener("click", async () => {
  const cur = document.getElementById("curPassword").value;
  const nw1 = document.getElementById("newPassword").value;
  const nw2 = document.getElementById("newPassword2").value;
  const statusEl = document.getElementById("pwStatus");

  if (!cur || !nw1 || !nw2) return showStatus("pwStatus", "err", "请填写所有密码字段");
  if (nw1.length < 8) return showStatus("pwStatus", "err", "新密码至少需要 8 位");
  if (nw1 !== nw2) return showStatus("pwStatus", "err", "两次输入的新密码不一致");

  const btn = document.getElementById("changePwBtn");
  btn.disabled = true;
  showStatus("pwStatus", "info", "提交中…");

  try {
    const res = await fetch(`${getApiBase()}/user/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ current_password: cur, new_password: nw1 }),
    });
    const data = await res.json();
    if (!res.ok) return showStatus("pwStatus", "err", data.detail || "修改失败");
    showStatus("pwStatus", "ok", "密码已修改成功");
    document.getElementById("curPassword").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("newPassword2").value = "";
  } catch {
    showStatus("pwStatus", "err", "网络错误，请重试");
  } finally {
    btn.disabled = false;
  }
});

// ── Balance tab ───────────────────────────────────────────────────────────────

async function loadBalanceTab() {
  const balNum = document.getElementById("balanceNum");
  if (balNum) {
    balNum.textContent = currentUser.role === "admin" ? "∞" : (currentUser.balance ?? "--");
  }

  try {
    const res = await fetch(`${getApiBase()}/user/usage`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderUsageLog(data.usage || []);
  } catch {
    document.getElementById("usageList").innerHTML =
      `<div style="color:var(--muted-2);font-size:0.78rem;padding:8px 0">暂无使用记录</div>`;
  }
}

function renderUsageLog(usage) {
  const el = document.getElementById("usageList");
  if (!usage.length) {
    el.innerHTML = `<div style="color:var(--muted-2);font-size:0.78rem;padding:8px 0">暂无使用记录</div>`;
    return;
  }
  el.innerHTML = usage.map((u) => `
    <div class="usage-row">
      <div>
        <div>${u.action === "chat" ? "AI 对话" : u.action}</div>
        <div class="usage-model">${u.model || "--"}</div>
      </div>
      <div style="text-align:right">
        <div class="usage-cost">-${u.cost} 积分</div>
        <div class="usage-time">${formatTime(u.created_at)}</div>
      </div>
    </div>
  `).join("");
}

function formatTime(ts) {
  if (!ts) return "--";
  try {
    const d = new Date(ts.replace(" ", "T") + "Z");
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return ts; }
}

// ── Model tab ─────────────────────────────────────────────────────────────────

function renderModelGrid() {
  selectedModel = currentUser.llm_model || MODELS[0].id;
  const grid = document.getElementById("modelGrid");

  const providerLabel = { claude: "🟣 Anthropic · Claude", openai: "🟢 OpenAI · GPT" };
  const providers = [...new Set(MODELS.map((m) => m.provider))];

  grid.style.gridTemplateColumns = "1fr";
  grid.innerHTML = providers.map((prov) => {
    const cards = MODELS.filter((m) => m.provider === prov).map((m) => `
      <div class="model-card ${selectedModel === m.id ? "selected" : ""}" data-id="${m.id}" style="flex:1;min-width:180px">
        <input type="radio" name="model" value="${m.id}" ${selectedModel === m.id ? "checked" : ""} />
        <div class="model-name">
          ${m.name}
          <span class="model-badge ${m.badgeCls}">${m.badge}</span>
        </div>
        <div class="model-desc">${m.desc}</div>
      </div>
    `).join("");
    return `
      <div style="margin-bottom:14px">
        <div style="font-size:0.72rem;font-weight:700;color:var(--muted-2);letter-spacing:0.05em;margin-bottom:8px">${providerLabel[prov] || prov}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${cards}</div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".model-card").forEach((card) => {
    card.addEventListener("click", () => {
      grid.querySelectorAll(".model-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      const radio = card.querySelector("input[type='radio']");
      if (radio) radio.checked = true;
      selectedModel = card.dataset.id;
    });
  });
}

document.getElementById("saveModelBtn").addEventListener("click", async () => {
  const btn = document.getElementById("saveModelBtn");
  btn.disabled = true;
  showStatus("modelStatus", "info", "保存中…");

  try {
    const res = await fetch(`${getApiBase()}/user/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ llm_model: selectedModel }),
    });
    const data = await res.json();
    if (!res.ok) return showStatus("modelStatus", "err", data.detail || "保存失败");
    currentUser.llm_model = selectedModel;
    showStatus("modelStatus", "ok", "模型设置已保存，下次对话生效");
  } catch {
    showStatus("modelStatus", "err", "网络错误，请重试");
  } finally {
    btn.disabled = false;
  }
});

// ── Admin tab ─────────────────────────────────────────────────────────────────

async function loadAdminUsers() {
  try {
    const res = await fetch(`${getApiBase()}/admin/users`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderUserTable(data.users || []);
  } catch {
    document.getElementById("userListWrap").innerHTML =
      `<div style="color:var(--muted-2);font-size:0.78rem;padding:8px 0">加载失败</div>`;
  }
}

function renderUserTable(users) {
  const wrap = document.getElementById("userListWrap");
  if (!users.length) {
    wrap.innerHTML = `<div style="color:var(--muted-2);font-size:0.78rem;padding:8px 0">暂无用户</div>`;
    return;
  }
  wrap.innerHTML = `
    <table class="user-table">
      <thead>
        <tr>
          <th>邮箱</th>
          <th>角色</th>
          <th>余额</th>
          <th>注册时间</th>
        </tr>
      </thead>
      <tbody>
        ${users.map((u) => `
          <tr>
            <td>${u.email}</td>
            <td class="${u.role === "admin" ? "td-role-admin" : ""}">${u.role === "admin" ? "管理员" : "用户"}</td>
            <td class="td-balance">${u.balance}</td>
            <td style="color:var(--muted-2)">${u.created_at ? u.created_at.slice(0, 10) : "--"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

document.getElementById("adminAddBtn").addEventListener("click", async () => {
  const email = document.getElementById("adminEmail").value.trim();
  const delta = parseInt(document.getElementById("adminDelta").value, 10);

  if (!email) return showStatus("adminStatus", "err", "请输入用户邮箱");
  if (isNaN(delta) || delta === 0) return showStatus("adminStatus", "err", "请输入有效积分数量");

  const btn = document.getElementById("adminAddBtn");
  btn.disabled = true;
  showStatus("adminStatus", "info", "操作中…");

  try {
    const res = await fetch(`${getApiBase()}/admin/balance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ email, delta }),
    });
    const data = await res.json();
    if (!res.ok) return showStatus("adminStatus", "err", data.detail || "操作失败");
    showStatus("adminStatus", "ok", `已为 ${email} ${delta > 0 ? "充值" : "扣除"} ${Math.abs(delta)} 积分`);
    loadAdminUsers();
  } catch {
    showStatus("adminStatus", "err", "网络错误，请重试");
  } finally {
    btn.disabled = false;
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function showStatus(id, type, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `status-msg ${type}`;
  if (type === "ok" || type === "info") {
    setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 4000);
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

init();
