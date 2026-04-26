@echo off
chcp 65001 >nul

set "PATH=%PATH%;%APPDATA%\npm"
set "PM2_HOME=%USERPROFILE%\.pm2"
set "LOG=%TEMP%\pm2-startup.log"

echo. >> "%LOG%"
echo ===== %DATE% %TIME% ===== >> "%LOG%"
call pm2 resurrect >> "%LOG%" 2>&1
