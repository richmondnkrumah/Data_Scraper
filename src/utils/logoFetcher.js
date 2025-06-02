const http = require('http');
const https = require('https');
const config = require('../config');

// Enhanced Logo Fetching - Hybrid Strategy
async function fetchCompanyLogo(companyName, website = null) {
    console.log(`🔍 Fetching logo for ${companyName} using hybrid strategy...`);
    
    // Strategy 1: Try Clearbit Logo API
    const clearbitLogo = await fetchLogoFromClearbit(companyName, website);
    if (clearbitLogo) {
        console.log(`✓ Logo found via Clearbit for ${companyName}`);
        return { logo: clearbitLogo, logoSource: 'Clearbit API' };
    }
    
    // Strategy 2: Try favicon scraping from company website
    if (website) {
        const faviconLogo = await fetchFaviconFromWebsite(website);
        if (faviconLogo) {
            console.log(`✓ Logo found via favicon scraping for ${companyName}`);
            return { logo: faviconLogo, logoSource: 'Favicon Scraping' };
        }
    }
    
    // Strategy 3: Try Google Custom Search API for logo images
    const googleLogo = await fetchLogoFromGoogleImages(companyName);
    if (googleLogo) {
        console.log(`✓ Logo found via Google Images for ${companyName}`);
        return { logo: googleLogo, logoSource: 'Google Images API' };
    }
    
    console.log(`✗ No logo found for ${companyName} using hybrid strategy`);
    return { logo: null, logoSource: 'Not Found' };
}

// Strategy 1: Clearbit Logo API
async function fetchLogoFromClearbit(companyName, website = null) {
    try {
        // Try with company website domain if available
        if (website) {
            const domain = extractDomainFromUrl(website);
            if (domain) {
                const logoUrl = `https://logo.clearbit.com/${domain}`;
                const isValid = await validateImageUrl(logoUrl);
                if (isValid) {
                    return logoUrl;
                }
            }
        }
        
        // Try with company name converted to potential domain
        const potentialDomains = generatePotentialDomains(companyName);
        for (const domain of potentialDomains) {
            const logoUrl = `https://logo.clearbit.com/${domain}`;
            const isValid = await validateImageUrl(logoUrl);
            if (isValid) {
                return logoUrl;
            }
        }
        
        return null;
    } catch (error) {
        console.warn(`Clearbit logo fetch failed for ${companyName}: ${error.message}`);
        return null;
    }
}

// Strategy 2: Favicon scraping from company website
async function fetchFaviconFromWebsite(website) {
    try {
        if (!website) return null;
        
        const domain = extractDomainFromUrl(website);
        if (!domain) return null;
        
        // Try common favicon locations
        const faviconUrls = [
            `https://${domain}/favicon.ico`,
            `https://${domain}/favicon.png`,
            `https://${domain}/apple-touch-icon.png`,
            `https://${domain}/android-chrome-192x192.png`,
            `https://${domain}/apple-touch-icon-152x152.png`
        ];
        
        for (const faviconUrl of faviconUrls) {
            const isValid = await validateImageUrl(faviconUrl);
            if (isValid) {
                // Check if favicon is reasonable size (not tiny default favicons)
                const imageInfo = await getImageInfo(faviconUrl);
                if (imageInfo && imageInfo.width >= 32 && imageInfo.height >= 32) {
                    return faviconUrl;
                }
            }
        }
        
        // Try scraping favicon from HTML meta tags
        const scrapedFavicon = await scrapeFaviconFromHtml(website);
        if (scrapedFavicon) {
            return scrapedFavicon;
        }
        
        return null;
    } catch (error) {
        console.warn(`Favicon fetch failed for ${website}: ${error.message}`);
        return null;
    }
}

// Strategy 3: Google Custom Search API for logo images
async function fetchLogoFromGoogleImages(companyName) {
    try {
        const GOOGLE_API_KEY = config.api?.google?.key;
        const GOOGLE_CX = config.api?.google?.cx;

        if (!GOOGLE_API_KEY || GOOGLE_API_KEY === 'YOUR_GOOGLE_API_KEY') {
            console.log('Google Custom Search API key not configured, skipping Google Images logo search');
            return null;
        }
        if (!GOOGLE_CX || GOOGLE_CX === 'YOUR_GOOGLE_CX') {
            console.log('Google Custom Search CX not configured, skipping Google Images logo search');
            return null;
        }

        const searchQuery = encodeURIComponent(`${companyName} logo official transparent`);
        const apiUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&searchType=image&q=${searchQuery}&num=8&imgSize=medium&imgType=photo&safe=active`;
        const result = await makeApiRequest(apiUrl);

        if (result && result.items && result.items.length > 0) {
            for (const item of result.items) {
                const imageUrl = item.link;
                // Only accept images with "logo" in path and with certain file extensions
                if (
                    /logo/i.test(imageUrl) &&
                    /\.(svg|png|jpg|jpeg|webp)$/i.test(imageUrl) &&
                    isValidLogoUrl(imageUrl, companyName)
                ) {
                    const isValid = await validateImageUrl(imageUrl);
                    if (isValid) {
                        const imageInfo = await getImageInfo(imageUrl);
                        if (imageInfo && imageInfo.width >= 90 && imageInfo.height >= 30) {
                            return imageUrl;
                        }
                    }
                }
            }
        }
        return null;
    } catch (error) {
        console.warn(`Google Images logo fetch failed for ${companyName}: ${error.message}`);
        return null;
    }
}

// Helper function to make API requests
async function makeApiRequest(apiUrl) {
    return new Promise((resolve) => {
        const client = apiUrl.startsWith('https') ? https : http;
        client.get(apiUrl, {headers: {'User-Agent': 'Node.js'}}, (res) => {
            let data = '';
            if (res.statusCode !== 200) {
                console.error(`API request failed with status: ${res.statusCode} for ${apiUrl}`);
                res.resume();
                resolve(null);
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
                    resolve(null);
                }
            });
        }).on('error', (err) => {
            console.error(`Error making API request to ${apiUrl}:`, err.message);
            resolve(null);
        });
    });
}

// Helper function to make HTML requests
async function makeHtmlRequest(apiUrl, redirectCount = 0) {
    const MAX_REDIRECTS = 5;
    if (redirectCount > MAX_REDIRECTS) {
        console.error(`Exceeded maximum redirects (${MAX_REDIRECTS}) for ${apiUrl}`);
        return null;
    }

    return new Promise((resolve) => {
        const client = apiUrl.startsWith('https') ? https : http;
        client.get(apiUrl, {headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}}, (res) => {
            let data = '';
            // Handle redirects for 301 and 302
            if (res.statusCode === 301 || res.statusCode === 302) {
                if (res.headers.location) {
                    console.log(`Redirecting from ${apiUrl} to ${res.headers.location} (Status: ${res.statusCode})`);
                    const newUrl = new URL(res.headers.location, apiUrl).toString();
                    makeHtmlRequest(newUrl, redirectCount + 1).then(resolve);
                } else {
                    console.error(`Redirect status ${res.statusCode} but no Location header for ${apiUrl}`);
                    resolve(null);
                }
                return;
            }

            if (res.statusCode !== 200) {
                console.error(`HTML request failed with status: ${res.statusCode} for ${apiUrl}`);
                res.resume();
                resolve(null);
                return;
            }
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve(data);
            });
        }).on('error', (err) => {
            console.error(`Error making HTML request to ${apiUrl}:`, err.message);
            resolve(null);
        });
    });
}

// Helper function to extract domain from URL
function extractDomainFromUrl(url) {
    try {
        if (!url) return null;
        
        // Add protocol if missing
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\./, ''); // Remove www prefix
    } catch (error) {
        return null;
    }
}

// Helper function to generate potential domains from company name
function generatePotentialDomains(companyName) {
    const cleanName = companyName
        .toLowerCase()
        .replace(/\s+inc\.?$|corporation\.?$|corp\.?$|ltd\.?$|llc\.?$|company$|co\.?$/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim();
    
    const domains = [];
    
    // Try exact match
    domains.push(cleanName.replace(/\s+/g, '') + '.com');
    
    // Try with common variations
    if (cleanName.includes(' ')) {
        domains.push(cleanName.replace(/\s+/g, '-') + '.com');
        domains.push(cleanName.replace(/\s+/g, '_') + '.com');
        domains.push(cleanName.split(' ')[0] + '.com'); // First word only
    }
    
    // Try other common TLDs
    const baseName = cleanName.replace(/\s+/g, '');
    domains.push(baseName + '.net');
    domains.push(baseName + '.org');
    
    return [...new Set(domains)]; // Remove duplicates
}

// Helper function to validate if image URL is accessible and valid
async function validateImageUrl(imageUrl, timeout = 5000) {
    try {
        return new Promise((resolve) => {
            const client = imageUrl.startsWith('https') ? https : http;
            const request = client.get(imageUrl, { timeout }, (res) => {
                // Check if response is successful and content type is image
                const isValidResponse = res.statusCode === 200;
                const contentType = res.headers['content-type'] || '';
                const isImage = contentType.startsWith('image/');
                
                // Consume response to free up resources
                res.resume();
                
                resolve(isValidResponse && isImage);
            });
            
            request.on('error', () => resolve(false));
            request.on('timeout', () => {
                request.destroy();
                resolve(false);
            });
        });
    } catch (error) {
        return false;
    }
}

// Helper function to get basic image information
async function getImageInfo(imageUrl) {
    try {
        return new Promise((resolve) => {
            const client = imageUrl.startsWith('https') ? https : http;
            const request = client.get(imageUrl, (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    resolve(null);
                    return;
                }
                
                const chunks = [];
                let totalLength = 0;
                const maxSize = 1024 * 1024; // 1MB limit for header reading
                
                res.on('data', (chunk) => {
                    totalLength += chunk.length;
                    if (totalLength > maxSize) {
                        res.destroy();
                        resolve(null);
                        return;
                    }
                    chunks.push(chunk);
                    
                    // Try to determine image dimensions from headers
                    const buffer = Buffer.concat(chunks);
                    const dimensions = getImageDimensionsFromBuffer(buffer);
                    if (dimensions) {
                        res.destroy();
                        resolve(dimensions);
                    }
                });
                
                res.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    const dimensions = getImageDimensionsFromBuffer(buffer);
                    resolve(dimensions);
                });
                
                res.on('error', () => resolve(null));
            });
            
            request.on('error', () => resolve(null));
            request.setTimeout(5000, () => {
                request.destroy();
                resolve(null);
            });
        });
    } catch (error) {
        return null;
    }
}

// Helper function to extract image dimensions from buffer (basic implementation)
function getImageDimensionsFromBuffer(buffer) {
    try {
        if (buffer.length < 24) return null;
        
        // PNG signature
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
            if (buffer.length >= 24) {
                const width = buffer.readUInt32BE(16);
                const height = buffer.readUInt32BE(20);
                return { width, height, type: 'PNG' };
            }
        }
        
        // JPEG signature
        if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
            for (let i = 2; i < buffer.length - 4; i++) {
                if (buffer[i] === 0xFF && (buffer[i + 1] === 0xC0 || buffer[i + 1] === 0xC2)) {
                    if (i + 9 < buffer.length) {
                        const height = buffer.readUInt16BE(i + 5);
                        const width = buffer.readUInt16BE(i + 7);
                        return { width, height, type: 'JPEG' };
                    }
                }
            }
        }
        
        // GIF signature
        if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
            if (buffer.length >= 10) {
                const width = buffer.readUInt16LE(6);
                const height = buffer.readUInt16LE(8);
                return { width, height, type: 'GIF' };
            }
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

// Helper function to scrape favicon from HTML
async function scrapeFaviconFromHtml(website) {
    try {
        const htmlContent = await makeHtmlRequest(website);
        if (!htmlContent) return null;
        
        // Look for favicon link tags
        const faviconMatches = [
            /<link[^>]*rel=["']icon["'][^>]*href=["']([^"']+)["']/i,
            /<link[^>]*rel=["']shortcut icon["'][^>]*href=["']([^"']+)["']/i,
            /<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i,
            /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
        ];
        
        for (const regex of faviconMatches) {
            const match = htmlContent.match(regex);
            if (match && match[1]) {
                let faviconUrl = match[1];
                
                // Convert relative URLs to absolute
                if (faviconUrl.startsWith('//')) {
                    faviconUrl = 'https:' + faviconUrl;
                } else if (faviconUrl.startsWith('/')) {
                    const domain = extractDomainFromUrl(website);
                    faviconUrl = `https://${domain}${faviconUrl}`;
                } else if (!faviconUrl.startsWith('http')) {
                    const domain = extractDomainFromUrl(website);
                    faviconUrl = `https://${domain}/${faviconUrl}`;
                }
                
                const isValid = await validateImageUrl(faviconUrl);
                if (isValid) {
                    return faviconUrl;
                }
            }
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

// Helper function to validate if URL looks like a legitimate logo
function isValidLogoUrl(imageUrl, companyName) {
    const url = imageUrl.toLowerCase();
    const company = companyName.toLowerCase();
    
    // Skip if URL contains spam indicators
    const spamIndicators = ['getty', 'shutterstock', 'alamy', 'depositphotos', 'placeholder', 'template'];
    if (spamIndicators.some(indicator => url.includes(indicator))) {
        return false;
    }
    
    // Prefer URLs that contain company name or logo-related terms  
    const logoTerms = ['logo', 'brand', 'icon', company.split(' ')[0]];
    const hasRelevantTerm = logoTerms.some(term => url.includes(term));
    
    // Accept SVG, PNG, JPG formats
    const validFormats = ['.svg', '.png', '.jpg', '.jpeg', '.webp'];
    const hasValidFormat = validFormats.some(format => url.includes(format));
    
    return hasRelevantTerm || hasValidFormat;
}

module.exports = {
    fetchCompanyLogo
};
