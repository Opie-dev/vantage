# Vantage — expenses

Companion to `commitments-and-income-plan.md`, and an answer to the one paragraph in it that
was left deliberately open.

---

## 1. The scope line this has to get past

`commitments-and-income-plan.md` §2 does not merely omit spending. It argues against it:

> **This tracks money that is known in advance. It does not track spending.**
> … Groceries, petrol, eating out, a new pair of shoes — these are not predictable, and an
> app that asks you to enter them becomes a chore that gets abandoned in three weeks.

And it names the consequence:

> **there is no bank balance in this design.** Modelling a chequing account would require
> every transaction to be entered, which is the abandoned-app path above. If you ever want
> one, it is a `SAVINGS` asset with no rate — but that is a different product and it should
> be **a deliberate decision, not a drift**.

That argument is still correct, and this plan does not overturn it. **Nothing here asks you
to record a purchase.** What it does is take the escape hatch that paragraph already
identified and make it load-bearing.

The gap is real, and the app already admits it out loud. `Money.jsx` prints the headline as
*"Unclaimed this month · **before living costs**"*. That parenthetical is the whole feature:
the app knows what comes in and what is owed, then stops one step short of the number the
owner actually wants.

Concretely, on today's data: RM 12,000 comes in, RM 1,894.07 is committed, and
**RM 10,105.93 a month goes somewhere the app cannot see.** That is not a rounding error. It
is the largest single flow in the system and it is unmodelled.

---

## 2. Four ways to do this, and why three are wrong

**(a) A transaction log.** Every purchase entered, by hand or by import. Rejected by §2, and
the rejection holds — but it is worth being precise about *why*, because "it is a chore" is
only half of it. Malaysia has no open-banking mandate, so there is no Plaid to lean on; the
entry would be manual forever, not manual until an integration lands. A feature whose
accuracy depends on daily diligence will be accurate for a fortnight and then quietly wrong,
which is worse than absent — an abandoned expense log makes the waterfall look *better* than
reality.

**(b) One monthly living-costs figure, typed in.** Cheap and honest, and it would work. But
it is a number the owner has to *know*, and the only way to know it is (a). It moves the
problem rather than solving it.

**(c) Category envelopes with budgets.** Useful for intent, useless for fact. A budget says
what you meant to spend. This plan is about what you did.

**(d) Spending as a residual — infer it, do not record it.** Every ringgit that arrives
either goes to an obligation, moves somewhere the app can see, or is spent. The first two are
already modelled exactly. So the third is the remainder:

```
spending = income − commitments − (money moved into things the app tracks)
```

This is the same instinct as the rest of the app. `loanSchedule()` does not store 84
payments, it derives them. `assetBalance()` does not store a balance, it sums a ledger.
Spending is the last flow still being asked for rather than computed, and it does not need to
be. **(d) is the design.**

---

## 3. What makes a residual honest — and the one number it needs

A residual is only as trustworthy as the completeness of the destinations it subtracts. The
identity for a month is:

```
  net income received
+ distributions received in cash
− commitment payments
− net moved into savings, EPF, ASB, Tabung Haji
− net moved into the broker
────────────────────────────────
= change in what you hold liquid   +   what you spent
```

Those last two terms are stuck together, and **that is the whole difficulty**. If RM 10,106
is uncommitted and none of it moves anywhere tracked, the residual is RM 10,106 — but the app
cannot tell whether that was spent or is sitting in a bank account. Reporting it as spending
would be a lie in the app's least forgivable direction: it would make the owner look poorer
and more profligate than they are.

**So the residual needs exactly one number: what you hold liquid.** Not a transaction log — a
balance, typed in when convenient. Update it monthly and the residual is your monthly spend.
Update it quarterly and you get a quarterly figure. Never update it and the app says so
rather than guessing.

This is precisely the escape hatch §2 describes — "a `SAVINGS` asset with no rate" — and the
machinery already exists. **Tabung Kawin is already such an account**: `rate_basis = NONE`, a
cash pot with no declaration. Nothing new is needed to hold the number.

What *is* needed is for the app to know that a bank account is a different kind of thing from
ASB.

---

## 4. Schema — one column

The distinction that matters is not the asset's *class* (`kind`, already `SAVINGS` |
`COMMODITY` | `ITEM`) but its **reachability**. Those are different axes and both are real.

```sql
ALTER TABLE assets ADD COLUMN IF NOT EXISTS liquidity TEXT NOT NULL DEFAULT 'SAVINGS';

ALTER TABLE assets ADD CONSTRAINT assets_liquidity_check
  CHECK (liquidity IN ('WALLET','SAVINGS','LOCKED'));
```

| Value | Meaning | Effect on the residual | Examples |
|---|---|---|---|
| `WALLET` | Where money sits between arriving and being spent. | A change in it is **not** a contribution — it is your pocket moving. Closes the residual. | Chequing account, e-wallet, cash |
| `SAVINGS` | A destination. Reachable with notice or penalty. | Money in is money **out of pocket**. Subtracted. | ASB, Tabung Haji, EPF Akaun Sejahtera |
| `LOCKED` | Cannot be reached before a condition is met. | Subtracted identically, but never counted as reachable. | EPF Akaun Persaraan (age 55) |

**`SAVINGS` is the default on purpose.** It is what every existing row is, so the migration
changes no behaviour: with no `WALLET` account the residual is simply not computable, and the
app says that instead of inventing a figure. The feature switches itself on the day the owner
adds a bank balance.

This column also closes a gap found independently of expenses. The app currently treats Akaun
Persaraan (locked to 55), Akaun Sejahtera (housing, education, health, hajj only) and Akaun
Fleksibel (any purpose, any time, RM 50 minimum) as identical `SAVINGS` assets. Of
RM 69,966.93 in EPF, **RM 161.55 is actually reachable**. One column serves both features,
which is a reason to prefer it over a boolean `is_wallet`.

### What is deliberately NOT added

- **No `expenses` table.** There is nothing to put in it that is not derivable.
- **No categories.** A residual has no category and cannot be given one honestly. Categories
  require (a), and (a) is rejected.
- **No `bank_transactions`.** Same reason, at greater length.

---

## 5. The math

A new section in `calc.js`, beside the waterfall it extends.

```
spendingFor(S, year, monthIndex) → {
  inflowRM,        // income_events net + cash distributions actually received
  committedRM,     // commitment payments for the month (schedule + deviations)
  savedRM,         // net into SAVINGS and LOCKED assets, and into the broker
  walletDeltaRM,   // change in WALLET balances across the month  (null if none)
  spentRM,         // inflow − committed − saved − walletDelta    (null if unknowable)
  basis,           // 'RESIDUAL' | 'UNKNOWN'
  coverage,        // the dates bounding the wallet readings used
}
```

Four properties this must have, each of which is a way it could go wrong:

**1. `spentRM` is `null`, never a guess.** With no `WALLET` account, or with no reading
bracketing the month, the answer is unknown. `basis: 'UNKNOWN'` and the screen says *"add a
bank balance to see this"*. The app has an established pattern here — `returnPct` is `null`
rather than 0 when there is nothing to divide by, and the tile renders `—`.

**2. Payroll and opening balances are already excluded, and must stay so.** `moneyByDay()`
skips `source = 'payroll'` (EPF that never reached your pocket) and `source = 'opening'` (a
balance that predates the ledger). The residual must reuse **that same filter**, not
re-implement it. An opening balance leaking in would read as RM 96,242.85 of spending in one
month — the identical bug that *Stop counting opening balances as this month's spending*
fixed for the calendar.

**3. A wallet reading is a point, not a period.** Balances are recorded on the days the owner
happens to type them. A month with no reading at either end cannot be closed, and one with
readings 40 days apart gives a 40-day figure, not a monthly one. `coverage` carries the actual
dates so the screen can say *"RM 3,120 over 38 days"* rather than silently annualising. This
is the same discipline `backfill_equity.py` applies to its constant-FX approximation: state
the shape of the estimate on every use.

**4. Interest, not instalment.** §3 of the commitments plan is emphatic that a loan payment is
part transfer and part cost. For cash flow the whole instalment leaves, so the residual
subtracts all of it — correct here. But a future "what did this month cost me" figure must use
interest only, and the two must not be confused. `loanSchedule()` already splits them.

**And note which "committed" figure.** `waterfall().committedRM` is a monthly **run rate** —
RM 1,894.07 today, with annual items amortised and card minimums included. The money calendar
for the same month sums the payments actually falling in it: RM 1,402.88. Both are right and
they answer different questions. The residual must use the second, because it is reconciling
against a real change in a real balance, and a run rate would leave a phantom RM 491.19 of
spending every month.

---

## 6. Where it appears

**The waterfall gains its missing line.** It currently ends at a figure the app itself labels
"before living costs":

```
= uncommitted          RM 10,105.93    what exists before you have lived
− living costs         RM  ?           the residual
────────────────────
= what actually stayed
```

That last line is the number this whole plan exists for, and it is the first time the app
could answer *"where did the money go"*.

**Nothing else changes shape.** Not the calendar — a residual has no day, and putting it on
one would be inventing a date, the same reason irregular income surfaces in the month note
instead of on the grid. Not the donut, not net worth: a `WALLET` asset already counts as an
asset, correctly, and always did.

**One new small thing:** an "add a reading" affordance on a `WALLET` account card, because the
value of this feature is proportional to how easily that one number gets updated. If it takes
four taps it will not happen. The existing Entry form is already two.

---

## 7. Phases

1. **`liquidity`.** The column, the CHECK, the form control, and tagging the seven existing
   accounts. Ship-able alone: it fixes the EPF reachability gap and shows what is actually
   within reach, with no residual math at all.
2. **The residual.** `spendingFor()`, the waterfall line, the `UNKNOWN` state. This is the
   feature.
3. **Coverage honesty.** The date-bounding, the "over 38 days" phrasing, the nudge when a
   reading is stale. Phase 2 is usable without it and misleading without it, so this is not
   really optional.
4. **Optional and last: a monthly target.** Not a budget by category — one figure, compared
   against the residual, so the owner can see whether living cost more than intended. This is
   the only part of the "categories" idea worth keeping, and it works because it compares an
   intention against a *fact* rather than against another intention.

Phases 1–3 are the feature. Phase 4 is a nicety and should not be built until 2 has run for a
few months.

---

## 8. Settled, and not

**Settled.** The residual identity is arithmetic, not a modelling choice. The `WALLET`
distinction is required by it. Payroll and opening exclusions already exist and are already
covered by the smoke test.

**Genuinely unresolved, and worth deciding before phase 2:**

- **Cash withdrawn from a wallet.** Taking RM 500 out of an ATM moves it from a tracked
  balance to an untracked pocket, so the residual books it as spent on the day of withdrawal
  rather than when it was used. Defensible — most of it will be — but it makes weekly figures
  lumpy in a way monthly ones are not. No fix that does not require (a).
- **Transfers between two `WALLET` accounts** must net to zero, and will, since the residual
  reads the *sum* of wallet balances rather than each one. Worth an explicit test, because
  getting it wrong would show a phantom spend and an equal phantom saving.
- **A credit card is spending on one date and a payment on another.** `REVOLVING` holds a
  balance you update, so a card-funded purchase does not touch the wallet until the bill is
  paid. The residual will therefore lag real spending by up to a month. Naming it is probably
  enough; modelling it is not worth it.
- **Whether `LOCKED` should be a `liquidity` value or a date.** "Locked until 55" is a
  condition, not a category, and Akaun Sejahtera is locked *for some purposes*. Three values
  may be too few. Start with three and see.

**Standing risk.** The whole feature degrades to nothing if the wallet reading is not kept up.
That is acceptable — it degrades to `null` and says so, which is the app's existing habit —
but it means this feature's accuracy is a habit, not a guarantee, and the UI should never
present a residual without the date it was last anchored to.
