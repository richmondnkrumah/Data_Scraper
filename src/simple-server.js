// Simple HTTP server without external dependencies
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3002;

// In-memory database simulation
const db = {
    companies: [
        {
            id: '1',
            name: 'Apple',
            description: 'Technology company that designs, develops, and sells consumer electronics, software, and online services.',
            industry: 'Technology',
            founded: 1976,
            headquarters: 'Cupertino, California, United States',
            website: 'https://www.apple.com',
            financials: {
                stockSymbol: 'AAPL',
                marketCap: 2800000000000,
                revenue: 394000000000,
                profitMargin: 0.25
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
        {
            id: '2',
            name: 'Microsoft',
            description: 'Technology company that develops, licenses, and supports software products, services, and devices.',
            industry: 'Technology',
            founded: 1975,
            headquarters: 'Redmond, Washington, United States',
            website: 'https://www.microsoft.com',
            financials: {
                stockSymbol: 'MSFT',
                marketCap: 2700000000000,
                revenue: 198000000000,
                profitMargin: 0.36
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
    ],
    comparisons: []
};

// Generate a comparison on the fly
function generateComparison(company1, company2) {
    return {
        id: `${company1.id}-${company2.id}`,
        companies: [company1.id, company2.id],
        companyNames: [company1.name, company2.name],
        financialComparison: {
            marketCap: {
                better: company1.financials.marketCap > company2.financials.marketCap ? company1.id : company2.id,
                differencePercent: Math.abs((company1.financials.marketCap - company2.financials.marketCap) / Math.max(company1.financials.marketCap, company2.financials.marketCap) * 100)
            },
            revenue: {
                better: company1.financials.revenue > company2.financials.revenue ? company1.id : company2.id,
                differencePercent: Math.abs((company1.financials.revenue - company2.financials.revenue) / Math.max(company1.financials.revenue, company2.financials.revenue) * 100)
            },
            profitMargin: {
                better: company1.financials.profitMargin > company2.financials.profitMargin ? company1.id : company2.id,
                differencePercent: Math.abs((company1.financials.profitMargin - company2.financials.profitMargin) / Math.max(company1.financials.profitMargin, company2.financials.profitMargin) * 100)
            }
        },
        chartData: {
            finances: {
                labels: ['Market Cap', 'Revenue', 'Profit Margin'],
                datasets: [
                    {
                        company: company1.name,
                        data: [company1.financials.marketCap / 1000000000, company1.financials.revenue / 1000000000, company1.financials.profitMargin * 100]
                    },
                    {
                        company: company2.name,
                        data: [company2.financials.marketCap / 1000000000, company2.financials.revenue / 1000000000, company2.financials.profitMargin * 100]
                    }
                ]
            }
        }
    };
}

// Helper function to parse URL query parameters
function parseQuery(url) {
    const queryParams = {};
    const queryString = url.split('?')[1];

    if (queryString) {
        queryString.split('&').forEach(param => {
            const [key, value] = param.split('=');
            queryParams[key] = decodeURIComponent(value);
        });
    }

    return queryParams;
}

// Simple HTTP request handler
const server = http.createServer((req, res) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Parse URL and query
    const url = req.url;
    const query = parseQuery(url);

    // API Routes
    if (url.startsWith('/api/health')) {
        // Health check
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
            status: 'OK',
            uptime: process.uptime(),
            timestamp: Date.now()
        }));
    } else if (url.startsWith('/api/companies') && !url.includes('/search/')) {
        // Get all companies
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
            status: 'success',
            results: db.companies.length,
            data: db.companies
        }));
    } else if (url.match(/\/api\/companies\/[^\/]+$/)) {
        // Get single company
        const id = url.split('/').pop();
        const company = db.companies.find(c =>
            c.id === id || c.name.toLowerCase() === id.toLowerCase()
        );

        if (company) {
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({
                status: 'success',
                data: company
            }));
        } else {
            res.writeHead(404, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({
                status: 'fail',
                message: 'Company not found'
            }));
        }
    } else if (url.startsWith('/api/comparison') && query.company1 && query.company2) {
        // Compare two companies
        const company1 = db.companies.find(c =>
            c.name.toLowerCase() === query.company1.toLowerCase()
        );
        const company2 = db.companies.find(c =>
            c.name.toLowerCase() === query.company2.toLowerCase()
        );

        if (company1 && company2) {
            const comparison = generateComparison(company1, company2);

            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({
                status: 'success',
                data: comparison
            }));
        } else {
            res.writeHead(404, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({
                status: 'fail',
                message: 'One or both companies not found'
            }));
        }
    } else if (url.startsWith('/api/comparison/chart/')) {
        // Get chart data
        const chartType = url.split('/').pop();

        if (query.company1 && query.company2) {
            const company1 = db.companies.find(c =>
                c.name.toLowerCase() === query.company1.toLowerCase()
            );
            const company2 = db.companies.find(c =>
                c.name.toLowerCase() === query.company2.toLowerCase()
            );

            if (company1 && company2) {
                let chartData = {};

                if (chartType === 'finances' || chartType === 'financial') {
                    chartData = {
                        labels: ['Market Cap', 'Revenue', 'Profit Margin'],
                        datasets: [
                            {
                                company: company1.name,
                                data: [company1.financials.marketCap / 1000000000, company1.financials.revenue / 1000000000, company1.financials.profitMargin * 100]
                            },
                            {
                                company: company2.name,
                                data: [company2.financials.marketCap / 1000000000, company2.financials.revenue / 1000000000, company2.financials.profitMargin * 100]
                            }
                        ]
                    };
                } else if (chartType === 'usermetrics') {
                    chartData = {
                        labels: ['User Count', 'User Growth', 'Rating'],
                        datasets: [
                            {
                                company: company1.name,
                                data: [company1.customerMetrics.userCount / 1000000, company1.customerMetrics.userGrowth * 100, company1.customerMetrics.rating]
                            },
                            {
                                company: company2.name,
                                data: [company2.customerMetrics.userCount / 1000000, company2.customerMetrics.userGrowth * 100, company2.customerMetrics.rating]
                            }
                        ]
                    };
                }

                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({
                    status: 'success',
                    data: chartData
                }));
            } else {
                res.writeHead(404, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({
                    status: 'fail',
                    message: 'One or both companies not found'
                }));
            }
        } else {
            res.writeHead(400, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({
                status: 'fail',
                message: 'Missing company1 or company2 parameter'
            }));
        }
    } else {
        // Serve README as homepage
        if (url === '/' || url === '/index.html') {
            fs.readFile(path.join(__dirname, '..', 'README.md'), 'utf8', (err, data) => {
                if (err) {
                    res.writeHead(500, {'Content-Type': 'text/plain'});
                    res.end('Internal Server Error');
                    return;
                }

                const htmlContent = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Competitor Analysis API</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
              pre { background: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }
              code { font-family: Consolas, Monaco, "Andale Mono", monospace; }
              h1, h2, h3 { margin-top: 20px; }
              h1 { border-bottom: 2px solid #eee; padding-bottom: 10px; }
              h2 { border-bottom: 1px solid #eee; padding-bottom: 5px; }
            </style>
          </head>
          <body>
            <h1>Competitor Analysis API</h1>
            <p>API is running successfully! Here's the documentation:</p>
            <pre>${data}</pre>
          </body>
          </html>
        `;

                res.writeHead(200, {'Content-Type': 'text/html'});
                res.end(htmlContent);
            });
        } else {
            // Not found
            res.writeHead(404, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({
                status: 'fail',
                message: 'Endpoint not found'
            }));
        }
    }
});

server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}/`);
});