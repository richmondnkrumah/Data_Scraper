# Competitor Analysis Scraper

A robust backend system for scraping and comparing company data for competitor analysis.

![Sample Comparison](https://via.placeholder.com/800x400?text=Competitor+Analysis+Dashboard)

## Features

- **Company Data Scraping**: Automatically collect data about companies from various sources
- **Financial Analysis**: Compare financial metrics (market cap, revenue, profit margins, P/E ratios, EPS)
- **User Metrics**: Analyze customer base size, growth rates, and satisfaction scores
- **Visual Comparison**: Generate charts and visualization data for easy comparison
- **AI-Enhanced Data**: Integration with Mistral AI for intelligent data gathering and gap filling
- **Built-in UI**: Web interface for quick company comparisons without a separate frontend
- **Responsive Design**: Mobile-friendly interface that adapts to screen size
- **Fast Performance**: Efficient caching system with minimal external dependencies

## Quick Start

### Windows

1. Download or clone the repository
2. Double-click `run-enhanced-server.bat`
3. Open your browser to the URL shown in the command window (typically http://localhost:9000)
4. Enter two company names to compare
5. View the comprehensive comparison

### Other Platforms

```bash
# Clone repository
git clone <repository-url>
cd competitor-analysis-scraper

# Run with Node.js
node src/enhanced-server.js
```

## Screenshots

### Company Comparison

![Company Comparison](https://via.placeholder.com/600x300?text=Company+Comparison)

### Financial Metrics

![Financial Charts](https://via.placeholder.com/600x300?text=Financial+Metrics)

## Tech Stack

- **Node.js**: JavaScript runtime environment
- **Core HTTP Module**: Native Node.js HTTP server (no Express dependency)
- **Alpha Vantage API**: Financial data source for company metrics
- **Mistral AI API**: Enhanced data gathering using AI
- **Wikipedia API**: Basic company information and descriptions
- **In-memory Database**: Fast responses with no external database dependency

## API Reference

### Companies

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/companies` | GET | List all companies in database |
| `/api/companies/:identifier` | GET | Get details for a specific company |
| `/api/companies/search/:term` | GET | Search for companies by name |

### Comparisons

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/comparison?company1=:name1&company2=:name2` | GET | Compare two companies |
| `/api/comparison/chart/:type` | GET | Get chart data for visualization |
| `/api/comparison/detail/:metric` | GET | Get detailed comparison for a metric |

### Health Checks

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Basic server health check |
| `/api/health/details` | GET | Detailed system status |

## Detailed Setup

### Prerequisites

- Node.js v14.0.0 or higher
- Windows, macOS, or Linux operating system
- Internet connection for API access

### Configuration (Optional)

For best results, configure your API keys:

1. Open `src/config.js`
2. Update the following values:
   ```javascript
   // API keys
   api: {
     alphaVantage: {
       key: 'YOUR_API_KEY_HERE', // Get from alphavantage.co
     },
     mistral: {
       key: 'YOUR_MISTRAL_KEY_HERE', // Get from mistral.ai
     }
   }
   ```

3. Or set as environment variables:
   ```bash
   set ALPHA_VANTAGE_API_KEY=your_key_here
   set MISTRAL_API_KEY=your_key_here
   ```

### Running the Server

#### Windows

```
run-enhanced-server.bat  # Full featured version (recommended)
run-simple-server.bat    # Minimal version with fewer features
```

#### Command Line (Any Platform)

```bash
# Navigate to project directory
cd path/to/competitor-analysis-scraper

# Run the enhanced server
node src/enhanced-server.js
```

## Project Structure

```
├── logs/                      # Log files (automatically created)
├── src/
│   ├── config.js              # Configuration settings
│   ├── enhanced-server.js     # Complete server with all features
│   ├── simple-server.js       # Basic server with minimal dependencies
│   ├── controllers/           # Request handlers
│   ├── models/                # Data definitions
│   ├── routes/                # API routes
│   ├── services/              # Business logic services
│   └── utils/                 # Utility functions
├── .env.example               # Example environment variables
├── run-enhanced-server.bat    # Primary batch file for Windows
├── run-simple-server.bat      # Alternative batch file
└── README.md                  # This documentation
```

## Data Sources

The system collects data from multiple sources:

- **Alpha Vantage API**: Financial metrics (stock symbols, market cap, ratios)
- **Wikipedia API**: Company descriptions and basic information
- **Mistral AI**: AI-based data enhancement and filling in gaps
- **Yahoo Finance**: Fallback data when other sources are limited

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Port already in use** | The server will automatically try different ports |
| **API rate limits** | Obtain API keys for Alpha Vantage and Mistral AI |
| **Slow responses** | First requests take longer as data is being collected |
| **No data available** | Some companies may have limited public information |
| **Server not starting** | Make sure you're using `run-enhanced-server.bat` |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add some amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Alpha Vantage API for financial data
- Wikipedia API for company information
- Mistral AI for enhanced data gathering capabilities
- All contributors who have helped shape this project