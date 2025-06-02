@echo off
echo Competitor Analysis Scraper - Enhanced Server Version
echo ===================================================
echo.

REM Define the full path to your Playwright's node.exe
set PLAYWRIGHT_NODE_EXE=C:\Users\KIIT0001\miniconda3\envs\scraper\Lib\site-packages\playwright\driver\node.exe

REM Define the full path to your server script
set SERVER_SCRIPT=%~dp0src\enhanced-server.js

REM Set environment variables (uncomment and modify as needed)
set PORT=9000
REM set HOST=0.0.0.0
set GEMINI_API_KEY=AIzaSyBkpg5F3G72SuZZ24zCXv-8p_0WOpR4cdI
REM set MISTRAL_API_KEY=your_mistral_key_here
REM set ALPHA_VANTAGE_API_KEY=your_api_key_here

REM Logo fetching API keys (optional for enhanced logo capabilities)
REM set GOOGLE_API_KEY=your_google_custom_search_api_key_here
REM set GOOGLE_CX=your_google_custom_search_engine_id_here

echo Using Node.js from: %PLAYWRIGHT_NODE_EXE%
echo.

echo Creating logs directory...
if not exist "%~dp0logs" mkdir "%~dp0logs"

echo Starting enhanced server (Ctrl+C to stop)...
echo Logo fetching strategy: Clearbit API → Favicon Scraping → Google Images → Wikipedia
echo.

REM Start the server with automatic port cleanup
"%PLAYWRIGHT_NODE_EXE%" "%SERVER_SCRIPT%"

echo.
echo Server stopped.
echo Cleaning up any potentially in-use ports...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%PORT%') do (
    echo Terminating process: %%a
    taskkill /F /PID %%a >nul 2>nul
)
echo Done.
echo Press any key to exit...
pause
