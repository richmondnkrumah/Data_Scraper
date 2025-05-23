const express = require('express');
const router = express.Router();
const comparisonController = require('../controllers/comparison.controller');

// Compare two companies
router.get('/', comparisonController.compareCompanies);

// Get recent comparisons
router.get('/recent', comparisonController.getRecentComparisons);

// Get a specific comparison by ID
router.get('/:id', comparisonController.getComparisonById);

// Get detailed comparison for a specific metric
router.get('/detail/:metric', comparisonController.getDetailedMetricComparison);

// Generate comparison chart data
router.get('/chart/:type', comparisonController.getChartData);

module.exports = router;