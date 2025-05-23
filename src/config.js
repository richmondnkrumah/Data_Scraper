// Server configuration
module.exports = {
  // Server settings
  server: {
    port: process.env.PORT || 9000,        // Primary port from environment variable or default to 9000 (higher port)
    fallbackPorts: [9001, 9002, 9003, 9999, 8888, 7000], // Use higher ports that don't require admin rights
    host: process.env.HOST || '127.0.0.1', // Host to bind to
    cors: {
      allowOrigin: '*',
      allowMethods: 'GET, POST, OPTIONS',
      allowHeaders: 'Content-Type'
    }
  },
  
  // API keys
  api: {
    alphaVantage: {
      key: process.env.ALPHA_VANTAGE_API_KEY || '1HJN43LFAM74ZOVM',
      baseUrl: 'https://www.alphavantage.co/query'
    },
    mistral: {
      key: process.env.MISTRAL_API_KEY || 'cwDEy5QsNjerFAqe4sj9XIN62IaLyTM9',
      enabled: true,
      baseUrl: 'https://api.mistral.ai/v1/chat/completions'
    }
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    logToFile: true,
    logDir: '../logs'
  }
};