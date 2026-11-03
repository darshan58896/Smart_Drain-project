@echo off
echo.
echo ========================================
echo  SmartDrain — Starting Backend
echo ========================================
echo.
cd /d %~dp0backend

if not exist node_modules (
  echo [1/2] Installing backend dependencies...
  npm install
  echo.
)

echo [2/2] Starting backend on port 3001...
npm start
