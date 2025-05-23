@echo off
echo Installing Competitor Analysis Dependencies
echo =========================================
echo.

set NODE_PATH=C:\Users\KIIT0001\miniconda3\envs\scraper\Lib\site-packages\playwright\driver

echo Using Node.js from: %NODE_PATH%
echo.

echo Creating node_modules directory...
if not exist node_modules mkdir node_modules

echo Installing express...
"%NODE_PATH%\node.exe" -e "const cp = require('child_process'); cp.execSync('curl -sL https://registry.npmjs.org/express/-/express-4.18.2.tgz -o express.tgz', {stdio: 'inherit'}); cp.execSync('mkdir -p node_modules\\express && tar -xzf express.tgz -C node_modules\\express --strip-components=1', {stdio: 'inherit'}); cp.execSync('del express.tgz', {stdio: 'inherit'});"

echo Installing cors...
"%NODE_PATH%\node.exe" -e "const cp = require('child_process'); cp.execSync('curl -sL https://registry.npmjs.org/cors/-/cors-2.8.5.tgz -o cors.tgz', {stdio: 'inherit'}); cp.execSync('mkdir -p node_modules\\cors && tar -xzf cors.tgz -C node_modules\\cors --strip-components=1', {stdio: 'inherit'}); cp.execSync('del cors.tgz', {stdio: 'inherit'});"

echo Installing other dependencies...
"%NODE_PATH%\node.exe" -e "const cp = require('child_process'); cp.execSync('curl -sL https://registry.npmjs.org/dotenv/-/dotenv-16.3.1.tgz -o dotenv.tgz', {stdio: 'inherit'}); cp.execSync('mkdir -p node_modules\\dotenv && tar -xzf dotenv.tgz -C node_modules\\dotenv --strip-components=1', {stdio: 'inherit'}); cp.execSync('del dotenv.tgz', {stdio: 'inherit'});"

echo.
echo Installation completed. Please run the application with run-simple-server.bat
echo to use the simplified version that doesn't require dependencies.
pause