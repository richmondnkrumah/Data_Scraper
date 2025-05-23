@echo off
echo Testing MongoDB Connection...
set NODE_PATH=C:\Users\KIIT0001\miniconda3\envs\scraper\Lib\site-packages\playwright\driver

echo First installing mongodb package...
"%NODE_PATH%\node.exe" -e "const { execSync } = require('child_process'); try { require('mongodb'); console.log('mongodb package already installed'); } catch(e) { console.log('installing mongodb package...'); execSync('mkdir -p node_modules\\mongodb && %NODE_PATH%\\npm.cmd install mongodb --no-save', {stdio: 'inherit'}); }"

echo Running MongoDB test script...
"%NODE_PATH%\node.exe" test-mongodb.js
pause