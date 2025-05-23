@echo off
echo Competitor Analysis Scraper - Using Playwright's Node.js
echo ======================================================
echo.

set NODE_PATH=C:\Users\KIIT0001\miniconda3\envs\scraper\Lib\site-packages\playwright\driver

echo Using Node.js from: %NODE_PATH%
echo.

echo Creating node_modules directory if it doesn't exist...
if not exist node_modules mkdir node_modules

echo Installing dependencies manually...
echo Installing express...
"%NODE_PATH%\node.exe" -e "try { require('express') } catch(e) { require('child_process').execSync('mkdir -p node_modules\\express && echo {\"name\":\"express\"} > node_modules\\express\\package.json && curl -s -L https://registry.npmjs.org/express/-/express-4.18.2.tgz | tar xz -C node_modules\\express --strip-components=1', {stdio: 'inherit'}) }"

echo Installing mongoose...
"%NODE_PATH%\node.exe" -e "try { require('mongoose') } catch(e) { require('child_process').execSync('mkdir -p node_modules\\mongoose && echo {\"name\":\"mongoose\"} > node_modules\\mongoose\\package.json && curl -s -L https://registry.npmjs.org/mongoose/-/mongoose-7.5.0.tgz | tar xz -C node_modules\\mongoose --strip-components=1', {stdio: 'inherit'}) }"

echo Installing other dependencies...
"%NODE_PATH%\node.exe" -e "try { require('cors') } catch(e) { require('child_process').execSync('mkdir -p node_modules\\cors && echo {\"name\":\"cors\"} > node_modules\\cors\\package.json && curl -s -L https://registry.npmjs.org/cors/-/cors-2.8.5.tgz | tar xz -C node_modules\\cors --strip-components=1', {stdio: 'inherit'}) }"
"%NODE_PATH%\node.exe" -e "try { require('dotenv') } catch(e) { require('child_process').execSync('mkdir -p node_modules\\dotenv && echo {\"name\":\"dotenv\"} > node_modules\\dotenv\\package.json && curl -s -L https://registry.npmjs.org/dotenv/-/dotenv-16.3.1.tgz | tar xz -C node_modules\\dotenv --strip-components=1', {stdio: 'inherit'}) }"
"%NODE_PATH%\node.exe" -e "try { require('morgan') } catch(e) { require('child_process').execSync('mkdir -p node_modules\\morgan && echo {\"name\":\"morgan\"} > node_modules\\morgan\\package.json && curl -s -L https://registry.npmjs.org/morgan/-/morgan-1.10.0.tgz | tar xz -C node_modules\\morgan --strip-components=1', {stdio: 'inherit'}) }"
"%NODE_PATH%\node.exe" -e "try { require('winston') } catch(e) { require('child_process').execSync('mkdir -p node_modules\\winston && echo {\"name\":\"winston\"} > node_modules\\winston\\package.json && curl -s -L https://registry.npmjs.org/winston/-/winston-3.10.0.tgz | tar xz -C node_modules\\winston --strip-components=1', {stdio: 'inherit'}) }"
"%NODE_PATH%\node.exe" -e "try { require('node-cache') } catch(e) { require('child_process').execSync('mkdir -p node_modules\\node-cache && echo {\"name\":\"node-cache\"} > node_modules\\node-cache\\package.json && curl -s -L https://registry.npmjs.org/node-cache/-/node-cache-5.1.2.tgz | tar xz -C node_modules\\node-cache --strip-components=1', {stdio: 'inherit'}) }"

echo Creating logs directory...
if not exist logs mkdir logs

echo Starting server...
"%NODE_PATH%\node.exe" src\server.js

pause