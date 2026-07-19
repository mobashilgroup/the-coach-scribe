/* The Coach Scribe — client portal (Spec §11).
 * The client reaches this page via a single-use magic link (#token=...). They
 * see ONLY what the coach shared, can update their tasks, and can leave a note
 * (optionally urgent). No coach tools, drafts, or internal data are exposed. */

const API = "";
const $ = (s, r = document) => r.querySelector(s);
const root = () => document.getElementById("portal");
const state = { token: sessionStorage.getItem("tcs_client_token") || null, client: null };

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2200);
}
async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body) headers["content-type"] = "application/json";
  if (state.token) headers.authorization = `Bearer ${state.token}`;
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.error && data.error.message) || `Error ${res.status}`);
  return data;
}

function tokenFromHash() {
  const m = location.hash.match(/token=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function boot() {
  const linkToken = tokenFromHash();
  if (linkToken) {
    try {
      const res = await api("/v1/client-portal/exchange", { method: "POST", body: { token: linkToken } });
      state.token = res.accessToken; state.client = res.client;
      sessionStorage.setItem("tcs_client_token", state.token);
      history.replaceState(null, "", location.pathname); // drop token from URL
    } catch (e) { return renderInvalid(e.message); }
  }
  if (!state.token) return renderInvalid("Open the portal using the secure link your coach sent you.");
  renderHome();
}

function renderInvalid(msg) {
  root().innerHTML = `<div class="auth-wrap"><div class="auth-card" style="text-align:center">
    <div class="logo"><div class="mark serif">The Coach Scribe</div><div class="by">Your coaching space</div></div>
    <p class="muted" data-testid="portal-invalid">${esc(msg)}</p></div></div>`;
}

async function renderHome() {
  root().innerHTML = `<div class="main" style="max-width:720px;margin:auto">
    <div class="page-title"><h1 class="serif" data-testid="portal-hello">Welcome</h1><div class="spacer"></div>
      <button class="link" id="signout">Sign out</button></div>
    <div id="body"><div class="empty">Loading…</div></div></div>`;
  $("#signout").onclick = () => { sessionStorage.removeItem("tcs_client_token"); state.token = null; renderInvalid("You have signed out."); };
  try {
    const [home, summaries, tasks, thread] = await Promise.all([
      api("/v1/client-portal/home"), api("/v1/client-portal/summaries"),
      api("/v1/client-portal/tasks"), api("/v1/client-portal/messages"),
    ]);
    $("[data-testid=portal-hello]").textContent = `Hello, ${home.client ? home.client.firstName : "there"}`;
    $("#body").innerHTML = `
      ${sharedBlock(summaries.summaries)}
      ${tasksBlock(tasks.tasks)}
      ${messagesBlock(thread.messages)}`;
    wire();
  } catch (e) { toast(e.message); if (String(e.message).match(/revoked|expired|invalid/i)) renderInvalid(e.message); }
}

function sharedBlock(summaries) {
  return `<div class="card"><h3 class="serif" style="margin-top:0">Shared summaries</h3>
    ${summaries.length ? summaries.map((s) => `<div class="list-item" data-summary="${s.id}" data-testid="portal-summary" style="cursor:pointer">
      <div><div style="font-weight:600">${esc(s.title || "Session summary")}</div>
      <div class="muted" style="font-size:13px">${s.sharedAt ? new Date(s.sharedAt).toLocaleDateString() : ""}</div></div>
      <div class="spacer"></div><span class="pill blue">View</span></div>`).join("")
      : `<div class="empty">Your coach hasn't shared a summary yet.</div>`}</div>`;
}
function tasksBlock(tasks) {
  return `<div class="card" style="margin-top:14px"><h3 class="serif" style="margin-top:0">This week's tasks</h3>
    ${tasks.length ? tasks.map((t) => `<div class="list-item">
      <div><div style="font-weight:600">${esc(t.title)}</div><div class="muted" style="font-size:13px">${esc(t.status.replace(/_/g, " "))}</div></div>
      <div class="spacer"></div>
      <select data-task="${t.id}" data-testid="portal-task" style="width:auto">
        ${["pending", "in_progress", "completed"].map((s) => `<option value="${s}" ${t.status === s ? "selected" : ""}>${s.replace(/_/g, " ")}</option>`).join("")}
      </select></div>`).join("")
      : `<div class="empty">No tasks assigned yet.</div>`}</div>`;
}
function messagesBlock(messages) {
  return `<div class="card" style="margin-top:14px"><h3 class="serif" style="margin-top:0">Notes &amp; questions</h3>
    <div data-testid="portal-thread">${messages.length ? messages.map((m) => `<div style="text-align:${m.direction === "coach_to_client" ? "left" : "right"};margin:6px 0">
      <span class="pill ${m.direction === "coach_to_client" ? "blue" : ""}">${m.direction === "coach_to_client" ? "Coach" : "You"}</span>
      <div style="font-size:14px">${esc(m.body)}</div></div>`).join("") : '<div class="muted" style="font-size:14px">No messages yet.</div>'}</div>
    <label style="margin-top:12px">Leave a note or question</label>
    <textarea id="noteBody" data-testid="portal-note" placeholder="Write to your coach…"></textarea>
    <label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" id="urgent" data-testid="portal-urgent" style="width:auto"/> Mark urgent (notifies your coach — not an emergency service)</label>
    <div class="row" style="margin-top:10px"><div class="spacer"></div><button class="btn" data-testid="portal-send">Send</button></div></div>`;
}

function wire() {
  root().querySelectorAll("[data-summary]").forEach((el) => (el.onclick = () => openSummary(el.dataset.summary)));
  root().querySelectorAll("[data-task]").forEach((sel) => (sel.onchange = async () => {
    try { await api(`/v1/client-portal/tasks/${sel.dataset.task}`, { method: "PATCH", body: { status: sel.value } }); toast("Task updated"); }
    catch (e) { toast(e.message); }
  }));
  $("[data-testid=portal-send]").onclick = async () => {
    const body = $("#noteBody").value.trim();
    if (!body) { toast("Write a note first"); return; }
    try {
      await api("/v1/client-portal/messages", { method: "POST", body: { body, urgent: $("#urgent").checked } });
      toast("Sent to your coach"); renderHome();
    } catch (e) { toast(e.message); }
  };
}

async function openSummary(id) {
  try {
    const { session, shared } = await api(`/v1/client-portal/summaries/${id}`);
    const list = (a) => Array.isArray(a) && a.length ? `<ul>${a.map((i) => `<li>${esc(typeof i === "string" ? i : i.title || "")}</li>`).join("")}</ul>` : "<p class='muted'>—</p>";
    root().innerHTML = `<div class="main" style="max-width:720px;margin:auto">
      <div class="page-title"><button class="btn ghost" id="back" style="padding:8px 12px">←</button>
        <h1 class="serif" style="font-size:22px">${esc(session.title || "Summary")}</h1></div>
      <div class="card">
        ${shared.summary !== undefined ? `<h3 class="serif">Summary</h3><p data-testid="portal-summary-text">${esc(shared.summary)}</p>` : ""}
        ${shared.topics ? `<h3 class="serif">Topics</h3>${list(shared.topics)}` : ""}
        ${shared.goals ? `<h3 class="serif">Goals</h3>${list(shared.goals)}` : ""}
        ${shared.reflection_questions ? `<h3 class="serif">Reflection questions</h3>${list(shared.reflection_questions)}` : ""}
      </div></div>`;
    $("#back").onclick = renderHome;
  } catch (e) { toast(e.message); }
}

boot();
