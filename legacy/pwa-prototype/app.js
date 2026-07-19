/*
 * Enhanced frontend logic for The Coach Scribe.
 *
 * This script augments the original navigation handlers with calls to
 * backend APIs for device activation, session management and logout. It
 * assumes that window.APP_CONFIG.API_BASE is set to the backend base URL.
 */

document.addEventListener('DOMContentLoaded', () => {
  if (!window.APP_CONFIG) {
    console.error('APP_CONFIG missing');
    return;
  }
  initApp();
});

function initApp() {
  // Show sign-in screen initially
  showScreen('signin-screen');

  // Set up nav item clicks
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      const target = item.getAttribute('data-screen');
      showScreen(target);
    });
  });

  // Set up sign-in button
  const signInBtn = document.getElementById('google-signin-btn');
  if (signInBtn) {
    signInBtn.addEventListener('click', () => {
      window.location.href = `${window.APP_CONFIG.API_BASE}/auth/google/start`;
    });
  }

  // Activate now button
  const activateBtn = document.getElementById('activate-btn');
  if (activateBtn) {
    activateBtn.addEventListener('click', () => {
      if (window.APP_CONFIG.activationMode === 'tokens') {
        showScreen('token-screen');
      } else {
        showScreen('plans-screen');
      }
    });
  }

  // Plan buttons (select plan)
  document.querySelectorAll('[data-plan]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.selectedPlan = btn.getAttribute('data-plan');
      showScreen('consent-screen');
    });
  });

  // Back buttons
  const backToPlansBtn = document.getElementById('back-to-plans-btn');
  if (backToPlansBtn) {
    backToPlansBtn.addEventListener('click', () => showScreen('plans-screen'));
  }
  const backToClientsBtn = document.getElementById('back-to-clients-btn');
  if (backToClientsBtn) {
    backToClientsBtn.addEventListener('click', () => showScreen('clients-screen'));
  }

  // Activate token button
  const activateTokenBtn = document.getElementById('activate-token-btn');
  if (activateTokenBtn) {
    activateTokenBtn.addEventListener('click', async () => {
      const code = document.getElementById('token-input').value.trim();
      const errorEl = document.getElementById('token-error');
      if (!code) {
        errorEl.classList.remove('hidden');
        return;
      }
      try {
        const result = await activateDevice(code);
        if (result.ok) {
          errorEl.classList.add('hidden');
          showToast('Código activado con éxito');
          // Update plan UI
          updatePlanInfo(result.data);
          showScreen('home-screen');
        } else {
          errorEl.classList.remove('hidden');
        }
      } catch (err) {
        errorEl.classList.remove('hidden');
      }
    });
  }

  // Consent screen
  const consentCheckbox = document.getElementById('consent-checkbox');
  const consentAcceptBtn = document.getElementById('consent-accept-btn');
  const consentCancelBtn = document.getElementById('consent-cancel-btn');
  if (consentCheckbox && consentAcceptBtn) {
    consentCheckbox.addEventListener('change', (e) => {
      consentAcceptBtn.disabled = !e.target.checked;
    });
  }
  if (consentCancelBtn) {
    consentCancelBtn.addEventListener('click', () => {
      showScreen('plans-screen');
    });
  }
  if (consentAcceptBtn) {
    consentAcceptBtn.addEventListener('click', () => {
      showScreen('preparation-screen');
    });
  }

  // Preparation screen
  const prepCancelBtn = document.getElementById('preparation-cancel-btn');
  if (prepCancelBtn) {
    prepCancelBtn.addEventListener('click', () => {
      showScreen('home-screen');
    });
  }
  const prepReadyBtn = document.getElementById('preparation-ready-btn');
  if (prepReadyBtn) {
    prepReadyBtn.addEventListener('click', async () => {
      // Start a new session on the backend
      try {
        const result = await startSession();
        if (result.ok) {
          window.currentSessionId = result.data.sessionId;
          // Update remaining sessions indicator on home screen
          if (result.data.sessionsRemaining !== undefined) {
            updatePlanInfo({ sessionsRemaining: result.data.sessionsRemaining });
          }
          showScreen('record-screen');
        } else {
          showToast(result.error?.message || 'No se pudo iniciar la sesión');
        }
      } catch (err) {
        showToast('Error al iniciar la sesión');
      }
    });
  }

  // Record screen end session
  const endSessionBtn = document.getElementById('end-session-btn');
  if (endSessionBtn) {
    endSessionBtn.addEventListener('click', async () => {
      // Finalize the session on the backend
      try {
        const result = await finishSession(window.currentSessionId);
        if (result.ok) {
          // Display summary in the Summary screen. Use the existing TLDR container.
          const summary = result.data?.summary || 'Sesión finalizada';
          const tldrEl = document.getElementById('summary-tldr');
          if (tldrEl) {
            tldrEl.textContent = summary;
          }
          showScreen('summary-screen');
        } else {
          showToast(result.error?.message || 'No se pudo finalizar la sesión');
        }
      } catch (err) {
        showToast('Error al finalizar la sesión');
      }
    });
  }

  const summaryBackBtn = document.getElementById('summary-back-btn');
  if (summaryBackBtn) {
    summaryBackBtn.addEventListener('click', () => {
      showScreen('home-screen');
    });
  }

  // New session button on home screen
  const newSessionBtn = document.getElementById('new-session-btn');
  if (newSessionBtn) {
    newSessionBtn.addEventListener('click', () => {
      showScreen('preparation-screen');
    });
  }

  // Language buttons (placeholder)
  const languageBtn = document.getElementById('language-selector-btn');
  if (languageBtn) {
    languageBtn.addEventListener('click', () => {
      showToast('Función de idioma no disponible aún');
    });
  }
  const settingsLangBtn = document.getElementById('settings-language-btn');
  if (settingsLangBtn) {
    settingsLangBtn.addEventListener('click', () => {
      showToast('Función de idioma no disponible aún');
    });
  }

  // Upgrade plan button
  const upgradePlanBtn = document.getElementById('upgrade-plan-btn');
  if (upgradePlanBtn) {
    upgradePlanBtn.addEventListener('click', () => {
      showScreen('plans-screen');
    });
  }

  // Sign out button
  const signOutBtn =
    document.getElementById('signout-settings-btn') ||
    document.getElementById('signout-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      try {
        await logout();
      } finally {
        showScreen('signin-screen');
      }
    });
  }
}

// ------------- API calls -------------

async function activateDevice(code) {
  const res = await fetch(`${window.APP_CONFIG.API_BASE}/device/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ code }),
  });
  return res.json();
}

async function startSession() {
  const res = await fetch(`${window.APP_CONFIG.API_BASE}/sessions/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  return res.json();
}

async function finishSession(sessionId) {
  const res = await fetch(`${window.APP_CONFIG.API_BASE}/sessions/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ sessionId }),
  });
  return res.json();
}

async function logout() {
  try {
    await fetch(`${window.APP_CONFIG.API_BASE}/auth/logout`, {
      method: 'GET',
      credentials: 'include',
    });
  } catch (err) {
    // ignore errors
  }
}

// ------------- UI helpers -------------

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.remove('active');
  });
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('active');
  }
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    document.body.removeChild(toast);
  }, 3000);
}

/**
 * Update the plan information UI based on activation or remaining sessions.
 * Accepts an object { plan, sessionsRemaining } and updates #plan-name,
 * #plan-sessions, #plan-remaining and progress bar accordingly.
 */
function updatePlanInfo(data = {}) {
  const { plan, sessionsRemaining } = data;
  // Map plan IDs to user‑friendly names and total sessions
  const planInfo = {
    basic: { name: 'Plan Básico', total: 20 },
    pro: { name: 'Plan Pro', total: 50 },
    premium: { name: 'Plan Premium', total: 100 },
  };
  const planNameEl = document.getElementById('plan-name');
  const planSessionsEl = document.getElementById('plan-sessions');
  const planRemainingEl = document.getElementById('plan-remaining');
  const progressEl = document.getElementById('plan-progress');
  if (plan && planInfo[plan]) {
    planNameEl.textContent = planInfo[plan].name;
    const total = planInfo[plan].total;
    const remaining =
      sessionsRemaining !== undefined ? sessionsRemaining : total;
    planSessionsEl.textContent = `${total - remaining}/${total} sesiones`;
    planRemainingEl.textContent = `${remaining} sesiones restantes`;
    const percent = ((total - remaining) / total) * 100;
    progressEl.style.width = `${percent}%`;
    // Show plan info container and hide activation container
    document.getElementById('plan-info').classList.remove('hidden');
    document.getElementById('activation-container').classList.add('hidden');
  } else if (sessionsRemaining !== undefined) {
    // Only update remaining sessions if plan already shown
    const displayedPlan = planNameEl.textContent
      .trim()
      .toLowerCase();
    const total = Object.values(planInfo).find(
      (p) => p.name.toLowerCase() === displayedPlan,
    )?.total;
    if (total) {
      const remaining = sessionsRemaining;
      planSessionsEl.textContent = `${total - remaining}/${total} sesiones`;
      planRemainingEl.textContent = `${remaining} sesiones restantes`;
      const percent = ((total - remaining) / total) * 100;
      progressEl.style.width = `${percent}%`;
    }
  }
}
