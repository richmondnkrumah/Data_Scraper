@echo off
echo Competitor Analysis Scraper - Simple Server Version
echo =================================================
echo.

set NODE_PATH=C:\Users\KIIT0001\miniconda3\envs\scraper\Lib\site-packages\playwright\driver

echo Using Node.js from: %NODE_PATH%
echo.

echo Creating logs directory...
if not exist logs mkdir logs

echo Starting simple server (no external dependencies)...
"%NODE_PATH%\node.exe" src\simple-server.js

pause