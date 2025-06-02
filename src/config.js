// Server configuration
module.exports = {
  // Server settings
  server: {
    port: process.env.PORT || 3000,        // Changed to match server.js default port
    fallbackPorts: [9001, 9002, 9003, 9999, 8888, 7000], // Use higher ports that don't require admin rights
    host: process.env.HOST || '127.0.0.1', // Host to bind to
    cors: {
      allowOrigin: '*',
      allowMethods: 'GET, POST, OPTIONS',
      allowHeaders: 'Content-Type'
    }
  },
  
  // API keys - ordered by priority
  api: {
    gemini: {
      key: process.env.GEMINI_API_KEY || null, // Removed hardcoded API key for security
      enabled: !!process.env.GEMINI_API_KEY,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
    },
    mistral: {
      key: process.env.MISTRAL_API_KEY || null, // Removed hardcoded API key for security
      enabled: !!process.env.MISTRAL_API_KEY,
      baseUrl: 'https://api.mistral.ai/v1/chat/completions'
    },
    alphaVantage: {
      key: process.env.ALPHA_VANTAGE_API_KEY || null, // Removed hardcoded API key for security
      baseUrl: 'https://www.alphavantage.co/query'
    },
    google: {
      key: process.env.GOOGLE_API_KEY || null, // Removed placeholder
      cx: process.env.GOOGLE_CX || null, // Removed placeholder
      enabled: !!(process.env.GOOGLE_API_KEY && process.env.GOOGLE_CX),
      baseUrl: 'https://www.googleapis.com/customsearch/v1'
    }
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    logToFile: true,
    logDir: '../logs'
  }
};
