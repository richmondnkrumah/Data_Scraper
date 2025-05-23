const express = require('express');
const router = express.Router();

// Import route modules
const companyRoutes = require('./company.routes');
const comparisonRoutes = require('./comparison.routes');
const healthRoutes = require('./health.routes');

// API documentation route
router.get('/', (req, res) => {
    res.json({
        message: 'Competitor Analysis API',
        version: '1.0.0',
        endpoints: {
            health: '/api/health',
            companies: '/api/companies/:name',
            comparison: '/api/comparison?company1=:name1&company2=:name2'
        }
    });
});

// Register routes
router.use('/health', healthRoutes);
router.use('/companies', companyRoutes);
router.use('/comparison', comparisonRoutes);

module.exports = router;