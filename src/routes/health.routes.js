const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Health check endpoint
router.get('/', (req, res) => {
    const healthcheck = {
        uptime: process.uptime(),
        message: 'OK',
        timestamp: Date.now()
    };

    res.status(200).json(healthcheck);
});

// Detailed health check with DB status
router.get('/details', async (req, res) => {
    const healthcheck = {
        uptime: process.uptime(),
        message: 'OK',
        timestamp: Date.now(),
        database: {
            status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
        },
        memory: {
            rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
            heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
            heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`
        }
    };

    try {
        // Check DB connection
        if (mongoose.connection.readyState !== 1) {
            healthcheck.message = 'Database connection issue';
            return res.status(503).json(healthcheck);
        }

        res.status(200).json(healthcheck);
    } catch (error) {
        healthcheck.message = error.message;
        healthcheck.error = 'Service unavailable';
        res.status(503).json(healthcheck);
    }
});

module.exports = router;