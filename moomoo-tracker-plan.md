# Moomoo Investment Tracker — Project Plan

**Owner:** syaafi · **Date:** 30 Aug 2026 · **Status:** Planning
**Decisions so far:** full-stack app · single user (just you) · auto-fetched prices · **moomoo OpenAPI sync from day one** (manual entry + CSV kept as fallback) · markets: Malaysia (MYR) + US (USD)

---

## 1. What we're building

A personal web app to track everything you do in moomoo:

- **Positions** — every holding: quantity, average cost, current price, market value, unrealized P&L (RM and %).
- **Portfolio dashboard** — total value, cash + invested split, allocation pie, equity curve over time, daily change.
- **History** — every buy/sell/dividend/fee, filterable and searchable, with realized P&L per closed trade.
- **Wallet / cash** — deposits, withdrawals, cash balance over time, how much buying power is left.
- **Calendar view** — a month grid showing which days you bought/sold and how much; click a day to see its transactions.
- **Goals** — e.g. "own 1,000 ETCO shares": shows current shares, shares remaining, capital needed at current price, % progress, and (optionally) a target date with the monthly investment needed to hit it.

## 2. How data gets in

| Layer | How | When |
|---|---|---|
| 1. moomoo OpenAPI (primary) | Run the **OpenD** gateway on your PC, logged in with your moomoo ID; a sync worker (Python + `moomoo-api` SDK) pulls positions, account funds, and order/deal history, and writes them into the DB | Auto-sync whenever OpenD is running; "Sync now" button + scheduled sync |
| 2. Manual entry | Add a transaction form (ticker, side, qty, price, fees, date) | Fallback for days OpenD isn't running, corrections, and anything the API misses (e.g. old history) |
| 3. CSV import | Export trade history / statements from moomoo app, upload, map columns, dedupe | One-time backfill of history older than the API returns |
| Prices | moomoo quotes via OpenD when connected; Yahoo Finance (free, unofficial) as fallback; manual override always possible | Refreshed on load + every few minutes |

Note on moomoo API: it's official ([openapi.moomoo.com](https://openapi.moomoo.com/moomoo-api-doc/en/)), supports MY/US/HK/SG markets. Two practical constraints to design around: it only works while OpenD is running and logged in on some machine, and historical order lookback is limited — so the DB is the source of truth (the API feeds it), and every synced row is tagged `source=api` so manual rows are never overwritten.

## 3. Architecture (full-stack, single user)

```
Browser (React SPA)
   │  REST/JSON
Backend (Node.js + Express  — or FastAPI if you prefer Python)
   │
SQLite database (one file, easy backup — upgrade to Postgres only if ever needed)
   │
Side jobs:  price-fetcher (Yahoo)   ·   moomoo-sync worker (Python + moomoo-api SDK → OpenD)
```

- **Frontend:** React + Vite, Tailwind CSS, Recharts for charts. Single-page app with the 6 sections above.
- **Backend:** small REST API; since it's just you, auth is a single PIN/password (no user-accounts system).
- **Database:** SQLite via Prisma/Drizzle ORM. Whole DB is one file you can copy to back up.
- **Hosting options:** run locally (free, `npm start`), or deploy to a small VPS / Railway / Fly.io if you want access from your phone. The moomoo sync worker must run where OpenD runs (your PC).

## 4. Data model (core tables)

- `instruments` — ticker, market (MY/US/HK/SG), name, currency.
- `transactions` — instrument, side (BUY/SELL/DIV/FEE), qty, price, fees, trade date, source (manual/csv/api).
- `cash_movements` — DEPOSIT / WITHDRAW / DIVIDEND / FEE, amount, currency, date.
- `prices` — instrument, price, fetched_at (cache of latest + daily closes for the equity curve).
- `goals` — instrument, target_qty, optional target_date, optional monthly_budget, created_at.
- `snapshots` — daily portfolio value + cash (powers the equity curve).

Positions are **derived** from transactions (sum of buys − sells, weighted avg cost) — never stored, so they can't drift out of sync.

## 5. Goal math (the "1k ETCO" feature)

For a goal of `target_qty` shares:

- shares remaining = `target_qty − current_qty`
- capital needed = `shares remaining × current price` (+ estimated fees)
- progress % = `current_qty / target_qty`
- if a target date is set: months left → `capital needed / months left` = required monthly investment
- if a monthly budget is set instead: projected completion date, assuming price stays flat (shown with a "price will move" caveat)

## 6. Build phases

1. **Phase 1 — OpenD + sync core (1–2 weekends):** install OpenD, get the Python `moomoo-api` SDK talking to it (paper account first), DB schema, sync worker that pulls positions / funds / order history into SQLite, tagged `source=api`.
2. **Phase 2 — Web app core:** React scaffold, portfolio dashboard + positions from the synced DB, quotes via OpenD with Yahoo fallback, MYR/USD shown per market.
3. **Phase 3 — History + Calendar:** filterable history, realized P&L, calendar month view of buy/sell days.
4. **Phase 4 — Goals:** goal CRUD + the capital/progress calculator + goal cards on dashboard.
5. **Phase 5 — Manual entry + CSV import:** fallback transaction form, moomoo statement parser with column mapping and dedupe against synced rows.
6. **Phase 6 — Polish:** daily snapshots + equity curve, FX rate table for a combined-MYR total, backups, PIN lock, deploy choice (local vs small VPS — the sync worker stays on the PC with OpenD either way).

## 7. Risks / notes

- OpenD must run on a logged-in machine — the app must degrade gracefully (show last-synced data + "last sync" timestamp) when it's off, with manual entry as the escape hatch.
- moomoo API historical-order lookback is limited — backfill older history once via CSV; from then on the DB accumulates everything.
- Market-data entitlements: check your moomoo account has quote rights for MY and US via OpenAPI (varies by account/region).
- Yahoo Finance API is unofficial — keep the manual price override as a fallback.
- Multi-currency: US holdings in USD vs wallet in MYR — Phase 6 adds an FX rate table for a combined total; before that, each market is shown in its own currency.
- moomoo CSV export format may change — the importer uses a column-mapping step rather than hard-coded columns.

## 8. Mockups

Interactive mockup built with **3 design options** (switchable in the top bar) covering all 6 screens with sample data — pick one and Phase 1 starts from that design.
