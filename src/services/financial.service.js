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
            previousClose: null,
            dayLow: null,
            dayHigh: null,
            peRatio: null,
            debtToEquity: null,
            quickRatio: null,
            currentRatio: null,
            shortRatio: null,
            pegRatio: null,
            returnOnAssets: null,
            returnOnEquity: null,
            trailingEps: null,
            trailingPe: null,
            forwardPe: null,
            volume: null,
            averageVolume: null,
            totalCash: null,
            totalRevenue: null,
            revenue: null,
            revenueGrowth: null,
            grossProfit: null,
            grossMargins: null,
            profitMargin: null,
            earningsGrowth: null,
            stockPrice: null,
            priceHistory: [],
            grossMargin: null,
            operatingMargin: null,
            priceToBook: null,
            enterpriseValue: null,
            beta: null,
            bookValue: null
        };

        // Get quote data
        try {
            const quote = await yahooFinance.quote(stockSymbol);

            if (quote) {
                financialData.marketCap = quote.marketCap;
                financialData.previousClose = quote.regularMarketPreviousClose;
                financialData.dayLow = quote.regularMarketDayLow;
                financialData.dayHigh = quote.regularMarketDayHigh;
                financialData.stockPrice = quote.regularMarketPrice;
                financialData.volume = quote.regularMarketVolume;
                financialData.averageVolume = quote.averageDailyVolume10Day;
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
                financialData.debtToEquity = keyStats.financialData.debtToEquity;
                financialData.quickRatio = keyStats.financialData.quickRatio;
                financialData.currentRatio = keyStats.financialData.currentRatio;
                financialData.shortRatio = keyStats.financialData.shortRatio;
                financialData.pegRatio = keyStats.financialData.pegRatio;
                financialData.returnOnAssets = keyStats.financialData.returnOnAssets;
                financialData.returnOnEquity = keyStats.financialData.returnOnEquity;
                financialData.trailingEps = keyStats.financialData.trailingEps;
                financialData.trailingPe = keyStats.financialData.trailingPE;
                financialData.forwardPe = keyStats.financialData.forwardPE;
                financialData.totalCash = keyStats.financialData.totalCash;
                financialData.totalRevenue = keyStats.financialData.totalRevenue;
                financialData.grossProfit = keyStats.financialData.grossProfits;
                financialData.grossMargins = keyStats.financialData.grossMargins;
                financialData.profitMargin = keyStats.financialData.profitMargins;
                financialData.earningsGrowth = keyStats.financialData.earningsGrowth;
                financialData.grossMargin = keyStats.financialData.grossMargins;
                financialData.operatingMargin = keyStats.financialData.operatingMargins;
                financialData.priceToBook = keyStats.financialData.priceToBook;
                financialData.enterpriseValue = keyStats.financialData.enterpriseValue;
                financialData.beta = keyStats.financialData.beta;
                financialData.bookValue = keyStats.financialData.bookValue;

                // If revenue isn't in the financial data, try to get it from other fields
                if (!financialData.revenue && keyStats.financialData.totalRevenue) {
                    financialData.revenue = keyStats.financialData.totalRevenue;
                }
            }

            // Get PE ratio from defaultKeyStatistics if available
            if (keyStats.defaultKeyStatistics) {
                financialData.peRatio = keyStats.defaultKeyStatistics.trailingPE || keyStats.defaultKeyStatistics.forwardPE;
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

        // Prepare comparison object with all possible metrics
        const allMetrics = {
            marketCap: compareMetric(financials1.marketCap, financials2.marketCap, company1._id, company2._id),
            previousClose: compareMetric(financials1.previousClose, financials2.previousClose, company1._id, company2._id),
            dayLow: compareMetric(financials1.dayLow, financials2.dayLow, company1._id, company2._id),
            dayHigh: compareMetric(financials1.dayHigh, financials2.dayHigh, company1._id, company2._id),
            peRatio: compareMetric(financials1.peRatio, financials2.peRatio, company1._id, company2._id, false),
            debtToEquity: compareMetric(financials1.debtToEquity, financials2.debtToEquity, company1._id, company2._id, false),
            quickRatio: compareMetric(financials1.quickRatio, financials2.quickRatio, company1._id, company2._id),
            currentRatio: compareMetric(financials1.currentRatio, financials2.currentRatio, company1._id, company2._id),
            shortRatio: compareMetric(financials1.shortRatio, financials2.shortRatio, company1._id, company2._id, false),
            pegRatio: compareMetric(financials1.pegRatio, financials2.pegRatio, company1._id, company2._id, false),
            returnOnAssets: compareMetric(financials1.returnOnAssets, financials2.returnOnAssets, company1._id, company2._id),
            returnOnEquity: compareMetric(financials1.returnOnEquity, financials2.returnOnEquity, company1._id, company2._id),
            trailingEps: compareMetric(financials1.trailingEps, financials2.trailingEps, company1._id, company2._id),
            trailingPe: compareMetric(financials1.trailingPe, financials2.trailingPe, company1._id, company2._id, false),
            forwardPe: compareMetric(financials1.forwardPe, financials2.forwardPe, company1._id, company2._id, false),
            volume: compareMetric(financials1.volume, financials2.volume, company1._id, company2._id),
            averageVolume: compareMetric(financials1.averageVolume, financials2.averageVolume, company1._id, company2._id),
            totalCash: compareMetric(financials1.totalCash, financials2.totalCash, company1._id, company2._id),
            totalRevenue: compareMetric(financials1.totalRevenue, financials2.totalRevenue, company1._id, company2._id),
            revenue: compareMetric(financials1.revenue, financials2.revenue, company1._id, company2._id),
            revenueGrowth: compareMetric(financials1.revenueGrowth, financials2.revenueGrowth, company1._id, company2._id),
            grossProfit: compareMetric(financials1.grossProfit, financials2.grossProfit, company1._id, company2._id),
            grossMargins: compareMetric(financials1.grossMargins, financials2.grossMargins, company1._id, company2._id),
            profitMargin: compareMetric(financials1.profitMargin, financials2.profitMargin, company1._id, company2._id),
            earningsGrowth: compareMetric(financials1.earningsGrowth, financials2.earningsGrowth, company1._id, company2._id),
            stockPerformance: null,
            grossMargin: compareMetric(financials1.grossMargin, financials2.grossMargin, company1._id, company2._id),
            operatingMargin: compareMetric(financials1.operatingMargin, financials2.operatingMargin, company1._id, company2._id),
            priceToBook: compareMetric(financials1.priceToBook, financials2.priceToBook, company1._id, company2._id),
            enterpriseValue: compareMetric(financials1.enterpriseValue, financials2.enterpriseValue, company1._id, company2._id),
            beta: compareMetric(financials1.beta, financials2.beta, company1._id, company2._id),
            bookValue: compareMetric(financials1.bookValue, financials2.bookValue, company1._id, company2._id)
        };

        // Compare stock performance (if history available)
        if (financials1.priceHistory && financials1.priceHistory.length > 0 &&
            financials2.priceHistory && financials2.priceHistory.length > 0) {

            const perf1 = calculateStockPerformance(financials1.priceHistory);
            const perf2 = calculateStockPerformance(financials2.priceHistory);

            allMetrics.stockPerformance = compareMetric(perf1, perf2, company1._id, company2._id);
        }

        // Filter out metrics where both companies have null/undefined values
        const filteredComparison = {};
        
        Object.keys(allMetrics).forEach(metric => {
            const comparison = allMetrics[metric];
            
            // Skip metrics that are null or where both values are null/undefined
            if (comparison === null) {
                return;
            }
            
            // Check if both values are null/undefined/0 (indicating no data)
            const value1 = getMetricValue(financials1, metric);
            const value2 = getMetricValue(financials2, metric);
            
            const hasValue1 = value1 !== null && value1 !== undefined && value1 !== 0;
            const hasValue2 = value2 !== null && value2 !== undefined && value2 !== 0;
            
            // Only include the metric if at least one company has a meaningful value
            if (hasValue1 || hasValue2) {
                filteredComparison[metric] = comparison;
            }
        });

        return filteredComparison;
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
function compareMetric(value1, value2, id1, id2, higherIsBetter = true) {
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

    // Determine which is better based on the metric type
    let better;
    if (higherIsBetter) {
        better = value1 > value2 ? id1 : id2;
    } else {
        // For metrics where lower is better (PE ratios, debt to equity, etc.)
        better = value1 < value2 ? id1 : id2;
    }

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

/**
 * Helper function to get the actual metric value from financials object
 */
function getMetricValue(financials, metricName) {
    switch (metricName) {
        case 'stockPerformance':
            return financials.priceHistory && financials.priceHistory.length > 0 ? 
                   calculateStockPerformance(financials.priceHistory) : null;
        default:
            return financials[metricName];
    }
}
