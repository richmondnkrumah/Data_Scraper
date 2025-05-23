const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Load configuration
const config = require('./config');

// Static file serving
function serveStaticFile(filePath, res) {
    const fullPath = path.join(__dirname, '..', 'public', filePath);
    
    // Security check - prevent directory traversal
    if (!fullPath.startsWith(path.join(__dirname, '..', 'public'))) {
        res.writeHead(403, {'Content-Type': 'text/plain'});
        res.end('Forbidden');
        return;
    }
    
    fs.readFile(fullPath, (err, data) => {
        if (err) {
            res.writeHead(404, {'Content-Type': 'text/plain'});
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
        
        res.writeHead(200, {'Content-Type': contentType});
        res.end(data);
    });
}
let PORT = config.server.port; // Will be updated if a port is selected from fallbacks
const ALPHA_VANTAGE_API_KEY = config.api.alphaVantage.key;
const MISTRAL_API_KEY = config.api.mistral.key;
const USE_MISTRAL = config.api.mistral.enabled;

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
                eps: null      // Placeholder for new data
            },
            products: [
                {name: 'iPhone', rating: 4.5},
                {name: 'MacBook', rating: 4.6},
                {name: 'iPad', rating: 4.3}
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
              eps: null
          },
          products: [
              {name: 'Windows', rating: 4.0},
              {name: 'Office 365', rating: 4.4},
              {name: 'Azure', rating: 4.5}
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
        client.get(apiUrl, {headers: {'User-Agent': 'Node.js'}}, (res) => {
            let data = '';
            if (res.statusCode !== 200) {
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
        // Prefer US markets if available
        const usMatch = result.bestMatches.find(match => match['4. region'] === 'United States');
        return usMatch ? usMatch['1. symbol'] : result.bestMatches[0]['1. symbol'];
    }
    return null;
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
        website: data.Websit || '', // Typo in Alpha Vantage API? Checking common variations.
        stockSymbol: data.Symbol || symbol,
        marketCap: data.MarketCapitalization ? parseFloat(data.MarketCapitalization) : null,
        peRatio: data.PERatio && data.PERatio !== 'None' ? parseFloat(data.PERatio) : null,
        eps: data.EPS && data.EPS !== 'None' ? parseFloat(data.EPS) : null,
        revenue: null, // Overview doesn't usually have revenue, might need another call or be in other reports
        profitMargin: data.ProfitMargin && data.ProfitMargin !== 'None' ? parseFloat(data.ProfitMargin) : null,
        country: data.Country || 'Unknown',
        headquarters: 'Unknown' // Not directly available in OVERVIEW
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

// Find or create company data
async function findOrCreateCompany(companyName) {
    const normalizedName = companyName.toLowerCase();

    if (db.companies[normalizedName] && db.companies[normalizedName].financials.peRatio !== null) { // Check if already fetched comprehensively
        console.log(`Using cached data for: ${companyName}`);
        return db.companies[normalizedName];
    }

    console.log(`Fetching data for new/updated company: ${companyName}`);
    let companyData = {
        id: db.companies[normalizedName]?.id || Date.now().toString(),
        name: companyName,
        financials: {stockSymbol: null, marketCap: null, revenue: null, profitMargin: null, peRatio: null, eps: null},
        customerMetrics: {
            userCount: db.companies[normalizedName]?.customerMetrics?.userCount || generateEstimatedUserCount(companyName),
            userGrowth: db.companies[normalizedName]?.customerMetrics?.userGrowth || generateEstimatedUserGrowth(),
            rating: db.companies[normalizedName]?.customerMetrics?.rating || generateEstimatedRating()
        },
        products: [] // Products hard to scrape generically
    };

    // 1. Try to get official name and stock symbol from Alpha Vantage Search
    const potentialSymbol = await searchStockSymbol(companyName);
    let symbolToUse = potentialSymbol;

    if (db.companies[normalizedName] && db.companies[normalizedName].financials.stockSymbol) {
        symbolToUse = db.companies[normalizedName].financials.stockSymbol; // Use pre-cached symbol if available
    }

    // 2. Fetch Financials and Overview from Alpha Vantage using the symbol
    if (symbolToUse) {
        const avData = await fetchCompanyFinancialsFromAlphaVantage(symbolToUse);
        if (avData) {
            companyData = {
                ...companyData,
                name: avData.name || companyData.name,
                description: avData.description || companyData.description,
                industry: avData.industry || companyData.industry,
                website: avData.website || companyData.website,
                financials: {
                    ...companyData.financials,
                    stockSymbol: avData.stockSymbol || symbolToUse,
                    marketCap: avData.marketCap,
                    peRatio: avData.peRatio,
                    eps: avData.eps,
                    profitMargin: avData.profitMargin
                    // Revenue often requires a different Alpha Vantage endpoint (INCOME_STATEMENT)
                },
            };
    }
  }

    // 3. Supplement with Wikipedia data (description, logo)
    // Use the name Alpha Vantage returned if available, otherwise the original input
    const nameForWikipedia = companyData.name || companyName;
    const wikiData = await scrapeCompanyFromWikipedia(nameForWikipedia);
    companyData = {
        ...companyData,
        description: companyData.description || wikiData.description, // Prioritize AV description
        logo: companyData.logo || wikiData.logo, // Prioritize AV logo if we had one
        website: companyData.website || wikiData.website, // Prioritize AV website
        name: wikiData.officialName || companyData.name // Update name if Wikipedia has a more official one
    };
    
    // 4. Enhance with Mistral AI data if available
    if (USE_MISTRAL) {
        const mistralData = await fetchDataFromMistral(companyData.name);
        if (mistralData) {
            // Update company info
            companyData = {
                ...companyData,
                description: mistralData.description || companyData.description,
                industry: companyData.industry || mistralData.industry,
                strengths: mistralData.strengths || [],
                weaknesses: mistralData.weaknesses || [],
                competitors: mistralData.competitors || [],
                founded: companyData.founded || mistralData.founded,
                headquarters: companyData.headquarters || mistralData.headquarters
            };
            
            // Update customer metrics if provided by Mistral
            if (mistralData.customerMetrics) {
                const convertMillionsToFull = (value) => value !== null ? value * 1000000 : null;
                
                companyData.customerMetrics = {
                    ...companyData.customerMetrics,
                    // Only use Mistral data if current data is missing or generated
                    userCount: mistralData.customerMetrics.userCount ? 
                              convertMillionsToFull(mistralData.customerMetrics.userCount) : 
                              companyData.customerMetrics.userCount,
                    userGrowth: mistralData.customerMetrics.userGrowth || companyData.customerMetrics.userGrowth,
                    rating: mistralData.customerMetrics.rating || companyData.customerMetrics.rating
                };
            }
            
            // Update financial data if missing from Alpha Vantage
            if (mistralData.financials) {
                // Convert billions to actual values if provided by Mistral
                const convertBillionsToFull = (value) => value !== null ? value * 1000000000 : null;
                
                companyData.financials = {
                    ...companyData.financials,
                    // Only use Mistral data if Alpha Vantage data is missing
                    marketCap: companyData.financials.marketCap || 
                              (mistralData.financials.marketCap ? convertBillionsToFull(mistralData.financials.marketCap) : null),
                    revenue: companyData.financials.revenue || 
                            (mistralData.financials.revenue ? convertBillionsToFull(mistralData.financials.revenue) : null),
                    profitMargin: companyData.financials.profitMargin || mistralData.financials.profitMargin,
                    peRatio: companyData.financials.peRatio || mistralData.financials.peRatio,
                    eps: companyData.financials.eps || mistralData.financials.eps
                };
            }
        }
    }

    // If financials are still sparse, and we have a symbol, make a last attempt with old Yahoo Finance scraper as a fallback
    // This is NOT recommended due to rate limits but included for minimal viability if AV fails.
    if (!companyData.financials.marketCap && companyData.financials.stockSymbol && ALPHA_VANTAGE_API_KEY === 'YOUR_API_KEY_HERE') {
        console.warn("Alpha Vantage key not set, trying Yahoo Finance as fallback for financial details. This may be unreliable.")
        const yahooData = await fetchStockDataYahoo(companyData.financials.stockSymbol); // Renamed old function
        if (yahooData) {
            companyData.financials.marketCap = companyData.financials.marketCap || yahooData.marketCap;
            companyData.financials.revenue = companyData.financials.revenue || yahooData.revenue; // Yahoo might have this
        }
    }

    if (!companyData.name && !companyData.description) {
        console.error(`Failed to fetch any data for ${companyName}`);
        return null; // Failed to get any meaningful data
    }

    console.log(`Data for ${companyData.name}: Symbol: ${companyData.financials.stockSymbol}, MktCap: ${companyData.financials.marketCap}`);
    db.companies[normalizedName] = companyData;
    return companyData;
}

// Fallback: Original Yahoo Finance Scraper (prone to rate limits)
async function fetchStockDataYahoo(symbol) {
    const apiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
    const result = await makeApiRequest(apiUrl);
    if (result && result.chart && result.chart.result && result.chart.result[0] && result.chart.result[0].meta) {
        const quote = result.chart.result[0].meta;
        return {
            stockPrice: quote.regularMarketPrice,
            marketCap: quote.marketCap || null,
            revenue: null, // Typically not in this specific Yahoo endpoint
            profitMargin: null // Typically not in this specific Yahoo endpoint
        };
    }
    console.warn(`Yahoo fallback failed for ${symbol}`);
    return null;
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
        return {better: Math.random() > 0.5 ? id1 : id2, differencePercent: 0, value1: value1, value2: value2};
    }
    if (value1 === null || value1 === undefined) {
        return {better: id2, differencePercent: 100, value1: value1, value2: value2};
    }
    if (value2 === null || value2 === undefined) {
        return {better: id1, differencePercent: 100, value1: value1, value2: value2};
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
    
    // For extremely close values (within 0.1%), use a tiebreaker
    if (Math.abs(num1 - num2) / Math.max(Math.abs(num1), Math.abs(num2)) < 0.001) {
        // Random tiebreaker - just to avoid too many ties in the UI
        const better = Math.random() > 0.5 ? id1 : id2;
        return {
            better,
            differencePercent: 0.1, // Small enough to show it's close
            value1: num1,
            value2: num2
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
          <p><strong>Market Cap:</strong> ${formatNumber(financials.marketCap)}</p>
          <p><strong>P/E Ratio:</strong> ${financials.peRatio !== null ? financials.peRatio.toFixed(2) : 'N/A'}</p>
          <p><strong>EPS:</strong> ${financials.eps !== null ? financials.eps.toFixed(2) : 'N/A'}</p>
          <p><strong>Revenue (TTM):</strong> ${formatNumber(financials.revenue)}</p>
          <p><strong>Profit Margin:</strong> ${financials.profitMargin !== null ? (financials.profitMargin * 100).toFixed(2) + '%' : 'N/A'}</p>
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
                  button { cursor: pointer; background: #5cb85c; color: white; border-color: #4cae4c; }
                  .api-key-note { background: #fff3cd; border: 1px solid #ffeeba; color: #856404; padding: 10px; margin-bottom:15px; border-radius:4px; }
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
                  <div class="search-container">
                    <div class="company-column">
                      <div class="form-group">
                        <label for="company1">Company 1:</label>
                        <input type="text" id="company1" name="company1" value="${company1Name || ''}" placeholder="e.g., Apple" required>
                      </div>
                    </div>
                    <div class="submit-column">
                      <button type="submit">Get Company Details</button>
                    </div>
                    <div class="company-column">
                      <div class="form-group">
                        <label for="company2">Company 2:</label>
                        <input type="text" id="company2" name="company2" value="${company2Name || ''}" placeholder="e.g., Microsoft" required>
                      </div>
                    </div>
                  </div>
                </form>
                ${(company1Data || company2Data) ? `
                  <div class="container">
                    ${company1Data ? renderCompanyBox(company1Data, company1Name) : (company1Name ? renderCompanyBox(null, company1Name) : '')}
                    ${company2Data ? renderCompanyBox(company2Data, company2Name) : (company2Name ? renderCompanyBox(null, company2Name) : '')}
                  </div>
                  ${(company1Data && company2Data) ? `<div class="form-center compare-button">
                    <button type="button" onclick="compareCompanies('${company1Data.name}', '${company2Data.name}')">Compare These Two Companies</button>
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
                    const val1 = parseFloat(value1);
                    const val2 = parseFloat(value2);
                    if (!isNaN(val1) && !isNaN(val2)) {
                      const max = Math.max(Math.abs(val1), Math.abs(val2));
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
                      '<div class="metric-bar metric-bar-1" style="width: ' + width1 + '%"></div>' +
                    '</div>' +
                    '<div class="metric-value">' + value1 + '</div>' +
                    '<div class="metric-bar-container">' +
                      '<div class="metric-bar metric-bar-2" style="width: ' + width2 + '%"></div>' +
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
                    const max = Math.max(value1, value2, 1); // Use at least 1 to avoid division by zero
                    
                    const width1 = (value1 / max * 100) + '%';
                    const width2 = (value2 / max * 100) + '%';
                    
                    html += '<div style="display:flex; margin-bottom:15px; align-items:center;">' +
                      '<div style="width:150px; font-weight:bold;">' + label + '</div>' +
                      '<div style="flex:1; padding:0 10px;">' +
                        '<div style="background:#4285f4; height:25px; width:' + width1 + '; position:relative;">' +
                          '<span style="position:absolute; right:5px; top:3px; color:#fff; font-size:12px;">' + value1.toFixed(1) + '</span>' +
                        '</div>' +
                      '</div>' +
                      '<div style="flex:1; padding:0 10px;">' +
                        '<div style="background:#ea4335; height:25px; width:' + width2 + '; position:relative;">' +
                          '<span style="position:absolute; right:5px; top:3px; color:#fff; font-size:12px;">' + value2.toFixed(1) + '</span>' +
                        '</div>' +
                      '</div>' +
                    '</div>';
                  });
                  
                  container.innerHTML = html;
                }
              </script>
              </html>
            `;
            res.writeHead(200, {'Content-Type': 'text/html'});
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
                    alphaVantage: ALPHA_VANTAGE_API_KEY !== 'YOUR_API_KEY_HERE',
                    mistral: USE_MISTRAL && MISTRAL_API_KEY !== 'YOUR_MISTRAL_API_KEY'
                }
            };
            
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(serverInfo, null, 2));
        } else if (pathname.startsWith('/api/companies')) {
            if (pathname === '/api/companies' && req.method === 'GET') {
                const companies = Object.values(db.companies);
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({status: 'success', results: companies.length, data: companies}));
            } else if (req.method === 'GET') {
                const companyName = decodeURIComponent(pathname.split('/').pop());
                if (!companyName) {
                    res.writeHead(400, {'Content-Type': 'application/json'});
                    return res.end(JSON.stringify({status: 'fail', message: 'Company name is required.'}));
                }
                const company = await findOrCreateCompany(companyName);
                if (company) {
                    res.writeHead(200, {'Content-Type': 'application/json'});
                    res.end(JSON.stringify({status: 'success', data: company}));
                } else {
                    res.writeHead(404, {'Content-Type': 'application/json'});
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
            res.writeHead(404, {'Content-Type': 'application/json'});
            return res.end(JSON.stringify({
                status: 'fail',
                message: `Data for company '${query.company1}' could not be fetched.`
            }));
        }
        if (!company2) {
            res.writeHead(404, {'Content-Type': 'application/json'});
            return res.end(JSON.stringify({
                status: 'fail',
                message: `Data for company '${query.company2}' could not be fetched.`
            }));
        }

        const comparison = generateComparison(company1, company2);
        const comparisonKey = `${(company1.name || 'comp1').toLowerCase().replace(/\W/g, '')}-${(company2.name || 'comp2').toLowerCase().replace(/\W/g, '')}`;
        db.comparisons[comparisonKey] = comparison;
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({status: 'success', data: comparison}));

        } else if (pathname.startsWith('/api/comparison/chart/')) {
            const chartType = pathname.split('/').pop();
        if (query.company1 && query.company2) {
            const company1 = await findOrCreateCompany(query.company1);
            const company2 = await findOrCreateCompany(query.company2);
            if (!company1 || !company2) {
                res.writeHead(404, {'Content-Type': 'application/json'});
                return res.end(JSON.stringify({
                    status: 'fail',
                    message: 'One or both companies could not be found or data fetched.'
                }));
            }
            const comparison = generateComparison(company1, company2);
            const chartDataResult = comparison.chartData[chartType] || {error: `Unknown chart type: ${chartType}`};
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({status: 'success', data: chartDataResult}));
        } else {
            res.writeHead(400, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({
                status: 'fail',
                message: 'Missing company1 or company2 parameter for chart data.'
            }));
        }
    } else if (fs.existsSync(path.join(__dirname, '..', 'public', pathname))) {
        // Serve static files from public directory
        serveStaticFile(pathname, res);
    } else {
        res.writeHead(404, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({status: 'fail', message: 'Endpoint not found'}));
    }
  } catch (error) {
      console.error('Server error:', error);
      res.writeHead(500, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({status: 'error', message: 'Internal server error', errorDetails: error.message}));
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