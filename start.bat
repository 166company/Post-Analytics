@echo off
chcp 65001 >nul
title Post Analytics Server

:: Node.js yoxlanır
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  Node.js tapılmadı!
    echo  nodejs.org saytından yükləyin və qurun, sonra yenidən cəhd edin.
    echo.
    pause
    exit /b 1
)

:: İlk dəfədirsə npm install
if not exist "node_modules" (
    echo  Paketlər yüklənir...
    npm install
)

:: Serveri başlat
node server.js
pause
