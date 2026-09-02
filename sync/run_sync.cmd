@echo off
REM Wrapper for the Windows scheduled task (VantageSync).
REM
REM Runs from the project root so the worker's relative paths behave, and appends
REM to sync/sync.log so a failed run leaves a trace instead of vanishing. A run
REM with OpenD closed is expected to fail and is harmless — the log will say so.
setlocal
cd /d "%~dp0.."

REM If the app has a PIN (VANTAGE_PIN set on the server), uncomment and match it
REM here, otherwise the worker gets a 401 and the log will say so.
REM set VANTAGE_PIN=your-pin

echo.>> sync\sync.log
echo ==== %DATE% %TIME% ====>> sync\sync.log
"C:\Python312\python.exe" sync\moomoo_sync.py >> sync\sync.log 2>&1
echo exit=%ERRORLEVEL%>> sync\sync.log
endlocal
