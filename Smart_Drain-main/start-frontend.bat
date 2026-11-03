@echo off
echo.
echo ========================================
echo  SmartDrain — Starting Frontend
echo ========================================
echo.
cd /d %~dp0frontend

if not exist node_modules (
  echo [1/2] Installing frontend dependencies...
  npm install
  echo.
)

echo [2/2] Starting Vite dev server on port 5173...
npm run dev
