const mongoose = require('mongoose');
const Company = require('../models/company.model');
const logger = require('../utils/logger');
const scraper = require('../services/scraper.service');
const financialService = require('../services/financial.service');
const NodeCache = require('node-cache');

// Cache for frequently accessed company data
const companyCache = new NodeCache({stdTTL: 3600, checkperiod: 600});

/**
 * Get all companies with pagination
 */
exports.getAllCompanies = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const companies = await Company.find({})
            .select('name logo industry size founded lastUpdated')
            .skip(skip)
            .limit(limit)
            .sort({name: 1});

        const total = await Company.countDocuments();

        res.status(200).json({
            status: 'success',
            results: companies.length,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            data: companies
        });
    } catch (error) {
        logger.error(`Error fetching companies: ${error.message}`);
        res.status(500).json({
            status: 'error',
            message: 'Error fetching companies'
        });
    }
};

/**
 * Get a single company by name or ID
 */
exports.getCompany = async (req, res) => {
    try {
        const {identifier} = req.params;

        // Check cache first
        const cachedCompany = companyCache.get(identifier);
        if (cachedCompany) {
            return res.status(200).json({
                status: 'success',
                data: cachedCompany,
                source: 'cache'
            });
        }

        // Try to find by ID first if it's a valid ObjectId
        let company;
        if (mongoose.Types.ObjectId.isValid(identifier)) {
            company = await Company.findById(identifier);
        }

        // If not found by ID, search by name or slug
        if (!company) {
            company = await Company.findOne({
                $or: [
                    {name: new RegExp(identifier, 'i')},
                    {slug: identifier.toLowerCase()}
                ]
            });
        }

        // If company doesn't exist in our database, try to scrape it
        if (!company) {
            logger.info(`Company ${identifier} not found in DB. Attempting to scrape...`);

            const companyData = await scraper.scrapeCompany(identifier);
            if (!companyData) {
                return res.status(404).json({
                    status: 'fail',
                    message: `Company with name or ID ${identifier} not found`
                });
            }

            // Add financial data if available
            if (companyData.financials && companyData.financials.stockSymbol) {
                try {
                    const financialData = await financialService.getFinancialData(companyData.financials.stockSymbol);
                    companyData.financials = {...companyData.financials, ...financialData};
                } catch (err) {
                    logger.warn(`Failed to get financial data for ${identifier}: ${err.message}`);
                }
            }

            // Create new company in database
            company = await Company.create(companyData);
        } else {
            // If data is older than a week, refresh in the background
            const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            if (company.lastUpdated < oneWeekAgo) {
                logger.info(`Data for ${company.name} is stale. Refreshing in background...`);
                this.refreshCompanyDataInBackground(company._id);
            }
        }

        // Add to cache
        companyCache.set(identifier, company);
        companyCache.set(company._id.toString(), company);

        res.status(200).json({
            status: 'success',
            data: company
        });
    } catch (error) {
        logger.error(`Error fetching company ${req.params.identifier}: ${error.message}`);
        res.status(500).json({
            status: 'error',
            message: 'Error fetching company details'
        });
    }
};

/**
 * Search for companies
 */
exports.searchCompanies = async (req, res) => {
    try {
        const {term} = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const companies = await Company.find({
            $or: [
                {name: new RegExp(term, 'i')},
                {industry: new RegExp(term, 'i')},
                {description: new RegExp(term, 'i')}
            ]
        })
            .select('name logo industry size founded')
            .skip(skip)
            .limit(limit);

        const total = await Company.countDocuments({
            $or: [
                {name: new RegExp(term, 'i')},
                {industry: new RegExp(term, 'i')},
                {description: new RegExp(term, 'i')}
            ]
        });

        res.status(200).json({
            status: 'success',
            results: companies.length,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            data: companies
        });
    } catch (error) {
        logger.error(`Error searching companies: ${error.message}`);
        res.status(500).json({
            status: 'error',
            message: 'Error searching companies'
        });
    }
};

/**
 * Create a new company
 */
exports.createCompany = async (req, res) => {
    try {
        const companyData = req.body;

        // Check if company already exists
        const existingCompany = await Company.findOne({name: new RegExp(`^${companyData.name}$`, 'i')});
        if (existingCompany) {
            return res.status(400).json({
                status: 'fail',
                message: `Company with name ${companyData.name} already exists`
            });
        }

        // Create new company
        const company = await Company.create(companyData);

        res.status(201).json({
            status: 'success',
            data: company
        });
    } catch (error) {
        logger.error(`Error creating company: ${error.message}`);
        res.status(400).json({
            status: 'error',
            message: error.message
        });
    }
};

/**
 * Update company data
 */
exports.updateCompany = async (req, res) => {
    try {
        const {id} = req.params;
        const updateData = req.body;

        // Find and update company
        const company = await Company.findByIdAndUpdate(
            id,
            {...updateData, lastUpdated: Date.now()},
            {new: true, runValidators: true}
        );

        if (!company) {
            return res.status(404).json({
                status: 'fail',
                message: `Company with ID ${id} not found`
            });
        }

        // Update cache
        companyCache.set(id, company);
        companyCache.set(company.name, company);
        companyCache.set(company.slug, company);

        res.status(200).json({
            status: 'success',
            data: company
        });
    } catch (error) {
        logger.error(`Error updating company: ${error.message}`);
        res.status(400).json({
            status: 'error',
            message: error.message
        });
    }
};

/**
 * Refresh company data from external sources
 */
exports.refreshCompanyData = async (req, res) => {
    try {
        const {id} = req.params;

        // Find company
        const company = await Company.findById(id);
        if (!company) {
            return res.status(404).json({
                status: 'fail',
                message: `Company with ID ${id} not found`
            });
        }

        // Scrape fresh data
        const scrapedData = await scraper.scrapeCompany(company.name);
        if (!scrapedData) {
            return res.status(400).json({
                status: 'fail',
                message: `Failed to scrape data for ${company.name}`
            });
        }

        // Add financial data if available
        if (scrapedData.financials && scrapedData.financials.stockSymbol) {
            try {
                const financialData = await financialService.getFinancialData(scrapedData.financials.stockSymbol);
                scrapedData.financials = {...scrapedData.financials, ...financialData};
            } catch (err) {
                logger.warn(`Failed to get financial data for ${company.name}: ${err.message}`);
            }
        }

        // Update company
        const updatedCompany = await Company.findByIdAndUpdate(
            id,
            {...scrapedData, lastUpdated: Date.now()},
            {new: true, runValidators: true}
        );

        // Update cache
        companyCache.set(id, updatedCompany);
        companyCache.set(company.name, updatedCompany);
        companyCache.set(company.slug, updatedCompany);

        res.status(200).json({
            status: 'success',
            data: updatedCompany
        });
    } catch (error) {
        logger.error(`Error refreshing company data: ${error.message}`);
        res.status(500).json({
            status: 'error',
            message: 'Error refreshing company data'
        });
    }
};

/**
 * Helper method to refresh company data in the background
 */
exports.refreshCompanyDataInBackground = async (companyId) => {
    try {
        const company = await Company.findById(companyId);
        if (!company) return;

        logger.info(`Background refresh started for ${company.name}`);

        // Scrape fresh data
        const scrapedData = await scraper.scrapeCompany(company.name);
        if (!scrapedData) {
            logger.warn(`Background scraping failed for ${company.name}`);
            return;
        }

        // Add financial data if available
        if (scrapedData.financials && scrapedData.financials.stockSymbol) {
            try {
                const financialData = await financialService.getFinancialData(scrapedData.financials.stockSymbol);
                scrapedData.financials = {...scrapedData.financials, ...financialData};
            } catch (err) {
                logger.warn(`Failed to get financial data for ${company.name}: ${err.message}`);
            }
        }

        // Update company
        const updatedCompany = await Company.findByIdAndUpdate(
            companyId,
            {...scrapedData, lastUpdated: Date.now()},
            {new: true}
        );

        // Update cache
        companyCache.set(companyId.toString(), updatedCompany);
        companyCache.set(company.name, updatedCompany);
        companyCache.set(company.slug, updatedCompany);

        logger.info(`Background refresh completed for ${company.name}`);
    } catch (error) {
        logger.error(`Background refresh error for company ${companyId}: ${error.message}`);
    }
};