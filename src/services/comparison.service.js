const financialService = require('./financial.service');
const logger = require('../utils/logger');

/**
 * Generate a complete comparison between two companies
 */
exports.generateComparison = async (company1, company2) => {
    try {
        logger.info(`Generating comparison: ${company1.name} vs ${company2.name}`);

        // Initialize comparison data structure
        const comparisonData = {
            financialComparison: {},
            productComparison: {},
            customerMetricsComparison: {},
            overallComparison: {
                strengths: [],
                weaknesses: []
            },
            chartData: {}
        };

        // Compare financials
        comparisonData.financialComparison = await financialService.compareFinancials(company1, company2);

        // Compare products
        comparisonData.productComparison = compareProducts(company1, company2);

        // Compare customer metrics
        comparisonData.customerMetricsComparison = compareCustomerMetrics(company1, company2);

        // Generate overall comparison
        comparisonData.overallComparison = generateOverallComparison(
            company1,
            company2,
            comparisonData.financialComparison,
            comparisonData.productComparison,
            comparisonData.customerMetricsComparison
        );

        // Generate chart data for visualization
        comparisonData.chartData = {
            finances: generateFinancialChartData(company1, company2),
            userMetrics: generateUserMetricsChartData(company1, company2),
            productRatings: generateProductRatingsChartData(company1, company2)
        };

        logger.info(`Comparison generated successfully: ${company1.name} vs ${company2.name}`);
        return comparisonData;
    } catch (error) {
        logger.error(`Error generating comparison: ${error.message}`);
        throw error;
    }
};

/**
 * Compare products between two companies
 */
function compareProducts(company1, company2) {
    try {
        const products1 = company1.products || [];
        const products2 = company2.products || [];

        // Initialize result
        const result = {
            quality: {
                better: null,
                differenceScore: 0
            },
            variety: {
                better: null,
                differenceCount: 0
            },
            pricing: {
                better: null,
                notes: ''
            }
        };

        // Compare product variety (number of products)
        if (products1.length !== products2.length) {
            result.variety.better = products1.length > products2.length ? company1._id : company2._id;
            result.variety.differenceCount = Math.abs(products1.length - products2.length);
        }

        // Compare product quality (average ratings)
        const avgRating1 = calculateAverageRating(products1);
        const avgRating2 = calculateAverageRating(products2);

        if (avgRating1 !== null && avgRating2 !== null) {
            if (avgRating1 !== avgRating2) {
                result.quality.better = avgRating1 > avgRating2 ? company1._id : company2._id;
                result.quality.differenceScore = Math.abs(avgRating1 - avgRating2);
            }
        } else if (avgRating1 !== null) {
            result.quality.better = company1._id;
            result.quality.differenceScore = 1; // Default difference
        } else if (avgRating2 !== null) {
            result.quality.better = company2._id;
            result.quality.differenceScore = 1; // Default difference
        }

        // Product pricing is complex and might need manual analysis
        // This is a placeholder for more sophisticated pricing comparison
        result.pricing.notes = 'Pricing comparison requires more detailed analysis';

        return result;
    } catch (error) {
        logger.error(`Error comparing products: ${error.message}`);
        return {
            error: 'Failed to compare product data'
        };
    }
}

/**
 * Compare customer metrics between two companies
 */
function compareCustomerMetrics(company1, company2) {
    try {
        const metrics1 = company1.customerMetrics || {};
        const metrics2 = company2.customerMetrics || {};

        // Initialize result
        const result = {
            userBase: {
                better: null,
                differencePercent: 0
            },
            growth: {
                better: null,
                differencePercent: 0
            },
            customerSatisfaction: {
                better: null,
                differenceScore: 0
            }
        };

        // Compare user base size
        if (metrics1.userCount && metrics2.userCount) {
            result.userBase.better = metrics1.userCount > metrics2.userCount ? company1._id : company2._id;

            const max = Math.max(metrics1.userCount, metrics2.userCount);
            if (max > 0) {
                result.userBase.differencePercent =
                    Math.abs(metrics1.userCount - metrics2.userCount) / max * 100;
            }
        } else if (metrics1.userCount) {
            result.userBase.better = company1._id;
            result.userBase.differencePercent = 100; // Default to 100% difference
        } else if (metrics2.userCount) {
            result.userBase.better = company2._id;
            result.userBase.differencePercent = 100; // Default to 100% difference
        }

        // Compare user growth
        if (metrics1.userGrowth && metrics2.userGrowth) {
            result.growth.better = metrics1.userGrowth > metrics2.userGrowth ? company1._id : company2._id;
            result.growth.differencePercent = Math.abs(metrics1.userGrowth - metrics2.userGrowth);
        } else if (metrics1.userGrowth) {
            result.growth.better = company1._id;
            result.growth.differencePercent = metrics1.userGrowth;
        } else if (metrics2.userGrowth) {
            result.growth.better = company2._id;
            result.growth.differencePercent = metrics2.userGrowth;
        }

        // Compare customer satisfaction
        if (metrics1.rating && metrics2.rating) {
            result.customerSatisfaction.better = metrics1.rating > metrics2.rating ? company1._id : company2._id;
            result.customerSatisfaction.differenceScore = Math.abs(metrics1.rating - metrics2.rating);
        } else if (metrics1.rating) {
            result.customerSatisfaction.better = company1._id;
            result.customerSatisfaction.differenceScore = 1; // Default difference
        } else if (metrics2.rating) {
            result.customerSatisfaction.better = company2._id;
            result.customerSatisfaction.differenceScore = 1; // Default difference
        }

        return result;
    } catch (error) {
        logger.error(`Error comparing customer metrics: ${error.message}`);
        return {
            error: 'Failed to compare customer metrics'
        };
    }
}

/**
 * Generate an overall comparison summary
 */
function generateOverallComparison(company1, company2, financialComparison, productComparison, customerMetricsComparison) {
    try {
        // Count which company has more "wins" in the comparison
        let company1Score = 0;
        let company2Score = 0;

        // Financial comparison points
        if (financialComparison.marketCap && financialComparison.marketCap.better) {
            if (financialComparison.marketCap.better.equals(company1._id)) company1Score++;
            else company2Score++;
        }

        if (financialComparison.revenue && financialComparison.revenue.better) {
            if (financialComparison.revenue.better.equals(company1._id)) company1Score++;
            else company2Score++;
        }

        if (financialComparison.profitMargin && financialComparison.profitMargin.better) {
            if (financialComparison.profitMargin.better.equals(company1._id)) company1Score++;
            else company2Score++;
        }

        if (financialComparison.stockPerformance && financialComparison.stockPerformance.better) {
            if (financialComparison.stockPerformance.better.equals(company1._id)) company1Score++;
            else company2Score++;
        }

        // Product comparison points
        if (productComparison.quality && productComparison.quality.better) {
            if (productComparison.quality.better.equals(company1._id)) company1Score++;
            else company2Score++;
        }

        if (productComparison.variety && productComparison.variety.better) {
            if (productComparison.variety.better.equals(company1._id)) company1Score++;
            else company2Score++;
        }

        // Customer metrics points
        if (customerMetricsComparison.userBase && customerMetricsComparison.userBase.better) {
            if (customerMetricsComparison.userBase.better.equals(company1._id)) company1Score++;
            else company2Score++;
        }

        if (customerMetricsComparison.growth && customerMetricsComparison.growth.better) {
            if (customerMetricsComparison.growth.better.equals(company1._id)) company1Score++;
            else company2Score++;
        }

        if (customerMetricsComparison.customerSatisfaction && customerMetricsComparison.customerSatisfaction.better) {
            if (customerMetricsComparison.customerSatisfaction.better.equals(company1._id)) company1Score++;
            else company2Score++;
        }

        // Determine overall winner
        const overallWinner = company1Score > company2Score ? company1._id :
            company2Score > company1Score ? company2._id : null;

        // Generate strengths and weaknesses
        const strengths = [];
        const weaknesses = [];

        // Financial strengths/weaknesses
        if (financialComparison.marketCap && financialComparison.marketCap.better) {
            const winner = financialComparison.marketCap.better;
            const loser = winner.equals(company1._id) ? company2._id : company1._id;

            strengths.push({
                company: winner,
                area: 'Market Capitalization',
                description: `Higher market capitalization by ${financialComparison.marketCap.differencePercent.toFixed(1)}%`
            });

            weaknesses.push({
                company: loser,
                area: 'Market Capitalization',
                description: `Lower market capitalization by ${financialComparison.marketCap.differencePercent.toFixed(1)}%`
            });
        }

        if (financialComparison.profitMargin && financialComparison.profitMargin.better) {
            const winner = financialComparison.profitMargin.better;
            const loser = winner.equals(company1._id) ? company2._id : company1._id;

            strengths.push({
                company: winner,
                area: 'Profitability',
                description: `Better profit margins`
            });

            weaknesses.push({
                company: loser,
                area: 'Profitability',
                description: `Weaker profit margins`
            });
        }

        // Product strengths/weaknesses
        if (productComparison.quality && productComparison.quality.better) {
            const winner = productComparison.quality.better;
            const loser = winner.equals(company1._id) ? company2._id : company1._id;

            strengths.push({
                company: winner,
                area: 'Product Quality',
                description: `Higher rated products`
            });

            weaknesses.push({
                company: loser,
                area: 'Product Quality',
                description: `Lower rated products`
            });
        }

        // Customer metrics strengths/weaknesses
        if (customerMetricsComparison.customerSatisfaction && customerMetricsComparison.customerSatisfaction.better) {
            const winner = customerMetricsComparison.customerSatisfaction.better;
            const loser = winner.equals(company1._id) ? company2._id : company1._id;

            strengths.push({
                company: winner,
                area: 'Customer Satisfaction',
                description: `Higher customer satisfaction ratings`
            });

            weaknesses.push({
                company: loser,
                area: 'Customer Satisfaction',
                description: `Lower customer satisfaction ratings`
            });
        }

        if (customerMetricsComparison.growth && customerMetricsComparison.growth.better) {
            const winner = customerMetricsComparison.growth.better;
            const loser = winner.equals(company1._id) ? company2._id : company1._id;

            strengths.push({
                company: winner,
                area: 'Growth',
                description: `Stronger user growth`
            });

            weaknesses.push({
                company: loser,
                area: 'Growth',
                description: `Weaker user growth`
            });
        }

        return {
            winner: overallWinner,
            strengths,
            weaknesses
        };
    } catch (error) {
        logger.error(`Error generating overall comparison: ${error.message}`);
        return {
            winner: null,
            strengths: [],
            weaknesses: [],
            error: 'Failed to generate overall comparison'
        };
    }
}

/**
 * Generate financial chart data for frontend visualization
 */
function generateFinancialChartData(company1, company2) {
    try {
        const financials1 = company1.financials || {};
        const financials2 = company2.financials || {};

        // Financial metrics to include in chart
        const metrics = [
            {label: 'Market Cap', value1: financials1.marketCap, value2: financials2.marketCap, scale: 1000000000},
            {label: 'Revenue', value1: financials1.revenue, value2: financials2.revenue, scale: 1000000000},
            {
                label: 'Profit Margin',
                value1: financials1.profitMargin,
                value2: financials2.profitMargin,
                scale: 1,
                percentage: true
            }
        ];

        const labels = metrics.map(m => m.label);

        const datasets = [
            {
                company: company1.name,
                data: metrics.map(m => {
                    if (m.value1 === null || m.value1 === undefined) return 0;
                    return m.percentage ? m.value1 * 100 : m.value1 / m.scale;
                })
            },
            {
                company: company2.name,
                data: metrics.map(m => {
                    if (m.value2 === null || m.value2 === undefined) return 0;
                    return m.percentage ? m.value2 * 100 : m.value2 / m.scale;
                })
            }
        ];

        return {
            labels,
            datasets
        };
    } catch (error) {
        logger.error(`Error generating financial chart data: ${error.message}`);
        return {
            labels: [],
            datasets: []
        };
    }
}

/**
 * Generate user metrics chart data for frontend visualization
 */
function generateUserMetricsChartData(company1, company2) {
    try {
        const metrics1 = company1.customerMetrics || {};
        const metrics2 = company2.customerMetrics || {};

        // User metrics to include in chart
        const metrics = [
            {label: 'User Count', value1: metrics1.userCount, value2: metrics2.userCount, scale: 1000000},
            {
                label: 'User Growth',
                value1: metrics1.userGrowth,
                value2: metrics2.userGrowth,
                scale: 1,
                percentage: true
            },
            {label: 'Rating', value1: metrics1.rating, value2: metrics2.rating, scale: 1}
        ];

        const labels = metrics.map(m => m.label);

        const datasets = [
            {
                company: company1.name,
                data: metrics.map(m => {
                    if (m.value1 === null || m.value1 === undefined) return 0;
                    return m.percentage ? m.value1 * 100 : m.value1 / m.scale;
                })
            },
            {
                company: company2.name,
                data: metrics.map(m => {
                    if (m.value2 === null || m.value2 === undefined) return 0;
                    return m.percentage ? m.value2 * 100 : m.value2 / m.scale;
                })
            }
        ];

        return {
            labels,
            datasets
        };
    } catch (error) {
        logger.error(`Error generating user metrics chart data: ${error.message}`);
        return {
            labels: [],
            datasets: []
        };
    }
}

/**
 * Generate product ratings chart data for frontend visualization
 */
function generateProductRatingsChartData(company1, company2) {
    try {
        const products1 = company1.products || [];
        const products2 = company2.products || [];

        // Use up to 5 products from each company
        const limitedProducts1 = products1.slice(0, 5);
        const limitedProducts2 = products2.slice(0, 5);

        // Generate labels (product names)
        const labels1 = limitedProducts1.map(p => `${company1.name}: ${p.name}`);
        const labels2 = limitedProducts2.map(p => `${company2.name}: ${p.name}`);

        // Combine labels
        const labels = [...labels1, ...labels2];

        // Create dataset for company 1
        const dataset1 = {
            company: company1.name,
            data: [
                ...limitedProducts1.map(p => p.rating || 0),
                ...Array(limitedProducts2.length).fill(null) // Fill with nulls for company 2's products
            ]
        };

        // Create dataset for company 2
        const dataset2 = {
            company: company2.name,
            data: [
                ...Array(limitedProducts1.length).fill(null), // Fill with nulls for company 1's products
                ...limitedProducts2.map(p => p.rating || 0)
            ]
        };

        return {
            labels,
            datasets: [dataset1, dataset2]
        };
    } catch (error) {
        logger.error(`Error generating product ratings chart data: ${error.message}`);
        return {
            labels: [],
            datasets: []
        };
    }
}

/**
 * Get detailed comparison for a specific metric
 */
exports.getDetailedMetricComparison = async (company1, company2, metricName) => {
    try {
        switch (metricName.toLowerCase()) {
            case 'financial':
            case 'financials':
                return financialService.compareFinancials(company1, company2);

            case 'product':
            case 'products':
                return compareProducts(company1, company2);

            case 'customer':
            case 'customers':
            case 'user':
            case 'users':
                return compareCustomerMetrics(company1, company2);

            case 'overall':
                const financialComparison = await financialService.compareFinancials(company1, company2);
                const productComparison = compareProducts(company1, company2);
                const customerMetricsComparison = compareCustomerMetrics(company1, company2);

                return generateOverallComparison(
                    company1,
                    company2,
                    financialComparison,
                    productComparison,
                    customerMetricsComparison
                );

            default:
                return {
                    error: `Unknown metric: ${metricName}`
                };
        }
    } catch (error) {
        logger.error(`Error generating detailed comparison for ${metricName}: ${error.message}`);
        return {
            error: `Error generating detailed comparison for ${metricName}`
        };
    }
};

/**
 * Generate chart data for frontend visualization
 */
exports.generateChartData = async (company1, company2, chartType) => {
    try {
        switch (chartType.toLowerCase()) {
            case 'financial':
            case 'financials':
            case 'finance':
                return generateFinancialChartData(company1, company2);

            case 'user':
            case 'users':
            case 'usermetrics':
            case 'customer':
            case 'customers':
                return generateUserMetricsChartData(company1, company2);

            case 'product':
            case 'products':
            case 'productratings':
                return generateProductRatingsChartData(company1, company2);

            default:
                return {
                    error: `Unknown chart type: ${chartType}`
                };
        }
    } catch (error) {
        logger.error(`Error generating chart data for ${chartType}: ${error.message}`);
        return {
            error: `Error generating chart data for ${chartType}`
        };
    }
};

/**
 * Calculate average product rating
 */
function calculateAverageRating(products) {
    if (!products || products.length === 0) return null;

    const productsWithRatings = products.filter(p => p.rating !== null && p.rating !== undefined);
    if (productsWithRatings.length === 0) return null;

    const sum = productsWithRatings.reduce((total, product) => total + product.rating, 0);
    return sum / productsWithRatings.length;
}