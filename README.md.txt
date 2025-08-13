# The Coach Scribe

A Progressive Web App (PWA) for coaches to transform their practice with AI-powered insights and emotional understanding for deeper client connections.

## Features

- Recording and transcription of coaching sessions
- AI-powered session summaries using Gemini
- Client management
- Multi-language support (English, Spanish, Portuguese, French, Italian, Hebrew, Russian, German)
- Offline functionality with Service Worker
- Responsive design optimized for mobile devices
- Complete internationalization system

## Installation

1. Clone this repository to your local machine
2. Configure the `config.js` file with your API settings
3. Upload all files to your GitHub repository
4. Enable GitHub Pages in your repository settings

## Configuration

Edit the `config.js` file to set up your API endpoints and credentials:

```javascript
window.APP_CONFIG = {
  API_BASE: 'https://your-api-base-url.com',          // Replace with your actual API base URL
  OAUTH_REDIRECT: 'https://mobashilgroup.github.io/the-coach-scribe/auth/callback',
  GOOGLE_CLIENT_ID: '',                                // Add your Google Client ID if using Google auth
  PAYPAL_MODE: 'live',                                // 'live' or 'sandbox'
  PAYPAL_CLIENT_ID: ''                                // Add your PayPal Client ID if using payments
};