/* app.js for The Coach Scribe */
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
  document.querySelectorAll('.nav-item').forEach(item => {
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

  // Plan buttons
  document.querySelectorAll('[data-plan]').forEach(btn => {
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
    activateTokenBtn.addEventListener('click', () => {
      const code = document.getElementById('token-input').value.trim();
      const tokenLists = window.TOKENS || {};
      let valid = false;
      Object.keys(tokenLists).forEach(key => {
        if (tokenLists[key] && tokenLists[key].includes(code)) valid = true;
      });
      const errorEl = document.getElementById('token-error');
      if (!valid) {
        errorEl.classList.remove('hidden');
      } else {
        errorEl.classList.add('hidden');
        showToast('C\u00f3digo activado con \u00e9xito');
        showScreen('home-screen');
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
    prepReadyBtn.addEventListener('click', () => {
      showScreen('record-screen');
    });
  }

  // Record screen end session
  const endSessionBtn = document.getElementById('end-session-btn');
  if (endSessionBtn) {
    endSessionBtn.addEventListener('click', () => {
      showScreen('summary-screen');
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

  // Language buttons
  const languageBtn = document.getElementById('language-selector-btn');
  if (languageBtn) {
    languageBtn.addEventListener('click', () => {
      showToast('Funci\u00f3n de idioma no disponible a\u00fan');
    });
  }
  const settingsLangBtn = document.getElementById('settings-language-btn');
  if (settingsLangBtn) {
    settingsLangBtn.addEventListener('click', () => {
      showToast('Funci\u00f3n de idioma no disponible a\u00fan');
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
  const signOutBtn = document.getElementById('signout-settings-btn') || document.getElementById('signout-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', () => {
      showScreen('signin-screen');
    });
  }
}

// Global functions for inline handlers
window.selectPlan = function(plan) {
  window.selectedPlan = plan;
  showScreen('consent-screen');
};
window.showTokenActivation = function() {
  showScreen('token-screen');
};
window.showPlans = function() {
  showScreen('plans-screen');
};

// Utility functions
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(screen => {
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
