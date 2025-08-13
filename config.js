window.APP_CONFIG = {
  // Configuración de API
  API_BASE: 'https://tu-api-backend.com',          // Reemplazar con tu URL real
  OAUTH_REDIRECT: 'https://mobashilgroup.github.io/the-coach-scribe/auth/callback',
  
  // Autenticación
  GOOGLE_CLIENT_ID: '663379765209-nbrd7hb501g31pmqjn8va4gega0ggj5i.apps.googleusercontent.com',                             // Obtener en Google Cloud Console
  
  // Pagos
  PAYPAL_MODE: 'sandbox',                          // Cambiar a 'live' para producción
  PAYPAL_CLIENT_ID: '',                             // Obtener en PayPal Developer
  
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

