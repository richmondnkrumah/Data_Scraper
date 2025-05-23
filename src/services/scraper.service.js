const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Main function to scrape company data from multiple sources
 */
exports.scrapeCompany = async (companyName) => {
    try {
        logger.info(`Starting scraping for company: ${companyName}`);

        // Basic structure for company data
        const companyData = {
            name: companyName,
            website: '',
            logo: '',
            description: '',
            industry: '',
            founded: null,
            headquarters: '',
            size: '',
            financials: {
                stockSymbol: '',
                marketCap: null,
                revenue: null,
                revenueGrowth: null,
                profitMargin: null
            },
            products: [],
            socialMedia: {},
            customerMetrics: {
                userCount: null,
                userGrowth: null,
                rating: null
            },
            lastUpdated: new Date()
        };

        // Try to enrich data from multiple sources
        try {
            await Promise.all([
                enrichFromWikipedia(companyData, companyName),
                enrichFromCrunchbase(companyData, companyName),
                enrichFromCompanyWebsite(companyData, companyName),
                enrichFromSocialMedia(companyData, companyName),
                findStockSymbol(companyData, companyName)
            ]);
        } catch (error) {
            logger.warn(`Some enrichment processes failed: ${error.message}`);
            // Continue anyway, we'll use what we managed to collect
        }

        logger.info(`Completed scraping for company: ${companyName}`);
        return companyData;
    } catch (error) {
        logger.error(`Error scraping company ${companyName}: ${error.message}`);
        return null;
    }
};

/**
 * Enrich company data from Wikipedia
 */
async function enrichFromWikipedia(companyData, companyName) {
    try {
        // Search Wikipedia for the company
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(companyName)}&limit=1&format=json`;
        const searchResponse = await axios.get(searchUrl);

        if (searchResponse.data[1].length === 0) {
            logger.warn(`No Wikipedia results found for ${companyName}`);
            return;
        }

        const articleTitle = searchResponse.data[1][0];
        const articleUrl = searchResponse.data[3][0];

        // Get article content
        const contentUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&titles=${encodeURIComponent(articleTitle)}&format=json`;
        const contentResponse = await axios.get(contentUrl);

        const pages = contentResponse.data.query.pages;
        const pageId = Object.keys(pages)[0];

        if (pageId === '-1') {
            logger.warn(`No Wikipedia content found for ${companyName}`);
            return;
        }

        const extract = pages[pageId].extract;

        // Update company data with Wikipedia info
        companyData.description = extract.split('\n')[0]; // First paragraph

        // Get infobox data for additional details
        const htmlUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(articleTitle)}&prop=text&format=json`;
        const htmlResponse = await axios.get(htmlUrl);

        if (htmlResponse.data.parse && htmlResponse.data.parse.text) {
            const $ = cheerio.load(htmlResponse.data.parse.text['*']);
            const infobox = $('.infobox.vcard');

            // Extract data from infobox
            infobox.find('tr').each((i, element) => {
                const header = $(element).find('th').text().trim().toLowerCase();
                const value = $(element).find('td').text().trim();

                if (header.includes('found') && !companyData.founded) {
                    const foundedMatch = value.match(/\b\d{4}\b/);
                    if (foundedMatch) {
                        companyData.founded = parseInt(foundedMatch[0]);
                    }
                }

                if (header.includes('industry') && !companyData.industry) {
                    companyData.industry = value;
                }

                if (header.includes('headquarters') && !companyData.headquarters) {
                    companyData.headquarters = value;
                }

                if (header.includes('revenue') && !companyData.financials.revenue) {
                    const revenueMatch = value.match(/\$[\d.]+\s+billion|\$[\d.]+\s+million/i);
                    if (revenueMatch) {
                        let revenue = parseFloat(revenueMatch[0].replace(/[^0-9.]/g, ''));
                        if (revenueMatch[0].toLowerCase().includes('billion')) {
                            revenue *= 1000000000;
                        } else if (revenueMatch[0].toLowerCase().includes('million')) {
                            revenue *= 1000000;
                        }
                        companyData.financials.revenue = revenue;
                    }
                }

                if (header.includes('employees') && !companyData.size) {
                    companyData.size = value;
                }
            });

            // Try to get logo
            const logoSrc = infobox.find('img').first().attr('src');
            if (logoSrc && !companyData.logo) {
                companyData.logo = logoSrc.startsWith('//') ? `https:${logoSrc}` : logoSrc;
            }
        }

    } catch (error) {
        logger.warn(`Error enriching from Wikipedia for ${companyName}: ${error.message}`);
    }
}

/**
 * Enrich company data from Crunchbase-like data
 * Note: This is a simplified version that would need to be replaced with actual API
 */
async function enrichFromCrunchbase(companyData, companyName) {
    try {
        // In a real implementation, this would use Crunchbase API
        // This is a placeholder that would be replaced with actual API implementation
        logger.info(`Would be fetching Crunchbase data for ${companyName} using their API`);

        // Simulate finding some data
        // In real implementation, this data would come from the API
        if (companyName.toLowerCase().includes('apple')) {
            companyData.financials.stockSymbol = 'AAPL';
            companyData.customerMetrics.userCount = 1500000000; // 1.5B active devices
        } else if (companyName.toLowerCase().includes('microsoft')) {
            companyData.financials.stockSymbol = 'MSFT';
            companyData.customerMetrics.userCount = 1400000000; // Windows users
        } else if (companyName.toLowerCase().includes('google') || companyName.toLowerCase().includes('alphabet')) {
            companyData.financials.stockSymbol = 'GOOGL';
            companyData.customerMetrics.userCount = 2000000000; // Android users
        }

    } catch (error) {
        logger.warn(`Error enriching from Crunchbase for ${companyName}: ${error.message}`);
    }
}

/**
 * Enrich company data from the company's own website
 */
async function enrichFromCompanyWebsite(companyData, companyName) {
    try {
        // First find the company website if not already known
        if (!companyData.website) {
            // Use Google search to find the website
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(companyName + ' official website')}`;

            const browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            const page = await browser.newPage();
            await page.goto(searchUrl, {waitUntil: 'networkidle2'});

            // Extract first search result
            const websiteUrl = await page.evaluate(() => {
                const firstResult = document.querySelector('.yuRUbf > a');
                return firstResult ? firstResult.href : null;
            });

            if (websiteUrl) {
                companyData.website = websiteUrl;

                // Now visit the website to collect more info
                await page.goto(websiteUrl, {waitUntil: 'networkidle2'});

                // Extract basic info from meta tags
                companyData.description = await page.evaluate(() => {
                    const metaDescription = document.querySelector('meta[name="description"]');
                    return metaDescription ? metaDescription.content : '';
                }) || companyData.description;

                // Try to find products
                const products = await page.evaluate(() => {
                    const possibleProductSections = Array.from(document.querySelectorAll('section, div')).filter(el => {
                        const text = el.textContent.toLowerCase();
                        return (text.includes('product') || text.includes('solution')) &&
                            !text.includes('privacy') &&
                            el.querySelectorAll('a, h3, h2').length > 2;
                    });

                    if (possibleProductSections.length === 0) return [];

                    const productSection = possibleProductSections[0];
                    return Array.from(productSection.querySelectorAll('a, h3, h2')).slice(0, 5).map(el => ({
                        name: el.textContent.trim(),
                        description: '',
                        category: ''
                    }));
                });

                if (products && products.length > 0) {
                    companyData.products = products;
                }

                // Find social media links
                const socialMedia = await page.evaluate(() => {
                    const links = Array.from(document.querySelectorAll('a[href]'));
                    const social = {};

                    links.forEach(link => {
                        const href = link.href.toLowerCase();
                        if (href.includes('twitter.com') || href.includes('x.com')) {
                            social.twitter = link.href;
                        } else if (href.includes('linkedin.com')) {
                            social.linkedin = link.href;
                        } else if (href.includes('facebook.com')) {
                            social.facebook = link.href;
                        } else if (href.includes('instagram.com')) {
                            social.instagram = link.href;
                        }
                    });

                    return social;
                });

                if (Object.keys(socialMedia).length > 0) {
                    companyData.socialMedia = socialMedia;
                }
            }

            await browser.close();
        }

    } catch (error) {
        logger.warn(`Error enriching from company website for ${companyName}: ${error.message}`);
    }
}

/**
 * Enrich with data from social media
 */
async function enrichFromSocialMedia(companyData, companyName) {
    try {
        // In a real implementation, this would use social media APIs
        // This is a placeholder for demonstration
        logger.info(`Would be fetching social media metrics for ${companyName}`);

        // In a real implementation, you would use Twitter/X API, LinkedIn API, etc.

    } catch (error) {
        logger.warn(`Error enriching from social media for ${companyName}: ${error.message}`);
    }
}

/**
 * Try to find stock symbol
 */
async function findStockSymbol(companyData, companyName) {
    try {
        if (companyData.financials.stockSymbol) return; // Already have it

        // This would use a financial API in a real implementation
        // For now, we'll use a simple lookup for demonstration
        const stockSymbolMap = {
            'apple': 'AAPL',
            'microsoft': 'MSFT',
            'google': 'GOOGL',
            'alphabet': 'GOOGL',
            'amazon': 'AMZN',
            'facebook': 'META',
            'meta': 'META',
            'tesla': 'TSLA',
            'netflix': 'NFLX',
            'walmart': 'WMT',
            'disney': 'DIS'
        };

        for (const [company, symbol] of Object.entries(stockSymbolMap)) {
            if (companyName.toLowerCase().includes(company)) {
                companyData.financials.stockSymbol = symbol;
                break;
            }
        }

    } catch (error) {
        logger.warn(`Error finding stock symbol for ${companyName}: ${error.message}`);
    }
}