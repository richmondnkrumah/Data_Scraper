const mongoose = require('mongoose');
const Company = require('../models/company.model');
const Comparison = require('../models/comparison.model');
const logger = require('../utils/logger');
const financialService = require('../services/financial.service');
const comparisonService = require('../services/comparison.service');
const NodeCache = require('node-cache');

// Cache for comparison data
const comparisonCache = new NodeCache({stdTTL: 3600, checkperiod: 600});

/**
 * Compare two companies
 */
exports.compareCompanies = async (req, res) => {
    try {
        const {company1, company2} = req.query;

        if (!company1 || !company2) {
            return res.status(400).json({
                status: 'fail',
                message: 'Please provide both company1 and company2 parameters'
            });
        }

        // Check cache for this comparison
        const cacheKey = `${company1.toLowerCase()}-${company2.toLowerCase()}`;
        const cachedComparison = comparisonCache.get(cacheKey);
        if (cachedComparison) {
            return res.status(200).json({
                status: 'success',
                data: cachedComparison,
                source: 'cache'
            });
        }

        // Find companies in the database
        const [firstCompany, secondCompany] = await Promise.all([
            findOrScrapeCompany(company1),
            findOrScrapeCompany(company2)
        ]);

        if (!firstCompany || !secondCompany) {
            return res.status(404).json({
                status: 'fail',
                message: `One or both companies not found: ${company1}, ${company2}`
            });
        }

        // Check if a comparison already exists for these companies
        let comparison = await Comparison.findOne({
            companyNames: {$all: [firstCompany.name, secondCompany.name]}
        }).sort({createdAt: -1});

        // If comparison exists but is older than a day, generate a new one
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (!comparison || comparison.createdAt < oneDayAgo) {
            // Generate comparison data
            const comparisonData = await comparisonService.generateComparison(
                firstCompany,
                secondCompany
            );

            // Create a new comparison record
            comparison = await Comparison.create({
                companies: [firstCompany._id, secondCompany._id],
                companyNames: [firstCompany.name, secondCompany.name],
                ...comparisonData,
                searchDate: Date.now()
            });
        }

        // Store in cache
        comparisonCache.set(cacheKey, comparison);
        comparisonCache.set(comparison._id.toString(), comparison);

        res.status(200).json({
            status: 'success',
            data: comparison
        });
    } catch (error) {
        logger.error(`Error comparing companies: ${error.message}`);
        res.status(500).json({
            status: 'error',
            message: 'Error comparing companies',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get recent comparisons
 */
exports.getRecentComparisons = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const comparisons = await Comparison.find({})
            .select('companyNames searchDate overallComparison')
            .populate({
                path: 'companies',
                select: 'name logo industry'
            })
            .skip(skip)
            .limit(limit)
            .sort({searchDate: -1});

        const total = await Comparison.countDocuments();

        res.status(200).json({
            status: 'success',
            results: comparisons.length,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            data: comparisons
        });
    } catch (error) {
        logger.error(`Error fetching recent comparisons: ${error.message}`);
        res.status(500).json({
            status: 'error',
            message: 'Error fetching recent comparisons'
        });
    }
};

/**
 * Get comparison by ID
 */
exports.getComparisonById = async (req, res) => {
    try {
        const {id} = req.params;

        // Check cache first
        const cachedComparison = comparisonCache.get(id);
        if (cachedComparison) {
            return res.status(200).json({
                status: 'success',
                data: cachedComparison,
                source: 'cache'
            });
        }

        // Find comparison by ID
        const comparison = await Comparison.findById(id)
            .populate({
                path: 'companies',
                select: 'name logo website industry financials products customerMetrics'
            });

        if (!comparison) {
            return res.status(404).json({
                status: 'fail',
                message: `Comparison with ID ${id} not found`
            });
        }

        // Store in cache
        comparisonCache.set(id, comparison);

        res.status(200).json({
            status: 'success',
            data: comparison
        });
    } catch (error) {
        logger.error(`Error fetching comparison: ${error.message}`);
        res.status(500).json({
            status: 'error',
            message: 'Error fetching comparison details'
        });
    }
};

/**
 * Get detailed comparison for a specific metric
 */
exports.getDetailedMetricComparison = async (req, res) => {
    try {
        const {metric} = req.params;
        const {company1, company2} = req.query;

        if (!company1 || !company2) {
            return res.status(400).json({
                status: 'fail',
                message: 'Please provide both company1 and company2 parameters'
            });
        }

        // Find companies in database
        const [firstCompany, secondCompany] = await Promise.all([
            findOrScrapeCompany(company1),
            findOrScrapeCompany(company2)
        ]);

        if (!firstCompany || !secondCompany) {
            return res.status(404).json({
                status: 'fail',
                message: `One or both companies not found: ${company1}, ${company2}`
            });
        }

        // Generate detailed comparison for the specific metric
        const detailedComparison = await comparisonService.getDetailedMetricComparison(
            firstCompany,
            secondCompany,
            metric
        );

        res.status(200).json({
            status: 'success',
            data: detailedComparison
        });
    } catch (error) {
        logger.error(`Error generating detailed comparison: ${error.message}`);
        res.status(500).json({
            status: 'error',
            message: 'Error generating detailed comparison'
        });
    }
};

/**
 * Get chart data for visualization
 */
exports.getChartData = async (req, res) => {
    try {
        const {type} = req.params;
        const {company1, company2, comparisonId} = req.query;

        let chartData;

        if (comparisonId) {
            // If comparison ID is provided, get chart data from existing comparison
            const comparison = await Comparison.findById(comparisonId);

            if (!comparison) {
                return res.status(404).json({
                    status: 'fail',
                    message: `Comparison with ID ${comparisonId} not found`
                });
            }

            if (!comparison.chartData || !comparison.chartData[type]) {
                return res.status(404).json({
                    status: 'fail',
                    message: `Chart data of type ${type} not found in comparison`
                });
            }

            chartData = comparison.chartData[type];
        } else if (company1 && company2) {
            // If company names are provided, generate chart data on-the-fly
            const [firstCompany, secondCompany] = await Promise.all([
                findOrScrapeCompany(company1),
                findOrScrapeCompany(company2)
            ]);

            if (!firstCompany || !secondCompany) {
                return res.status(404).json({
                    status: 'fail',
                    message: `One or both companies not found: ${company1}, ${company2}`
                });
            }

            // Generate chart data for the specified type
            chartData = await comparisonService.generateChartData(
                firstCompany,
                secondCompany,
                type
            );
        } else {
            return res.status(400).json({
                status: 'fail',
                message: 'Please provide either a comparisonId or both company1 and company2 parameters'
            });
        }

        res.status(200).json({
            status: 'success',
            data: chartData
        });
    } catch (error) {
        logger.error(`Error generating chart data: ${error.message}`);
        res.status(500).json({
            status: 'error',
            message: 'Error generating chart data'
        });
    }
};

/**
 * Helper function to find a company or scrape it if not found
 */
async function findOrScrapeCompany(companyName) {
    // Try to find by name
    let company = await Company.findOne({
        $or: [
            {name: new RegExp(`^${companyName}$`, 'i')},
            {slug: companyName.toLowerCase()}
        ]
    });

    // If not found, try to scrape
    if (!company) {
        const scraper = require('../services/scraper.service');

        try {
            logger.info(`Company ${companyName} not found in DB. Attempting to scrape...`);

            const companyData = await scraper.scrapeCompany(companyName);
            if (!companyData) return null;

            // Add financial data if available
            if (companyData.financials && companyData.financials.stockSymbol) {
                try {
                    const financialData = await financialService.getFinancialData(companyData.financials.stockSymbol);
                    companyData.financials = {...companyData.financials, ...financialData};
                } catch (err) {
                    logger.warn(`Failed to get financial data for ${companyName}: ${err.message}`);
                }
            }

            // Create new company in database
            company = await Company.create(companyData);
        } catch (error) {
            logger.error(`Failed to scrape company ${companyName}: ${error.message}`);
            return null;
        }
    }

    return company;
}