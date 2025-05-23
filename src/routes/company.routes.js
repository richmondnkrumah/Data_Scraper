const express = require('express');
const router = express.Router();
const companyController = require('../controllers/company.controller');

// Get all companies (with pagination)
router.get('/', companyController.getAllCompanies);

// Get a single company by name or id
router.get('/:identifier', companyController.getCompany);

// Search companies by name, industry, etc.
router.get('/search/:term', companyController.searchCompanies);

// Create a new company (protected for admin use)
router.post('/', companyController.createCompany);

// Update company data
router.put('/:id', companyController.updateCompany);

// Force refresh company data from external sources
router.post('/:id/refresh', companyController.refreshCompanyData);

module.exports = router;