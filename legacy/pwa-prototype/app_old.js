document.addEventListener('DOMContentLoaded', () => {
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
      document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
    });
  });

  // Set up sign-in button
  const signInBtn = document.getElementById('google-signin-btn');
  if (signInBtn) {
    signInBtn.addEventListener('click', () => {
      window.location.href = `${window.APP_CONFIG.API_BASE}/auth/google/start`;
    });
  }

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
        showToast('Código activado con éxito');
        showScreen('home-screen');
      }
    });
  }
}

// Global functions for inline handlers
function selectPlan(plan) {
  window.selectedPlan = plan;
  showScreen('consent-screen');
}

function showTokenActivation() {
  showScreen('token-screen');
}

function showPlans() {
  showScreen('plans-screen');
}

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
    toast.classList.add('show');
  }, 50);
  setTimeout(() => {
    toast.classList.remove('show');
    toast.remove();
  }, 3000);
}
