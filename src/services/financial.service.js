const yahooFinance = require('yahoo-finance2').default;
const logger = require('../utils/logger');

/**
 * Get financial data for a company
 */
exports.getFinancialData = async (stockSymbol) => {
    try {
        logger.info(`Fetching financial data for stock symbol: ${stockSymbol}`);

        // Financial data storage
        const financialData = {
            stockSymbol,
            marketCap: null,
            revenue: null,
            revenueGrowth: null,
            profitMargin: null,
            stockPrice: null,
            priceHistory: []
        };

        // Get quote data
        try {
            const quote = await yahooFinance.quote(stockSymbol);

            if (quote) {
                financialData.marketCap = quote.marketCap;
                financialData.stockPrice = quote.regularMarketPrice;
            }
        } catch (error) {
            logger.warn(`Error fetching quote for ${stockSymbol}: ${error.message}`);
        }

        // Get historical prices (last 30 days)
        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);

            const historical = await yahooFinance.historical(stockSymbol, {
                period1: startDate,
                period2: endDate,
                interval: '1d'
            });

            if (historical && historical.length > 0) {
                financialData.priceHistory = historical.map(item => ({
                    date: item.date,
                    price: item.close
                }));
            }
        } catch (error) {
            logger.warn(`Error fetching historical prices for ${stockSymbol}: ${error.message}`);
        }

        // Get key statistics and financial data
        try {
            const keyStats = await yahooFinance.quoteSummary(stockSymbol, {
                modules: ['financialData', 'defaultKeyStatistics', 'incomeStatementHistory']
            });

            if (keyStats.financialData) {
                financialData.profitMargin = keyStats.financialData.profitMargins;

                // If revenue isn't in the financial data, try to get it from other fields
                if (!financialData.revenue && keyStats.financialData.totalRevenue) {
                    financialData.revenue = keyStats.financialData.totalRevenue;
                }
            }

            // Try to get revenue growth
            if (keyStats.incomeStatementHistory &&
                keyStats.incomeStatementHistory.incomeStatementHistory &&
                keyStats.incomeStatementHistory.incomeStatementHistory.length >= 2) {

                const statements = keyStats.incomeStatementHistory.incomeStatementHistory;
                const currentRevenue = statements[0].totalRevenue;
                const previousRevenue = statements[1].totalRevenue;

                if (currentRevenue && previousRevenue && previousRevenue !== 0) {
                    financialData.revenueGrowth = (currentRevenue - previousRevenue) / previousRevenue;
                }
            }
        } catch (error) {
            logger.warn(`Error fetching key stats for ${stockSymbol}: ${error.message}`);
        }

        logger.info(`Completed fetching financial data for ${stockSymbol}`);
        return financialData;
    } catch (error) {
        logger.error(`Error getting financial data for ${stockSymbol}: ${error.message}`);
        throw error;
    }
};

/**
 * Compare financial metrics between two companies
 */
exports.compareFinancials = async (company1, company2) => {
    try {
        const symbol1 = company1.financials?.stockSymbol;
        const symbol2 = company2.financials?.stockSymbol;

        // Can't compare if one or both don't have stock symbols
        if (!symbol1 || !symbol2) {
            return {
                error: 'One or both companies do not have stock symbols'
            };
        }

        // Get fresh financial data if not available
        let financials1 = company1.financials;
        let financials2 = company2.financials;

        if (!financials1.marketCap || !financials1.stockPrice) {
            try {
                financials1 = await exports.getFinancialData(symbol1);
            } catch (error) {
                logger.warn(`Error fetching updated financials for ${company1.name}`);
            }
        }

        if (!financials2.marketCap || !financials2.stockPrice) {
            try {
                financials2 = await exports.getFinancialData(symbol2);
            } catch (error) {
                logger.warn(`Error fetching updated financials for ${company2.name}`);
            }
        }

        // Prepare comparison object
        const comparison = {
            marketCap: compareMetric(financials1.marketCap, financials2.marketCap, company1._id, company2._id),
            revenue: compareMetric(financials1.revenue, financials2.revenue, company1._id, company2._id),
            revenueGrowth: compareMetric(financials1.revenueGrowth, financials2.revenueGrowth, company1._id, company2._id),
            profitMargin: compareMetric(financials1.profitMargin, financials2.profitMargin, company1._id, company2._id),
            stockPerformance: null
        };

        // Compare stock performance (if history available)
        if (financials1.priceHistory && financials1.priceHistory.length > 0 &&
            financials2.priceHistory && financials2.priceHistory.length > 0) {

            const perf1 = calculateStockPerformance(financials1.priceHistory);
            const perf2 = calculateStockPerformance(financials2.priceHistory);

            comparison.stockPerformance = compareMetric(perf1, perf2, company1._id, company2._id);
        }

        return comparison;
    } catch (error) {
        logger.error(`Error comparing financials: ${error.message}`);
        return {
            error: 'Failed to compare financial data'
        };
    }
};

/**
 * Calculate stock performance (percentage change)
 */
function calculateStockPerformance(priceHistory) {
    if (!priceHistory || priceHistory.length < 2) return null;

    const oldestPrice = priceHistory[priceHistory.length - 1].price;
    const newestPrice = priceHistory[0].price;

    if (oldestPrice === 0) return null;

    return (newestPrice - oldestPrice) / oldestPrice;
}

/**
 * Compare a single metric between two companies
 */
function compareMetric(value1, value2, id1, id2) {
    // Handle null values
    if (value1 === null && value2 === null) {
        return {
            better: null,
            differencePercent: 0
        };
    }

    if (value1 === null) {
        return {
            better: id2,
            differencePercent: 100 // Arbitrary large difference
        };
    }

    if (value2 === null) {
        return {
            better: id1,
            differencePercent: 100 // Arbitrary large difference
        };
    }

    // For metrics where higher is better
    let better = value1 > value2 ? id1 : id2;
    let differencePercent;

    // Special case for profitMargin:
    // If one is negative and one is positive, the positive one is clearly better
    if ((value1 < 0 && value2 > 0) || (value1 > 0 && value2 < 0)) {
        better = value1 > value2 ? id1 : id2;
        differencePercent = 100; // Arbitrary large difference for display
    } else {
        // Calculate percentage difference
        const max = Math.max(Math.abs(value1), Math.abs(value2));
        if (max === 0) {
            differencePercent = 0;
        } else {
            differencePercent = Math.abs((value1 - value2) / max) * 100;
        }
    }

    return {
        better,
        differencePercent
    };
}