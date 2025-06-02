const mongoose = require('mongoose');

const ComparisonSchema = new mongoose.Schema({
    companies: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    }],
    companyNames: [{
        type: String,
        required: true
    }],
    financialComparison: {
        marketCap: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        previousClose: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        dayLow: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        dayHigh: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        peRatio: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        debtToEquity: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        quickRatio: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        currentRatio: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        shortRatio: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        pegRatio: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        returnOnAssets: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        returnOnEquity: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        trailingEps: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        trailingPe: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        forwardPe: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        volume: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        averageVolume: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        totalCash: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        totalRevenue: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        revenue: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        revenueGrowth: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        grossProfit: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        grossMargins: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        profitMargin: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        earningsGrowth: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        stockPerformance: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        grossMargin: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        operatingMargin: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        priceToBook: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        enterpriseValue: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        beta: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        bookValue: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        }
    },
    productComparison: {
        quality: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differenceScore: Number
        },
        variety: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differenceCount: Number
        },
        pricing: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            notes: String
        }
    },
    customerMetricsComparison: {
        userBase: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        growth: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differencePercent: Number
        },
        customerSatisfaction: {
            better: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            differenceScore: Number
        }
    },
    overallComparison: {
        winner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company'
        },
        strengths: [{
            company: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            area: String,
            description: String
        }],
        weaknesses: [{
            company: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company'
            },
            area: String,
            description: String
        }]
    },
    chartData: {
        // Storing pre-calculated data for frontend charts
        finances: {
            labels: [String],
            datasets: [{
                company: {
                    type: String,
                    required: true
                },
                data: [Number]
            }]
        },
        userMetrics: {
            labels: [String],
            datasets: [{
                company: {
                    type: String,
                    required: true
                },
                data: [Number]
            }]
        },
        productRatings: {
            labels: [String],
            datasets: [{
                company: {
                    type: String,
                    required: true
                },
                data: [Number]
            }]
        }
    },
    searchDate: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Create a compound index for companies
ComparisonSchema.index({companies: 1});
// Create an index for companyNames for text search
ComparisonSchema.index({companyNames: 1});

module.exports = mongoose.model('Comparison', ComparisonSchema);
