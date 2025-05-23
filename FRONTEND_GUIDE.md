# Frontend Developer Guide for Competitor Analysis API

This guide provides information for frontend developers who want to integrate with the Competitor Analysis API. It
covers API endpoints, data structures, and best practices for creating an effective frontend experience.

## API Overview

The Competitor Analysis API provides data for comparing companies across multiple dimensions:

- Financial metrics
- Customer/user metrics
- Product information
- Competitive positioning

## Base URL

When running locally (using the enhanced server):

```
http://localhost:9000/api/
```

> **Note**: The server may run on a different port if 9000 is already in use. Check the console output when starting the
> server to confirm the actual port number.

## Key Endpoints

### Company Data

#### Get Company Information

```
GET /api/companies/:companyName
```

Example Response:

```json
{
  "status": "success",
  "data": {
    "id": "1684932912345",
    "name": "Apple Inc.",
    "description": "Technology company that designs, develops, and sells consumer electronics, software, and online services.",
    "industry": "Technology",
    "founded": 1976,
    "headquarters": "Cupertino, California, United States",
    "website": "https://www.apple.com",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg",
    "financials": {
      "stockSymbol": "AAPL",
      "marketCap": 2800000000000,
      "revenue": 394000000000,
      "profitMargin": 0.25,
      "peRatio": 30.5,
      "eps": 5.61
    },
    "products": [
      {"name": "iPhone", "rating": 4.5},
      {"name": "MacBook", "rating": 4.6},
      {"name": "iPad", "rating": 4.3}
    ],
    "customerMetrics": {
      "userCount": 1500000000,
      "userGrowth": 0.05,
      "rating": 4.5
    }
  }
}
```

#### List Available Companies

```
GET /api/companies
```

### Company Comparison

#### Compare Two Companies

```
GET /api/comparison?company1=:name1&company2=:name2
```

Example Response:

```json
{
  "status": "success",
  "data": {
    "id": "apple-microsoft",
    "companies": ["1684932912345", "1684932912346"],
    "companyNames": ["Apple Inc.", "Microsoft Corporation"],
    "financialComparison": {
      "marketCap": {
        "better": "1684932912345", 
        "differencePercent": 3.7,
        "value1": 2800000000000,
        "value2": 2700000000000
      },
      "revenue": {
        "better": "1684932912345", 
        "differencePercent": 98.9,
        "value1": 394000000000,
        "value2": 198000000000
      },
      "profitMargin": {
        "better": "1684932912346", 
        "differencePercent": 44.0,
        "value1": 0.25,
        "value2": 0.36
      },
      "peRatio": {
        "better": "1684932912345",
        "differencePercent": 16.7, 
        "value1": 25.0,
        "value2": 30.0
      },
      "eps": {
        "better": "1684932912346", 
        "differencePercent": 29.0,
        "value1": 3.99,
        "value2": 5.62
      }
    },
    "userMetricsComparison": {
      "userBase": {
        "better": "1684932912345", 
        "differencePercent": 7.1,
        "value1": 1500000000,
        "value2": 1400000000
      },
      "userGrowth": {
        "better": "1684932912346", 
        "differencePercent": 60.0,
        "value1": 0.05,
        "value2": 0.08
      },
      "rating": {
        "better": "1684932912345", 
        "differencePercent": 7.1,
        "value1": 4.5,
        "value2": 4.2
      }
    },
    "chartData": {
      "finances": {
        "labels": ["Market Cap (B)", "Revenue (B)", "Profit Margin (%)", "P/E Ratio", "EPS"],
        "datasets": [
          {
            "company": "Apple Inc.",
            "data": [2800, 394, 25, 25, 3.99]
          },
          {
            "company": "Microsoft Corporation",
            "data": [2700, 198, 36, 30, 5.62]
          }
        ]
      },
      "userMetrics": {
        "labels": ["User Count (M)", "User Growth (%)", "Rating"],
        "datasets": [
          {
            "company": "Apple Inc.",
            "data": [1500, 5, 4.5]
          },
          {
            "company": "Microsoft Corporation",
            "data": [1400, 8, 4.2]
          }
        ]
      }
    }
  }
}
```

#### Get Chart Data

```
GET /api/comparison/chart/:chartType?company1=:name1&company2=:name2
```

Examples:

- `/api/comparison/chart/finances?company1=Apple&company2=Microsoft`
- `/api/comparison/chart/userMetrics?company1=Apple&company2=Microsoft`

### Health Check API

```
GET /api/health
```

Response:

```json
{
  "status": "OK",
  "uptime": 35.48,
  "timestamp": 1683912345678,
  "version": "1.0.0",
  "port": 9000,
  "memory": {
    "rss": "56MB",
    "heapTotal": "34MB", 
    "heapUsed": "26MB"
  },
  "apis": {
    "alphaVantage": true,
    "mistral": true
  }
}
```

## Working with the API

### Best Practices

1. **Cache Results Locally**:
    - The API already caches company data, but for best performance, cache comparison results on the frontend.
    - Store results in localStorage with an expiration time (e.g., 30 minutes).

2. **Handle API Timeouts**:
    - First-time company lookups may take longer (5-15 seconds) as data is being collected.
    - Implement loading indicators and timeouts.

3. **Error Handling**:
    - The API returns consistent error formats with HTTP status codes.
    - Always check the `status` field in the response (success/fail/error).

4. **Show Missing Data Gracefully**:
    - Some companies may have incomplete data.
    - Implement conditional rendering for metrics that may be null.

### Example Integration (JavaScript/Fetch)

```javascript
// Fetch company comparison data
async function compareCompanies(company1, company2) {
  // Determine the base URL (checking if port is different from default)
  const baseUrl = window.location.hostname === 'localhost' ? 
                  window.location.origin : 
                  'http://localhost:9000';
                  
  try {
    const response = await fetch(
      `${baseUrl}/api/comparison?company1=${encodeURIComponent(company1)}&company2=${encodeURIComponent(company2)}`
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to load comparison data');
    }
    
    const data = await response.json();
    if (data.status !== 'success') {
      throw new Error(data.message || 'API returned error status');
    }
    
    return data.data; // Return the comparison data
  } catch (error) {
    console.error('Error fetching comparison:', error);
    throw error;
  }
}

// Usage
compareCompanies('Apple', 'Microsoft')
  .then(comparisonData => {
    // Render charts/UI with the comparison data
    renderFinancialChart(comparisonData.chartData.finances);
    renderUserMetricsChart(comparisonData.chartData.userMetrics);
    determineWinner(comparisonData);
  })
  .catch(error => {
    // Show error message to user
    displayErrorMessage(error.message);
  });
```

## Visualization Tips

### Chart Libraries

For visualizing the comparison data, consider these libraries:

- **Chart.js**: Simple, responsive charts with good customization
- **D3.js**: Advanced data visualization with complete control
- **Victory**: React-specific chart components
- **Highcharts**: Feature-rich interactive charts

### Example Chart.js Implementation

```javascript
function renderFinancialChart(chartData) {
  const ctx = document.getElementById('financeChart').getContext('2d');
  
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: chartData.labels,
      datasets: chartData.datasets.map((dataset, index) => ({
        label: dataset.company,
        data: dataset.data,
        backgroundColor: index === 0 ? '#4285f4' : '#ea4335',
        borderColor: index === 0 ? '#2a56c6' : '#c62828',
        borderWidth: 1
      }))
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}
```

## User Interface Design Guidelines

### Comparison Layout

1. **Side-by-side Cards**:
    - Display company information in adjacent cards
    - Use consistent vertical alignment for comparable metrics

2. **Highlight Differences**:
    - Use color coding to show which company performs better in each metric
    - Include percentage differences to quantify the gap

3. **Interactive Elements**:
    - Allow users to expand/collapse detailed sections
    - Provide tooltips for metric explanations

### Mobile Responsiveness

On mobile devices:

- Stack company cards vertically
- Use collapsible sections for detailed metrics
- Ensure charts are responsive and readable on small screens

## Handling Edge Cases

1. **Private Companies**:
    - Not all companies will have stock symbols or public financial data
    - The API will provide AI-estimated data when official sources are unavailable

2. **Rate Limits**:
    - The Alpha Vantage API has rate limits (typically 5 calls/minute)
    - Implement queuing and graceful fallbacks when rate limits are hit

3. **Similar Names**:
    - Companies may have similar names or abbreviations
    - Provide autocomplete suggestions to help users select the right company

## Available Metric Explanations

Help users understand the metrics with these explanations:

### Financial Metrics

- **Market Cap**: Total market value of a company's outstanding shares
- **Revenue**: Total income from sales before expenses
- **Profit Margin**: Percentage of revenue that translates to profit
- **P/E Ratio**: Price-to-earnings ratio (lower values often considered better)
- **EPS**: Earnings per share (higher values typically better)

### User Metrics

- **User Base**: Estimated number of users/customers
- **User Growth**: Annual percentage growth in user base
- **Rating**: Average customer satisfaction rating (1-5 scale)

## Need Help?

The API includes a built-in web interface at the root URL (e.g., http://localhost:9000/) where you can:

- Test company lookups
- View sample comparisons
- See the available API endpoints

### Running the Server

1. Open Command Prompt or PowerShell
2. Navigate to your project directory
3. Run the enhanced server:
   ```
   run-enhanced-server.bat
   ```
4. Look for this message in the console:
   ```
   ✓ Server started successfully!
   ✓ Local: http://127.0.0.1:9000/
   ```
5. The URL shown is where you can access the API

### Common Issues

- **CORS errors**: The API has CORS enabled, but if you're hosting your frontend on a different domain, you may need to
  modify the server's CORS settings
- **Connection refused**: Ensure the server is running and check the actual port number in the console output
- **Rate limiting**: If you're making many requests in development, implement caching to reduce API calls

For any questions or feature requests, please open an issue on the GitHub repository.