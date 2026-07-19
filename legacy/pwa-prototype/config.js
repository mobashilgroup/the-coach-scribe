window.APP_CONFIG = {
  // Configuración de API
  API_BASE: 'https://coach-scribe-backend.onrender.com',
  OAUTH_REDIRECT: 'https://mobashilgroup.github.io/the-coach-scribe/',

  // Autenticación
  GOOGLE_CLIENT_ID: '663379765209-nbdr7hb501g31mpjn8va49ega09gj5i.apps.googleusercontent.com',

  // Pagos
  PAYPAL_MODE: 'sandbox', // Cambiar a 'live' para producción
  PAYPAL_CLIENT_ID: 'AfmU4IFTeIx5yuX15EqEM5Clhgq6-Yiywe-2npsbGDo8JupG6YZnQSQpmg-21DAsYGAAaLyLXMUAv261', // Obtener en PayPal Developer

  // Planes de suscripción
  PLANS: {
    basic: {
      price: 49,
      monthlySessions: 20,
      name: 'Básico'
    },
    pro: {
      price: 99,
      monthlySessions: 50,
      name: 'Pro'
    },
    premium: {
      price: 139,
      monthlySessions: 100,
      name: 'Premium'
    }
  },

  // Modo de activación: 'tokens' o 'payments'
  activationMode: 'tokens'
};
