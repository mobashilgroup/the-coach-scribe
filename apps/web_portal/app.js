/* The Coach Scribe — coach web console.
 * Plain ES module, no build step. Every action calls the real API on the same
 * origin. No secrets live here; the browser only holds the coach's own access
 * token (Spec §19.5). */

const API = ""; // same origin as the API server
const $ = (sel, root = document) => root.querySelector(sel);
const app = () => document.getElementById("app");

const state = {
  token: localStorage.getItem("tcs_token") || null,
  user: JSON.parse(localStorage.getItem("tcs_user") || "null"),
  view: "dashboard",
  clients: [],
  sessions: [],
  current: null, // active session detail
};

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function initials(name) {
  return (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

async function api(path, { method = "GET", body, raw } = {}) {
  const headers = {};
  if (body && !raw) headers["content-type"] = "application/json";
  if (raw) headers["content-type"] = "application/octet-stream";
  if (state.token) headers.authorization = `Bearer ${state.token}`;
  const res = await fetch(API + path, { method, headers, body: raw ? body : body ? JSON.stringify(body) : undefined });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = data && data.error && data.error.code;
    throw err;
  }
  return data;
}

function setSession(auth) {
  state.token = auth.accessToken;
  state.user = auth.user;
  localStorage.setItem("tcs_token", auth.token || auth.accessToken);
  localStorage.setItem("tcs_user", JSON.stringify(auth.user));
}
function signOut() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("tcs_token");
  localStorage.removeItem("tcs_user");
  renderAuth();
}

/* ------------------------------------------------------------------ Auth -- */
function renderAuth(mode = "login") {
  app().innerHTML = `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="logo">
        <div class="mark serif">The Coach Scribe</div>
        <div class="by">Powered by Mobashil Group S.A.</div>
      </div>
      <div id="authForm"></div>
    </div>
  </div>`;
  mode === "login" ? loginForm() : registerForm();
}

async function continueWithGoogle() {
  try {
    const { url } = await api("/v1/auth/oauth/google/url");
    window.location.href = url;
  } catch (e) {
    // 501 until the owner provisions Google credentials — inform gracefully.
    toast(e.status === 501 ? "Google sign-in isn't enabled yet" : e.message);
  }
}

function loginForm() {
  $("#authForm").innerHTML = `
    <h2 class="serif" style="margin:0 0 4px">Welcome back, Coach</h2>
    <p class="muted" style="margin:0 0 8px">Sign in to your practice.</p>
    <label>Email</label><input id="email" type="email" data-testid="login-email" autocomplete="username" />
    <label>Password</label><input id="password" type="password" data-testid="login-password" autocomplete="current-password" />
    <div class="error-text" id="err"></div>
    <button class="btn block" data-testid="login-submit" style="margin-top:12px">Log In</button>
    <button class="btn ghost block" data-testid="login-google" style="margin-top:10px">Continue with Google</button>
    <p class="muted" style="text-align:center;margin-top:16px">No account?
      <button class="link" id="toRegister" data-testid="to-register">Create one</button></p>`;
  $("#toRegister").onclick = registerForm;
  $("[data-testid=login-google]").onclick = continueWithGoogle;
  $("[data-testid=login-submit]").onclick = async () => {
    try {
      const auth = await api("/v1/auth/login", { method: "POST", body: { email: $("#email").value.trim(), password: $("#password").value } });
      setSession(auth);
      renderApp("dashboard");
    } catch (e) { $("#err").textContent = e.message; }
  };
}

function registerForm() {
  $("#authForm").innerHTML = `
    <h2 class="serif" style="margin:0 0 4px">Create your account</h2>
    <p class="muted" style="margin:0 0 8px">Start documenting sessions in minutes.</p>
    <label>First name</label><input id="firstName" data-testid="reg-firstname" />
    <label>Practice / organization (optional)</label><input id="orgName" data-testid="reg-org" />
    <label>Email</label><input id="email" type="email" data-testid="reg-email" autocomplete="username" />
    <label>Password</label><input id="password" type="password" data-testid="reg-password" autocomplete="new-password" />
    <label style="display:flex;gap:8px;align-items:center;margin-top:14px;color:var(--ink)">
      <input type="checkbox" id="terms" data-testid="reg-terms" style="width:auto" /> I accept the Terms &amp; Privacy Policy</label>
    <div class="error-text" id="err"></div>
    <button class="btn block" data-testid="reg-submit" style="margin-top:12px">Create Account</button>
    <p class="muted" style="text-align:center;margin-top:16px">Already have an account?
      <button class="link" id="toLogin" data-testid="to-login">Log in</button></p>`;
  $("#toLogin").onclick = loginForm;
  $("[data-testid=reg-submit]").onclick = async () => {
    if (!$("#terms").checked) { $("#err").textContent = "You must accept the terms"; return; }
    try {
      const auth = await api("/v1/auth/register", { method: "POST", body: {
        firstName: $("#firstName").value.trim(),
        organizationName: $("#orgName").value.trim() || undefined,
        email: $("#email").value.trim(),
        password: $("#password").value,
        acceptedTerms: true,
      }});
      setSession(auth);
      renderApp("dashboard");
    } catch (e) { $("#err").textContent = e.message; }
  };
}

/* ------------------------------------------------------------- App shell -- */
function renderApp(view) {
  state.view = view || state.view;
  app().innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <div class="brand serif">The Coach Scribe<span class="by">Mobashil Group S.A.</span></div>
      <nav class="nav">
        ${navBtn("dashboard", "Dashboard")}
        ${navBtn("clients", "Clients")}
        ${navBtn("newSession", "New Session")}
        ${navBtn("history", "Session History")}
        ${navBtn("messages", "Messages")}
      </nav>
      <div style="position:absolute;bottom:24px">
        <button class="link" data-testid="signout" style="color:#bbb">Sign out</button>
      </div>
    </aside>
    <main class="main" id="main"></main>
  </div>`;
  app().querySelectorAll("[data-nav]").forEach((b) => (b.onclick = () => renderApp(b.dataset.nav)));
  $("[data-testid=signout]").onclick = signOut;
  routes[state.view] ? routes[state.view]() : viewDashboard();
}
function navBtn(id, label) {
  return `<button data-nav="${id}" data-testid="nav-${id}" class="${state.view === id ? "active" : ""}">${label}</button>`;
}

/* ------------------------------------------------------------- Dashboard -- */
async function viewDashboard() {
  const main = $("#main");
  main.innerHTML = `<div class="page-title"><h1 class="serif">Hello, ${esc(state.user?.firstName || "Coach")}</h1></div>
    <div class="row" style="margin-bottom:20px">
      <button class="btn dark" data-testid="dash-new-session">＋ New Session</button>
      <button class="btn ghost" data-testid="dash-add-client">＋ Add Client</button>
    </div>
    <div class="grid cols-3" id="stats"></div>
    <h3 class="serif" style="margin-top:26px">Recent sessions</h3>
    <div class="card" id="recent"><div class="empty">Loading…</div></div>`;
  $("[data-testid=dash-new-session]").onclick = () => renderApp("newSession");
  $("[data-testid=dash-add-client]").onclick = () => renderApp("clients");
  try {
    const [{ clients }, { sessions }] = await Promise.all([api("/v1/clients"), api("/v1/sessions")]);
    state.clients = clients; state.sessions = sessions;
    $("#stats").innerHTML = `
      ${statCard(clients.length, "Clients")}
      ${statCard(sessions.length, "Sessions")}
      ${statCard(sessions.filter((s) => s.status === "review_required").length, "Awaiting review")}`;
    $("#recent").innerHTML = sessions.length
      ? sessions.slice(0, 6).map(sessionRow).join("")
      : `<div class="empty">No sessions yet. Start with <b>New Session</b>.</div>`;
    wireSessionRows($("#recent"));
  } catch (e) { toast(e.message); }
}
function statCard(n, l) { return `<div class="card stat"><div class="n">${n}</div><div class="l">${l}</div></div>`; }

/* --------------------------------------------------------------- Clients -- */
async function viewClients() {
  const main = $("#main");
  main.innerHTML = `<div class="page-title"><h1 class="serif">Clients</h1><div class="spacer"></div>
    <button class="btn" data-testid="add-client-open">＋ Add Client</button></div>
    <div class="card" id="clientList"><div class="empty">Loading…</div></div>`;
  $("[data-testid=add-client-open]").onclick = openAddClient;
  try {
    const { clients } = await api("/v1/clients");
    state.clients = clients;
    $("#clientList").innerHTML = clients.length
      ? clients.map((c) => {
          const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
          return `<div class="list-item"><div class="avatar">${initials(name)}</div>
            <div><div style="font-weight:600" data-testid="client-name">${esc(name)}</div>
            <div class="muted" style="font-size:13px">${esc(c.email || "No email")}</div></div>
            <div class="spacer"></div><span class="pill">${esc(c.portalStatus)}</span>
            <button class="btn ghost" data-invite="${c.id}" data-testid="client-invite" style="padding:6px 12px">Invite to portal</button></div>`;
        }).join("")
      : `<div class="empty">No clients yet.</div>`;
    $("#clientList").querySelectorAll("[data-invite]").forEach((b) => (b.onclick = () => inviteClient(b.dataset.invite)));
  } catch (e) { toast(e.message); }
}
function openAddClient() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal">
    <h2 class="serif" style="margin-top:0">Add Client</h2>
    <label>First name *</label><input id="cFirst" data-testid="client-first" />
    <label>Last name</label><input id="cLast" data-testid="client-last" />
    <label>Email</label><input id="cEmail" type="email" data-testid="client-email" />
    <div class="error-text" id="cErr"></div>
    <div class="row" style="margin-top:14px"><div class="spacer"></div>
      <button class="btn ghost" data-testid="client-cancel">Cancel</button>
      <button class="btn" data-testid="client-save">Save Client</button></div></div>`;
  document.body.appendChild(modal);
  $("[data-testid=client-cancel]", modal).onclick = () => modal.remove();
  $("[data-testid=client-save]", modal).onclick = async () => {
    const firstName = $("#cFirst", modal).value.trim();
    if (!firstName) { $("#cErr", modal).textContent = "First name is required"; return; }
    try {
      await api("/v1/clients", { method: "POST", body: {
        firstName, lastName: $("#cLast", modal).value.trim() || undefined, email: $("#cEmail", modal).value.trim() || undefined } });
      modal.remove(); toast("New client onboarded"); viewClients();
    } catch (e) { $("#cErr", modal).textContent = e.message; }
  };
}

/* ----------------------------------------------------------- New Session -- */
let draft = { clientId: "", method: "free_text" };
async function viewNewSession() {
  const main = $("#main");
  try { const { clients } = await api("/v1/clients"); state.clients = clients; } catch (e) { toast(e.message); }
  if (!state.clients.length) {
    main.innerHTML = `<div class="page-title"><h1 class="serif">New Session</h1></div>
      <div class="card empty">Add a client first. <button class="link" data-testid="go-clients">Go to Clients</button></div>`;
    $("[data-testid=go-clients]").onclick = () => renderApp("clients");
    return;
  }
  main.innerHTML = `<div class="page-title"><h1 class="serif">New Session</h1></div>
    <div class="card">
      <label>Client</label>
      <select id="client" data-testid="session-client">${state.clients.map((c) => `<option value="${c.id}">${esc([c.firstName, c.lastName].filter(Boolean).join(" "))}</option>`).join("")}</select>
      <label>Title (optional)</label><input id="title" data-testid="session-title" placeholder="Weekly session" />
      <label>Input method</label>
      <div class="method-grid">
        <div class="method selected" data-method="free_text" data-testid="method-free_text"><div class="t">✎ Write Free Text</div><div class="muted" style="font-size:13px">Type notes taken outside the app</div></div>
        <div class="method" data-method="upload_audio" data-testid="method-upload_audio"><div class="t">⭑ Upload Audio</div><div class="muted" style="font-size:13px">Upload a recording (consent required)</div></div>
      </div>
      <div id="methodBody" style="margin-top:16px"></div>
    </div>`;
  draft.method = "free_text";
  main.querySelectorAll(".method").forEach((m) => (m.onclick = () => {
    main.querySelectorAll(".method").forEach((x) => x.classList.remove("selected"));
    m.classList.add("selected"); draft.method = m.dataset.method; renderMethodBody();
  }));
  renderMethodBody();
}
function renderMethodBody() {
  const body = $("#methodBody");
  if (draft.method === "free_text") {
    body.innerHTML = `<label>Session notes</label>
      <textarea id="freeText" data-testid="session-freetext" placeholder="What happened in the session…"></textarea>
      <div class="error-text" id="nsErr"></div>
      <button class="btn" data-testid="create-process" style="margin-top:6px">Generate Summary</button>`;
    $("[data-testid=create-process]").onclick = createFreeText;
  } else {
    body.innerHTML = `<div class="card" style="background:#faf9f6">
        <b>Recording Consent</b>
        <p class="muted" style="font-size:14px">This conversation will be transcribed and analyzed. The audio is deleted after processing per your retention settings. You confirm the client was informed and consented. Some jurisdictions require all-party consent.</p>
        <label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" id="consent" data-testid="consent-check" style="width:auto" /> I informed the client and recorded their consent.</label>
      </div>
      <label style="margin-top:14px">Audio file</label>
      <input type="file" id="audio" data-testid="session-audio" accept="audio/*,video/*" />
      <div class="error-text" id="nsErr"></div>
      <button class="btn" data-testid="create-upload" style="margin-top:10px" disabled>Upload &amp; Process</button>`;
    const btn = $("[data-testid=create-upload]");
    $("#consent").onchange = () => (btn.disabled = !$("#consent").checked); // gate (Spec §10.11)
    btn.onclick = createAudio;
  }
}

async function createFreeText() {
  const err = $("#nsErr");
  const freeText = $("#freeText").value.trim();
  if (!freeText) { err.textContent = "Please write some notes first"; return; }
  const btn = $("[data-testid=create-process]"); btn.disabled = true; btn.textContent = "Processing…";
  try {
    const { session } = await api("/v1/sessions", { method: "POST", body: {
      clientId: $("#client").value, inputMethod: "free_text", title: $("#title").value.trim() || undefined, freeText, outputLanguage: "en" } });
    await api(`/v1/sessions/${session.id}/process`, { method: "POST", body: {} });
    toast("Summary ready for review"); openSession(session.id);
  } catch (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = "Generate Summary"; }
}

async function createAudio() {
  const err = $("#nsErr");
  const file = $("#audio").files[0];
  if (!file) { err.textContent = "Choose an audio file"; return; }
  const btn = $("[data-testid=create-upload]"); btn.disabled = true; btn.textContent = "Uploading…";
  try {
    const { session } = await api("/v1/sessions", { method: "POST", body: {
      clientId: $("#client").value, inputMethod: "upload_audio", title: $("#title").value.trim() || undefined,
      durationSeconds: 1500, outputLanguage: "en" } });
    // Consent before touching the media (Spec §10.11).
    await api(`/v1/sessions/${session.id}/consent`, { method: "POST", body: { confirmed: true, method: "coach_checkbox" } });
    // Chunked, resumable upload (Spec §15.1).
    const buf = new Uint8Array(await file.arrayBuffer());
    const chunkSize = 1024 * 512;
    const totalChunks = Math.max(1, Math.ceil(buf.length / chunkSize));
    const init = await api(`/v1/sessions/${session.id}/upload/init`, { method: "POST", body: {
      fileName: file.name, mimeType: file.type || "audio/mpeg", totalSize: buf.length, totalChunks } });
    for (let i = 0; i < totalChunks; i++) {
      const slice = buf.slice(i * chunkSize, (i + 1) * chunkSize);
      await api(`/v1/sessions/${session.id}/upload/${init.uploadId}/chunk/${i}`, {
        method: "PUT", raw: true, body: slice, });
    }
    await api(`/v1/sessions/${session.id}/upload/${init.uploadId}/complete`, { method: "POST", body: { totalChunks, fileName: file.name } });
    btn.textContent = "Transcribing…";
    await api(`/v1/sessions/${session.id}/process`, { method: "POST", body: {} });
    toast("Transcript & summary ready"); openSession(session.id);
  } catch (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = "Upload & Process"; }
}

/* -------------------------------------------------------- Session review -- */
async function openSession(id) {
  state.view = "session";
  const main = $("#main");
  main.innerHTML = `<div class="empty">Loading session…</div>`;
  try {
    const data = await api(`/v1/sessions/${id}`);
    state.current = data;
    renderSession(data);
  } catch (e) { toast(e.message); }
}

function statusPill(s) {
  const map = { review_required: "gold", approved: "green", shared: "blue" };
  return `<span class="pill ${map[s] || ""}" data-testid="session-status">${esc(s.replace(/_/g, " "))}</span>`;
}

function renderSession(data) {
  const { session, summary, transcript, speakers } = data;
  const c = summary ? summary.contentJson : {};
  const main = $("#main");
  const clientName = state.clients.find((x) => x.id === session.clientId);
  main.innerHTML = `
    <div class="page-title">
      <button class="btn ghost" data-testid="back" style="padding:8px 12px">←</button>
      <h1 class="serif" style="font-size:24px">${esc(session.title || "Session")}</h1>
      ${statusPill(session.status)}
      <div class="spacer"></div>
      <button class="btn dark" data-testid="approve" ${session.status !== "review_required" ? "disabled" : ""}>Approve</button>
      <button class="btn" data-testid="share" ${session.status !== "approved" ? "disabled" : ""}>Share</button>
    </div>
    <p class="muted">${session.status === "shared" ? "Shared with client." : "AI-generated · review and edit before sharing."}</p>
    <div class="card">
      ${field("Executive Summary", "summary", c.summary || "", true)}
      ${listField("Main Topics", c.topics)}
      ${listField("Strengths & Resources", c.strengths)}
      ${listField("Obstacles", c.obstacles)}
      ${tasksField(c.action_items)}
      ${listField("Reflection Questions", c.reflection_questions)}
      ${transcript && transcript.length ? transcriptBlock(transcript, speakers) : ""}
    </div>
    <div class="row" style="margin-top:16px">
      <button class="btn ghost" data-testid="save-summary">Save edits</button>
      <button class="btn ghost" data-testid="export-json">Export JSON</button>
      <button class="btn ghost" data-testid="export-html">Export / Print</button>
    </div>`;
  $("[data-testid=back]").onclick = () => renderApp("history");
  $("[data-testid=approve]").onclick = () => approveSession(session.id);
  $("[data-testid=share]").onclick = () => openShare(session.id);
  $("[data-testid=save-summary]").onclick = () => saveSummary(session.id);
  $("[data-testid=export-json]").onclick = () => window.open(`${API}/v1/sessions/${session.id}/export?format=json`, "_blank");
  $("[data-testid=export-html]").onclick = () => window.open(`${API}/v1/sessions/${session.id}/export?format=html`, "_blank");
}
function field(label, key, value, editable) {
  return `<div class="summary-field"><label>${label}<span class="badge-ai">AI</span></label>
    <textarea data-field="${key}" ${editable ? "" : "readonly"} style="min-height:80px">${esc(value)}</textarea></div>`;
}
function listField(label, arr) {
  const items = Array.isArray(arr) ? arr : [];
  return `<div class="summary-field"><label>${label}<span class="badge-ai">AI</span></label>
    ${items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : `<span class="muted">—</span>`}</div>`;
}
function tasksField(arr) {
  const items = Array.isArray(arr) ? arr : [];
  return `<div class="summary-field"><label>Action Items<span class="badge-ai">AI</span></label>
    ${items.length ? `<ul data-testid="action-items">${items.map((t) => `<li>${esc(t.title)} <span class="pill">${esc(t.owner)}</span></li>`).join("")}</ul>` : `<span class="muted">—</span>`}</div>`;
}
function transcriptBlock(segments, speakers) {
  return `<div class="summary-field"><label>Transcript (${speakers.length} speakers)</label>
    <div style="max-height:200px;overflow:auto;font-size:14px">${segments.map((s) => `<div><b>${esc(labelFor(s, speakers))}</b>: ${esc(s.text)}</div>`).join("")}</div></div>`;
}
function labelFor(seg, speakers) {
  const sp = speakers.find((x) => x.id === seg.speakerId);
  return sp ? sp.label : "Speaker";
}

async function saveSummary(id) {
  const c = { ...(state.current.summary?.contentJson || {}) };
  const sumEl = document.querySelector('[data-field="summary"]');
  if (sumEl) c.summary = sumEl.value;
  try {
    await api(`/v1/sessions/${id}/summary`, { method: "PATCH", body: c });
    toast("Edits saved (new version)"); openSession(id);
  } catch (e) { toast(e.message); }
}
async function approveSession(id) {
  try { await api(`/v1/sessions/${id}/summary/approve`, { method: "POST", body: {} }); toast("Approved"); openSession(id); }
  catch (e) { toast(e.message); }
}
function openShare(id) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><h2 class="serif" style="margin-top:0">Share with client</h2>
    <p class="muted" style="font-size:14px">Choose exactly what to share. Transcript and private notes stay with you.</p>
    ${["summary", "topics", "tasks", "goals", "reflectionQuestions"].map((k) => `<label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" data-share="${k}" ${k !== "reflectionQuestions" ? "checked" : ""} style="width:auto"/> ${k}</label>`).join("")}
    <div class="row" style="margin-top:16px"><div class="spacer"></div>
      <button class="btn ghost" data-testid="share-cancel">Cancel</button>
      <button class="btn" data-testid="share-confirm">Share</button></div></div>`;
  document.body.appendChild(modal);
  $("[data-testid=share-cancel]", modal).onclick = () => modal.remove();
  $("[data-testid=share-confirm]", modal).onclick = async () => {
    const include = {};
    modal.querySelectorAll("[data-share]").forEach((el) => (include[el.dataset.share] = el.checked));
    try { await api(`/v1/sessions/${id}/share`, { method: "POST", body: { include, channel: "portal" } }); modal.remove(); toast("Shared with client"); openSession(id); }
    catch (e) { toast(e.message); }
  };
}

/* --------------------------------------------------------------- History -- */
async function viewHistory() {
  const main = $("#main");
  main.innerHTML = `<div class="page-title"><h1 class="serif">Session History</h1></div>
    <div class="card" id="hist"><div class="empty">Loading…</div></div>`;
  try {
    const [{ sessions }, { clients }] = await Promise.all([api("/v1/sessions"), api("/v1/clients")]);
    state.sessions = sessions; state.clients = clients;
    $("#hist").innerHTML = sessions.length ? sessions.map(sessionRow).join("") : `<div class="empty">No sessions yet.</div>`;
    wireSessionRows($("#hist"));
  } catch (e) { toast(e.message); }
}
function sessionRow(s) {
  const client = (state.clients.find((c) => c.id === s.clientId) || {});
  const name = [client.firstName, client.lastName].filter(Boolean).join(" ") || "Client";
  const date = new Date(s.createdAt).toLocaleDateString();
  return `<div class="list-item" data-open="${s.id}" data-testid="session-row" style="cursor:pointer">
    <div class="avatar">${initials(name)}</div>
    <div><div style="font-weight:600">${esc(s.title || "Session")}</div>
      <div class="muted" style="font-size:13px">${esc(name)} · ${esc(date)} · ${esc(s.inputMethod)}</div></div>
    <div class="spacer"></div>${statusPillSmall(s.status)}</div>`;
}
function statusPillSmall(s) {
  const map = { review_required: "gold", approved: "green", shared: "blue" };
  return `<span class="pill ${map[s] || ""}">${esc(s.replace(/_/g, " "))}</span>`;
}
function wireSessionRows(root) {
  root.querySelectorAll("[data-open]").forEach((el) => (el.onclick = () => openSession(el.dataset.open)));
}

/* ---------------------------------------------------------------- Router -- */
/* -------------------------------------------------------------- Messages -- */
async function viewMessages() {
  const main = $("#main");
  main.innerHTML = `<div class="page-title"><h1 class="serif">Messages</h1></div>
    <p class="muted">Client notes with an AI-suggested reply. Nothing is sent until you review and send it.</p>
    <div class="card" id="msgList"><div class="empty">Loading…</div></div>`;
  try {
    const { messages } = await api("/v1/messages");
    if (!messages.length) { $("#msgList").innerHTML = `<div class="empty">No client messages yet.</div>`; return; }
    $("#msgList").innerHTML = messages.map((m) => {
      const name = [m.client.firstName, m.client.lastName].filter(Boolean).join(" ");
      return `<div class="list-item" data-msg="${m.id}" data-testid="message-row" style="cursor:pointer">
        <div class="avatar">${initials(name)}</div>
        <div><div style="font-weight:600">${esc(name)} ${m.urgent ? '<span class="pill gold">Urgent</span>' : ""}</div>
          <div class="muted" style="font-size:13px">${esc(m.body.slice(0, 80))}</div></div>
        <div class="spacer"></div><span class="pill ${m.status === "sent" ? "green" : "gold"}">${esc(m.status.replace(/_/g, " "))}</span></div>`;
    }).join("");
    main.querySelectorAll("[data-msg]").forEach((el) => (el.onclick = () => openMessage(el.dataset.msg)));
  } catch (e) { toast(e.message); }
}

async function openMessage(id) {
  const main = $("#main");
  main.innerHTML = `<div class="empty">Loading…</div>`;
  try {
    const { message, thread } = await api(`/v1/messages/${id}`);
    const draft = message.drafts && message.drafts[0];
    main.innerHTML = `<div class="page-title">
        <button class="btn ghost" data-testid="msg-back" style="padding:8px 12px">←</button>
        <h1 class="serif" style="font-size:22px">Message from ${esc(message.client.firstName)}</h1>
        ${message.urgent ? '<span class="pill gold">Urgent</span>' : ""}</div>
      <div class="card">
        <div class="muted" style="font-size:13px">Client wrote${message.urgent ? " (marked urgent — not an emergency service)" : ""}:</div>
        <p data-testid="msg-body">${esc(message.body)}</p>
      </div>
      <div class="card" style="margin-top:14px">
        <label>AI-suggested reply <span class="badge-ai">AI</span> · review & edit before sending</label>
        <textarea data-testid="reply-body" style="min-height:120px">${esc(draft ? draft.draftBody : "")}</textarea>
        <div class="row" style="margin-top:12px"><div class="spacer"></div>
          <button class="btn dark" data-testid="reply-send" ${message.status === "sent" ? "disabled" : ""}>Send reply</button></div>
      </div>
      <h3 class="serif" style="margin-top:18px">Conversation</h3>
      <div class="card" data-testid="thread">${thread.map(threadLine).join("") || '<div class="empty">No messages yet.</div>'}</div>`;
    $("[data-testid=msg-back]").onclick = () => renderApp("messages");
    $("[data-testid=reply-send]").onclick = async () => {
      const body = $("[data-testid=reply-body]").value.trim();
      if (!body) { toast("Write a reply first"); return; }
      try { await api(`/v1/messages/${id}/reply`, { method: "POST", body: { body } }); toast("Reply sent to client"); openMessage(id); }
      catch (e) { toast(e.message); }
    };
  } catch (e) { toast(e.message); }
}
function threadLine(m) {
  const mine = m.direction === "coach_to_client";
  return `<div style="text-align:${mine ? "right" : "left"};margin:6px 0">
    <span class="pill ${mine ? "blue" : ""}">${mine ? "You" : "Client"}</span>
    <div style="font-size:14px;margin-top:2px">${esc(m.body)}</div></div>`;
}

async function inviteClient(clientId) {
  try {
    const res = await api(`/v1/clients/${clientId}/invite`, { method: "POST", body: {} });
    const modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.innerHTML = `<div class="modal"><h2 class="serif" style="margin-top:0">Portal invitation</h2>
      <p class="muted" style="font-size:14px">Share this single-use link with your client (email or WhatsApp). It expires in 72 hours.</p>
      <input readonly value="${esc(res.link)}" data-testid="invite-link" onclick="this.select()" />
      <div class="row" style="margin-top:14px"><div class="spacer"></div>
        <button class="btn" data-testid="invite-close">Done</button></div></div>`;
    document.body.appendChild(modal);
    $("[data-testid=invite-close]", modal).onclick = () => modal.remove();
  } catch (e) { toast(e.message); }
}

const routes = {
  dashboard: viewDashboard,
  clients: viewClients,
  newSession: viewNewSession,
  history: viewHistory,
  messages: viewMessages,
  session: () => state.current && renderSession(state.current),
};

function boot() {
  if (state.token) renderApp("dashboard");
  else renderAuth();
}
boot();
