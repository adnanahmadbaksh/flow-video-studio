@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js nahi mila. Pehle https://nodejs.org se install karein. & pause & exit /b)
start "" http://localhost:3000
node server.js
pause
