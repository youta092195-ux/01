const usersBody = document.querySelector("#adminUsers");
const stats = document.querySelector("#adminStats");
const audit = document.querySelector("#adminAudit");
const toast = document.querySelector("#adminToast");
const adminLogin = document.querySelector("#adminLogin");
const adminShell = document.querySelector(".admin-shell");
const adminLoginForm = document.querySelector("#adminLoginForm");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}

async function adminRequest(path, options = {}) {
  const response = await fetch(`/api/v1/admin${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) {
    let message = "管理操作に失敗しました。";
    try {
      message = (await response.json()).detail || message;
    } catch {}
    throw new Error(message);
  }
  return response.status === 204 ? null : response.json();
}

async function authRequest(path, options = {}) {
  const response = await fetch(`/api/v1/auth/${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) {
    let message = "ログインできませんでした。";
    try {
      message = (await response.json()).detail || message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

function showAdminShell() {
  adminLogin.hidden = true;
  adminShell.classList.add("ready");
}

function showAdminLogin(message = "") {
  adminLogin.hidden = false;
  adminShell.classList.remove("ready");
  document.querySelector("#adminLoginError").textContent = message;
}

function formatDate(value) {
  if (!value) return "－";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  }).format(new Date(value));
}

async function loadStats() {
  const data = await adminRequest("/stats");
  stats.innerHTML = [
    ["登録ユーザー", data.users],
    ["有効ユーザー", data.active_users],
    ["管理者", data.admins],
    ["有効セッション", data.sessions],
    ["動画解析", data.analyses]
  ].map(([label, value]) => `<article><small>${label}</small><strong>${Number(value).toLocaleString()}</strong></article>`).join("");
}

async function loadUsers(query = "") {
  const users = await adminRequest(`/users?query=${encodeURIComponent(query)}`);
  if (!users.length) {
    usersBody.innerHTML = '<tr><td colspan="5">該当するユーザーはいません。</td></tr>';
    return;
  }
  usersBody.innerHTML = users.map((user) => `
    <tr data-user-id="${escapeHtml(user.id)}">
      <td><strong>${escapeHtml(user.username)}</strong><span>${escapeHtml(user.login_id)}・${escapeHtml(user.member_number || "番号なし")}</span><small>${escapeHtml(user.email || "メールなし")}</small></td>
      <td><select data-role aria-label="${escapeHtml(user.username)}の権限"><option value="user"${user.role === "user" ? " selected" : ""}>一般</option><option value="admin"${user.role === "admin" ? " selected" : ""}>管理者</option></select></td>
      <td><span class="admin-status ${user.is_active ? "active" : "disabled"}">${user.is_active ? "有効" : "停止中"}</span></td>
      <td><small>登録 ${formatDate(user.created_at)}</small><small>最終 ${formatDate(user.last_login_at)}</small></td>
      <td><div class="admin-actions"><button type="button" data-action="sessions">セッション失効</button><button type="button" data-action="status" class="${user.is_active ? "danger" : "primary"}">${user.is_active ? "停止" : "再開"}</button></div></td>
    </tr>
  `).join("");
}

async function loadAudit() {
  const entries = await adminRequest("/audit");
  audit.innerHTML = entries.length ? entries.map((entry) => `
    <article><span>${escapeHtml(entry.action)}</span><div><strong>${escapeHtml(entry.actor_login_id || "system")}</strong><small>${escapeHtml(entry.target_user_id || "対象なし")}${entry.detail ? `・${escapeHtml(entry.detail)}` : ""}</small></div><time>${formatDate(entry.created_at)}</time></article>
  `).join("") : "<p>監査ログはまだありません。</p>";
}

async function refreshAll(query = "") {
  try {
    await Promise.all([loadStats(), loadUsers(query), loadAudit()]);
  } catch (error) {
    showToast(error.message);
  }
}

document.querySelector("#adminSearch").addEventListener("submit", (event) => {
  event.preventDefault();
  loadUsers(document.querySelector("#adminSearchInput").value.trim()).catch((error) => showToast(error.message));
});

document.querySelector("#refreshAdmin").addEventListener("click", () => refreshAll(document.querySelector("#adminSearchInput").value.trim()));

usersBody.addEventListener("change", async (event) => {
  const select = event.target.closest("[data-role]");
  if (!select) return;
  const row = select.closest("[data-user-id]");
  if (!confirm(`このユーザーの権限を「${select.options[select.selectedIndex].text}」へ変更しますか？ 現在のセッションは失効します。`)) {
    await loadUsers(document.querySelector("#adminSearchInput").value.trim());
    return;
  }
  try {
    await adminRequest(`/users/${row.dataset.userId}/role`, { method: "PATCH", body: JSON.stringify({ role: select.value }) });
    showToast("権限を変更しました。");
    await refreshAll(document.querySelector("#adminSearchInput").value.trim());
  } catch (error) {
    showToast(error.message);
    await loadUsers(document.querySelector("#adminSearchInput").value.trim());
  }
});

usersBody.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const row = button.closest("[data-user-id]");
  try {
    if (button.dataset.action === "sessions") {
      if (!confirm("このユーザーをすべての端末からログアウトさせますか？")) return;
      await adminRequest(`/users/${row.dataset.userId}/revoke-sessions`, { method: "POST" });
      showToast("全セッションを失効しました。");
    } else {
      const enable = button.textContent === "再開";
      if (!confirm(enable ? "このアカウントを再開しますか？" : "このアカウントを停止し、全端末からログアウトさせますか？")) return;
      await adminRequest(`/users/${row.dataset.userId}/status`, { method: "PATCH", body: JSON.stringify({ is_active: enable }) });
      showToast(enable ? "アカウントを再開しました。" : "アカウントを停止しました。");
    }
    await refreshAll(document.querySelector("#adminSearchInput").value.trim());
  } catch (error) {
    showToast(error.message);
  }
});

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(adminLoginForm);
  const submit = adminLoginForm.querySelector("button");
  submit.disabled = true;
  document.querySelector("#adminLoginError").textContent = "";
  try {
    const user = await authRequest("login", {
      method: "POST",
      body: JSON.stringify({
        login_id: data.get("login_id"),
        password: data.get("password")
      })
    });
    if (user.role !== "admin") {
      await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
      throw new Error("管理者権限のあるアカウントではありません。");
    }
    adminLoginForm.reset();
    showAdminShell();
    await refreshAll();
  } catch (error) {
    showAdminLogin(error.message);
  } finally {
    submit.disabled = false;
  }
});

authRequest("me")
  .then((user) => {
    if (user.role !== "admin") throw new Error();
    showAdminShell();
    return refreshAll();
  })
  .catch(() => showAdminLogin());
