@echo off
REM Starts Vantage and the sync agent the app's Sync button drives.
REM
REM One double-click gets you both: the app comes up in Docker (detached, so it
REM keeps running on its own) and the agent then takes over this window.
REM
REM The agent syncs nothing by itself — it sits on 127.0.0.1:8124 and runs one
REM pull each time the button asks, which is why the button exists at all: OpenD
REM is on this machine's loopback and the app is in a container, so the browser
REM cannot reach OpenD without something here to ask.
REM
REM Ctrl-C stops the AGENT ONLY. The app is detached and `restart: unless-stopped`,
REM so it survives this window closing — stop it with `docker compose down`.
REM
REM OpenD must be running and logged in for a sync to succeed. The scheduled task
REM (VantageSync) is unaffected either way.
REM
REM Pass any extra compose flags straight through, e.g. after changing code:
REM     run_agent.cmd --build
setlocal enabledelayedexpansion
cd /d "%~dp0.."

REM ── 1. Docker itself ────────────────────────────────────────────────────────
docker version >NUL 2>&1
if errorlevel 1 (
  echo.
  echo   Docker is not running. Start Docker Desktop, wait for the whale to settle,
  echo   then run this again.
  echo.
  pause
  exit /b 1
)

REM ── 2. The shared devdata Postgres ──────────────────────────────────────────
REM Vantage joins devdata_default as an external network, so compose fails
REM outright if devdata has never been brought up. Checking the network is the
REM cheapest way to know; when it is already there this costs nothing.
docker network inspect devdata_default >NUL 2>&1
if errorlevel 1 (
  echo   Starting the shared devdata services...
  docker compose -f "..\semaisens\worktree-tools\compose.services.yml" up -d
  if errorlevel 1 (
    echo.
    echo   Could not start devdata. Vantage keeps its database there, so it cannot
    echo   run without it. See the output above.
    echo.
    pause
    exit /b 1
  )
)

REM ── 3. Vantage ──────────────────────────────────────────────────────────────
REM Idempotent: does nothing when the container is already up and healthy. No
REM --build by default, because rebuilding compiles the React app every time and
REM this script runs daily — pass --build yourself after changing code.
echo   Starting Vantage...
docker compose up -d %*
if errorlevel 1 (
  echo.
  echo   Vantage did not start. See the output above.
  echo.
  pause
  exit /b 1
)

REM ── 4. Wait until it actually answers ───────────────────────────────────────
REM `up -d` returns once the container is created, not once the app is serving:
REM migrations run first and the Node process needs a moment. /api/health stays
REM open even when a PIN is set, so this works either way.
set /a tries=0
:wait
curl -fsS -o NUL http://127.0.0.1:8123/api/health >NUL 2>&1
if not errorlevel 1 goto ready
set /a tries+=1
if !tries! geq 30 (
  echo.
  echo   Vantage started but is not answering on 8123 after a minute.
  echo   Check `docker compose logs app`. Starting the agent anyway.
  goto ready
)
timeout /t 2 /nobreak >NUL
goto wait

:ready
echo.
echo   Vantage      http://localhost:8123
echo   Sync agent   127.0.0.1:8124   ^(this window^)
echo.
echo   Leave this window open so the Sync button has something to talk to.
echo   Ctrl-C stops the agent; the app keeps running.
echo.

REM Only if the app has a PIN (VANTAGE_PIN on the server) — the agent then
REM requires the same one, and the app forwards it for you.
REM set VANTAGE_PIN=your-pin

"C:\Python312\python.exe" sync\moomoo_sync.py --serve
endlocal
