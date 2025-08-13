document.addEventListener('DOMContentLoaded', () => {
  if (!window.APP_CONFIG) {
    console.error('APP_CONFIG missing');
    return;
  }
  // Initialize application if initApp function exists
  if (typeof initApp === 'function') {
    initApp();
  }
});
