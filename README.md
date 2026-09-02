# Vantage — personal finance tracker

Tracks everything you own, owe and earn: moomoo positions, portfolio, history, cash wallet
and purchase calendar; the savings that live outside the broker (ASB, Tabung Haji, EPF);
what you owe on loans, cards and recurring charges; what arrives each month; and the goals
measured against all of it. Runs entirely on your PC; all data lives in the `vantage`
database on your local devdata Postgres.

It began as a moomoo tracker and the broker half is still the most developed part — that
code is deliberately untouched by everything added since, and the reasoning is in
[personal-assets-plan.md](personal-assets-plan.md) and
[commitments-and-income-plan.md](commitments-and-income-plan.md).

## Quick start

```
git clone https://github.com/Opie-dev/vantage.git
cd vantage
copy .env.example .env         # cp on macOS/Linux — edit if your Postgres differs
docker compose up -d --build   # → http://localhost:8123
```

That one command builds the React app inside the image, creates the `vantage`
database if it is missing, applies every pending migration, then serves on
**http://localhost:8123** — bound to loopback, so nothing outside this machine
can reach it.

It assumes the shared devdata Postgres is already up. If it is not, or you would
rather not think about any of this, double-click **`sync/run_agent.cmd`**: it
starts devdata, starts the app, waits until the API actually answers, and then
runs the moomoo sync agent in the same window. One double-click, everything up.

> **Cloning onto a different machine?** Vantage does not ship its own database.
> It expects the shared devdata Postgres described under
> [Database](#database) — an external compose project, plus the
> `devdata_default` network that `compose.yml` joins. Without it `docker compose
> up` fails immediately on the missing network. Point `DATABASE_URL` at any
> Postgres 16 you like instead, and drop the `networks:` blocks from
> `compose.yml`. The two `sync\*.cmd` wrappers also hardcode
> `C:\Python312\python.exe`; change it to your own interpreter.

## Serving it — the three ways

| | Command | When |
|---|---|---|
| **Docker** (normal) | `docker compose up -d --build` | Everything: database created, migrations applied, UI built in-image. Can never serve a stale UI. |
| **Host Node** | `npm install && npm run web:install && npm run build && npm start` | No Docker. You must build first — `npm start` only serves what is already in `public/`. |
| **Frontend dev** | `npm start` **+** `npm run web:dev` | Editing the UI. Vite on :5173 with hot reload, proxying `/api` to :8123. |

All three talk to the same database, so pick whichever — but only one of the
first two at a time, since they share port 8123. Stop Docker with
`docker compose down`; that removes Vantage's own containers only, never the
shared devdata Postgres.

## The screens

Ten, in the order the sidebar lists them:

- **Dashboard** — net worth, equity curve, what you own against what you owe
- **Positions** — moomoo holdings, cost basis, unrealised P/L
- **Instruments** — the securities you track, and their prices
- **History** — every event across all four domains, tagged by where it came from
- **Wallet** — broker cash, deposits, FX transfers
- **Calendar** — trades, dividends, salary and instalments on a month grid
- **Goals** — targets measured against real money, not wishes
- **Assets** — savings outside the broker: ASB, Tabung Haji, EPF
- **Money** — income and commitments, and the waterfall between them
- **Settings** — theme, PIN, data

Nothing is pre-seeded. Every account, commitment and income source is one you
entered, so an empty screen means exactly that and never a stale default.

## Requirements

- Node.js 22+ (https://nodejs.org) — the frontend build needs it
- The devdata Postgres container (`dev-postgres`, listening on 127.0.0.1:5433)
- Python 3.9+ (only for the moomoo sync worker)
- moomoo OpenD gateway (only for auto-sync): https://www.moomoo.com/download/OpenAPI

## Database

Vantage stores everything in a `vantage` database on the machine's shared devdata Postgres
(compose project `devdata`, defined in `semaisens/worktree-tools/compose.services.yml`).
Its tables come from the migrations in `db/migrations`.

That container must be running first:

```
docker compose -f ../semaisens/worktree-tools/compose.services.yml up -d
```

How Vantage reaches it depends on where Vantage itself runs, and `DATABASE_URL` overrides both:

- on the host — `postgres://semaisens:secret@127.0.0.1:5433/vantage` (devdata's published port)
- in Docker — `postgres://semaisens:secret@dev-postgres:5432/vantage`, by container name over the
  `devdata_default` network, which `compose.yml` joins as an external network

`docker compose up` creates the database for you. Doing it by hand:

```
docker exec dev-postgres psql -U semaisens -d postgres -c "CREATE DATABASE vantage OWNER semaisens;"
```

## Run the app

With Docker — builds the image, creates the database if it's missing, starts the app:

```
docker compose up -d --build
```

→ http://localhost:8123. Stop with `docker compose down`; that only removes Vantage's own
containers, never the shared devdata Postgres.

The image builds the React app itself, so this can never serve a stale UI.

Or straight on the host:

```
cd vantage
npm install          # first time only
npm run web:install  # first time only — frontend dependencies
npm run build        # compile the React app into public/
npm start            # → open http://localhost:8123
```

Both talk to the same database, so use whichever — but only one at a time, since they
share port 8123.

For day-to-day use there is a shortcut: `sync/run_agent.cmd` starts the app *and* the sync
agent in one double-click. See [The Sync button](#the-sync-button).

### Working on the frontend

`npm run web:dev` starts Vite on :5173 with hot reload, proxying `/api` to :8123 — so run
`npm start` alongside it and you get live editing against the real database. `npm run build`
writes the production bundle into `public/`, which is what `npm start` serves.

You can use the app immediately with manual entry, no broker connection needed:
add instruments under **Instruments**, log trades under **Positions**, record deposits
under **Wallet**, open a savings account and its entries under **Assets**, and add
what you earn and owe under **Money**.

## Auto-sync from moomoo (recommended)

1. Install OpenD, launch it, log in with your moomoo ID (it listens on 127.0.0.1:11111).
2. `pip install moomoo-api requests`
3. With the app running:

```
python sync/moomoo_sync.py                # one sync
python sync/moomoo_sync.py --loop 300     # keep syncing every 5 min
python sync/moomoo_sync.py --cash-days 270  # first run: backfill dividend history
python sync/moomoo_sync.py --serve        # sync on demand, from the app's Sync button
```

The worker pulls positions, account funds, your full fill history, cash flow (dividends,
withholding tax, deposits, FX transfers) and live quotes, then pushes them into the app. Every
synced row carries its moomoo id, so re-running never duplicates anything and your manual rows
are never touched.

**It cannot trade.** Every OpenD call it makes is a query — it never places, changes or cancels
an order, and it never calls `unlock_trade`, without which moomoo refuses order placement on a
live account outright.

`--cash-days N` sets how many clearing dates to scan for dividends and cash movements. You
rarely need it: by default the worker asks the app how fresh it already is and scans back far
enough to cover the gap, so skipping a fortnight loses nothing. A minimum of 14 days is always
re-scanned (see the clearing lag below), and an automatic run stops at 120 — a longer gap is
reported with the exact `--cash-days` to run, never half-closed in silence. moomoo serves one
date per request and rate-limits to 20 per 30 seconds, so each day scanned costs ~1.7s.
`--deals-since YYYY-MM-DD` sets how far back to pull fills (default: two years).

### Why a dividend can be in moomoo but not here

moomoo updates your **balance** the moment money lands, but only publishes the **cash-flow row**
at clearing, usually later the same day. In between, the dividend is visible in the moomoo app,
your cash is already right here too — and no API a sync can read will admit the dividend exists.

Syncing in that window is not a failure and does not report one. The app compares the broker's
balance against its own ledger and says so: *"Your cash moved, but moomoo has not published it
yet — USD +70.91."* Sync again once it clears and the dividend lands with its withholding tax
attached to the right holding. Nothing is lost by syncing early, and nothing needs re-running.

`SECURITY_FIRM` must match the moomoo entity holding your account — `FUTUMY` for Malaysia,
`FUTUINC` for the US, `FUTUSECURITIES` for Hong Kong, `FUTUSG` for Singapore. Get it wrong and
nothing fails loudly: moomoo just returns your paper accounts and silently omits the real one.
`SecurityFirm.NONE` auto-detects.

The worker stays on the host rather than in a container: OpenD listens on 127.0.0.1 and is a
desktop app you log into, so it isn't reachable from inside the Docker network. It posts to the
app's published port, which works whether Vantage is running under Docker or under `npm start`.

### The Sync button

Double-click `sync/run_agent.cmd` and leave the window open. **It starts the app too** — Docker
first (detached, so it keeps running on its own), then the agent takes over the window. One
double-click gets you both. The header's **Sync** button then pulls from moomoo on demand — no
terminal, and the toast says what arrived ("2 dividends, 1 cash movement") rather than just
"done".

It brings up devdata if the shared Postgres has never been started, waits until `/api/health`
actually answers before handing the window to the agent, and stops with a plain message naming
what to fix if Docker is not running. Ctrl-C stops the **agent only** — the app is detached and
`restart: unless-stopped`, so it survives the window closing; `docker compose down` stops it.

No `--build` by default, because rebuilding compiles the React app every time and this runs
daily. After changing code, pass it through: `run_agent.cmd --build`. Pending migrations are
applied on every launch regardless, since `up -d` re-runs the one-shot `migrate` service.

That window syncs nothing by itself. It sits on `127.0.0.1:8124` and runs one pull each time the
button asks, which is the whole reason it exists: OpenD is on your machine's loopback and the app
is in a container, so the browser has no way to reach OpenD without something on the host to ask.
The app proxies the click to it (`SYNC_AGENT_URL`, default `http://host.docker.internal:8124`).
Only one sync runs at a time; a second click while one is in flight is refused, not queued.

It exposes exactly one action, and that action is the same read-only sync above — there is no
path through it to an order. If the window is closed or OpenD is down, the button says so and
names the file to start; nothing breaks. The scheduled task is unaffected either way, and you can
run both.

### Where the cash balance comes from

Your wallet balance is read from the broker (`accinfo_query`), not summed from the movement
history — because moomoo's cash-flow ledger leaves trade fees out entirely. Its per-trade rows
equal the deal notional to the cent, so no sum of that ledger reproduces the real balance; on
this account it came out RM 673 and USD 81 short. `cash_movements` is therefore the *history* of
what moved, and the figure on the Wallet screen is the broker's own. If you have never synced,
the app falls back to computing it from your manual entries.

## Schema changes

The schema lives in `db/migrations` and is applied with [dbmate](https://github.com/amacneil/dbmate).
The app checks at boot that migrations have run and refuses to start otherwise, rather than
serving 500s from a half-built database.

```
npm run db:new add_notes_column   # create a migration
npm run db:up                     # apply pending ones
npm run db:status                 # what's applied
npm run db:rollback               # undo the last one
npm run db:schema                 # refresh db/schema.sql (needs dev-postgres up)
```

Under Docker the `migrate` service applies them before the app starts, so
`docker compose up -d --build` is enough.

Two notes. `.env` holds the host connection string as **`VANTAGE_DB_URL`**, not
`DATABASE_URL` — Docker Compose auto-loads `.env` for substitution, so naming it
`DATABASE_URL` would override the container's own connection string and the app would
try to reach Postgres on `127.0.0.1:5433` from inside a container, where nothing is
listening. The npm scripts pass `dbmate --env VANTAGE_DB_URL`. And `db/schema.sql` is
only refreshed by `npm run db:schema`, because `pg_dump` lives in the `dev-postgres`
container rather than on this machine.

## Prices without OpenD

↻ Prices is the fallback for when OpenD is not running — Sync already refreshes quotes. It
fetches from Yahoo Finance for any instrument with a Yahoo symbol (Bursa: stock code + `.KL`, e.g. `5279.KL`; US tickers as-is). The sync worker fills these automatically for synced holdings.

## Locking the app with a PIN

Off by default, which is right while the app is bound to loopback. To turn it on,
put a PIN in `.env`:

```
VANTAGE_PIN=1234
```

then `docker compose up -d` (or restart `npm start`). Every `/api` route then needs
either a session cookie or the PIN as a header; the browser shows a lock screen and
sets a 30-day HttpOnly cookie once you enter it. `/api/health` stays open so the
container healthcheck keeps working, and the React bundle itself is still served to
anyone — it holds no data, and the gate is on the API.

**The sync worker needs the same PIN**, since it has no cookie jar:

```
set VANTAGE_PIN=1234
python sync/moomoo_sync.py
```

For the scheduled task, uncomment the `set VANTAGE_PIN=` line in `sync/run_sync.cmd` — and the
same line in `sync/run_agent.cmd` for the Sync button, which requires the PIN too when one is
set. The app forwards it for you, so the browser never sees it.
Without it the worker exits with a message telling you exactly that, rather than
failing silently.

Ten wrong attempts in fifteen minutes locks out further tries, including correct
ones. Changing the PIN invalidates every existing session.

## Keeping it in sync automatically

`sync/run_sync.cmd` wraps the worker so it runs from the project root and appends to
`sync/sync.log`. A Windows scheduled task named **VantageSync** runs it daily at
18:00:

```
schtasks /Query /TN VantageSync          # check it
schtasks /Run   /TN VantageSync          # run it now
schtasks /Change /TN VantageSync /ST 09:00   # change the time
schtasks /Delete /TN VantageSync /F      # remove it
```

A run with OpenD closed fails harmlessly and says so in the log. The worker must
stay on the host for the reason above, so this is a host task rather than anything
in Docker.

## Backup

```
docker exec dev-postgres pg_dump -U semaisens vantage > vantage-backup.sql
```

Restore into an empty database with `psql -U semaisens -d vantage -f vantage-backup.sql`.

## Layout

The API follows the usual layered split — a request goes route → controller →
service → model, and only the model layer contains SQL:

```
server.js            entry point: check migrations have run, then listen
src/
  app.js               Express assembly — middleware, routes, error handling
  config.js            port, paths, defaults
  db.js                Postgres pool, query + transaction helpers
  routes/              what exists; one router per resource, index.js is the map
  controllers/         HTTP in, HTTP out — no logic
  services/            business logic and validation
  models/              every SQL statement in the app
  middleware/          async wrapper, JSON 404, error handler
  lib/                 small shared helpers
web/                 React + Vite + Tailwind + shadcn/ui source
  src/lib/calc.js      all the math — every figure on screen is derived here,
                       from raw rows; nothing derived is ever stored
  src/lib/format.js    money/date formatting
  src/lib/store.jsx    state, fetching and mutations
  src/screens/*.jsx    the ten screens
  smoke.mjs            headless mount test — every screen and dialog
public/              BUILD OUTPUT — `npm run build` regenerates it, don't hand-edit
db/migrations/       schema, one file per change (dbmate)
db/schema.sql        dump of the current schema, for reading
sync/moomoo_sync.py  OpenD → app sync worker
sync/run_agent.cmd   starts the app AND the sync agent — the daily double-click
sync/run_sync.cmd    scheduled-task wrapper (VantageSync)
design/              static mockups the UI was built from
.env.example         copy to .env
compose.yml          the app container; joins devdata's network for Postgres
Dockerfile           image for the app; builds web/ in its first stage
```
