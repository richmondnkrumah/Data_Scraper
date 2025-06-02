const mongoose = require('mongoose');

const CompanySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        index: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true
    },
    website: {
        type: String,
        trim: true
    },
    logo: {
        type: String,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    industry: {
        type: String,
        trim: true
    },
    founded: {
        type: Number
    },
    headquarters: {
        type: String,
        trim: true
    },
    size: {
        type: String,
        trim: true
    },
    financials: {
        stockSymbol: {
            type: String,
            trim: true
        },
        marketCap: {
            type: Number
        },
        previousClose: {
            type: Number
        },
        dayLow: {
            type: Number
        },
        dayHigh: {
            type: Number
        },
        peRatio: {
            type: Number
        },
        debtToEquity: {
            type: Number
        },
        quickRatio: {
            type: Number
        },
        currentRatio: {
            type: Number
        },
        shortRatio: {
            type: Number
        },
        pegRatio: {
            type: Number
        },
        returnOnAssets: {
            type: Number
        },
        returnOnEquity: {
            type: Number
        },
        trailingEps: {
            type: Number
        },
        trailingPe: {
            type: Number
        },
        forwardPe: {
            type: Number
        },
        volume: {
            type: Number
        },
        averageVolume: {
            type: Number
        },
        totalCash: {
            type: Number
        },
        totalRevenue: {
            type: Number
        },
        revenue: {
            type: Number
        },
        revenueGrowth: {
            type: Number
        },
        grossProfit: {
            type: Number
        },
        grossMargins: {
            type: Number
        },
        profitMargin: {
            type: Number
        },
        earningsGrowth: {
            type: Number
        },
        stockPrice: {
            type: Number
        },
        priceHistory: [{
            date: Date,
            price: Number
        }],
        grossMargin: {
            type: Number
        },
        operatingMargin: {
            type: Number
        },
        priceToBook: {
            type: Number
        },
        enterpriseValue: {
            type: Number
        },
        beta: {
            type: Number
        },
        bookValue: {
            type: Number
        }
    },
    products: [{
        name: {
            type: String,
            trim: true
        },
        description: {
            type: String,
            trim: true
        },
        category: {
            type: String,
            trim: true
        },
        pricing: {
            type: String,
            trim: true
        },
        rating: {
            type: Number,
            min: 0,
            max: 5
        }
    }],
    socialMedia: {
        twitter: String,
        linkedin: String,
        facebook: String,
        instagram: String
    },
    customerMetrics: {
        userCount: Number,
        userGrowth: Number,
        churnRate: Number,
        nps: Number,
        rating: {
            type: Number,
            min: 0,
            max: 5
        }
    },
    competitors: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company'
    }],
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    toJSON: {virtuals: true},
    toObject: {virtuals: true}
});

// Create slug before saving
CompanySchema.pre('save', function (next) {
    if (!this.slug || this.isModified('name')) {
        this.slug = this.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
    }
    next();
});

module.exports = mongoose.model('Company', CompanySchema);
