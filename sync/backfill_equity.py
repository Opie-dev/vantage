"""
One-off backfill: reconstruct the Vantage equity curve from historical prices.

The app only ever wrote one snapshot per sync day, so the chart starts empty and grows a
point a day. This walks the whole history instead — holdings, daily closes and cash for
every US trading day since the first fill — and POSTs the series to /api/snapshot, so the
curve is useful the moment you open the Dashboard.

Run:  python sync/backfill_equity.py --dry-run     # print the series, write nothing
      python sync/backfill_equity.py               # reconstruct and write

Prereqs are the same as moomoo_sync.py: OpenD running and logged in on 127.0.0.1:11111,
the Vantage server up, `pip install moomoo-api requests`.

Read-only against the broker, exactly like moomoo_sync.py: the only OpenD calls here are
accinfo_query, history_deal_list_query and request_history_kline. Nothing is ordered,
changed or cancelled, and unlock_trade is never called.

Idempotent: every point is keyed by date and upserted, so re-running rewrites the same
rows with the same values rather than appending. The row count does not move.


How each piece is reconstructed
-------------------------------
holdings  Walk BUY/SELL fills chronologically. Six tickers exist but only three are still
          held — BITO, BCCC and MAXI were bought and fully sold in May 2026, so their qty
          returns to 0 and they stop contributing value from the sell date onward.

prices    Daily closes from request_history_kline with autype=AuType.NONE. NOT QFQ: these
          are high-distribution ETFs, so back-adjusted prices bake every distribution into
          the history and understate what the shares were actually worth on the day. ETCO's
          2025-12-16 close reads 12.1076 under QFQ against 19.512 unadjusted — a 38% haircut
          on that ticker alone. We want the price the market actually paid.
          The last known close is carried forward across gaps (a ticker halted for a day,
          say); snapshots are only emitted for days the market was open, so weekends and
          holidays never appear as flat plateaus.

cash      Anchored to the broker's current cash and walked BACKWARDS, undoing each day's
          movements. Do NOT sum the ledger forwards from zero: moomoo's cash-flow ledger
          omits trade fees entirely and carries no opening balance, so a forward sum is
          provably short — on this account it lands at RM 192.14 in the MYR pocket against
          the broker's RM 865.22 total, i.e. RM 673 adrift, and USD 120.91 against USD
          213.98. Reversing per-day deltas from today's authoritative accinfo_query figure
          is correct because only the *changes* have to be right, and those we do know
          exactly: BUY/SELL/DIV transactions plus DEPOSIT/WITHDRAW/FEE cash rows.

fx        One constant USD→MYR rate for the whole series. There is no historical FX series
          available here, so a constant rate is the honest approximation rather than a
          pretend-precise one — the script says so on every run. By default the rate is the
          one the broker itself is using (accinfo_query in MYR divided by the same figure in
          USD), because that is what the live daily snapshots are already denominated in;
          using anything else would put a step in the curve where the backfill meets them.
          --fx overrides it.
"""
import argparse
import datetime as dt
import os
import sys
import time
from collections import defaultdict

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from moomoo import OpenQuoteContext, OpenSecTradeContext, TrdMarket, Currency, KLType, AuType, RET_OK
except ImportError:
    sys.exit("moomoo-api not installed. Run: pip install moomoo-api")

from moomoo_sync import (OPEND_HOST, OPEND_PORT, VANTAGE_URL, AUTH, TRD_ENV, SECURITY_FIRM,
                         history_deals, code_parts)

# request_history_kline is capped per 30 seconds. Six tickers is nowhere near the limit,
# but a small gap keeps a re-run under it even when a page or two has to be re-requested.
KLINE_DELAY = 1.0
KLINE_PAGE = 1000

# Unadjusted, deliberately. See the module docstring — QFQ would silently rewrite history.
AU_TYPE = AuType.NONE

SNAPSHOT_BATCH = 400   # points per POST; the whole series fits in one, but stay under the 2mb body cap


def fetch_state():
    r = requests.get(f"{VANTAGE_URL}/api/state", timeout=60, headers=AUTH)
    r.raise_for_status()
    return r.json()


def daily_closes(quote, code, start, end):
    """date 'YYYY-MM-DD' -> close, unadjusted, following page_req_key to the end."""
    out, page_key = {}, None
    while True:
        ret, df, page_key = quote.request_history_kline(
            code, start=start.isoformat(), end=end.isoformat(), ktype=KLType.K_DAY,
            autype=AU_TYPE, max_count=KLINE_PAGE, page_req_key=page_key)
        if ret != RET_OK:
            raise RuntimeError(f"request_history_kline {code}: {df}")
        for _, r in df.iterrows():
            out[str(r["time_key"])[:10]] = float(r["close"])
        if not page_key:
            return out
        time.sleep(KLINE_DELAY)


def broker_cash_and_fx(trd):
    """(cash in MYR, implied USD->MYR rate or None). accinfo_query converts the whole
    account into whichever currency you ask for, so the same figures in both give the rate
    the broker is applying today."""
    funds = {}
    for cur, label in ((Currency.MYR, "MYR"), (Currency.USD, "USD")):
        ret, f = trd.accinfo_query(trd_env=TRD_ENV, currency=cur)
        if ret != RET_OK or not len(f):
            raise RuntimeError(f"accinfo_query {label}: {f}")
        row = f.iloc[0]
        funds[label] = {k: float(row.get(k, 0) or 0) for k in ("cash", "market_val", "total_assets")}
    rate = None
    for k in ("total_assets", "market_val", "cash"):   # widest base first, least rounding
        if funds["USD"][k] > 0 and funds["MYR"][k] > 0:
            rate = funds["MYR"][k] / funds["USD"][k]
            break
    return funds["MYR"]["cash"], rate, funds


def transfer_fx_range(cash_rows):
    """(n, min, max) USD->MYR implied by the account's own MYR->USD transfers.

    Not a clean mid-market series — each pair carries moomoo's conversion spread, and there
    are only a couple of dozen of them — so it isn't good enough to *drive* the conversion.
    It is good enough to size the error the constant rate is hiding, which beats claiming
    there is no evidence either way."""
    by = defaultdict(lambda: [0.0, 0.0])
    for c in cash_rows:
        if c["type"] == "WITHDRAW" and c["currency"] == "MYR":
            by[c["date"]][0] += abs(float(c["amount"] or 0))
        elif c["type"] == "DEPOSIT" and c["currency"] == "USD":
            by[c["date"]][1] += abs(float(c["amount"] or 0))
    rates = [out / into for out, into in by.values() if out > 0 and into > 0]
    return (len(rates), min(rates), max(rates)) if rates else (0, 0.0, 0.0)


def holdings_by_day(transactions):
    """date -> {ticker: qty held at the END of that date}, only on dates qty changed."""
    moves = defaultdict(lambda: defaultdict(float))
    for t in transactions:
        if t["side"] == "BUY":
            moves[t["trade_date"]][t["ticker"]] += float(t["qty"])
        elif t["side"] == "SELL":
            moves[t["trade_date"]][t["ticker"]] -= float(t["qty"])
    running, out = defaultdict(float), {}
    for d in sorted(moves):
        for tk, q in moves[d].items():
            running[tk] += q
        # a float walk can leave -1e-13 where a position was closed exactly; that would
        # otherwise show as a sliver of value in a ticker that is provably gone
        out[d] = {tk: q for tk, q in running.items() if abs(q) > 1e-9}
    return out


def cash_deltas(transactions, cash_rows, fx):
    """date -> net change in total account cash on that date, in RM.

    Signs are from the cash balance's point of view. Trades are taken from transactions
    only: the sync worker drops moomoo's 'Others' cash-flow rows (the cash leg of a trade)
    precisely so they aren't counted twice, which also means fees live only on the fill."""
    d = defaultdict(float)
    for t in transactions:
        # every instrument on this account is USD-denominated; a future MY holding would
        # need its own currency lookup here rather than a blanket conversion
        rate = fx
        qty, price, fees = float(t["qty"] or 0), float(t["price"] or 0), float(t["fees"] or 0)
        if t["side"] == "BUY":
            d[t["trade_date"]] -= (qty * price + fees) * rate
        elif t["side"] == "SELL":
            d[t["trade_date"]] += (qty * price - fees) * rate
        elif t["side"] == "DIV":
            d[t["trade_date"]] += float(t["amount"] or 0) * rate
    for c in cash_rows:
        rate = 1.0 if c["currency"] == "MYR" else fx
        amt = abs(float(c["amount"] or 0)) * rate
        d[c["date"]] += amt if c["type"] in ("DEPOSIT", "DIVIDEND") else -amt
    return d


def build_series(state, closes, anchor_cash_rm, fx, start, end, trading_days):
    """[(date, value_rm, cash_rm)] for every trading day in range, oldest first."""
    tx, cash_rows = state["transactions"], state["cash"]

    # --- cash: anchor on today's broker figure and undo each day's movements going back ---
    deltas = cash_deltas(tx, cash_rows, fx)
    cash_on = {}
    bal, day = anchor_cash_rm, end
    while day >= start:
        iso = day.isoformat()
        cash_on[iso] = bal            # balance at the END of `day`
        bal -= deltas.get(iso, 0.0)   # ...which makes bal the end of the previous day
        day -= dt.timedelta(days=1)

    # --- holdings: last change on or before each day ---
    changes = holdings_by_day(tx)
    change_dates = sorted(changes)

    series, held, ci, last_close = [], {}, 0, {}
    for day in trading_days:
        iso = day.isoformat()
        while ci < len(change_dates) and change_dates[ci] <= iso:
            held = changes[change_dates[ci]]
            ci += 1
        for tk, px in closes.items():
            if iso in px:
                last_close[tk] = px[iso]      # carry the last known close forward over gaps
        usd = 0.0
        for tk, q in held.items():
            px = last_close.get(tk)
            if px is None:
                print(f"  warning: no close for {tk} on or before {iso}; valued at 0")
                continue
            usd += q * px
        series.append((iso, round(usd * fx, 4), round(cash_on.get(iso, 0.0), 4)))
    return series


def post(series, batch=SNAPSHOT_BATCH):
    written = 0
    for i in range(0, len(series), batch):
        chunk = [{"date": d, "value_rm": v, "cash_rm": c} for d, v, c in series[i:i + batch]]
        r = requests.post(f"{VANTAGE_URL}/api/snapshot", json=chunk, timeout=120, headers=AUTH)
        if not r.ok:
            raise RuntimeError(f"/api/snapshot {r.status_code}: {r.text}")
        written += r.json().get("written", len(chunk))
    return written


def check_deals(trd, state, start):
    """Cross-check the app's fills against the broker's own history. The reconstruction is
    only as good as the transaction table, so a silent gap there would bend the whole curve."""
    deals = history_deals(trd, start)
    if deals is None or not len(deals):
        print("  deal cross-check: broker returned no fills, skipped")
        return
    broker = defaultdict(float)
    for _, r in deals.iterrows():
        _, sym = code_parts(r["code"])
        sign = 1 if "BUY" in str(r["trd_side"]).upper() else -1
        broker[sym] += sign * float(r["qty"])
    app = defaultdict(float)
    for t in state["transactions"]:
        if t["side"] == "BUY":
            app[t["ticker"]] += float(t["qty"])
        elif t["side"] == "SELL":
            app[t["ticker"]] -= float(t["qty"])
    bad = [tk for tk in set(broker) | set(app) if abs(broker.get(tk, 0) - app.get(tk, 0)) > 1e-6]
    if bad:
        print(f"  deal cross-check: MISMATCH on {', '.join(sorted(bad))} — "
              f"broker { {t: round(broker.get(t, 0), 4) for t in sorted(bad)} } vs "
              f"app { {t: round(app.get(t, 0), 4) for t in sorted(bad)} }. Re-run moomoo_sync.py.")
    else:
        print(f"  deal cross-check: OK, {len(deals)} broker fills agree with the app on all "
              f"{len(app)} tickers")


def main():
    ap = argparse.ArgumentParser(description="Backfill the Vantage equity curve from historical prices.")
    ap.add_argument("--dry-run", action="store_true", help="print the series, write nothing")
    ap.add_argument("--start", type=dt.date.fromisoformat, default=None,
                    help="first date, YYYY-MM-DD (default: date of the earliest fill)")
    ap.add_argument("--end", type=dt.date.fromisoformat, default=dt.date.today(),
                    help="last date, YYYY-MM-DD (default: today)")
    ap.add_argument("--fx", type=float, default=None,
                    help="USD->MYR rate (default: the rate the broker is using today)")
    ap.add_argument("--overwrite-today", action="store_true",
                    help="also rewrite today's snapshot; off by default because the sync worker "
                         "writes it straight from the broker and that beats any reconstruction")
    ap.add_argument("--no-check-deals", action="store_true",
                    help="skip cross-checking the app's fills against the broker's history")
    args = ap.parse_args()

    state = fetch_state()
    tx = state["transactions"]
    if not tx:
        sys.exit("no transactions in the app — run moomoo_sync.py first")
    start = args.start or dt.date.fromisoformat(min(t["trade_date"] for t in tx))
    end = args.end
    if end < start:
        sys.exit(f"--end {end} is before the first fill {start}")

    instruments = {i["ticker"]: i for i in state["instruments"]}
    codes = {tk: (i.get("moomoo_code") or f"US.{tk}") for tk, i in instruments.items()}

    trd = OpenSecTradeContext(filter_trdmarket=TrdMarket.NONE, host=OPEND_HOST,
                              port=OPEND_PORT, security_firm=SECURITY_FIRM)
    quote = OpenQuoteContext(host=OPEND_HOST, port=OPEND_PORT)
    try:
        anchor_cash, implied_fx, funds = broker_cash_and_fx(trd)
        if not args.no_check_deals:
            check_deals(trd, state, start)

        state_fx = float(state.get("fx") or 0)
        if args.fx:
            fx, fx_src = args.fx, "--fx"
        elif implied_fx:
            fx, fx_src = implied_fx, "the broker's own rate today (accinfo MYR / accinfo USD)"
        else:
            fx, fx_src = state_fx, "the app's stored fx"
        if not fx:
            sys.exit("no usable USD->MYR rate; pass --fx")

        print(f"fx: {fx:.5f} USD->MYR, from {fx_src}.")
        print("    NOTE: applied as a CONSTANT across the whole series. There is no historical "
              "FX feed here,\n          so every point is priced at today's rate — the moves you "
              "see are price moves, not currency moves.")
        n, lo, hi = transfer_fx_range(state["cash"])
        if n:
            worst = max(abs(lo / fx - 1), abs(hi / fx - 1)) * 100
            print(f"          Size of that approximation: this account's own {n} MYR->USD transfers "
                  f"cleared between\n          {lo:.4f} and {hi:.4f}, so an individual historical "
                  f"point can be off by up to ~{worst:.1f}% on the FX leg alone.")
        if state_fx and abs(state_fx - fx) / fx > 0.01:
            print(f"    the app's stored fx is {state_fx:.5f}, {(state_fx / fx - 1) * 100:+.1f}% off "
                  f"this rate — worth updating in Settings.")

        print(f"fetching daily closes (autype=NONE, unadjusted — NOT QFQ) for {len(codes)} tickers "
              f"{start}..{end}")
        closes = {}
        for n, (tk, code) in enumerate(sorted(codes.items())):
            closes[tk] = daily_closes(quote, code, start, end)
            got = closes[tk]
            print(f"  {tk:6} {len(got):4} sessions" +
                  (f"  {min(got)} .. {max(got)}" if got else "  (none)"))
            if n < len(codes) - 1:
                time.sleep(KLINE_DELAY)
    finally:
        trd.close()
        quote.close()

    # The market calendar is whatever days the broker actually returned bars for. All six
    # are US-listed and share it; taking the union means one halted ticker can't drop a day.
    trading_days = sorted({dt.date.fromisoformat(d) for px in closes.values() for d in px
                           if start <= dt.date.fromisoformat(d) <= end})
    if not trading_days:
        sys.exit("no kline data in range — is OpenD logged in?")

    series = build_series(state, closes, anchor_cash, fx, start, end, trading_days)

    todayISO = dt.date.today().isoformat()
    if not args.overwrite_today:
        keep = [p for p in series if p[0] != todayISO]
        if len(keep) != len(series):
            print(f"skipping {todayISO}: leaving the sync worker's broker-sourced snapshot in "
                  f"place (--overwrite-today to replace it)")
        series = keep
    if not series:
        sys.exit("nothing to write")

    if args.dry_run:
        print("\ndate         value_rm      cash_rm        total_rm")
        for d, v, c in series:
            print(f"{d}  {v:11,.2f}  {c:10,.2f}  {v + c:14,.2f}")

    d0, v0, c0 = series[0]
    d1, v1, c1 = series[-1]
    print(f"\n{len(series)} points, {d0} .. {d1} (US trading days only — no weekend/holiday "
          f"plateaus; cash moves on a closed day land on the next session)")
    print(f"  first  {d0}  value RM {v0:,.2f} + cash RM {c0:,.2f} = RM {v0 + c0:,.2f}")
    print(f"  last   {d1}  value RM {v1:,.2f} + cash RM {c1:,.2f} = RM {v1 + c1:,.2f}")
    print(f"  broker now       value RM {funds['MYR']['market_val']:,.2f} + cash RM "
          f"{funds['MYR']['cash']:,.2f} = RM {funds['MYR']['total_assets']:,.2f}")
    neg = [p for p in series if p[1] + p[2] < 0]
    if neg:
        print(f"  WARNING: {len(neg)} point(s) go negative, first {neg[0][0]}")

    if args.dry_run:
        print("\ndry run — nothing written.")
    else:
        print(f"\nwrote {post(series)} snapshots to {VANTAGE_URL}/api/snapshot")


if __name__ == "__main__":
    main()
