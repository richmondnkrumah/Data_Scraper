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
        profitMargin: {
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