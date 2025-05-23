@echo off
echo Competitor Analysis Scraper - Setup Helper
echo =========================================
echo.
echo This script will guide you through setting up the required prerequisites:
echo 1. Node.js
echo 2. MongoDB
echo.
echo NOTE: If you already have Node.js and MongoDB installed, you can skip this setup.
echo.
echo For Node.js:
echo - Download from: https://nodejs.org/dist/v22.16.0/node-v22.16.0-x64.msi
echo - Install using the MSI installer
echo.
echo For MongoDB:
echo - Download from: https://www.mongodb.com/try/download/community
echo - Install the Community Edition
echo.
echo After installing the prerequisites:
echo 1. Open a command prompt
echo 2. Navigate to this project directory
echo 3. Run: npm install
echo 4. Run: npm run dev
echo.
echo Press any key to open the Node.js download page...
pause > nul
start https://nodejs.org/dist/v22.16.0/node-v22.16.0-x64.msi
echo.
echo Press any key to open the MongoDB download page...
pause > nul
start https://www.mongodb.com/try/download/community
echo.
echo Once you have installed both Node.js and MongoDB, you can close this window.
echo Then follow the remaining steps mentioned above to run the application.
pause > nul