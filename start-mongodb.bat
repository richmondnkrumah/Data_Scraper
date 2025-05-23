@echo off
echo Starting MongoDB service...

:: Check if running as administrator
NET SESSION >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo This script requires administrator privileges.
    echo Right-click on this batch file and select "Run as administrator".
    pause
    exit /b
)

:: Try to start MongoDB service
net start MongoDB
if %ERRORLEVEL% neq 0 (
    echo.
    echo Could not start MongoDB service automatically.
    echo.
    echo Alternative methods to start MongoDB:
    echo 1. Try starting MongoDB Compass (if installed)
    echo 2. Go to Start Menu ^> MongoDB Inc ^> MongoDB Server ^> MongoDB Service
    echo 3. Open Services application by typing "services.msc" in Run dialog
    echo    and manually start MongoDB service
    echo.
    echo Attempting to start MongoDB directly... 
    
    :: Try to find MongoDB binary and start it directly
    if exist "C:\Program Files\MongoDB\Server\6.0\bin\mongod.exe" (
        echo Starting MongoDB from Program Files...
        start "" "C:\Program Files\MongoDB\Server\6.0\bin\mongod.exe" --dbpath "C:\data\db"
    ) else if exist "C:\Program Files\MongoDB\Server\5.0\bin\mongod.exe" (
        echo Starting MongoDB from Program Files...
        start "" "C:\Program Files\MongoDB\Server\5.0\bin\mongod.exe" --dbpath "C:\data\db"
    ) else if exist "C:\Program Files\MongoDB\Server\4.4\bin\mongod.exe" (
        echo Starting MongoDB from Program Files...
        start "" "C:\Program Files\MongoDB\Server\4.4\bin\mongod.exe" --dbpath "C:\data\db"
    ) else (
        echo Could not locate MongoDB executable.
        echo Please start MongoDB manually using one of the methods above.
    )
    
    echo After ensuring MongoDB is running, press any key to continue...
    pause
)

:: Wait a bit for MongoDB to start
echo Waiting for MongoDB to initialize...
timeout /t 5 > nul

:: Check if MongoDB is running
echo Verifying MongoDB connection...
where mongosh >nul 2>nul
if %ERRORLEVEL% equ 0 (
    :: mongosh is available
    mongosh --eval "db.runCommand({ping:1})" --quiet >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        echo MongoDB is now running!
    ) else (
        echo Could not connect to MongoDB. Please ensure it's running.
    )
) else (
    :: mongosh not in path, try with node
    node -e "try{require('mongoose').connect('mongodb://localhost:27017/test',{serverSelectionTimeoutMS:3000}).then(()=>{console.log('Connected');process.exit(0)},e=>{process.exit(1)})}catch{process.exit(1)}" >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        echo MongoDB is now running!
    ) else (
        echo Could not verify MongoDB is running. Please check manually.
    )
)

echo You can now run the application using run.bat
pause