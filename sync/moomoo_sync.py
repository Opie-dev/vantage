"""
moomoo OpenD → Vantage sync worker.

Prereqs (one-time):
  1. Install OpenD from https://www.moomoo.com/download/OpenAPI and log in with your moomoo ID.
     Default it listens on 127.0.0.1:11111.
  2. pip install moomoo-api requests
  3. Start the Vantage server (npm start in the app folder).

Run:  python moomoo_sync.py
      python moomoo_sync.py --loop 300      # re-sync every 5 minutes
      python moomoo_sync.py --cash-days 120 # first run: backfill dividend history
      python moomoo_sync.py --serve         # sit idle; sync when the app's Sync button asks

It pulls positions, account funds, today's + historical deals, cash flow
(dividends, withholding tax, deposits, FX transfers) and current quotes from OpenD
and POSTs them to the app's /api/ingest/moomoo endpoint. Every synced row carries
its moomoo id, so re-running never duplicates rows.

Read-only by design: every OpenD call here is a *_query / get_* / subscribe. Nothing
places, changes or cancels an order. It also never calls unlock_trade, and moomoo
refuses order placement on a live account until that unlock succeeds — so the trading
path stays shut even if a future edit reached for it by mistake.

--serve exists because the app runs in a container and OpenD does not: the browser
cannot reach 127.0.0.1:11111 through it, so the Sync button asks this listener to do
the run instead. It binds loopback only, exposes exactly one action, and that action
is this same read-only sync — there is no path through it to anything else.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pandas as pd
import requests

try:
    from moomoo import (
        OpenSecTradeContext, OpenQuoteContext, TrdEnv, TrdMarket,
        SecurityFirm, Currency, RET_OK,
    )
except ImportError:
    sys.exit("moomoo-api not installed. Run: pip install moomoo-api")

OPEND_HOST = "127.0.0.1"
OPEND_PORT = 11111
VANTAGE_URL = os.environ.get("VANTAGE_URL", "http://localhost:8123")
# Only needed if the app has a PIN set (VANTAGE_PIN on the server). The worker
# has no cookie jar, so it presents the PIN on every request instead.
VANTAGE_PIN = os.environ.get("VANTAGE_PIN", "")
AUTH = {"X-Vantage-Pin": VANTAGE_PIN} if VANTAGE_PIN else {}
TRD_ENV = TrdEnv.REAL          # switch to TrdEnv.SIMULATE to test with paper trading
SECURITY_FIRM = SecurityFirm.FUTUMY  # entity holding the account; a wrong value silently returns no REAL account

FEE_BATCH = 50  # order ids per order_fee_query call

# Where --serve listens. The app reaches it at host.docker.internal:AGENT_PORT
# from inside its container (see SYNC_AGENT_URL in compose.yml).
AGENT_PORT = 8124

# Called with no start/end, history_deal_list_query returns only a short recent window
# (37 of 124 fills on this account), which silently understates every position. Always
# ask for an explicit range, and split it: moomoo rejects a span wider than 360 days.
DEAL_WINDOW = 350
DEAL_DAYS = 730

# get_acc_cash_flow takes one clearing date per call on a moomoo MY account and allows
# 20 calls per 30s, so a run costs ~1.7s per business day scanned.
#
# CASH_DAYS is the FLOOR, not the window — see cash_window(). It stays this wide
# even on a same-day re-sync because moomoo publishes a clearing date's rows some
# hours after the money moves: a date that returned nothing this morning can have
# your dividend in it tonight, and only a re-scan will find it.
CASH_DAYS = 14
CASH_DELAY = 1.7
# Days re-scanned behind what the app already has, for rows published late.
CASH_OVERLAP = 3
# Ceiling for one automatic run (~2 min of scanning). A longer gap is reported
# rather than silently half-closed; --cash-days overrides this deliberately.
CASH_MAX_DAYS = 120
# 'Others' is the cash leg of a stock trade; the synced deals already account for it,
# so importing it as a cash movement would subtract every purchase twice.
CASH_SKIP = {"Others"}
# 'MSTY 182.31230000 SHARES DIVIDENDS 0.16199967 USD PER SHARE' -> MSTY
CASH_TICKER = re.compile(r"^([A-Z][A-Z0-9.]*)\s+[\d.]+\s+SHARES")

# get_rehab is one call per code and returns the fund's whole declared history,
# so it is cheap but worth pacing — moomoo rate-limits the quote channel.
REHAB_DELAY = 0.4

# moomoo market prefix → (market label, currency) used by the app
MARKETS = {"MY": ("MY", "MYR"), "US": ("US", "USD"), "HK": ("HK", "HKD"), "SG": ("SG", "SGD")}


def num(v):
    """moomoo uses NaN for "not applicable"; JSON has no NaN, so it becomes null."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f != f else f


def code_parts(code):
    """'US.AAPL' -> ('US', 'AAPL'); 'MY.5279' -> ('MY', '5279')"""
    pfx, _, sym = code.partition(".")
    return pfx, sym


def yahoo_symbol(code):
    pfx, sym = code_parts(code)
    return {"US": sym, "MY": f"{sym}.KL", "HK": f"{sym.zfill(4)}.HK", "SG": f"{sym}.SI"}.get(pfx, "")


def deal_fees(trd, deals):
    """deal_id → fee. moomoo bills per order, so an order filled by several deals
    has its fee split across them by notional value."""
    order_ids = list(dict.fromkeys(str(o) for o in deals["order_id"]))
    charged = {}
    for i in range(0, len(order_ids), FEE_BATCH):
        ret, f = trd.order_fee_query(order_id_list=order_ids[i:i + FEE_BATCH], trd_env=TRD_ENV)
        if ret != RET_OK:
            print("order_fee_query failed, fees left at 0:", f)
            return {}
        for _, r in f.iterrows():
            charged[str(r["order_id"])] = float(r["fee_amount"] or 0)

    order_total = {}
    for _, r in deals.iterrows():
        oid = str(r["order_id"])
        order_total[oid] = order_total.get(oid, 0.0) + float(r["qty"]) * float(r["price"])

    fees = {}
    for _, r in deals.iterrows():
        oid = str(r["order_id"])
        total = order_total.get(oid, 0.0)
        share = float(r["qty"]) * float(r["price"]) / total if total else 1.0
        fees[str(r["deal_id"])] = round(charged.get(oid, 0.0) * share, 4)
    return fees


def history_deals(trd, since):
    """Every fill from `since` to today, walked in windows moomoo will accept."""
    frames = []
    start, today = since, dt.date.today()
    while start <= today:
        end = min(start + dt.timedelta(days=DEAL_WINDOW), today)
        ret, d = trd.history_deal_list_query(trd_env=TRD_ENV, start=start.isoformat(),
                                             end=end.isoformat())
        if ret != RET_OK:
            print(f"history_deal_list_query {start}..{end}: {d}")
        elif len(d):
            frames.append(d)
        start = end + dt.timedelta(days=1)
    if not frames:
        return None
    return pd.concat(frames, ignore_index=True).drop_duplicates(subset=["deal_id"])


def cash_window(explicit):
    """How many clearing dates this run should scan.

    A fixed fortnight is wrong in both directions: wasteful on a daily sync, and
    silently LOSSY if nobody synced for three weeks — those dividends fall out of
    the window and are never looked at again. So ask the app how fresh it already
    is and cover the gap, with a few days of overlap for late-published rows.

    An explicit --cash-days always wins; that is what it is for.
    """
    if explicit is not None:
        return explicit
    try:
        r = requests.get(f"{VANTAGE_URL}/api/state", timeout=30, headers=AUTH)
        r.raise_for_status()
        state = r.json()
        seen = [c["date"] for c in state.get("cash", []) if c.get("date")]
        seen += [t["trade_date"] for t in state.get("transactions", [])
                 if t.get("side") == "DIV" and t.get("trade_date")]
    except Exception as e:
        print("could not ask the app how fresh it is, using the default window:", e)
        return CASH_DAYS

    if not seen:
        # Nothing synced yet. Take as much as one run allows and say what is left.
        print(f"no dividends or cash on record — scanning {CASH_MAX_DAYS} days. "
              f"Use --cash-days for a deeper first backfill.")
        return CASH_MAX_DAYS

    newest = max(seen)
    gap = (dt.date.today() - dt.date.fromisoformat(newest)).days + CASH_OVERLAP
    if gap > CASH_MAX_DAYS:
        print(f"last cash movement on record is {newest}, {gap} days back. Scanning "
              f"{CASH_MAX_DAYS}; run --cash-days {gap} once to close the rest.")
    return max(CASH_DAYS, min(gap, CASH_MAX_DAYS))


def cash_flow(trd, days):
    """Dividends, withholding tax, deposits and FX transfers over the last `days`
    business days. Older rows stay in the DB, so a short window is enough once
    backfilled — use --cash-days for the initial pull."""
    rows = []
    today = dt.date.today()
    for i in range(days):
        d = today - dt.timedelta(days=i)
        if d.weekday() >= 5:          # clearing only runs on business days
            continue
        ds = d.isoformat()
        ret, cf = trd.get_acc_cash_flow(trd_env=TRD_ENV, clearing_date=ds)
        if ret != RET_OK:
            print(f"cash flow {ds}: {cf}")
        else:
            for _, r in cf.iterrows():
                kind = str(r["cashflow_type"])
                if kind in CASH_SKIP:
                    continue
                remark = str(r.get("cashflow_remark", "") or "")
                m = CASH_TICKER.match(remark)
                rows.append({
                    "cashflow_id": str(r["cashflow_id"]),
                    "date": ds,
                    "currency": str(r["currency"]),
                    "type": kind,
                    "direction": str(r["cashflow_direction"]),
                    "amount": float(r["cashflow_amount"]),
                    "ticker": m.group(1) if m else "",
                })
        time.sleep(CASH_DELAY)
    return rows


def distributions(quote, codes):
    """Every cash distribution a fund has declared, per share, from get_rehab.

    This is the fund's own schedule, not this account's receipts: it reaches back
    before the first purchase and runs ahead of the account by the gap between an
    ex-date and settlement. Splits and other rehab rows carry no per_cash_div and
    are skipped."""
    rows = []
    for code in codes:
        ret, d = quote.get_rehab(code)
        if ret != RET_OK:
            print(f"get_rehab {code}: {d}")
        else:
            _, sym = code_parts(code)
            for _, r in d.iterrows():
                amt = num(r.get("per_cash_div"))
                ex = str(r.get("ex_div_date") or "")[:10]
                if not amt or amt <= 0 or len(ex) != 10:
                    continue
                rows.append({"ticker": sym, "ex_date": ex, "per_share": amt})
        time.sleep(REHAB_DELAY)
    return rows


def pull(cash_days=None, deals_since=None):
    cash_days = cash_window(cash_days)
    deals_since = deals_since or dt.date.today() - dt.timedelta(days=DEAL_DAYS)
    trd = OpenSecTradeContext(filter_trdmarket=TrdMarket.NONE, host=OPEND_HOST,
                              port=OPEND_PORT, security_firm=SECURITY_FIRM)
    quote = OpenQuoteContext(host=OPEND_HOST, port=OPEND_PORT)
    payload = {"positions": [], "orders": [], "funds": [], "quotes": [], "cash_flows": [],
               "fund_metrics": [], "distributions": []}
    try:
        ret, pos = trd.position_list_query(trd_env=TRD_ENV)
        if ret != RET_OK:
            raise RuntimeError(f"position_list_query: {pos}")
        codes = []
        for _, r in pos.iterrows():
            pfx, sym = code_parts(r["code"])
            mkt, cur = MARKETS.get(pfx, (pfx, "USD"))
            codes.append(r["code"])
            payload["positions"].append({
                "ticker": sym,   # ticker = symbol part of the moomoo code
                "name": r.get("stock_name", ""),
                "market": mkt, "currency": cur,
                "yahoo_symbol": yahoo_symbol(r["code"]),
                "moomoo_code": r["code"],
                "qty": float(r["qty"]),
                "avg_cost": float(r.get("cost_price", 0) or 0),
            })

        # accinfo_query(currency=X) restates the WHOLE account in X, so the `cash` it
        # reports for MYR and for USD is the same money in different clothes — adding
        # the two views together counts it twice. my_cash / us_cash are the genuine
        # per-wallet pockets; market_val / total_assets on the MYR view are the whole
        # portfolio, which is what a snapshot wants.
        views = {}
        for cur in (Currency.MYR, Currency.USD):
            ret, funds = trd.accinfo_query(trd_env=TRD_ENV, currency=cur)
            if ret == RET_OK and len(funds):
                views[cur] = funds.iloc[0]
        if Currency.MYR in views:
            f = views[Currency.MYR]
            payload["funds"] = [{"currency": "MYR", "cash": float(f.get("my_cash", 0) or 0)},
                                {"currency": "USD", "cash": float(f.get("us_cash", 0) or 0)}]
            payload["account"] = {"market_val_rm": float(f.get("market_val", 0) or 0),
                                  "cash_rm": float(f.get("cash", 0) or 0),
                                  "total_rm": float(f.get("total_assets", 0) or 0)}

        deals = history_deals(trd, deals_since)
        if deals is not None:
            fees = deal_fees(trd, deals)
            for _, r in deals.iterrows():
                pfx, sym = code_parts(r["code"])
                mkt, cur = MARKETS.get(pfx, (pfx, "USD"))
                payload["orders"].append({
                    "order_id": str(r["deal_id"]),
                    "ticker": sym, "name": r.get("stock_name", ""),
                    "market": mkt, "currency": cur,
                    "yahoo_symbol": yahoo_symbol(r["code"]),
                    "moomoo_code": r["code"],
                    "side": "BUY" if "BUY" in str(r["trd_side"]).upper() else "SELL",
                    "qty": float(r["qty"]), "price": float(r["price"]),
                    "fees": fees.get(str(r["deal_id"]), 0.0),
                    "trade_date": str(r["create_time"])[:10],
                })

            # The app keeps one USD→MYR rate and had been sitting on its hardcoded
            # default forever. The same account valued both ways gives moomoo's own rate.
            usd = views.get(Currency.USD)
            if usd is not None and float(usd.get("total_assets", 0) or 0):
                payload["fx"] = round(payload["account"]["total_rm"] / float(usd["total_assets"]), 4)

        # Held codes only. The Instruments screen shows what you currently own, so
        # fetching a sold-out fund's schedule would be work nothing reads.
        payload["distributions"] = distributions(quote, codes)

        payload["cash_flows"] = cash_flow(trd, cash_days)

        # Fund facts for the ETFs we hold. get_market_snapshot returns these under
        # trust_* and leaves them NaN for anything that is not a fund, so a plain
        # stock simply contributes nothing rather than a row of zeroes.
        if codes:
            ret, snap = quote.get_market_snapshot(codes)
            if ret != RET_OK:
                print("get_market_snapshot:", snap)
            else:
                for _, r in snap.iterrows():
                    if not bool(r.get("trust_valid", False)):
                        continue
                    _, sym = code_parts(r["code"])
                    payload["fund_metrics"].append({
                        "ticker": sym,
                        "aum": num(r.get("trust_aum")),
                        "nav": num(r.get("trust_netAssetValue")),
                        "outstanding_units": num(r.get("trust_outstanding_units")),
                        "dividend_yield": num(r.get("trust_dividend_yield")),
                        "premium": num(r.get("trust_premium")),
                        "asset_class": None if str(r.get("trust_assetClass")) in ("N/A", "nan") else str(r.get("trust_assetClass")),
                    })

        # live quotes for everything we hold
        if codes:
            quote.subscribe(codes, ["QUOTE"])
            ret, quotes = quote.get_stock_quote(codes)
            if ret == RET_OK:
                for _, r in quotes.iterrows():
                    _, sym = code_parts(r["code"])
                    payload["quotes"].append({"ticker": sym, "price": float(r["last_price"])})
    finally:
        trd.close()
        quote.close()
    return payload


def push(payload):
    """POST the payload to the app and return what it says it stored.

    Raises rather than exits, so --serve can turn a failure into an HTTP error
    for the button instead of taking the whole listener down with it.
    """
    r = requests.post(f"{VANTAGE_URL}/api/ingest/moomoo", json=payload, timeout=60, headers=AUTH)
    if r.status_code == 401:
        raise RuntimeError("app rejected the PIN: set VANTAGE_PIN in this shell to match the server")
    r.raise_for_status()
    j = r.json()
    return {
        "positions": len(payload["positions"]),
        "orders": j.get("ordersAdded", 0),
        "dividends": j.get("dividendsAdded", 0),
        "cash": j.get("cashAdded", 0),
        "quotes": len(payload["quotes"]),
        "fundProfiles": len(payload["fund_metrics"]),
        "distributions": j.get("distributionsAdded", 0),
        "unexplainedCash": j.get("unexplainedCash", []),
    }


def sync_once(cash_days, deals_since):
    """One full pull-and-push. The only thing --serve is allowed to do."""
    return push(pull(cash_days, deals_since))


def summary(c):
    """The one line every run has always printed. Kept identical on purpose."""
    line = (f"synced: {c['positions']} positions, {c['orders']} new orders, "
            f"{c['dividends']} dividends, {c['cash']} cash movements, "
            f"{c['quotes']} quotes, {c['fundProfiles']} fund profiles, "
            f"{c['distributions']} new distributions")
    for m in c.get("unexplainedCash") or []:
        line += (f"\n  note: {m['currency']} cash moved {m['delta']:+.2f} with nothing in the "
                 f"ledger to explain it. moomoo has not published that clearing date yet - "
                 f"sync again later and it will land.")
    return line


def serve(port, cash_days, deals_since):
    """Sit on loopback and run a sync when the app's Sync button posts /run.

    One sync at a time — a second request while one is in flight gets a 409
    rather than two OpenD sessions fighting over the same account.
    """
    lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        server_version = "VantageSyncAgent/1.0"

        def reply(self, code, body):
            raw = json.dumps(body).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def drain(self):
            # Keep-alive framing breaks if the request body is left unread.
            n = int(self.headers.get("Content-Length") or 0)
            if n:
                self.rfile.read(n)

        def authed(self):
            # Mirrors the app's own gate: no PIN configured means no gate.
            return not VANTAGE_PIN or self.headers.get("X-Vantage-Pin") == VANTAGE_PIN

        def do_GET(self):
            if self.path.rstrip("/") in ("", "/health"):
                self.reply(200, {"ok": True, "busy": lock.locked()})
            else:
                self.reply(404, {"error": "not found"})

        def do_POST(self):
            self.drain()
            if self.path.rstrip("/") != "/run":
                return self.reply(404, {"error": "not found"})
            if not self.authed():
                return self.reply(401, {"error": "wrong or missing PIN"})
            if not lock.acquire(blocking=False):
                return self.reply(409, {"error": "a sync is already running"})
            try:
                counts = sync_once(cash_days, deals_since)
                print(summary(counts), flush=True)
                self.reply(200, {"ok": True, "counts": counts})
            except Exception as e:
                print("sync failed:", e, flush=True)
                self.reply(502, {"error": str(e)})
            finally:
                lock.release()

        def log_message(self, *a):
            pass  # the sync's own summary line is the log

    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"sync agent listening on http://127.0.0.1:{port} — the app's Sync button "
          "drives it. Leave this window open; Ctrl-C to stop.", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("sync agent stopped", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--loop", type=int, default=0, help="re-sync every N seconds")
    ap.add_argument("--cash-days", type=int, default=None,
                    help="clearing dates scanned for dividends/cash. Default: enough to "
                         f"cover everything since the app's newest row (min {CASH_DAYS}, "
                         f"max {CASH_MAX_DAYS}). Set it for a deeper backfill.")
    ap.add_argument("--deals-since", type=dt.date.fromisoformat, default=None,
                    help="earliest trade date to pull, YYYY-MM-DD (default: 2 years back)")
    ap.add_argument("--serve", nargs="?", type=int, const=AGENT_PORT, default=None,
                    metavar="PORT",
                    help=f"sync nothing now; listen on 127.0.0.1:PORT (default {AGENT_PORT}) "
                         "so the app's Sync button can trigger a run")
    args = ap.parse_args()

    if args.serve:
        serve(args.serve, args.cash_days, args.deals_since)
        sys.exit(0)

    failed = False
    while True:
        try:
            print(summary(sync_once(args.cash_days, args.deals_since)))
            failed = False
        except Exception as e:
            print("sync failed:", e)
            failed = True
        if not args.loop:
            break
        time.sleep(args.loop)
    # run_sync.cmd logs this exit code; a silent 0 after a failed run would make
    # a broken sync look like a clean one in sync.log.
    sys.exit(1 if failed else 0)
