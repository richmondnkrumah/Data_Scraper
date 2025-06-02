const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Load configuration
const config = require('./config');
const { fetchCompanyLogo } = require('./utils/logoFetcher');

// Import Primary Yahoo Finance API (yahoo-stock-api by phamleduy04)
const YahooStockAPI = require('yahoo-stock-api').default;
const yahooStockAPI_instance = new YahooStockAPI();
// Import yahoo-finance2 for robust financial data fetching
const yahooFinance2 = require('yahoo-finance2').default;
let popularCompanies = [];
try {
    const popularCompaniesPath = path.join(__dirname, '..', 'public', 'popular_companies.json');
    if (fs.existsSync(popularCompaniesPath)) {
        const popularCompaniesData = fs.readFileSync(popularCompaniesPath, 'utf8');
        popularCompanies = JSON.parse(popularCompaniesData);
        console.log(`✓ Successfully loaded ${popularCompanies.length} popular companies (with symbols) for autocomplete dropdown.`);
    } else {
        console.warn("Warning: popular_companies.json not found. Autocomplete will be limited.");
    }
} catch (err) {
    console.warn("Warning: Could not load or parse popular_companies.json. Autocomplete will be limited.", err.message);
}

// Static file serving
function serveStaticFile(filePath, res) {
    const fullPath = path.join(__dirname, '..', 'public', filePath);

    // Security check - prevent directory traversal
    if (!fullPath.startsWith(path.join(__dirname, '..', 'public'))) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    fs.readFile(fullPath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File not found');
            return;
        }

        // Set appropriate content type
        const ext = path.extname(filePath);
        const contentType = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml'
        }[ext] || 'text/plain';

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
}
let PORT = config.server.port; // Will be updated if a port is selected from fallbacks
const ALPHA_VANTAGE_API_KEY = config.api.alphaVantage.key;
const MISTRAL_API_KEY = config.api.mistral.key;
const USE_MISTRAL = config.api.mistral.enabled;
const GEMINI_API_KEY = config.api.gemini.key;
const USE_GEMINI = config.api.gemini.enabled;

// Helper functions to generate estimated user metrics based on company data
function generateEstimatedUserCount(companyName) {
    // Generate a semi-realistic user count based on company name length as a seed
    // This is just for demonstration - in a real app, you'd use actual data
    const seed = companyName.length * 7 + companyName.charCodeAt(0);
    let baseCount;

    // Companies in certain industries tend to have more users
    const techCompanies = ['google', 'microsoft', 'apple', 'meta', 'facebook', 'amazon', 'netflix', 'intel'];
    const consumerCompanies = ['coca', 'pepsi', 'walmart', 'target', 'mcdonalds', 'nike', 'adidas', 'toyota', 'honda'];

    const normalizedName = companyName.toLowerCase();

    if (techCompanies.some(tech => normalizedName.includes(tech))) {
        baseCount = 500000000 + (seed * 10000000); // Tech companies typically have hundreds of millions of users
    } else if (consumerCompanies.some(consumer => normalizedName.includes(consumer))) {
        baseCount = 100000000 + (seed * 5000000); // Consumer companies have tens to hundreds of millions
    } else {
        baseCount = 10000000 + (seed * 1000000); // Default to tens of millions
    }

    // Add some randomness
    return Math.round(baseCount * (0.8 + Math.random() * 0.4));
}

function generateEstimatedUserGrowth() {
    // Generate a plausible growth rate between -5% and 30%
    return (Math.random() * 0.35) - 0.05;
}

function generateEstimatedRating() {
    // Generate a rating between 3.0 and 4.9
    return 3.0 + (Math.random() * 1.9);
}

// Function to fetch financial data using yahoo-stock-api (phamleduy04)
async function fetchFinancialsFromYahooStockAPI(symbol) {
    try {
        console.log(`Attempting to fetch financial data for ${symbol} using yahoo-stock-api...`);
        const data = await yahooStockAPI_instance.getSymbol({ symbol });

        if (!data || data.error || !data.response) {
            console.warn(`yahoo-stock-api failed for ${symbol}: ${data?.error || 'No response or error in response'}`);
            return null;
        }

        const response = data.response; // Access the actual data object

        // Map the response to our desired structure.
        // Note: Field names from yahoo-stock-api might be different and need careful mapping.
        // This mapping is based on common fields; actual fields might vary.
        const financials = {
            stockPrice: response.price || null,
            marketCap: response.marketCap || null,
            revenue: response.totalRevenue || response.revenue || null, // Check common variations
            profitMargin: response.profitMargins || null,
            peRatio: response.trailingPE || response.peRatio || null, // Check common variations
            eps: response.epsTrailingTwelveMonths || response.eps || null // Check common variations
        };

        const foundFields = Object.keys(financials).filter(key => financials[key] !== null);
        if (foundFields.length === 0) {
            console.warn(`yahoo-stock-api for ${symbol} returned no usable financial fields.`);
            return null;
        }

        console.log(`✓ yahoo-stock-api found data for ${symbol}: ${foundFields.join(', ')}`);
        if (financials.marketCap) {
            console.log(`✓ yahoo-stock-api Market Cap for ${symbol}: ${(financials.marketCap / 1000000000).toFixed(2)}B`);
        }
        return financials;

    } catch (error) {
        console.error(`Error in fetchFinancialsFromYahooStockAPI for ${symbol}: ${error.message}`);
        if (error.message && error.message.toLowerCase().includes('timeout')) {
            console.error(`Timeout occurred while fetching data for ${symbol} from yahoo-stock-api.`);
        }
        return null;
    }
}

// Helper function to check if financial data has empty fields
function hasEmptyFinancialFields(financials, fieldsToCheck = ['marketCap', 'revenue', 'profitMargin', 'peRatio', 'eps']) {
    if (!financials) return true;
    return fieldsToCheck.some(field => financials[field] === null || financials[field] === undefined);
}

// In-memory database with caching
const db = {
    companies: {
        'apple': {
            id: '1',
            name: 'Apple Inc.', // Official name
            description: 'Technology company that designs, develops, and sells consumer electronics, software, and online services.',
            industry: 'Technology',
            founded: 1976,
            headquarters: 'Cupertino, California, United States',
            website: 'https://www.apple.com',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg', // Example logo
            financials: {
                stockSymbol: 'AAPL',
                marketCap: 2800000000000,
                revenue: 394000000000,
                profitMargin: 0.25,
                peRatio: null, // Placeholder for new data
                eps: null,      // Placeholder for new data
                currentRatio: null,
                debtToEquity: null,
                grossMargin: null,
                operatingMargin: null,
                returnOnAssets: null,
                returnOnEquity: null,
                revenueGrowth: null,
                earningsGrowth: null,
                priceToBook: null,
                enterpriseValue: null,
                volume: null,
                averageVolume: null,
                beta: null,
                freeCashFlow: null,
                operatingCashFlow: null,
                bookValue: null,
                totalCash: null,
                totalDebt: null
            },
            products: [
                { name: 'iPhone', rating: 4.5 },
                { name: 'MacBook', rating: 4.6 },
                { name: 'iPad', rating: 4.3 }
            ],
            customerMetrics: {
                userCount: 1500000000,
                userGrowth: 0.05,
                rating: 4.5
            }
        },
        'microsoft': {
            id: '2',
            name: 'Microsoft Corporation', // Official name
            description: 'Technology company that develops, licenses, and supports software products, services, and devices.',
            industry: 'Technology',
            founded: 1975,
            headquarters: 'Redmond, Washington, United States',
            website: 'https://www.microsoft.com',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg', // Example logo
            financials: {
                stockSymbol: 'MSFT',
                marketCap: 2700000000000,
                revenue: 198000000000,
                profitMargin: 0.36,
                peRatio: null,
                eps: null,
                currentRatio: null,
                quickRatio: null,
                debtToEquity: null,
                grossMargin: null,
                operatingMargin: null,
                returnOnAssets: null
            },
            products: [
                { name: 'Windows', rating: 4.0 },
                { name: 'Office 365', rating: 4.4 },
                { name: 'Azure', rating: 4.5 }
            ],
            customerMetrics: {
                userCount: 1400000000,
                userGrowth: 0.08,
                rating: 4.2
            }
        }
    },
    comparisons: {}
};

// Helper to make HTTPS requests
async function makeApiRequest(apiUrl) {
    return new Promise((resolve, reject) => {
        const client = apiUrl.startsWith('https') ? https : http;
        client.get(apiUrl, { headers: { 'User-Agent': 'Node.js' } }, (res) => {
            let data = '';
            if (res.statusCode !== 200) {
                // Handle 401 errors for Yahoo Finance quoteSummary endpoint gracefully
                if (res.statusCode === 401 && apiUrl.includes('yahoo') && apiUrl.includes('quoteSummary')) {
                    // Don't log as error - this is expected for some Yahoo Finance endpoints
                    res.resume(); // Consume response data to free up memory
                    resolve(null); // Resolve with null on 401 for Yahoo Finance
                    return;
                }
                console.error(`API request failed with status: ${res.statusCode} for ${apiUrl}`);
                // Consume response data to free up memory
                res.resume();
                resolve(null); // Resolve with null on error to not break Promise.all
                return;
            }
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve(result);
                } catch (error) {
                    console.error(`Error parsing JSON from ${apiUrl}:`, error.message);
                    console.error('Received data:', data.substring(0, 200)); // Log first 200 chars of problematic data
                    resolve(null);
                }
            });
        }).on('error', (err) => {
            console.error(`Error making API request to ${apiUrl}:`, err.message);
            resolve(null);
        });
    });
}

// Alpha Vantage - Search for stock symbol
async function searchStockSymbol(keywords) {
    if (ALPHA_VANTAGE_API_KEY === 'YOUR_API_KEY_HERE') {
        console.warn('Alpha Vantage API key is not set. Symbol search will be skipped.');
        return null;
    }
    const apiUrl = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(keywords)}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const result = await makeApiRequest(apiUrl);
    if (result && result.bestMatches && result.bestMatches.length > 0) {
        // Prioritize US markets and common stock types
        const sortedMatches = result.bestMatches.sort((a, b) => {
            const aIsUS = a['4. region'] === 'United States';
            const bIsUS = b['4. region'] === 'United States';
            const aIsEquity = a['3. type'] === 'Equity';
            const bIsEquity = b['3. type'] === 'Equity';

            if (aIsUS && !bIsUS) return -1;
            if (!aIsUS && bIsUS) return 1;
            if (aIsEquity && !bIsEquity) return -1;
            if (!aIsEquity && bIsEquity) return 1;

            // Optional: Prefer shorter symbols if other factors are equal
            if (a['1. symbol'].length < b['1. symbol'].length) return -1;
            if (a['1. symbol'].length > b['1. symbol'].length) return 1;

            return 0; // Keep original order if all else is equal
        });

        if (sortedMatches.length > 0) {
            console.log(`✓ Symbol search for "${keywords}" found best match: ${sortedMatches[0]['1. symbol']} (Region: ${sortedMatches[0]['4. region']}, Type: ${sortedMatches[0]['3. type']})`);
            return sortedMatches[0]['1. symbol'];
        }
    }
    console.warn(`✗ No symbol found via Alpha Vantage search for "${keywords}"`);
    return null;
}

// Finnhub - Fetch financial ratios
async function fetchFinancialRatiosFromFinnhub(symbol) {
    const apiKey = 'd0u2d1pr01qgk5llgb60d0u2d1pr01qgk5llgb6g';
    const finnhubUrl = `https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${apiKey}`;
    try {
        const res = await fetch(finnhubUrl);
        const data = await res.json();
        if (!data || !data.metric) return null;
        console.log('Finnhub metrics for', symbol, data.metric); // New: LOG
        function pick(...args) { for (const k of args) { if (data.metric[k] !== undefined && data.metric[k] !== null) return data.metric[k]; } return null; }
        return {
            currentRatio: pick('currentRatioTTM', 'currentRatioAnnual', 'currentRatioQuarterly', 'currentRatio'),
            quickRatio: pick('quickRatioTTM', 'quickRatioAnnual', 'quickRatioQuarterly', 'quickRatio'),
            debtToEquity: pick('debtEquityRatioTTM', 'debtEquityRatioAnnual', 'debtEquityRatioQuarterly', 'totalDebtEquityQuarterly'),
            grossMargin: pick('grossMarginTTM', 'grossMarginAnnual', 'grossMarginQuarterly', 'grossMargin'),
            operatingMargin: pick('operatingMarginTTM', 'operatingMarginAnnual', 'operatingMarginQuarterly', 'operatingMargin'),
            returnOnAssets: pick('roaTTM', 'roaAnnual', 'roaQuarterly', 'returnOnAssets'),
            returnOnEquity: pick('roeTTM', 'roeAnnual', 'roeQuarterly', 'returnOnEquity'),
            revenueGrowth: pick('revenueGrowthTTM', 'revenueGrowthAnnual', 'revenueGrowthQuarterly', 'revenueGrowth'),
            earningsGrowth: pick('netIncomeGrowthTTM', 'netIncomeGrowthAnnual', 'netIncomeGrowthQuarterly', 'netIncomeGrowth'),
            priceToBook: pick('pbAnnual', 'pbQuarterly', 'pbTTM', 'priceToBookRatioAnnual', 'priceToBookRatioTTM'),
            enterpriseValue: pick('enterpriseValueQuarterly', 'enterpriseValueAnnual', 'enterpriseValueTTM', 'enterpriseValue'),
            volume: null,
            averageVolume: null,
            beta: pick('beta'),
            freeCashFlow: pick('freeCashFlowYieldAnnual', 'freeCashFlowYieldTTM', 'freeCashFlowYieldQuarterly'),
            operatingCashFlow: pick('operatingCashFlowPerShareAnnual', 'operatingCashFlowPerShareTTM', 'operatingCashFlowPerShareQuarterly'),
            bookValue: pick('bookValuePerShareAnnual', 'bookValuePerShareQuarterly', 'bookValuePerShareTTM'),
            totalCash: null,
            totalDebt: null
        };
    } catch (e) {
        console.warn('Finnhub ratio fetch failed:', e);
        return null;
    }
}

// Alpha Vantage - Fetch company overview and financials
async function fetchCompanyFinancialsFromAlphaVantage(symbol) {
    if (ALPHA_VANTAGE_API_KEY === 'YOUR_API_KEY_HERE') {
        console.warn('Alpha Vantage API key is not set. Financial data fetching will be skipped.');
        return null;
    }
    const apiUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const data = await makeApiRequest(apiUrl);

    if (!data || data['Note'] || Object.keys(data).length === 0) {
        console.warn(`Could not fetch overview for ${symbol} from Alpha Vantage. ${data ? data['Note'] : 'Empty response'}`);
        return null;
    }

    return {
        name: data.Name || symbol,
        description: data.Description || '',
        industry: data.Industry || 'Unknown',
        sector: data.Sector || 'Unknown',
        website: data.Website || data.Websit || '', // Typo in Alpha Vantage API? Checking common variations.
        stockSymbol: data.Symbol || symbol,
        marketCap: data.MarketCapitalization ? parseFloat(data.MarketCapitalization) : null,
        peRatio: data.PERatio && data.PERatio !== 'None' ? parseFloat(data.PERatio) : null,
        eps: data.EPS && data.EPS !== 'None' ? parseFloat(data.EPS) : null,
        revenue: data.RevenueTTM ? parseFloat(data.RevenueTTM) : null,
        profitMargin: data.ProfitMargin && data.ProfitMargin !== 'None' ? parseFloat(data.ProfitMargin) : null,
        currentRatio: data.CurrentRatio ? parseFloat(data.CurrentRatio) : null,
        quickRatio: data.QuickRatio ? parseFloat(data.QuickRatio) : null,
        debtToEquity: data.DebtEquity ? parseFloat(data.DebtEquity) : null,
        grossMargin: data.GrossProfitMargin ? parseFloat(data.GrossProfitMargin) : null,
        operatingMargin: data.OperatingMarginTTM ? parseFloat(data.OperatingMarginTTM) : null,
        returnOnAssets: data.ReturnOnAssetsTTM ? parseFloat(data.ReturnOnAssetsTTM) : null,
        returnOnEquity: data.ReturnOnEquityTTM ? parseFloat(data.ReturnOnEquityTTM) : null,
        revenueGrowth: data.RevenueGrowth ? parseFloat(data.RevenueGrowth) : null,
        earningsGrowth: data.EarningsGrowth ? parseFloat(data.EarningsGrowth) : null,
        priceToBook: data.PriceToBookRatio ? parseFloat(data.PriceToBookRatio) : null,
        enterpriseValue: data.EnterpriseValue ? parseFloat(data.EnterpriseValue) : null,
        volume: data.Volume ? parseFloat(data.Volume) : null,
        averageVolume: data.AverageVolume ? parseFloat(data.AverageVolume) : null,
        beta: data.Beta ? parseFloat(data.Beta) : null,
        freeCashFlow: data.FreeCashFlowTTM ? parseFloat(data.FreeCashFlowTTM) : null,
        operatingCashFlow: data.OperatingCashflowTTM ? parseFloat(data.OperatingCashflowTTM) : null,
        bookValue: data.BookValue ? parseFloat(data.BookValue) : null,
        totalCash: data.TotalCash ? parseFloat(data.TotalCash) : null,
        totalDebt: data.TotalDebt ? parseFloat(data.TotalDebt) : null,
        country: data.Country || 'Unknown',
        headquarters: 'Unknown'
    };
}

// Wikipedia Scraper (Simplified - kept for description, logo, etc.)
async function scrapeCompanyFromWikipedia(companyName) {
    const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(companyName.replace(/\sInc\.?|\sCorporation\.?/g, '').trim())}`;
    const result = await makeApiRequest(apiUrl);

    if (!result || result.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') {
        console.warn(`No Wikipedia page found for ${companyName}`);
        return {}; // Return empty object, other sources might fill data
    }

    const companyData = {
        description: result.extract || (db.companies[companyName.toLowerCase()]?.description || ''),
        logo: result.thumbnail?.source || null,
        website: result.originalimage?.source && result.originalimage.source.includes(companyName.split(' ')[0].toLowerCase()) ? result.originalimage.source : null // Basic check
        // Wikipedia is less reliable for structured data like founded, headquarters, use AlphaVantage primarily
    };
    if (result.title && result.title !== companyName) companyData.officialName = result.title;

    return companyData;
}

// Helper to make HTML requests (for scraping)
async function makeHtmlRequest(apiUrl, redirectCount = 0) {
    const MAX_REDIRECTS = 5;
    if (redirectCount > MAX_REDIRECTS) {
        console.error(`Exceeded maximum redirects (${MAX_REDIRECTS}) for ${apiUrl}`);
        return null;
    }

    return new Promise((resolve, reject) => {
        const client = apiUrl.startsWith('https') ? https : http;
        client.get(apiUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' } }, (res) => {
            let data = '';
            // Handle redirects for 301 and 302
            if (res.statusCode === 301 || res.statusCode === 302) {
                if (res.headers.location) {
                    console.log(`Redirecting from ${apiUrl} to ${res.headers.location} (Status: ${res.statusCode})`);
                    // Ensure the new location is a full URL
                    const newUrl = new URL(res.headers.location, apiUrl).toString();
                    makeHtmlRequest(newUrl, redirectCount + 1).then(resolve).catch(reject);
                } else {
                    console.error(`Redirect status ${res.statusCode} but no Location header for ${apiUrl}`);
                    resolve(null); // No location to redirect to
                }
                return;
            }

            if (res.statusCode !== 200) {
                console.error(`HTML request failed with status: ${res.statusCode} for ${apiUrl}`);
                // Consume response data to free up memory
                res.resume();
                resolve(null);
                return;
            }
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve(data); // Return raw HTML content
            });
        }).on('error', (err) => {
            console.error(`Error making HTML request to ${apiUrl}:`, err.message);
            resolve(null);
        });
    });
}

// CompaniesMarketCap Scraper for real-time financial data
async function scrapeCompanyFromMarketCap(companyName) {
    try {
        console.log(`Fetching real-time financial data for ${companyName} from CompaniesMarketCap...`);

        // Create a search-friendly version of the company name
        const searchName = companyName.toLowerCase()
            .replace(/\s+inc\.?$/i, '')
            .replace(/\s+corporation\.?$/i, '')
            .replace(/\s+corp\.?$/i, '')
            .replace(/\s+ltd\.?$/i, '')
            .replace(/\s+llc\.?$/i, '')
            .replace(/\s+company$/i, '')
            .replace(/\s+co\.?$/i, '')
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '-');

        // Try the direct company page
        const companyUrl = `https://companiesmarketcap.com/${searchName}/marketcap/`;

        // Use HTML request to get the page content
        const htmlContent = await makeHtmlRequest(companyUrl);

        if (!htmlContent) {
            console.warn(`Could not fetch data from CompaniesMarketCap for ${companyName}`);
            return null;
        }

        console.log(`DEBUG: HTML snippet for ${companyName}:`, htmlContent.substring(0, 500));

        // Enhanced regex patterns to extract data from HTML content
        const marketCapPatterns = [
            /Market\s*Cap[^$]*\$([0-9,.]+)\s*([BTM])/i,
            /market\s*capitalization[^$]*\$([0-9,.]+)\s*([BTM])/i,
            /cap[^$]*\$([0-9,.]+)\s*([BTM])/i
        ];

        const pricePatterns = [
            /Price[^$]*\$([0-9,.]+)/i,
            /share\s*price[^$]*\$([0-9,.]+)/i,
            /stock\s*price[^$]*\$([0-9,.]+)/i
        ];

        const stockSymbolPatterns = [
            /\(([A-Z]{2,5})\)/g,
            /ticker[^:]*:?\s*([A-Z]{2,5})/i,
            /symbol[^:]*:?\s*([A-Z]{2,5})/i
        ];

        let marketCap = null;
        let marketCapMatch = null;

        // Try different market cap patterns
        for (const pattern of marketCapPatterns) {
            marketCapMatch = htmlContent.match(pattern);
            if (marketCapMatch) break;
        }

        if (marketCapMatch) {
            const value = parseFloat(marketCapMatch[1].replace(/,/g, ''));
            const unit = marketCapMatch[2].toUpperCase();

            switch (unit) {
                case 'T':
                    marketCap = value * 1000000000000;
                    break;
                case 'B':
                    marketCap = value * 1000000000;
                    break;
                case 'M':
                    marketCap = value * 1000000;
                    break;
                default:
                    marketCap = value;
            }
            console.log(`DEBUG: Found market cap for ${companyName}: ${value}${unit} = ${marketCap}`);
        } else {
            console.log(`DEBUG: No market cap found for ${companyName}`);
        }

        let stockPrice = null;
        let priceMatch = null;

        // Try different price patterns
        for (const pattern of pricePatterns) {
            priceMatch = htmlContent.match(pattern);
            if (priceMatch) break;
        }

        if (priceMatch) {
            stockPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
            console.log(`DEBUG: Found stock price for ${companyName}: ${stockPrice}`);
        }

        let stockSymbol = null;

        // Try different stock symbol patterns
        for (const pattern of stockSymbolPatterns) {
            const symbolMatch = htmlContent.match(pattern);
            if (symbolMatch) {
                stockSymbol = symbolMatch[1].replace(/[()]/g, ''); // Remove parentheses
                console.log(`DEBUG: Found stock symbol for ${companyName}: ${stockSymbol}`);
                break;
            }
        }

        if (marketCap || stockPrice || stockSymbol) {
            console.log(`✓ Successfully obtained real-time data from CompaniesMarketCap for ${companyName}`);
            return {
                name: companyName,
                financials: {
                    stockSymbol: stockSymbol,
                    marketCap: marketCap,
                    stockPrice: stockPrice
                },
                dataSource: 'companiesmarketcap'
            };
        }

        console.log(`DEBUG: No useful data extracted for ${companyName} from CompaniesMarketCap`);
        return null;
    } catch (error) {
        console.warn(`Error scraping CompaniesMarketCap for ${companyName}: ${error.message}`);
        return null;
    }
}

// Mistral API integration for enhanced data gathering
async function fetchDataFromMistral(companyName) {
    if (!USE_MISTRAL || MISTRAL_API_KEY === 'YOUR_MISTRAL_API_KEY') {
        console.log('Mistral API key not set or integration disabled. Skipping Mistral data gathering.');
        return null;
    }

    console.log(`Fetching enhanced company data for ${companyName} from Mistral...`);
    console.log(`Using Mistral API for ${companyName}. This may take a few seconds...`);

    try {
        const prompt = `Provide detailed information about ${companyName} with the following structure:
1. A concise but informative company description (2-3 sentences)
2. Industry/sector the company operates in
3. Approximate financial data (use your knowledge, not real-time data):
   - Market capitalization (in billions USD)
   - Revenue (in billions USD, annual)
   - Profit margin (as percentage)
   - P/E ratio (approximate)
   - EPS (Earnings Per Share, approximate)
4. Key strengths (list 3-5 points)
5. Key challenges or weaknesses (list 2-3 points)
6. Main competitors (list up to 5)
7. Founded year
8. Headquarters location
9. Customer/user metrics (estimate):
   - Approximate user/customer count (in millions)
   - User growth rate (as decimal, e.g., 0.05 for 5% growth)
   - Overall customer satisfaction rating (out of 5)

Format as JSON with the following structure:
{
  "description": "...",
  "industry": "...",
  "financials": {
    "marketCap": number in billions (e.g., 200 for $200 billion),
    "revenue": number in billions (annual revenue),
    "profitMargin": decimal (e.g., 0.15 for 15%),
    "peRatio": number,
    "eps": number
  },
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "competitors": ["...", "..."],
  "founded": "YYYY",
  "headquarters": "Location",
  "customerMetrics": {
    "userCount": number in millions,
    "userGrowth": decimal,
    "rating": number out of 5
  }
}`;

        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MISTRAL_API_KEY}`
            },
            body: JSON.stringify({
                model: "mistral-medium",
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.2,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Mistral API error: ${response.status} ${response.statusText}`, errorText);
            return null;
        }

        const data = await response.json();
        if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
            console.error('Unexpected Mistral API response format:', data);
            return null;
        }

        console.log(`Received response from Mistral for ${companyName}`);

        let result;
        try {
            // The response may already be parsed as JSON by the Mistral API
            if (typeof data.choices[0].message.content === 'string') {
                const content = data.choices[0].message.content;
                // Clean up any malformed JSON - sometimes the AI adds explanations or text after the JSON
                const jsonEndIndex = content.lastIndexOf('}');
                if (jsonEndIndex > 0) {
                    const cleanedJson = content.substring(0, jsonEndIndex + 1);
                    try {
                        result = JSON.parse(cleanedJson);
                        console.log(`Successfully processed Mistral data for ${companyName}`);
                    } catch (innerError) {
                        console.error('Failed to parse cleaned JSON:', innerError);
                        // Create a basic result with just the description if possible
                        if (content.includes('"description"')) {
                            try {
                                const descStart = content.indexOf('"description"');
                                const descEnd = content.indexOf('",', descStart);
                                if (descStart > 0 && descEnd > descStart) {
                                    const description = content.substring(
                                        content.indexOf(':', descStart) + 1,
                                        descEnd
                                    ).trim().replace(/^"|"$/g, '');

                                    result = {
                                        description: description,
                                        industry: "Entertainment",
                                        financials: {
                                            marketCap: null,
                                            revenue: null,
                                            profitMargin: null,
                                            peRatio: null,
                                            eps: null
                                        }
                                    };
                                    console.log(`Extracted basic information for ${companyName}`);
                                }
                            } catch (e) {
                                console.error('Failed to extract description:', e);
                                return null;
                            }
                        } else {
                            return null;
                        }
                    }
                }
            } else {
                result = data.choices[0].message.content;
                console.log(`Successfully processed Mistral data for ${companyName}`);
            }
        } catch (e) {
            console.error('Failed to parse Mistral response as JSON:', e);
            console.log('Raw content:', data.choices[0].message.content);
            return null;
        }

        return result;
    } catch (error) {
        console.error('Error fetching data from Mistral:', error);
        return null;
    }
}

// Gemini API integration for enhanced data gathering (Primary source)
async function fetchDataFromGemini(companyName) {
    if (!USE_GEMINI || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY') {
        console.log('Gemini API key not set or integration disabled. Skipping Gemini data gathering.');
        return null;
    }

    console.log(`Fetching enhanced company data for ${companyName} from Gemini AI...`);
    console.log(`Using Gemini API for ${companyName}. This may take a few seconds...`);

    try {
        const prompt = `Analyze the company "${companyName}" and provide comprehensive business intelligence data. Return ONLY a valid JSON object with this exact structure - no additional text, explanations, or markdown formatting:

{
  "description": "2-3 sentence description of the company's business model",
  "industry": "Primary industry/sector",
  "founded": "YYYY",
  "headquarters": "City, State/Country",
  "website": "Official website URL if known",
  "financials": {
    "stockSymbol": "Stock ticker symbol if publicly traded",
    "marketCap": 0,
    "revenue": 0,
    "profitMargin": 0,
    "peRatio": 0,
    "eps": 0
  },
  "strengths": ["competitive advantage 1", "competitive advantage 2"],
  "weaknesses": ["challenge 1", "challenge 2"],
  "competitors": ["competitor 1", "competitor 2"],
  "customerMetrics": {
    "userCount": 0,
    "userGrowth": 0,
    "rating": 0
  },
  "products": [
    {"name": "Product name", "category": "Product category"}
  ],
  "recentNews": "Brief summary of recent developments",
  "marketPosition": "Market position description"
}

For ${companyName}, provide realistic estimates. Use numbers in billions for marketCap/revenue, millions for userCount, decimals for ratios/growth rates. Ensure all property names are double-quoted and all string values are double-quoted. Return only the JSON object.`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.2,
                    topK: 1,
                    topP: 1,
                    maxOutputTokens: 2048
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Gemini API error: ${response.status} ${response.statusText}`, errorText);
            return null;
        }

        const data = await response.json();

        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts) {
            console.error('Unexpected Gemini API response format:', data);
            return null;
        }

        const responseText = data.candidates[0].content.parts[0].text;
        console.log(`Received response from Gemini for ${companyName}`);

        let result;
        try {
            // Clean the response text to extract valid JSON
            let cleanedText = responseText.trim();

            // Remove markdown code blocks if present
            cleanedText = cleanedText.replace(/```json\s*/g, '').replace(/```\s*$/g, '');

            // Find the JSON content - look for the outermost braces
            let jsonStartIndex = cleanedText.indexOf('{');
            let jsonEndIndex = cleanedText.lastIndexOf('}');

            if (jsonStartIndex === -1 || jsonEndIndex === -1 || jsonStartIndex >= jsonEndIndex) {
                console.warn('No valid JSON structure found in Gemini response for', companyName);
                return null;
            }

            // Extract the JSON portion
            const jsonString = cleanedText.substring(jsonStartIndex, jsonEndIndex + 1);

            // Try to parse the JSON directly first
            try {
                result = JSON.parse(jsonString);
            } catch (firstParseError) {
                // If that fails, try to clean up common JSON issues
                let fixedJsonString = jsonString
                    // Fix unquoted property names
                    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
                    // Fix single quotes to double quotes (but be careful with contractions)
                    .replace(/:\s*'([^']*)'/g, ': "$1"')
                    // Fix trailing commas
                    .replace(/,(\s*[}\]])/g, '$1')
                    // Fix multiple commas
                    .replace(/,+/g, ',');

                result = JSON.parse(fixedJsonString);
            }

            console.log(`Successfully processed Gemini data for ${companyName}`);

            // Add source information
            result._source = 'gemini';
            result._timestamp = new Date().toISOString();

            return result;

        } catch (e) {
            console.error('Failed to parse Gemini response as JSON for', companyName, ':', e.message);
            console.error('Response snippet:', responseText.substring(0, 500) + '...');

            // Fallback: try to extract at least basic information manually
            try {
                const fallbackResult = {
                    description: null,
                    industry: null,
                    financials: {},
                    _source: 'gemini_fallback',
                    _timestamp: new Date().toISOString()
                };

                // Extract description using regex
                const descMatch = responseText.match(/"description"\s*:\s*"([^"]+)"/i);
                if (descMatch) fallbackResult.description = descMatch[1];

                // Extract industry using regex
                const industryMatch = responseText.match(/"industry"\s*:\s*"([^"]+)"/i);
                if (industryMatch) fallbackResult.industry = industryMatch[1];

                if (fallbackResult.description || fallbackResult.industry) {
                    console.log(`Extracted partial data for ${companyName} using fallback parsing`);
                    return fallbackResult;
                }
            } catch (fallbackError) {
                console.error('Fallback parsing also failed:', fallbackError.message);
            }

            return null;
        }

    } catch (error) {
        console.error('Error fetching data from Gemini:', error);
        return null;
    }
}

// Find or create company data
async function findOrCreateCompany(companyName) {
    const normalizedCompanyName = companyName.toLowerCase();

    // Check cache first (can be enhanced for more granular caching)
    if (db.companies[normalizedCompanyName] && db.companies[normalizedCompanyName].dataSource !== 'fallback' && db.companies[normalizedCompanyName].lastUpdated) {
        const cacheAge = (new Date() - new Date(db.companies[normalizedCompanyName].lastUpdated)) / (1000 * 60);
        if (cacheAge < 60) { // 1-hour cache for successfully fetched data
            console.log(`Using cached data for: ${companyName} (Source: ${db.companies[normalizedCompanyName].dataSource}, Age: ${cacheAge.toFixed(1)} mins)`);
            return db.companies[normalizedCompanyName];
        }
    }

    console.log(`Fetching data for new/updated company: ${companyName}`);
    let companyData = {
        id: db.companies[normalizedCompanyName]?.id || Date.now().toString(),
        name: companyName,
        description: null, industry: null, founded: null, headquarters: null, website: null, logo: null,
        strengths: [], weaknesses: [], competitors: [],
        recentNews: null, marketPosition: null,
        financials: { stockSymbol: null, marketCap: null, revenue: null, profitMargin: null, peRatio: null, eps: null, stockPrice: null },
        customerMetrics: { userCount: null, userGrowth: null, rating: null },
        products: [],
        dataSource: 'fallback',
        dataSourceDetails: []
    };

    // Helper to merge (only if current field is null/empty or an empty array)
    function mergeField(targetObj, fieldName, value, sourceName) {
        if (value !== null && value !== undefined) {
            if (targetObj[fieldName] === null || targetObj[fieldName] === undefined || (Array.isArray(targetObj[fieldName]) && targetObj[fieldName].length === 0)) {
                targetObj[fieldName] = value;
                companyData.dataSourceDetails.push({ field: fieldName, source: sourceName, value: (typeof value === 'string' && value.length > 100 ? value.substring(0, 100) + '...' : value) });
                return true;
            }
        }
        return false;
    }

    // --- Symbol Resolution Logic ---
    let stockSymbol = null;
    const popularEntry = popularCompanies.find(pc => pc.name.toLowerCase() === normalizedCompanyName);

    if (popularEntry && popularEntry.symbol) {
        stockSymbol = popularEntry.symbol;
        console.log(`✓ Using pre-vetted symbol "${stockSymbol}" for "${companyName}" from popular list.`);
        mergeField(companyData.financials, 'stockSymbol', stockSymbol, 'Popular List');
    } else {
        console.log(`~ "${companyName}" not in popular list or symbol missing, attempting Alpha Vantage symbol search...`);
        stockSymbol = await searchStockSymbol(companyName);
        if (stockSymbol) {
            mergeField(companyData.financials, 'stockSymbol', stockSymbol, 'Alpha Vantage Search');
        }
    }
    // Ensure stockSymbol in companyData.financials is the one we resolved
    if (stockSymbol && !companyData.financials.stockSymbol) {
        companyData.financials.stockSymbol = stockSymbol;
    }

    // --- Data Fetching Hierarchy ---

    // 1. Yahoo Finance (using yahoo-finance2 via fetchStockDataYahoo)
    if (companyData.financials.stockSymbol) {
        const yahooFinance2Data = await fetchStockDataYahoo(companyData.financials.stockSymbol); // Renamed variable for clarity
        if (yahooFinance2Data) {
            console.log(`✓ Data obtained from yahoo-finance2 for ${companyData.financials.stockSymbol}`);
            Object.keys(yahooFinance2Data).forEach(key => mergeField(companyData.financials, key, yahooFinance2Data[key], 'yahoo-finance2'));
            if (companyData.dataSource === 'fallback' && Object.values(yahooFinance2Data).some(v => v !== null)) {
                companyData.dataSource = 'yahoo-finance2';
            }
        } else {
            console.log(`✗ yahoo-finance2 fetch failed for ${companyData.financials.stockSymbol}.`);
        }
    } else {
        console.log(`✗ No stock symbol for "${companyName}", yahoo-finance2 skipped.`);
    }

    // 1.5 Alpha Vantage (fallback for any missing fields)
    if (hasEmptyFinancialFields(companyData.financials, [
        'marketCap', 'revenue', 'profitMargin', 'peRatio', 'eps', 'currentRatio', 'quickRatio', 'debtToEquity', 'grossMargin', 'operatingMargin',
        'returnOnAssets', 'returnOnEquity', 'revenueGrowth', 'earningsGrowth', 'priceToBook', 'enterpriseValue', 'volume', 'averageVolume',
        'beta', 'freeCashFlow', 'operatingCashFlow', 'bookValue', 'totalCash', 'totalDebt'
    ])) {
        const alphaVantageData = await fetchCompanyFinancialsFromAlphaVantage(companyData.financials.stockSymbol || companyData.name);
        if (alphaVantageData) {
            console.log(`✓ Data obtained from Alpha Vantage for ${companyData.name}`);
            Object.keys(alphaVantageData).forEach(key => mergeField(companyData.financials, key, alphaVantageData[key], 'Alpha Vantage'));
            if (companyData.dataSource === 'fallback' && Object.values(alphaVantageData).some(v => v !== null)) companyData.dataSource = 'Alpha Vantage';
        } else {
            console.log(`✗ Alpha Vantage fetch failed for ${companyData.name}.`);
        }
    }

    // 1.6 Finnhub (fallback for financial ratios)
    if (hasEmptyFinancialFields(companyData.financials, [
        'marketCap', 'revenue', 'profitMargin', 'peRatio', 'eps', 'currentRatio', 'quickRatio', 'debtToEquity', 'grossMargin', 'operatingMargin',
        'returnOnAssets', 'returnOnEquity', 'revenueGrowth', 'earningsGrowth', 'priceToBook', 'enterpriseValue', 'volume', 'averageVolume',
        'beta', 'freeCashFlow', 'operatingCashFlow', 'bookValue', 'totalCash', 'totalDebt'
    ])) {
        const finnhubData = await fetchFinancialRatiosFromFinnhub(companyData.financials.stockSymbol || companyData.name);
        if (finnhubData) {
            console.log(`✓ Data obtained from Finnhub for ${companyData.name}`);
            Object.keys(finnhubData).forEach(key => mergeField(companyData.financials, key, finnhubData[key], 'Finnhub'));
            if (companyData.dataSource === 'fallback' && Object.values(finnhubData).some(v => v !== null)) companyData.dataSource = 'Finnhub';
        } else {
            console.log(`✗ Finnhub fetch failed for ${companyData.name}.`);
        }
    }

    // 2. CompaniesMarketCap
    if (hasEmptyFinancialFields(companyData.financials, ['marketCap', 'stockPrice'])) {
        const marketCapRawData = await scrapeCompanyFromMarketCap(companyData.name);
        if (marketCapRawData && marketCapRawData.financials) {
            console.log(`✓ Data obtained from CompaniesMarketCap for ${companyData.name}`);
            Object.keys(marketCapRawData.financials).forEach(key => mergeField(companyData.financials, key, marketCapRawData.financials[key], 'CompaniesMarketCap'));
            // If CMC provided a symbol and we didn't have one from Yahoo/PopularList, update it
            if (!companyData.financials.stockSymbol && marketCapRawData.financials.stockSymbol) {
                mergeField(companyData.financials, 'stockSymbol', marketCapRawData.financials.stockSymbol, 'CompaniesMarketCap');
            }
            if (companyData.dataSource === 'fallback' && Object.values(marketCapRawData.financials).some(v => v !== null)) companyData.dataSource = 'CompaniesMarketCap';
        } else {
            console.log(`✗ CompaniesMarketCap fetch failed for ${companyData.name}.`);
        }
    }

    const needsMoreCompanyInfo = () => !companyData.description || !companyData.industry || !companyData.founded || !companyData.headquarters || !companyData.website;
    const needsMoreFinancialEstimates = () => hasEmptyFinancialFields(companyData.financials);

    // 3. Gemini AI
    if (USE_GEMINI && (needsMoreFinancialEstimates() || needsMoreCompanyInfo() || companyData.strengths.length === 0)) {
        const geminiData = await fetchDataFromGemini(companyData.name);
        if (geminiData) {
            console.log(`✓ Data obtained from Gemini AI for ${companyData.name}`);
            mergeField(companyData, 'description', geminiData.description, 'Gemini AI');
            mergeField(companyData, 'industry', geminiData.industry, 'Gemini AI');
            mergeField(companyData, 'founded', geminiData.founded ? parseInt(geminiData.founded) : null, 'Gemini AI');
            mergeField(companyData, 'headquarters', geminiData.headquarters, 'Gemini AI');
            mergeField(companyData, 'website', geminiData.website, 'Gemini AI');
            mergeField(companyData, 'strengths', geminiData.strengths, 'Gemini AI');
            mergeField(companyData, 'weaknesses', geminiData.weaknesses, 'Gemini AI');
            mergeField(companyData, 'competitors', geminiData.competitors, 'Gemini AI');
            mergeField(companyData, 'recentNews', geminiData.recentNews, 'Gemini AI');
            mergeField(companyData, 'marketPosition', geminiData.marketPosition, 'Gemini AI');
            if (geminiData.products) mergeField(companyData, 'products', geminiData.products, 'Gemini AI');

            if (geminiData.financials) {
                Object.keys(geminiData.financials).forEach(key => {
                    let val = geminiData.financials[key];

                    // Only convert billions to actual values for financial fields that need it
                    if (['marketCap', 'revenue', 'enterpriseValue', 'freeCashFlow', 'operatingCashFlow', 'totalCash', 'totalDebt'].includes(key)) {
                        // Check if the value is already in the right range (billions)
                        // Gemini returns values like 200 for $200B, we need 200000000000
                        if (val !== null && val !== undefined && val < 10000) { // If less than 10K, likely in billions
                            val = val * 1e9;
                        }
                        // If val is already large (> 10K), it's probably already in actual dollars, so don't convert
                    }

                    mergeField(companyData.financials, key, val, 'Gemini AI (Estimate)');
                });
            }
            if (geminiData.customerMetrics) {
                Object.keys(geminiData.customerMetrics).forEach(key => {
                    let val = geminiData.customerMetrics[key];

                    // Only convert millions to actual values for userCount
                    if (key === 'userCount') {
                        // Check if the value is already in the right range
                        // Gemini returns values like 1000 for 1000M users, we need 1000000000
                        if (val !== null && val !== undefined && val < 100000) { // If less than 100K, likely in millions
                            val = val * 1e6;
                        }
                        // If val is already large (> 100K), it's probably already in actual count, so don't convert
                    }

                    mergeField(companyData.customerMetrics, key, val, 'Gemini AI (Estimate)');
                });
            }
            if (companyData.dataSource === 'fallback') companyData.dataSource = 'Gemini AI';
        } else {
            console.log(`✗ Gemini AI fetch failed for ${companyData.name}.`);
        }
    }

    // 4. Mistral AI
    if (USE_MISTRAL && (needsMoreFinancialEstimates() || needsMoreCompanyInfo() || companyData.strengths.length === 0)) {
        const mistralData = await fetchDataFromMistral(companyData.name);
        if (mistralData) {
            console.log(`✓ Data obtained from Mistral AI for ${companyData.name}`);
            mergeField(companyData, 'description', mistralData.description, 'Mistral AI');
            mergeField(companyData, 'industry', mistralData.industry, 'Mistral AI');
            mergeField(companyData, 'founded', mistralData.founded ? parseInt(mistralData.founded) : null, 'Mistral AI');
            mergeField(companyData, 'headquarters', mistralData.headquarters, 'Mistral AI');
            mergeField(companyData, 'website', mistralData.website, 'Mistral AI');
            mergeField(companyData, 'strengths', mistralData.strengths, 'Mistral AI');
            mergeField(companyData, 'weaknesses', mistralData.weaknesses, 'Mistral AI');
            mergeField(companyData, 'competitors', mistralData.competitors, 'Mistral AI');

            if (mistralData.financials) {
                Object.keys(mistralData.financials).forEach(key => {
                    let val = mistralData.financials[key];

                    // Only convert billions to actual values for financial fields that need it
                    if (['marketCap', 'revenue', 'enterpriseValue', 'freeCashFlow', 'operatingCashFlow', 'totalCash', 'totalDebt'].includes(key)) {
                        // Check if the value is already in the right range (billions)
                        // Mistral returns values like 200 for $200B, we need 200000000000
                        if (val !== null && val !== undefined && val < 10000) { // If less than 10K, likely in billions
                            val = val * 1e9;
                        }
                        // If val is already large (> 10K), it's probably already in actual dollars, so don't convert
                    }

                    mergeField(companyData.financials, key, val, 'Mistral AI (Estimate)');
                });
            }
            if (mistralData.customerMetrics) {
                Object.keys(mistralData.customerMetrics).forEach(key => {
                    let val = mistralData.customerMetrics[key];

                    // Only convert millions to actual values for userCount
                    if (key === 'userCount') {
                        // Check if the value is already in the right range
                        // Mistral returns values like 1000 for 1000M users, we need 1000000000
                        if (val !== null && val !== undefined && val < 100000) { // If less than 100K, likely in millions
                            val = val * 1e6;
                        }
                        // If val is already large (> 100K), it's probably already in actual count, so don't convert
                    }

                    mergeField(companyData.customerMetrics, key, val, 'Mistral AI (Estimate)');
                });
            }
            if (companyData.dataSource === 'fallback') companyData.dataSource = 'Mistral AI';
        } else {
            console.log(`✗ Mistral AI fetch failed for ${companyData.name}.`);
        }
    }

    // --- Placeholder for Wikipedia (To be inserted next) ---

    // 5. Logo fetching (try Clearbit, favicon, Google Search before Wikipedia)
    if (!companyData.logo) {
        const logoResult = await fetchCompanyLogo(companyData.name, companyData.website);
        if (logoResult && logoResult.logo) {
            mergeField(companyData, 'logo', logoResult.logo, logoResult.logoSource);
        }
    }

    // 6. Wikipedia (Description, Logo - only if still missing)
    if (!companyData.description || !companyData.logo) {
        const nameForWikipedia = companyData.name;
        const wikiData = await scrapeCompanyFromWikipedia(nameForWikipedia);
        if (wikiData) {
            console.log(`✓ Data obtained from Wikipedia for ${nameForWikipedia}`);
            mergeField(companyData, 'description', wikiData.description, 'Wikipedia');
            mergeField(companyData, 'logo', wikiData.logo, 'Wikipedia');
            if (wikiData.officialName) mergeField(companyData, 'name', wikiData.officialName, 'Wikipedia'); // Update name if Wikipedia has a more official one and current is null
            if (companyData.dataSource === 'fallback') companyData.dataSource = 'Wikipedia';
        } else {
            console.log(`✗ Wikipedia fetch failed for ${nameForWikipedia}.`);
        }
    }

    // Finalization Logic
    // Determine effective data source name
    if (companyData.dataSource === 'fallback') {
        if (Object.values(companyData.financials).some(v => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))) {
            // Check if primary financials came from Yahoo or CMC
            const yahooContribution = companyData.dataSourceDetails.find(d => d.source === 'yahoo-stock-api' && ['marketCap', 'stockPrice', 'revenue'].includes(d.field));
            const cmcContribution = companyData.dataSourceDetails.find(d => d.source === 'CompaniesMarketCap' && ['marketCap', 'stockPrice'].includes(d.field));
            if (yahooContribution) companyData.dataSource = 'yahoo-stock-api (supplemented)';
            else if (cmcContribution) companyData.dataSource = 'CompaniesMarketCap (supplemented)';
            else companyData.dataSource = 'Multiple (Financials Focus)';
        } else if (companyData.description) {
            const geminiDesc = companyData.dataSourceDetails.find(d => d.source === 'Gemini AI' && d.field === 'description');
            const mistralDesc = companyData.dataSourceDetails.find(d => d.source === 'Mistral AI' && d.field === 'description');
            if (geminiDesc) companyData.dataSource = 'Gemini AI (supplemented)';
            else if (mistralDesc) companyData.dataSource = 'Mistral AI (supplemented)';
            else companyData.dataSource = 'Multiple (Info Focus)';
        } else {
            companyData.dataSource = 'No single primary source';
        }
    }

    // Fill any remaining estimated customer metrics if they are still null
    if (companyData.customerMetrics.userCount === null) mergeField(companyData.customerMetrics, 'userCount', generateEstimatedUserCount(companyData.name), 'Estimate');
    if (companyData.customerMetrics.userGrowth === null) mergeField(companyData.customerMetrics, 'userGrowth', generateEstimatedUserGrowth(), 'Estimate');
    if (companyData.customerMetrics.rating === null) mergeField(companyData.customerMetrics, 'rating', generateEstimatedRating(), 'Estimate');

    // Check if any meaningful data was fetched
    const hasFinancialData = Object.values(companyData.financials).some(v => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0));
    const hasBasicInfo = companyData.description || companyData.industry || companyData.logo;

    if (!hasFinancialData && !hasBasicInfo) {
        console.error(`Error: Failed to fetch any meaningful data for ${companyName}. All sources failed or returned empty.`);
        // Store minimal data to prevent re-fetching immediately for a known bad name, but mark as error
        db.companies[normalizedCompanyName] = {
            ...companyData,
            name: companyName,
            lastUpdated: new Date().toISOString(),
            dataSource: 'Error - No Data Retrieved',
            financials: { stockSymbol: null, marketCap: null, revenue: null, profitMargin: null, peRatio: null, eps: null, stockPrice: null } // Ensure financials are reset
        };
        return null;
    }

    companyData.lastUpdated = new Date().toISOString();
    console.log(`✓ Final data for ${companyData.name}: Effective Source: ${companyData.dataSource}, Symbol: ${companyData.financials.stockSymbol}, MktCap: ${companyData.financials.marketCap ? (companyData.financials.marketCap / 1e9).toFixed(2) + 'B' : 'N/A'}`);
    // For very detailed debugging of what each source provided:
    // console.log(`DataSourceDetails for ${companyData.name}:\n${companyData.dataSourceDetails.map(d => `  - ${d.field} from ${d.source}: ${d.value}`).join('\n')}`);

    db.companies[normalizedCompanyName] = companyData;
    return companyData;
}

// Enhanced Yahoo Finance API function using yahoo-finance2 package
async function fetchStockDataYahoo(symbol) {
    try {
        console.log(`Fetching comprehensive data from Yahoo Finance for ${symbol}...`);

        let stockData = {
            stockPrice: null,
            marketCap: null,
            revenue: null,
            profitMargin: null,
            peRatio: null,
            eps: null,
            currentRatio: null,
            quickRatio: null,
            debtToEquity: null,
            grossMargin: null,
            operatingMargin: null,
            returnOnAssets: null
        };

        // Get basic quote data
        try {
            const quote = await yahooFinance2.quote(symbol);
            if (quote) {
                stockData.stockPrice = quote.regularMarketPrice || null;
                stockData.marketCap = quote.marketCap || null;
                stockData.peRatio = quote.trailingPE || null;
                stockData.eps = quote.epsTrailingTwelveMonths || null;
            }
        } catch (quoteError) {
            console.log(`Note: Yahoo Finance quote failed for ${symbol}: ${quoteError.message}`);
        }

        // Get additional financial data using quoteSummary
        try {
            const summary = await yahooFinance2.quoteSummary(symbol, {
                modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail', 'incomeStatementHistory', 'earnings']
            });

            if (summary) {
                // Financial data
                if (summary.financialData) {
                    if (!stockData.revenue && summary.financialData.totalRevenue) {
                        stockData.revenue = summary.financialData.totalRevenue.raw;
                    }
                    if (!stockData.profitMargin && summary.financialData.profitMargins) {
                        stockData.profitMargin = summary.financialData.profitMargins.raw;
                    }
                    if (!stockData.returnOnAssets && summary.financialData.returnOnAssets) {
                        stockData.returnOnAssets = summary.financialData.returnOnAssets.raw;
                    }
                    if (!stockData.currentRatio && summary.financialData.currentRatio) {
                        stockData.currentRatio = summary.financialData.currentRatio.raw;
                    }
                    if (!stockData.quickRatio && summary.financialData.quickRatio) {
                        stockData.quickRatio = summary.financialData.quickRatio.raw;
                    }
                    if (!stockData.debtToEquity && summary.financialData.debtToEquity) {
                        stockData.debtToEquity = summary.financialData.debtToEquity.raw;
                    }
                    if (!stockData.grossMargin && summary.financialData.grossMargins) {
                        stockData.grossMargin = summary.financialData.grossMargins.raw;
                    }
                    if (!stockData.operatingMargin && summary.financialData.operatingMargins) {
                        stockData.operatingMargin = summary.financialData.operatingMargins.raw;
                    }
                }

                // Key statistics
                if (summary.defaultKeyStatistics) {
                    if (!stockData.peRatio && summary.defaultKeyStatistics.trailingPE) {
                        stockData.peRatio = summary.defaultKeyStatistics.trailingPE.raw;
                    }
                    if (!stockData.eps && summary.defaultKeyStatistics.trailingEps) {
                        stockData.eps = summary.defaultKeyStatistics.trailingEps.raw;
                    }
                }

                // Summary detail for market cap backup
                if (summary.summaryDetail && !stockData.marketCap && summary.summaryDetail.marketCap) {
                    stockData.marketCap = summary.summaryDetail.marketCap.raw;
                }

                // Try to get revenue from income statement history
                if (!stockData.revenue && summary.incomeStatementHistory && summary.incomeStatementHistory.incomeStatementHistory) {
                    const statements = summary.incomeStatementHistory.incomeStatementHistory;
                    if (statements.length > 0 && statements[0].totalRevenue) {
                        stockData.revenue = statements[0].totalRevenue.raw;
                    }
                }

                // Try to get revenue from earnings
                if (!stockData.revenue && summary.earnings && summary.earnings.financialsChart && summary.earnings.financialsChart.yearly) {
                    const yearly = summary.earnings.financialsChart.yearly;
                    if (yearly.length > 0 && yearly[0].revenue) {
                        stockData.revenue = yearly[0].revenue.raw;
                    }
                }
            }
        } catch (summaryError) {
            console.log(`Note: Yahoo Finance quoteSummary failed for ${symbol}: ${summaryError.message}`);
        }

        // If we still don't have revenue, try a different approach
        if (!stockData.revenue) {
            try {
                const fundamentals = await yahooFinance2.quoteSummary(symbol, {
                    modules: ['incomeStatementHistoryQuarterly', 'financialData']
                });

                if (fundamentals) {
                    // Try quarterly income statement for more recent revenue
                    if (fundamentals.incomeStatementHistoryQuarterly && fundamentals.incomeStatementHistoryQuarterly.incomeStatementHistory) {
                        const quarterly = fundamentals.incomeStatementHistoryQuarterly.incomeStatementHistory;
                        if (quarterly.length >= 4) {
                            // Sum last 4 quarters for TTM revenue
                            let ttmRevenue = 0;
                            for (let i = 0; i < 4; i++) {
                                if (quarterly[i] && quarterly[i].totalRevenue && quarterly[i].totalRevenue.raw) {
                                    ttmRevenue += quarterly[i].totalRevenue.raw;
                                }
                            }
                            if (ttmRevenue > 0) {
                                stockData.revenue = ttmRevenue;
                            }
                        }
                    }

                    // Final fallback: try financialData again
                    if (!stockData.revenue && fundamentals.financialData && fundamentals.financialData.totalRevenue) {
                        stockData.revenue = fundamentals.financialData.totalRevenue.raw;
                    }
                    if (summary.defaultKeyStatistics && summary.defaultKeyStatistics.bookValue) {
                        stockData.bookValue = summary.defaultKeyStatistics.bookValue.raw ?? stockData.bookValue;
                    }
                    if (quote && quote.bookValue) {
                        stockData.bookValue = quote.bookValue ?? stockData.bookValue;
                    }
                    if (summary.financialData && summary.financialData.totalCash) {
                        stockData.totalCash = summary.financialData.totalCash.raw ?? stockData.totalCash;
                    }
                    if (summary.financialData && summary.financialData.totalDebt) {
                        stockData.totalDebt = summary.financialData.totalDebt.raw ?? stockData.totalDebt;
                    }
                }
            } catch (fundamentalsError) {
                console.log(`Note: Yahoo Finance fundamentals failed for ${symbol}: ${fundamentalsError.message}`);
            }
        }

        // Log what we found
        const foundData = Object.keys(stockData).filter(key => stockData[key] !== null);
        console.log(`✓ Yahoo Finance found data for ${symbol}: ${foundData.join(', ')}`);

        // Log specific market cap for debugging
        if (stockData.marketCap) {
            console.log(`✓ Yahoo Finance Market Cap for ${symbol}: ${(stockData.marketCap / 1000000000).toFixed(2)}B`);
        }

        return foundData.length > 0 ? stockData : null;

    } catch (error) {
        console.warn(`Yahoo Finance error for ${symbol}: ${error.message}`);
        return null;
    }
}

// Generate a comparison on the fly
function generateComparison(company1, company2) {
    const id = `${(company1.name || 'comp1').toLowerCase().replace(/\W/g, '')}-${(company2.name || 'comp2').toLowerCase().replace(/\W/g, '')}`;
    const financials1 = company1.financials || {};
    const financials2 = company2.financials || {};
    const customerMetrics1 = company1.customerMetrics || {};
    const customerMetrics2 = company2.customerMetrics || {};

    const financialComparison = {
        marketCap: compareMetric(financials1.marketCap, financials2.marketCap, company1.id, company2.id, 'marketCap'),
        revenue: compareMetric(financials1.revenue, financials2.revenue, company1.id, company2.id, 'revenue'),
        profitMargin: compareMetric(financials1.profitMargin, financials2.profitMargin, company1.id, company2.id, 'profitMargin'),
        peRatio: compareMetric(financials1.peRatio, financials2.peRatio, company1.id, company2.id, 'peRatio'),
        eps: compareMetric(financials1.eps, financials2.eps, company1.id, company2.id, 'eps'),
        currentRatio: compareMetric(financials1.currentRatio, financials2.currentRatio, company1.id, company2.id, 'currentRatio'),
        quickRatio: compareMetric(financials1.quickRatio, financials2.quickRatio, company1.id, company2.id, 'quickRatio'),
        debtToEquity: compareMetric(financials1.debtToEquity, financials2.debtToEquity, company1.id, company2.id, 'debtToEquity'),
        grossMargin: compareMetric(financials1.grossMargin, financials2.grossMargin, company1.id, company2.id, 'grossMargin'),
        operatingMargin: compareMetric(financials1.operatingMargin, financials2.operatingMargin, company1.id, company2.id, 'operatingMargin'),
        returnOnAssets: compareMetric(financials1.returnOnAssets, financials2.returnOnAssets, company1.id, company2.id, 'returnOnAssets'),
        returnOnEquity: compareMetric(financials1.returnOnEquity, financials2.returnOnEquity, company1.id, company2.id, 'returnOnEquity'),
        revenueGrowth: compareMetric(financials1.revenueGrowth, financials2.revenueGrowth, company1.id, company2.id, 'revenueGrowth'),
        earningsGrowth: compareMetric(financials1.earningsGrowth, financials2.earningsGrowth, company1.id, company2.id, 'earningsGrowth'),
        priceToBook: compareMetric(financials1.priceToBook, financials2.priceToBook, company1.id, company2.id, 'priceToBook'),
        enterpriseValue: compareMetric(financials1.enterpriseValue, financials2.enterpriseValue, company1.id, company2.id, 'enterpriseValue'),
        volume: compareMetric(financials1.volume, financials2.volume, company1.id, company2.id, 'volume'),
        averageVolume: compareMetric(financials1.averageVolume, financials2.averageVolume, company1.id, company2.id, 'averageVolume'),
        beta: compareMetric(financials1.beta, financials2.beta, company1.id, company2.id, 'beta'),
        freeCashFlow: compareMetric(financials1.freeCashFlow, financials2.freeCashFlow, company1.id, company2.id, 'freeCashFlow'),
        operatingCashFlow: compareMetric(financials1.operatingCashFlow, financials2.operatingCashFlow, company1.id, company2.id, 'operatingCashFlow'),
        bookValue: compareMetric(financials1.bookValue, financials2.bookValue, company1.id, company2.id, 'bookValue'),
        totalCash: compareMetric(financials1.totalCash, financials2.totalCash, company1.id, company2.id, 'totalCash'),
        totalDebt: compareMetric(financials1.totalDebt, financials2.totalDebt, company1.id, company2.id, 'totalDebt'),
    };

    const userMetricsComparison = {
        userBase: compareMetric(customerMetrics1.userCount, customerMetrics2.userCount, company1.id, company2.id, 'userCount'),
        userGrowth: compareMetric(customerMetrics1.userGrowth, customerMetrics2.userGrowth, company1.id, company2.id, 'userGrowth'),
        rating: compareMetric(customerMetrics1.rating, customerMetrics2.rating, company1.id, company2.id, 'rating')
    };

    const chartData = {
        finances: {
            labels: ['Market Cap (B)', 'Revenue (B)', 'Profit Margin (%)', 'P/E Ratio', 'EPS'],
            datasets: [
                {
                    company: company1.name || 'Company 1',
                    data: [
                        financials1.marketCap ? financials1.marketCap / 1000000000 : 0,
                        financials1.revenue ? financials1.revenue / 1000000000 : 0, // Assuming revenue is also in billions if available
                        financials1.profitMargin ? financials1.profitMargin * 100 : 0,
                        financials1.peRatio || 0,
                        financials1.eps || 0,
                    ]
                },
                {
                    company: company2.name || 'Company 2',
                    data: [
                        financials2.marketCap ? financials2.marketCap / 1000000000 : 0,
                        financials2.revenue ? financials2.revenue / 1000000000 : 0,
                        financials2.profitMargin ? financials2.profitMargin * 100 : 0,
                        financials2.peRatio || 0,
                        financials2.eps || 0,
                    ]
                }
            ]
        },
        userMetrics: {
            labels: ['User Count (M)', 'User Growth (%)', 'Rating'],
            datasets: [
                {
                    company: company1.name || 'Company 1',
                    data: [
                        customerMetrics1.userCount ? customerMetrics1.userCount / 1000000 : 0,
                        customerMetrics1.userGrowth ? customerMetrics1.userGrowth * 100 : 0,
                        customerMetrics1.rating || 0
                    ]
                },
                {
                    company: company2.name || 'Company 2',
                    data: [
                        customerMetrics2.userCount ? customerMetrics2.userCount / 1000000 : 0,
                        customerMetrics2.userGrowth ? customerMetrics2.userGrowth * 100 : 0,
                        customerMetrics2.rating || 0
                    ]
                }
            ]
        }
    };

    return {
        id,
        companies: [company1.id, company2.id],
        companyNames: [company1.name || 'Company 1', company2.name || 'Company 2'],
        financialComparison,
        userMetricsComparison,
        chartData
    };
}

function compareMetric(value1, value2, id1, id2, metricName = '') {
    if ((value1 === null || value1 === undefined) && (value2 === null || value2 === undefined)) {
        // No values to compare, return a tie but with a decisive differencePercent to help tiebreaker
        return { better: Math.random() > 0.5 ? id1 : id2, differencePercent: 0, value1: value1, value2: value2 };
    }
    if (value1 === null || value1 === undefined) {
        return { better: id2, differencePercent: 100, value1: value1, value2: value2 };
    }
    if (value2 === null || value2 === undefined) {
        return { better: id1, differencePercent: 100, value1: value1, value2: value2 };
    }

    // For metrics where smaller is better (like P/E ratio), lower values are considered better
    const smallerBetterMetrics = ['peratio', 'pe', 'p/e', 'price-to-earnings'];

    // Check if this is a metric where smaller values are considered better
    const isSmallerBetter = metricName ?
        smallerBetterMetrics.some(m => metricName.toLowerCase().includes(m)) :
        false;

    // Convert to numbers for comparison
    const num1 = parseFloat(value1);
    const num2 = parseFloat(value2);

    // For extremely close values (within 0.1%), use a deterministic tiebreaker
    if (Math.abs(num1 - num2) / Math.max(Math.abs(num1), Math.abs(num2), 1e-9) < 0.001) { // Added 1e-9 to avoid division by zero with Math.max if both are 0
        let betterCompanyId = null;
        // Tie-breaking logic: 
        // 1. Prefer higher Market Cap if this is not the Market Cap comparison itself.
        // 2. If still tied (or it is a Market Cap comparison), prefer company that is first alphabetically.
        if (metricName.toLowerCase() !== 'marketcap') {
            // Find the full company objects to compare their market caps for tie-breaking
            const company1Object = Object.values(db.companies).find(c => c.id === id1);
            const company2Object = Object.values(db.companies).find(c => c.id === id2);

            if (company1Object && company2Object && company1Object.financials && company2Object.financials) {
                const marketCap1 = company1Object.financials.marketCap;
                const marketCap2 = company2Object.financials.marketCap;

                if (marketCap1 !== null && marketCap2 !== null && Math.abs(marketCap1 - marketCap2) / Math.max(Math.abs(marketCap1), Math.abs(marketCap2), 1e-9) >= 0.001) { // If market caps are significantly different
                    betterCompanyId = marketCap1 > marketCap2 ? id1 : id2;
                }
            }
        }

        // If no decision by market cap or it is a marketcap comparison, use alphabetical tie-breaking
        if (!betterCompanyId) {
            const company1Name = Object.values(db.companies).find(c => c.id === id1)?.name || '';
            const company2Name = Object.values(db.companies).find(c => c.id === id2)?.name || '';
            betterCompanyId = company1Name.localeCompare(company2Name) <= 0 ? id1 : id2;
        }

        return {
            better: betterCompanyId,
            differencePercent: 0, // Show 0% difference for true ties or very close values
            value1: num1,
            value2: num2,
            tieBrokenBy: betterCompanyId ? (metricName.toLowerCase() !== 'marketcap' && Object.values(db.companies).find(c => c.id === id1)?.financials?.marketCap !== Object.values(db.companies).find(c => c.id === id2)?.financials?.marketCap ? 'Market Cap' : 'Alphabetical') : 'N/A'
        };
    }

    // Handle the comparison logic based on whether smaller is better
    let better;
    if (isSmallerBetter) {
        better = num1 < num2 ? id1 : id2;
    } else {
        better = num1 > num2 ? id1 : id2;
    }

    const max = Math.max(Math.abs(num1), Math.abs(num2));
    const differencePercent = max === 0 ? 0 : Math.abs((num1 - num2) / max) * 100;

    return {
        better,
        differencePercent: parseFloat(differencePercent.toFixed(2)),
        value1: num1,
        value2: num2
    };
}

function parseQuery(reqUrl) {
    const parsedUrl = url.parse(reqUrl, true);
    return parsedUrl.query;
}

function formatNumber(num) {
    if (num === null || num === undefined) return 'N/A';
    if (Math.abs(num) >= 1e12) return (num / 1e12).toFixed(2) + ' T';
    if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(2) + ' B';
    if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(2) + ' M';
    if (Number.isInteger(num)) return num.toString();
    return num.toFixed(2);
}

function showNumber(val, digits = 2) {
    if (typeof val === 'number') return val.toFixed(digits);
    if (val && typeof val.raw === 'number') return val.raw.toFixed(digits);
    return 'N/A';
}

function renderCompanyBox(company, companyKey) {
    if (!company) return `<div class="company-box not-found">Company data for <strong>${companyKey}</strong> not found or failed to load.</div>`;
    const financials = company.financials || {};
    const name = company.name || companyKey;
    return `
      <div class="company-box">
        <h3>${name} ${financials.stockSymbol ? `(${financials.stockSymbol})` : ''}</h3>
        ${company.logo ? `<img src="${company.logo}" alt="${name} logo" class="logo">` : ''}
        <p><strong>Industry:</strong> ${company.industry || 'N/A'}</p>
        
        <div class="description">
          <strong>Description:</strong><br>
          <div class="description-preview">
            ${company.description ? company.description.substring(0, 100) + (company.description.length > 100 ? '...' : '') : 'N/A'}
            ${company.description && company.description.length > 100 ?
            `<a href="#" onclick="toggleDescription('${company.id || name.replace(/\W/g, '')}'); return false;" class="toggle-description" id="toggle-desc-${company.id || name.replace(/\W/g, '')}">Read more</a>` : ''}
          </div>
          ${company.description && company.description.length > 100 ?
            `<div class="description-full" id="full-desc-${company.id || name.replace(/\W/g, '')}" style="display:none">
              ${company.description}
              <a href="#" onclick="toggleDescription('${company.id || name.replace(/\W/g, '')}'); return false;" class="toggle-description">Read less</a>
             </div>` : ''}
        </div>
        
        <div class="financial-data">
          ${(() => {
            const financialMetricConfig = [
                { key: 'marketCap', label: 'Market Cap' },
                { key: 'peRatio', label: 'P/E Ratio' },
                { key: 'eps', label: 'EPS' },
                { key: 'revenue', label: 'Revenue (TTM)' },
                { key: 'profitMargin', label: 'Profit Margin', percent: true },
                { key: 'currentRatio', label: 'Current Ratio' },
                { key: 'quickRatio', label: 'Quick Ratio' },
                { key: 'debtToEquity', label: 'Debt to Equity' },
                { key: 'grossMargin', label: 'Gross Margin', percent: true },
                { key: 'operatingMargin', label: 'Operating Margin', percent: true },
                { key: 'returnOnAssets', label: 'Return on Assets (ROA)', percent: true },
                { key: 'returnOnEquity', label: 'Return on Equity (ROE)', percent: true },
                { key: 'revenueGrowth', label: 'Revenue Growth', percent: true },
                { key: 'earningsGrowth', label: 'Earnings Growth', percent: true },
                { key: 'priceToBook', label: 'Price to Book' },
                { key: 'enterpriseValue', label: 'Enterprise Value' },
                { key: 'volume', label: 'Volume' },
                { key: 'averageVolume', label: 'Average Volume' },
                { key: 'beta', label: 'Beta' },
                { key: 'freeCashFlow', label: 'Free Cash Flow' },
                { key: 'operatingCashFlow', label: 'Operating Cash Flow' },
                { key: 'bookValue', label: 'Book Value' },
                { key: 'totalCash', label: 'Total Cash' },
                { key: 'totalDebt', label: 'Total Debt' }
            ];

            return financialMetricConfig.map(cfg => {
                let val = financials[cfg.key];
                if (val === undefined || val === null || val === 'N/A' || (typeof val === 'number' && isNaN(val))) return '';
                if (val && typeof val.raw === 'number') val = val.raw;
                let display = val;
                if (cfg.percent && typeof display === 'number') display = (display * 100).toFixed(2) + '%';
                else if (!cfg.percent && typeof display === 'number') display = display.toFixed(2);
                else if (cfg.key === 'marketCap' || cfg.key === 'revenue' || cfg.key === 'enterpriseValue' || cfg.key === 'freeCashFlow' || cfg.key === 'operatingCashFlow' || cfg.key === 'totalCash' || cfg.key === 'totalDebt') display = formatNumber(val);
                return `<p><strong>${cfg.label}:</strong> ${display}</p>`;
            }).join('');
        })()}
        </div>
        <p><span class="toggle-more" onclick="toggleMoreInfo('${company.id || name.replace(/\W/g, '')}')">▼ See More Details</span></p>
        <div id="more-${company.id || name.replace(/\W/g, '')}" class="more-info">
          <h4>Additional Information</h4>
          <p><strong>Founded:</strong> ${company.founded || 'N/A'}</p>
          <p><strong>Headquarters:</strong> ${company.headquarters || 'N/A'}</p>
          <p><strong>Website:</strong> ${company.website ? `<a href="${company.website}" target="_blank">${company.website}</a>` : 'N/A'}</p>
          <p><strong>Full Description:</strong> ${company.description || 'N/A'}</p>
          ${company.products && company.products.length > 0 ?
            `<h4>Products</h4>
            <ul>${company.products.map(product => `<li>${product.name} - Rating: ${product.rating || 'N/A'}</li>`).join('')}</ul>` : ''}
          ${company.strengths && company.strengths.length > 0 ?
            `<h4>Key Strengths</h4>
            <ul>${company.strengths.map(strength => `<li>${strength}</li>`).join('')}</ul>` : ''}
          ${company.weaknesses && company.weaknesses.length > 0 ?
            `<h4>Challenges</h4>
            <ul>${company.weaknesses.map(weakness => `<li>${weakness}</li>`).join('')}</ul>` : ''}
          ${company.competitors && company.competitors.length > 0 ?
            `<h4>Main Competitors</h4>
            <ul>${company.competitors.map(competitor => `<li>${competitor}</li>`).join('')}</ul>` : ''}
        </div>
      </div>
    `;
}

let server = http.createServer(async (req, res) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const reqUrl = req.url;
    const query = parseQuery(reqUrl);
    const pathname = url.parse(reqUrl).pathname;

    try {
        if (pathname === '/' || pathname === '/index.html') {
            let company1Data = null, company2Data = null;
            let company1Name = query.company1, company2Name = query.company2;

            if (company1Name) company1Data = await findOrCreateCompany(company1Name);
            if (company2Name) company2Data = await findOrCreateCompany(company2Name);

            const readmeContent = fs.existsSync(path.join(__dirname, '..', 'README.md')) ?
                fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8') :
                'README.md not found.';

            const htmlContent = `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Competitor Analysis API</title>
                <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; margin: 0 auto; padding: 20px; max-width: 1200px; }
                  .container { display: flex; flex-wrap: wrap; gap: 20px; margin-bottom: 20px; }
                  .company-box { border: 1px solid #ddd; padding: 15px; border-radius: 5px; width: calc(50% - 30px); box-sizing: border-box; background: #f9f9f9; }
                  .company-box.not-found { background: #ffe0e0; color: #a04040; }
                  .company-box h3 { margin-top: 0; color: #337ab7; }
                  .logo { max-width: 100px; max-height: 50px; float: right; margin-left: 10px; }
                  .company-box p { margin: 8px 0; }
                  .description { font-size: 0.9em; margin: 15px 0; padding-bottom: 10px; border-bottom: 1px solid #eee; }
                  .description-preview { margin-bottom: 5px; }
                  .description-full { background-color: #f8f9fa; padding: 10px; border-radius: 4px; margin-top: 5px; }
                  .toggle-description { color: #0275d8; text-decoration: none; font-size: 0.85em; font-weight: 500; }
                  .financial-data { margin-top: 20px; }
                  form { margin: 20px 0; padding: 20px; background: #eee; border-radius: 5px; }
                  input, button { padding: 10px; margin: 5px; border-radius: 3px; border: 1px solid #ccc; }
                  input[type="text"] { width: 300px; font-size: 16px; padding: 12px; border: 2px solid #ddd; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: border-color 0.3s ease; }
                  input[type="text"]:focus { outline: none; border-color: #337ab7; box-shadow: 0 2px 8px rgba(51,122,183,0.2); }
                  button { cursor: pointer; background: #5cb85c; color: white; border-color: #4cae4c; padding: 12px 24px; font-size: 16px; font-weight: bold; transition: background-color 0.3s ease; }
                  button:hover { background: #449d44; }
                  .autocomplete-hint { font-size: 12px; color: #666; margin-top: 5px; }

                  .api-key-note { background: #fff3cd; border: 1px solid #ffeeba; color: #856404; padding: 10px; margin-bottom:15px; border-radius:4px; }
                  .autocomplete-help { font-size: 12px; color: #666; margin-top: 5px; text-align: center; font-style: italic; }
                  pre { background: #f0f0f0; padding: 10px; border-radius: 5px; overflow-x: auto; font-size: 0.85em; }
                  .search-container { display: flex; justify-content: space-between; align-items: flex-end; }
                  .company-column { flex: 0 0 40%; }
                  .submit-column { flex: 0 0 18%; text-align: center; }
                  .form-group { margin: 0 10px; }
                  .more-info { display: none; background: #f0f7ff; border: 1px solid #d0e3ff; padding: 15px; margin-top: 15px; border-radius: 5px; }
                  .more-info h4 { margin-top: 0; color: #337ab7; }
                  .toggle-more { cursor: pointer; color: #337ab7; text-decoration: underline; display: inline-block; margin: 10px 0; }
                  #comparison-results { display: none; margin-top: 30px; padding: 20px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 5px; }
                  .comparison-title { text-align: center; margin-bottom: 20px; color: #337ab7; }
                  .section-divider { margin: 40px 0; border-top: 1px solid #ddd; }
                  .admin-section { background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-top: 40px; }
                  .metric-row { display: flex; margin-bottom: 15px; align-items: center; }
                  .metric-label { width: 150px; font-weight: bold; }
                  .metric-bar-container { flex: 1; height: 30px; display: flex; margin: 0 10px; }
                  .metric-bar { height: 100%; position: relative; }
                  .metric-bar-1 { background-color: #4285f4; }
                  .metric-bar-2 { background-color: #ea4335; }
                  .metric-value { min-width: 80px; text-align: center; }
                  .metric-winner { min-width: 100px; text-align: center; font-weight: bold; }
                  .winner-highlight { background-color: #d4edda; color: #155724; padding: 3px 8px; border-radius: 3px; }
                  .chart-container { margin: 30px 0; }
                  .chart-title { text-align: center; margin-bottom: 15px; font-weight: bold; }
                  .loading { text-align: center; padding: 20px; }
                  .compare-button { margin-top: 20px; }
                  .pie-container { display: flex; flex-direction: flex-row}
                </style>
              </head>
              <body>
                <script>
                  function toggleDescription(id) {
                    const previewElem = document.getElementById('toggle-desc-' + id);
                    const fullElem = document.getElementById('full-desc-' + id);
                    
                    if (fullElem.style.display === 'none') {
                      fullElem.style.display = 'block';
                      previewElem.style.display = 'none';
                    } else {
                      fullElem.style.display = 'none';
                      previewElem.style.display = 'inline';
                    }
                  }
                </script>
                <h1>Competitor Analysis Dashboard</h1>
                <form method="get" action="/">
                  <h3>Enter Companies to Analyze</h3>
                  <div class="autocomplete-help">💡 Start typing a company name to see alphabetically sorted suggestions from top ${popularCompanies.length} companies</div>
                  <div class="search-container">
                    <div class="company-column">
                      <div class="form-group">
                        <label for="company1">Company 1:</label>
                        <input type="text" id="company1" name="company1" value="${company1Name || ''}" placeholder="e.g., Apple Inc." list="company-suggestions" required>
                        <div class="autocomplete-hint">🔍 Type to see dropdown with stock symbols</div>
                      </div>
                    </div>
                    <div class="submit-column">
                      <button type="submit">Get Company Details</button>
                    </div>
                    <div class="company-column">
                      <div class="form-group">
                        <label for="company2">Company 2:</label>
                        <input type="text" id="company2" name="company2" value="${company2Name || ''}" placeholder="e.g., Microsoft Corporation" list="company-suggestions" required>
                        <div class="autocomplete-hint">🔍 Type to see dropdown with stock symbols</div>
                      </div>
                    </div>
                  </div>
                </form>
                <datalist id="company-suggestions">
                  ${popularCompanies.map(company => `<option value="${company.name}" data-symbol="${company.symbol}">${company.name} (${company.symbol})</option>`).join('')}
                </datalist>
                ${(company1Data || company2Data) ? `
                  <div class="container">
                    ${company1Data ? renderCompanyBox(company1Data, company1Name) : (company1Name ? renderCompanyBox(null, company1Name) : '')}
                    ${company2Data ? renderCompanyBox(company2Data, company2Name) : (company2Name ? renderCompanyBox(null, company2Name) : '')}
                  </div>
                  <div class="pie-container">
                  ${company1Data ? `
    <div style="width:100%;max-width:400px;margin:auto">
      <canvas id="pie-${company1Data.id}"></canvas>
    </div>` : ''}
                  ${company2Data ? `
    <div style="width:100%;max-width:400px;margin:auto">
      <canvas id="pie-${company2Data.id}"></canvas>
    </div>` : ''}
                  </div>
                  ${(company1Data && company2Data) ? `<div class="compare-button" style="text-align: center;">
                    <button type="button" onclick="compareCompanies('${company1Data.name.replace(/'/g, "\\'")}', '${company2Data.name.replace(/'/g, "\\'")}')">Compare These Two Companies</button>
                  </div>
                  <div id="comparison-results">
                    <h2 class="comparison-title">Comparison: <span id="company-1-name"></span> vs <span id="company-2-name"></span></h2>
                    <div id="loading-comparison" class="loading">Loading comparison data...</div>
                    <div id="financial-comparison" style="display:none;">
                      <h3>Financial Metrics Comparison</h3>
                      <div id="financial-metrics"></div>
                      <div class="chart-container">
                        <div class="chart-title">Financial Performance</div>
                        <div id="finance-chart"></div>
                      </div>
                    </div>
                    <div id="user-metrics-comparison" style="display:none;">
                      <h3>User Metrics Comparison</h3>
                      <div id="user-metrics"></div>
                      <div class="chart-container">
                        <div class="chart-title">User Metrics</div>
                        <div id="user-chart"></div>
                      </div>
                    </div>
                    <div id="overall-winner" style="display:none;"></div>
                  </div>` : ''}
                ` : ''}
                <!-- Admin section only shown in development mode -->
                ${process.env.NODE_ENV === 'development' ? `
                  <hr class="section-divider">
                  <div class="admin-section">
                    <h2>API Documentation (Endpoints)</h2>
                    <p class="api-key-note">${ALPHA_VANTAGE_API_KEY === 'YOUR_API_KEY_HERE' ? '<strong>WARNING:</strong> Alpha Vantage API key is not set. Data for new companies will be limited. <a href="https://www.alphavantage.co/support/#api-key" target="_blank">Get a free key</a> and update <code>src/enhanced-server.js</code>.' : 'Alpha Vantage API Key is set.'}</p>
                    <pre>${readmeContent.replace(/http:\/\/localhost:3003/g, `http://localhost:${PORT}`)}</pre>
                  </div>
                ` : ''}
              </body>
              <script>
                function toggleMoreInfo(id) {
                  const element = document.getElementById('more-' + id);
                  const toggle = event.target;
                  if (element.style.display === "block") {
                    element.style.display = "none";
                    toggle.innerHTML = "▼ See More Details";
                  } else {
                    element.style.display = "block";
                    toggle.innerHTML = "▲ Hide Details";
                  }
                }

                function compareCompanies(company1, company2) {
                  // Show the results container and loading message
                  document.getElementById('comparison-results').style.display = 'block';
                  document.getElementById('loading-comparison').style.display = 'block';
                  document.getElementById('financial-comparison').style.display = 'none';
                  document.getElementById('user-metrics-comparison').style.display = 'none';
                  document.getElementById('overall-winner').style.display = 'none';
                  
                  // Update company names in the title
                  document.getElementById('company-1-name').textContent = company1;
                  document.getElementById('company-2-name').textContent = company2;
                  
                  // Scroll to the comparison section
                  document.getElementById('comparison-results').scrollIntoView({behavior: 'smooth'});
                  
                  // Fetch the comparison data
                  fetch('/api/comparison?company1=' + encodeURIComponent(company1) + '&company2=' + encodeURIComponent(company2))
                    .then(response => response.json())
                    .then(data => {
                      if (data.status !== 'success') {
                        alert('Error: ' + (data.message || 'Failed to load comparison data'));
                        return;
                      }
                      
                      // Hide loading message
                      document.getElementById('loading-comparison').style.display = 'none';
                      
                      const comparison = data.data;
                      const companyNames = comparison.companyNames;
                      const financialComparison = comparison.financialComparison;
                      const userComparison = comparison.userMetricsComparison;
                      const chartData = comparison.chartData;
                      
                      // Display financial metrics
                      let financialHTML = '';
                      let company1Wins = 0;
                      let company2Wins = 0;
                      
                      // Market Cap
                      financialHTML += createComparisonRow(
                        'Market Cap', 
                        formatNumberForDisplay(financialComparison.marketCap.value1), 
                        formatNumberForDisplay(financialComparison.marketCap.value2),
                        financialComparison.marketCap.better,
                        comparison.companies[0], comparison.companies[1],
                        company1Wins, company2Wins
                      );
                      
                      // Track wins
                      if (financialComparison.marketCap.better === comparison.companies[0]) company1Wins++;
                      if (financialComparison.marketCap.better === comparison.companies[1]) company2Wins++;
                      
                      // Revenue
                      financialHTML += createComparisonRow(
                        'Revenue', 
                        formatNumberForDisplay(financialComparison.revenue.value1), 
                        formatNumberForDisplay(financialComparison.revenue.value2),
                        financialComparison.revenue.better,
                        comparison.companies[0], comparison.companies[1],
                        company1Wins, company2Wins
                      );
                      
                      // Track wins
                      if (financialComparison.revenue.better === comparison.companies[0]) company1Wins++;
                      if (financialComparison.revenue.better === comparison.companies[1]) company2Wins++;
                      
                      // Profit Margin
                      financialHTML += createComparisonRow(
                        'Profit Margin', 
                        financialComparison.profitMargin.value1 !== null ? (financialComparison.profitMargin.value1 * 100).toFixed(2) + '%' : 'N/A', 
                        financialComparison.profitMargin.value2 !== null ? (financialComparison.profitMargin.value2 * 100).toFixed(2) + '%' : 'N/A',
                        financialComparison.profitMargin.better,
                        comparison.companies[0], comparison.companies[1],
                        company1Wins, company2Wins
                      );
                      
                      // Track wins
                      if (financialComparison.profitMargin.better === comparison.companies[0]) company1Wins++;
                      if (financialComparison.profitMargin.better === comparison.companies[1]) company2Wins++;
                      
                      // PE Ratio
                      financialHTML += createComparisonRow(
                        'P/E Ratio', 
                        financialComparison.peRatio.value1 !== null ? financialComparison.peRatio.value1.toFixed(2) : 'N/A', 
                        financialComparison.peRatio.value2 !== null ? financialComparison.peRatio.value2.toFixed(2) : 'N/A',
                        financialComparison.peRatio.better,
                        comparison.companies[0], comparison.companies[1],
                        company1Wins, company2Wins
                      );
                      
                      // Track wins
                      if (financialComparison.peRatio.better === comparison.companies[0]) company1Wins++;
                      if (financialComparison.peRatio.better === comparison.companies[1]) company2Wins++;
                      
                      // EPS
                      financialHTML += createComparisonRow(
                        'EPS', 
                        financialComparison.eps.value1 !== null ? financialComparison.eps.value1.toFixed(2) : 'N/A', 
                        financialComparison.eps.value2 !== null ? financialComparison.eps.value2.toFixed(2) : 'N/A',
                        financialComparison.eps.better,
                        comparison.companies[0], comparison.companies[1],
                        company1Wins, company2Wins
                      );
                      
                      // Track wins
                      if (financialComparison.eps.better === comparison.companies[0]) company1Wins++;
                      if (financialComparison.eps.better === comparison.companies[1]) company2Wins++;
                      
                      document.getElementById('financial-metrics').innerHTML = financialHTML;
                      document.getElementById('financial-comparison').style.display = 'block';
                      
                      // User metrics
                      let userHTML = '';
                      
                      // User base
                      userHTML += createComparisonRow(
                        'User Base', 
                        formatNumberForDisplay(userComparison.userBase.value1), 
                        formatNumberForDisplay(userComparison.userBase.value2),
                        userComparison.userBase.better,
                        comparison.companies[0], comparison.companies[1],
                        company1Wins, company2Wins
                      );
                      
                      // Track wins
                      if (userComparison.userBase.better === comparison.companies[0]) company1Wins++;
                      if (userComparison.userBase.better === comparison.companies[1]) company2Wins++;
                      
                      // User growth
                      userHTML += createComparisonRow(
                        'User Growth', 
                        userComparison.userGrowth.value1 !== null ? (userComparison.userGrowth.value1 * 100).toFixed(2) + '%' : 'N/A', 
                        userComparison.userGrowth.value2 !== null ? (userComparison.userGrowth.value2 * 100).toFixed(2) + '%' : 'N/A',
                        userComparison.userGrowth.better,
                        comparison.companies[0], comparison.companies[1],
                        company1Wins, company2Wins
                      );
                      
                      // Track wins
                      if (userComparison.userGrowth.better === comparison.companies[0]) company1Wins++;
                      if (userComparison.userGrowth.better === comparison.companies[1]) company2Wins++;
                      
                      // Rating
                      userHTML += createComparisonRow(
                        'Rating', 
                        userComparison.rating.value1 !== null ? userComparison.rating.value1.toFixed(1) + '/5' : 'N/A', 
                        userComparison.rating.value2 !== null ? userComparison.rating.value2.toFixed(1) + '/5' : 'N/A',
                        userComparison.rating.better,
                        comparison.companies[0], comparison.companies[1],
                        company1Wins, company2Wins
                      );
                      
                      // Track wins
                      if (userComparison.rating.better === comparison.companies[0]) company1Wins++;
                      if (userComparison.rating.better === comparison.companies[1]) company2Wins++;
                      
                      document.getElementById('user-metrics').innerHTML = userHTML;
                      document.getElementById('user-metrics-comparison').style.display = 'block';
                      
                      // Generate charts
                      createSimpleChart('finance-chart', chartData.finances, companyNames);
                      createSimpleChart('user-chart', chartData.userMetrics, companyNames);
                      
                      // Show overall winner
                      const overallWinner = company1Wins > company2Wins ? companyNames[0] : (company2Wins > company1Wins ? companyNames[1] : 'Tie');
                      document.getElementById('overall-winner').innerHTML = 
                        '<h3>Overall Analysis</h3>' +
                        '<div style="text-align: center; padding: 15px; font-size: 1.2em;">' +
                        (overallWinner === 'Tie' 
                          ? '<p>The comparison shows a <strong>tie</strong> between ' + companyNames[0] + ' and ' + companyNames[1] + '.</p>'
                          : '<p>Based on the available metrics, <strong>' + overallWinner + '</strong> appears to be performing better overall.</p>'
                        ) +
                        '</div>';
                      document.getElementById('overall-winner').style.display = 'block';
                    })
                    .catch(error => {
                      console.error('Error fetching comparison data:', error);
                      document.getElementById('loading-comparison').innerHTML = 'Error loading comparison data. Please try again.';
                    });
                }
                
                function formatNumberForDisplay(num) {
                  if (num === null || num === undefined) return 'N/A';
                  if (Math.abs(num) >= 1e12) return (num / 1e12).toFixed(2) + ' T';
                  if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(2) + ' B';
                  if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(2) + ' M';
                  if (Number.isInteger(num)) return num.toString();
                  return num.toFixed(2);
                }
                
                function createComparisonRow(label, value1, value2, better, id1, id2, company1Wins, company2Wins) {
                  let width1 = 0, width2 = 0;
                  
                  if (value1 !== 'N/A' && value2 !== 'N/A') {
                    // Parse the numerical values, removing formatting
                    let val1 = parseFloat(value1.toString().replace(/[^0-9.-]/g, ''));
                    let val2 = parseFloat(value2.toString().replace(/[^0-9.-]/g, ''));
                    
                    // Handle unit conversions for proper scaling
                    if (value1.toString().includes('T')) val1 *= 1000; // Convert trillions to billions for comparison
                    if (value2.toString().includes('T')) val2 *= 1000;
                    if (value1.toString().includes('M') && !value1.toString().includes('Margin')) val1 /= 1000; // Convert millions to billions (except profit margin)
                    if (value2.toString().includes('M') && !value2.toString().includes('Margin')) val2 /= 1000;
                    
                    if (!isNaN(val1) && !isNaN(val2)) {
                      const max = Math.max(Math.abs(val1), Math.abs(val2), 0.1); // Minimum threshold to avoid zero division
                      width1 = Math.abs(val1) / max * 100;
                      width2 = Math.abs(val2) / max * 100;
                    }
                  }
                  
                  let winner = '';
                  if (better) {
                    winner = better === id1 ? 
                      '<div class="winner-highlight">' + (value1 !== 'N/A' ? '✓' : '') + ' Company 1</div>' : 
                      '<div class="winner-highlight">' + (value2 !== 'N/A' ? '✓' : '') + ' Company 2</div>';
                  }
                  
                  return '<div class="metric-row">' +
                    '<div class="metric-label">' + label + '</div>' +
                    '<div class="metric-bar-container">' +
                      '<div class="metric-bar metric-bar-1" style="width: ' + width1 + '%; min-width: ' + (width1 > 0 ? '5px' : '0') + ';"></div>' +
                    '</div>' +
                    '<div class="metric-value">' + value1 + '</div>' +
                    '<div class="metric-bar-container">' +
                      '<div class="metric-bar metric-bar-2" style="width: ' + width2 + '%; min-width: ' + (width2 > 0 ? '5px' : '0') + ';"></div>' +
                    '</div>' +
                    '<div class="metric-value">' + value2 + '</div>' +
                    '<div class="metric-winner">' + winner + '</div>' +
                  '</div>';
                }
                
                function createSimpleChart(containerId, chartData, companyNames) {
                  const container = document.getElementById(containerId);
                  const labels = chartData.labels;
                  const datasets = chartData.datasets;
                  
                  let html = '<div style="display:flex; margin-bottom:10px;">' +
                    '<div style="width:150px;"></div>' +
                    '<div style="flex:1; text-align:center;"><span style="background:#4285f4;width:12px;height:12px;display:inline-block;margin-right:5px;"></span>' + companyNames[0] + '</div>' +
                    '<div style="flex:1; text-align:center;"><span style="background:#ea4335;width:12px;height:12px;display:inline-block;margin-right:5px;"></span>' + companyNames[1] + '</div>' +
                  '</div>';
                  
                  labels.forEach((label, i) => {
                    const value1 = datasets[0].data[i];
                    const value2 = datasets[1].data[i];
                    
                    // Ensure we have valid numbers
                    const numValue1 = parseFloat(value1) || 0;
                    const numValue2 = parseFloat(value2) || 0;
                    
                    // Find the maximum value for proper scaling
                    const max = Math.max(Math.abs(numValue1), Math.abs(numValue2), 1);
                    
                    // Calculate widths as percentages
                    const width1 = Math.abs(numValue1) / max * 100;
                    const width2 = Math.abs(numValue2) / max * 100;
                    
                    // Format display values appropriately
                    let displayValue1, displayValue2;
                    
                    // Special formatting for different metric types
                    if (label.includes('Market Cap') || label.includes('Revenue')) {
                      // Already in billions, show with 1 decimal
                      displayValue1 = numValue1.toFixed(1) + 'B';
                      displayValue2 = numValue2.toFixed(1) + 'B';
                    } else if (label.includes('User Count')) {
                      // Already in millions, show with 0-1 decimals
                      displayValue1 = numValue1 < 100 ? numValue1.toFixed(1) + 'M' : numValue1.toFixed(0) + 'M';
                      displayValue2 = numValue2 < 100 ? numValue2.toFixed(1) + 'M' : numValue2.toFixed(0) + 'M';
                    } else if (label.includes('Growth') || label.includes('Margin')) {
                      // Percentage values
                      displayValue1 = numValue1.toFixed(1) + '%';
                      displayValue2 = numValue2.toFixed(1) + '%';
                    } else {
                      // Default formatting for ratios, ratings, etc.
                      displayValue1 = numValue1.toFixed(1);
                      displayValue2 = numValue2.toFixed(1);
                    }
                    
                    html += '<div style="display:flex; margin-bottom:15px; align-items:center;">' +
                      '<div style="width:150px; font-weight:bold;">' + label + '</div>' +
                      '<div style="flex:1; padding:0 10px;">' +
                        '<div style="background:#4285f4; height:25px; width:' + width1 + '%; position:relative; min-width:20px;">' +
                          '<span style="position:absolute; right:5px; top:3px; color:#fff; font-size:12px; white-space:nowrap;">' + displayValue1 + '</span>' +
                        '</div>' +
                      '</div>' +
                      '<div style="flex:1; padding:0 10px;">' +
                        '<div style="background:#ea4335; height:25px; width:' + width2 + '%; position:relative; min-width:20px;">' +
                          '<span style="position:absolute; right:5px; top:3px; color:#fff; font-size:12px; white-space:nowrap;">' + displayValue2 + '</span>' +
                        '</div>' +
                      '</div>' +
                    '</div>';
                  });
                  
                  container.innerHTML = html;
                }
                                function formatValue(value) {
    if (value >= 1e12) return (value / 1e12).toFixed(2) + ' (Trillions)';
    if (value >= 1e9) return (value / 1e9).toFixed(2) + ' (Billions)';
    if (value >= 1e6) return (value / 1e6).toFixed(2) + ' (Millions)';
    if (value >= 1e3) return (value / 1e3).toFixed(2) + ' K';
    return value.toFixed(2);
  }
                  function renderPieChart(company, elementId) {
    const raw = {
    marketCap: company.financials.marketCap || 0,
    revenue: company.financials.revenue || 0,
    profitMargin: (company.financials.profitMargin || 0) * 100,
    peRatio: company.financials.peRatio || 0,
    eps: company.financials.eps || 0,

  }
  const scaled = {
    marketCap: raw.marketCap,
    revenue: raw.revenue,
    profitMargin: raw.profitMargin,
    peRatio: raw.peRatio,
    eps: raw.eps
  };
  const total = scaled.marketCap + scaled.revenue;
  
  const percentages = [
    (scaled.marketCap / total) * 100,
    (scaled.revenue / total) * 100,
    scaled.profitMargin,
    scaled.peRatio,
    scaled.eps
  ];
  
   const labels = [ 'Market Cap', 'Revenue','Profit Margin (%)','P/E Ratio (%)','EPS (%)'];
  
  const originalValues = [scaled.marketCap, scaled.revenue,scaled.profitMargin,scaled.peRatio,scaled.eps];
  new Chart(document.getElementById(elementId), {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: percentages,
        backgroundColor: ['#ff6384', '#36a2eb', '#cc65fe', '#ffce56', '#4bc0c0'],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        tooltip: { 
        enabled: true,
        callbacks: {
          label:  function(context) {
              const idx = context.dataIndex;
              return labels[idx].split("(")[0] + ":" + formatValue(originalValues[idx]);
            }
        }
         },
        legend: { position: 'bottom' }
      }
    }
  });
}
  window.addEventListener('DOMContentLoaded', () => {
  ${company1Data ? `renderPieChart(${JSON.stringify(company1Data)}, 'pie-${company1Data.id}');` : ''}
  ${company2Data ? `renderPieChart(${JSON.stringify(company2Data)}, 'pie-${company2Data.id}');` : ''}
});
              </script>
              </html>
            `;
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(htmlContent);
        } else if (pathname.startsWith('/api/health')) {
            const memoryUsage = process.memoryUsage();
            const serverInfo = {
                status: 'OK',
                uptime: process.uptime(),
                timestamp: Date.now(),
                version: '1.0.0',
                port: PORT,
                memory: {
                    rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
                    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
                    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
                },
                apis: {
                    gemini: USE_GEMINI && GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY',
                    mistral: USE_MISTRAL && MISTRAL_API_KEY !== 'YOUR_MISTRAL_API_KEY',
                    alphaVantage: ALPHA_VANTAGE_API_KEY !== 'YOUR_API_KEY_HERE'
                },
                dataSourcePriority: ['Yahoo Finance API', 'CompaniesMarketCap (Real-time)', 'Gemini AI', 'Mistral AI', 'Alpha Vantage', 'Wikipedia']
            };

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(serverInfo, null, 2));
        } else if (pathname.startsWith('/api/companies')) {
            if (pathname === '/api/companies' && req.method === 'GET') {
                const companies = Object.values(db.companies);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success', results: companies.length, data: companies }));
            } else if (req.method === 'GET') {
                const companyName = decodeURIComponent(pathname.split('/').pop());
                if (!companyName) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ status: 'fail', message: 'Company name is required.' }));
                }
                const company = await findOrCreateCompany(companyName);
                if (company) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'success', data: company }));
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'fail',
                        message: `Company '${companyName}' not found or data fetch failed.`
                    }));
                }
            }
        } else if (pathname.startsWith('/api/comparison') && query.company1 && query.company2) {
            const company1 = await findOrCreateCompany(query.company1);
            const company2 = await findOrCreateCompany(query.company2);

            if (!company1) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                    status: 'fail',
                    message: `Data for company '${query.company1}' could not be fetched.`
                }));
            }
            if (!company2) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                    status: 'fail',
                    message: `Data for company '${query.company2}' could not be fetched.`
                }));
            }

            const comparison = generateComparison(company1, company2);
            const comparisonKey = `${(company1.name || 'comp1').toLowerCase().replace(/\W/g, '')}-${(company2.name || 'comp2').toLowerCase().replace(/\W/g, '')}`;
            db.comparisons[comparisonKey] = comparison;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'success', data: comparison }));

        } else if (pathname.startsWith('/api/comparison/chart/')) {
            const chartType = pathname.split('/').pop();
            if (query.company1 && query.company2) {
                const company1 = await findOrCreateCompany(query.company1);
                const company2 = await findOrCreateCompany(query.company2);
                if (!company1 || !company2) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({
                        status: 'fail',
                        message: 'One or both companies could not be found or data fetched.'
                    }));
                }
                const comparison = generateComparison(company1, company2);
                const chartDataResult = comparison.chartData[chartType] || { error: `Unknown chart type: ${chartType}` };
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success', data: chartDataResult }));
            } else {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'fail',
                    message: 'Missing company1 or company2 parameter for chart data.'
                }));
            }
        } else if (fs.existsSync(path.join(__dirname, '..', 'public', pathname))) {
            // Serve static files from public directory
            serveStaticFile(pathname, res);
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'fail', message: 'Endpoint not found' }));
        }
    } catch (error) {
        console.error('Server error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'Internal server error', errorDetails: error.message }));
    }
});

// Keep track of all open sockets so we can forcibly close them on shutdown
const openSockets = {};

// Start server with better port handling
function startServer() {
    // Enable socket tracking for clean shutdown
    server.on('connection', socket => {
        // Set keep-alive timeout to a lower value to release sockets faster
        socket.setKeepAlive(true, 1000);

        // Add socket to tracking for proper cleanup on shutdown
        const socketId = Date.now();
        openSockets[socketId] = socket;

        socket.on('close', () => {
            delete openSockets[socketId];
        });
    });

    // Enable server to reuse address immediately
    server.on('listening', () => {
        if (server._handle) {
            try {
                // Using internal Node.js method to set SO_REUSEADDR
                server._handle.setSimultaneousAccepts(true);
            } catch (error) {
                // Ignore errors if not supported on this platform
            }
        }
    });

    // Initialize the port list with the preferred port first, followed by fallbacks
    const allPorts = [config.server.port, ...config.server.fallbackPorts];
    const uniquePorts = [...new Set(allPorts)]; // Remove duplicates

    // Try each port in sequence
    function tryPort(portIndex) {
        if (portIndex >= uniquePorts.length) {
            console.error("ERROR: All ports are in use. Cannot start the server.");
            console.error("Available ports tried: " + uniquePorts.join(", "));
            console.error("Try setting a different port with the PORT environment variable.");
            process.exit(1);
            return;
        }

        const port = uniquePorts[portIndex];

        // Remove any existing listeners to avoid memory leaks when retrying
        server.removeAllListeners('error');

        // Set up error handler before attempting to listen
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`Port ${port} is in use. Trying next port...`);
                tryPort(portIndex + 1); // Try next port in the list
            } else {
                console.error(`Error starting server: ${err.message}`);
                process.exit(1);
            }
        });

        // Try to start the server
        console.log(`Attempting to start server on port ${port}...`);
        server.listen(port, config.server.host, () => {
            PORT = port; // Update the PORT variable

            // Display startup information
            console.log("─────────────────────────────────────────────────────────────");
            console.log(`✓ Server started successfully!`);
            console.log(`✓ Local:            http://${config.server.host === '0.0.0.0' ? 'localhost' : config.server.host}:${port}/`);

            // Try to get the network IP for LAN access
            try {
                const networkInterfaces = require('os').networkInterfaces();
                const ipv4Interfaces = Object.values(networkInterfaces)
                    .flat()
                    .filter(iface => iface.family === 'IPv4' && !iface.internal);

                if (ipv4Interfaces.length > 0 && config.server.host === '0.0.0.0') {
                    console.log(`✓ On Your Network:  http://${ipv4Interfaces[0].address}:${port}/`);
                }
            } catch (e) {
                // Silently ignore any issues getting network interfaces
            }

            console.log("─────────────────────────────────────────────────────────────");

            // API key warnings
            if (ALPHA_VANTAGE_API_KEY === 'YOUR_API_KEY_HERE') {
                console.warn('⚠️  WARNING: Alpha Vantage API key is not set.');
                console.warn('⚠️  Data for new companies will be limited.');
                console.warn('⚠️  Get a free key from https://www.alphavantage.co/support/#api-key');
            }

            if (GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY') {
                console.warn('⚠️  WARNING: Gemini API key is not set.');
                console.warn('⚠️  Gemini AI (secondary data source) will be skipped.');
                console.warn('⚠️  Get a free key from https://makersuite.google.com/app/apikey');
            } else {
                console.log('✓ Gemini AI enabled (secondary data source)');
            }

            if (MISTRAL_API_KEY === 'YOUR_MISTRAL_API_KEY') {
                console.warn('⚠️  WARNING: Mistral API key is not set.');
                console.warn('⚠️  Mistral AI (tertiary data source) will be skipped.');
            } else {
                console.log('✓ Mistral AI enabled (tertiary data source)');
            }

            // Create a health check endpoint
            console.log("• Health check:     http://localhost:" + port + "/api/health");
            console.log("• API documentation: http://localhost:" + port + "/");
            console.log("─────────────────────────────────────────────────────────────");
        });
    }

    // Start with the first port
    tryPort(0);

    // Handle graceful shutdown
    process.on('SIGTERM', () => {
        console.log('SIGTERM signal received: closing HTTP server');
        closeServer();
    });

    process.on('SIGINT', () => {
        console.log('SIGINT signal received: closing HTTP server');
        closeServer();
    });

    // Helper function for graceful shutdown
    function closeServer() {
        // First close all active connections
        Object.keys(openSockets).forEach(socketId => {
            openSockets[socketId].destroy();
        });

        // Then close the server
        server.close(() => {
            console.log('HTTP server closed and all connections terminated');
            process.exit(0);
        });

        // Force exit if server hasn't closed within 3 seconds
        setTimeout(() => {
            console.log('Server shutdown timed out. Forcing exit.');
            process.exit(1);
        }, 3000);
    }
}

// Start the server
startServer();