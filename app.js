/* app.js for The Coach Scribe */
document.addEventListener('DOMContentLoaded', () => {
  if (!window.APP_CONFIG) {
    console.error('APP_CONFIG missing');
    return;
  }
  initApp();
});

let selectedPlan = null;

function initApp() {
  // Setup navigation
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    const screen = item.getAttribute('data-screen');
    if (screen) {
      item.addEventListener('click', () => {
        showScreen(screen);
      });
    }
  });

  // Sign in button
  const signInBtn = document.getElementById('google-signin-btn');
  if (signInBtn) {
    signInBtn.addEventListener('click', () => {
      window.location.href = window.APP_CONFIG.API_BASE + '/auth/google/start';
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

  // Plan buttons (fallback)
  document.querySelectorAll('[data-plan]').forEach(btn => {
    btn.addEventListener('click', () => {
      const plan = btn.getAttribute('data-plan');
      selectPlan(plan);
    });
  });

  // Back to plans
  const backPlans = document.getElementById('back-to-plans-btn');
  if (backPlans) {
    backPlans.addEventListener('click', () => {
      showScreen('plans-screen');
    });
  }

  // Activation code
  const activateCodeBtn = document.getElementById('activate-code-btn');
  if (activateCodeBtn) {
    activateCodeBtn.addEventListener('click', async () => {
      const input = document.getElementById('activation-code-input');
      const code = input ? input.value.trim() : '';
      if (!code) {
        showToast('Por favor ingresa el código de activación.');
        return;
      }
      try {
        const res = await fetch(window.APP_CONFIG.API_BASE + '/device/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        const data = await res.json();
        if (data.ok) {
          showToast('Dispositivo activado exitosamente.');
          showScreen('home-screen');
        } else {
          showToast(data.error?.message || 'No se pudo activar.');
        }
      } catch (e) {
        showToast('Error al activar: ' + e.message);
      }
    });
  }

  // New session button
  const newSessionBtn = document.getElementById('new-session-btn');
  if (newSessionBtn) {
    newSessionBtn.addEventListener('click', () => {
      const consentScreen = document.getElementById('consent-screen');
      if (consentScreen) {
        consentScreen.style.display = 'flex';
      } else {
        showToast('Iniciando sesión (demo).');
      }
    });
  }

  // Consent events
  const consentCheckbox = document.getElementById('consent-checkbox');
  const consentAccept = document.getElementById('consent-accept-btn');
  const consentCancel = document.getElementById('consent-cancel-btn');
  if (consentCheckbox && consentAccept) {
    consentCheckbox.addEventListener('change', () => {
      consentAccept.disabled = !consentCheckbox.checked;
    });
  }
  if (consentCancel) {
    consentCancel.addEventListener('click', () => {
      const consentScreen = document.getElementById('consent-screen');
      if (consentScreen) {
        consentScreen.style.display = 'none';
      }
    });
  }
  if (consentAccept) {
    consentAccept.addEventListener('click', () => {
      const consentScreen = document.getElementById('consent-screen');
      if (consentScreen) {
        consentScreen.style.display = 'none';
      }
      showToast('Sesión iniciada (demo).');
    });
  }

  // Language selector
  const langBtn = document.getElementById('language-selector-btn');
  if (langBtn) {
    langBtn.addEventListener('click', () => {
      showToast('Selector de idioma no implementado.');
    });
  }

  // Sign out
  const signoutBtn = document.getElementById('signout-btn');
  if (signoutBtn) {
    signoutBtn.addEventListener('click', () => {
      localStorage.removeItem('jwt');
      showScreen('signin-screen');
    });
  }

  // Default screen
  showScreen('signin-screen');
}

function showScreen(screenId) {
  const screens = document.querySelectorAll('[id$="-screen"]');
  screens.forEach(el => {
    el.style.display = (el.id === screenId) ? 'block' : 'none';
  });
}

function selectPlan(planId) {
  selectedPlan = planId;
  showScreen('token-screen');
  showToast('Plan seleccionado: ' + planId);
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  } else {
    alert(message);
  }
}
