# Vantage — commitments and income

**Owner:** syaafi · **Date:** 1 Sep 2026 · **Status:** Plan, not yet built
**Scope:** what arrives each month (salary, freelance) and what leaves it (car, house,
rent, cards, subscriptions) — and how those meet the portfolio.
**Reads with:** [personal-assets-plan.md](personal-assets-plan.md), which adds ASB, Tabung
Haji and gold. This plan assumes those tables exist.

---

## 1. What this actually changes

Vantage today answers *"what am I worth, and what does it pay me."* Adding ASB, Tabung Haji
and gold widens that but does not change its shape.

Income and commitments change the shape. The app starts answering a different and more
useful question:

> **How much is actually free to invest, and what is it competing with?**

That question is currently unanswerable, and its absence quietly undermines the feature the
app already has. A goal today says *"at RM 500/month you reach the cap in 37 months"* — but
RM 500 is a number typed into a box with nothing behind it. Nothing checks it against what
you earn, what you already owe, or what the other two goals have claimed. **Once income and
commitments exist, every goal in the app becomes falsifiable.** That is the single biggest
return on this work, and it is why this belongs in Vantage rather than in a separate app.

It also completes net worth. The Dashboard strip in the assets plan shows RM 157,768 and
calls it net worth. With a mortgage in the picture that figure is not net worth, it is
gross assets — and the difference is usually six figures.

---

## 2. The scope line: commitments, not spending

**This tracks money that is known in advance. It does not track spending.**

That boundary is the most important product decision here, and it is worth stating before
any schema. Rent, a car instalment, a mortgage, insurance, a phone plan, Netflix — these are
*predictable*. You enter each one once and it is correct for years. Groceries, petrol,
eating out, a new pair of shoes — these are not predictable, and an app that asks you to
enter them becomes a chore that gets abandoned in three weeks.

So Vantage will know your fixed obligations exactly and your discretionary spending not at
all. The waterfall in §5.4 therefore ends at **uncommitted**, never at "surplus" — the money
below the line is what you have *before* living, not after it. Calling it anything else
would be the app's first lie.

Consequence worth accepting up front: **there is no bank balance in this design.** Modelling
a chequing account would require every transaction to be entered, which is the abandoned-app
path above. If you ever want one, it is a `SAVINGS` asset with no rate — but that is a
different product and it should be a deliberate decision, not a drift.

---

## 3. Four shapes, not one list

"Commitments" is not one thing. Car, house, rent and a credit card behave differently enough
that a single table would need a nullable column for every difference:

| | **Amortising loan** | **Revolving credit** | **Recurring charge** | **Income** |
|---|---|---|---|---|
| Examples | Car (HP), mortgage, personal loan, PTPTN | Credit card, overdraft | Rent, insurance, phone, subscriptions | Salary, freelance |
| Has a balance? | Yes, and it falls predictably | Yes, and it moves however you use it | **No** | No |
| Payment | Fixed instalment | Minimum, or whatever you choose | Fixed amount | — |
| Ends? | On a known date | Never, by design | On notice | — |
| Reduces net worth when paid? | **Partly — it is part transfer** | Partly | **No — it is pure expense** | — |
| Derivable from terms? | Yes | No | Trivially | Partly |

The last two rows are the ones that matter.

**A loan payment is not an expense.** Paying RM 928 on a car loan moves maybe RM 780 from
cash to equity and spends RM 148 on interest. Rent spends all of it. If the app treats both
as "money out" it gets cash flow right and net worth wrong; if it treats both as expense it
gets net worth wrong too. **Every loan payment must be split into principal and interest**,
and only the interest is a cost.

**A loan's whole future is derivable from four fields.** Principal, rate, term, start date —
and today's date gives you the outstanding balance, the instalment, and every remaining
payment. So Vantage should *not* ask you to record 84 car payments. It derives the schedule
and records only deviations. That is the same instinct as everywhere else in this app:
nothing stored that can be computed.

A credit card is the opposite — nothing about it is derivable, because the balance is
whatever you did last month. It needs a current balance you update, and the app should be
honest that it is a snapshot rather than a derivation.

**BNPL sits awkwardly and is worth naming.** A three-instalment Atome or Grab plan is a short
amortising loan by any structural test, but nobody thinks of it as a loan and it is usually too
small to model individually. `RECURRING` with an end date handles it. Two things are worth
knowing if it ever matters: BNPL moved under the **Consumer Credit Commission** in 2026, whose
conduct standards **already prohibit flat rate and Rule of 78** — with no deferral, unlike the
bank-side ban that waits for 2027 — and at least one provider still charges 1.5% of the
*original* amount per instalment, which is flat-rate pricing under another name.

So: **three commitment kinds and one income table.**

---

## 4. Schema

### `income_sources` — who pays you

```sql
CREATE TABLE IF NOT EXISTS income_sources (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  kind        TEXT NOT NULL,              -- EMPLOYMENT | FREELANCE | RENTAL | OTHER
  name        TEXT NOT NULL,              -- 'Day job', 'Design work'
  payer       TEXT DEFAULT '',            -- employer or client
  currency    TEXT NOT NULL DEFAULT 'MYR',
  cadence     TEXT NOT NULL DEFAULT 'MONTHLY',  -- MONTHLY | IRREGULAR
  pay_day     INTEGER,                    -- 1..31, or -1 for last working day; NULL if irregular
  gross_default DOUBLE PRECISION,         -- the expected gross, for forecasting an unrecorded month
  epf_member  BOOLEAN NOT NULL DEFAULT false,  -- drives the statutory block below
  epf_asset_id INTEGER REFERENCES assets(id), -- where contributions land (see §6.4)
  active      BOOLEAN NOT NULL DEFAULT true,
  started_on  TEXT, ended_on TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE income_sources ADD CONSTRAINT income_sources_kind_check
  CHECK (kind IN ('EMPLOYMENT','FREELANCE','RENTAL','OTHER'));
-- A monthly source must say which day it lands; an irregular one cannot.
ALTER TABLE income_sources ADD CONSTRAINT income_sources_shape_check CHECK (
     (cadence = 'MONTHLY'   AND pay_day IS NOT NULL)
  OR (cadence = 'IRREGULAR' AND pay_day IS NULL)
);
```

### `income_events` — what actually arrived

```sql
CREATE TABLE IF NOT EXISTS income_events (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  source_id   INTEGER NOT NULL REFERENCES income_sources(id),
  date        TEXT NOT NULL,              -- YYYY-MM-DD
  gross       DOUBLE PRECISION NOT NULL,

  -- DEDUCTED FROM the employee's pay. net = gross - these.
  epf_employee   DOUBLE PRECISION NOT NULL DEFAULT 0,
  socso_employee DOUBLE PRECISION NOT NULL DEFAULT 0,
  eis_employee   DOUBLE PRECISION NOT NULL DEFAULT 0,
  skbbk          DOUBLE PRECISION NOT NULL DEFAULT 0,  -- LINDUNG 24 JAM, from 1 Jun 2026 (§5.1)
  pcb            DOUBLE PRECISION NOT NULL DEFAULT 0,
  zakat          DOUBLE PRECISION NOT NULL DEFAULT 0,
  other_deducted DOUBLE PRECISION NOT NULL DEFAULT 0,

  -- PAID ON TOP by the employer. NOT part of gross, NOT subtracted from net.
  epf_employer   DOUBLE PRECISION NOT NULL DEFAULT 0,
  socso_employer DOUBLE PRECISION NOT NULL DEFAULT 0,
  eis_employer   DOUBLE PRECISION NOT NULL DEFAULT 0,

  note        TEXT DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'manual'
);

CREATE INDEX IF NOT EXISTS income_events_lookup_idx ON income_events (source_id, date DESC);
```

**The two column groups are the whole point of this table.** Employer EPF is not a
deduction — it never passes through your pay, it is paid alongside it. Netting it out of
gross understates take-home; adding it to gross overstates income. It gets its own group so
neither mistake is available, and so §6.4 can route it into the EPF asset where it actually
lands.

Explicit columns rather than a child `income_deductions` table because the Malaysian
statutory set is small, fixed and known; a generic key/value table would buy flexibility
nobody needs and make every query a pivot. `other_deducted` catches the rest.

### `commitments` — what you owe or must pay

```sql
CREATE TABLE IF NOT EXISTS commitments (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  kind        TEXT NOT NULL,              -- LOAN | REVOLVING | RECURRING
  name        TEXT NOT NULL,              -- 'Myvi', 'House', 'Rent', 'CIMB Visa'
  lender      TEXT DEFAULT '',
  currency    TEXT NOT NULL DEFAULT 'MYR',
  due_day     INTEGER,                    -- 1..31; NULL for a revolving card with no fixed date

  -- LOAN only
  principal    DOUBLE PRECISION,          -- the amount FINANCED, not the purchase price: it
                                          -- includes any MRTA premium rolled into the loan,
                                          -- on which you then pay interest for the full term
  rate         DOUBLE PRECISION,          -- annual, as a percentage
  rate_type    TEXT,                      -- FLAT | REDUCING   (see §5.2 — this is load-bearing)
  term_months  INTEGER,
  started_on   TEXT,
  instalment   DOUBLE PRECISION,          -- the bank's own figure; overrides the derived one

  -- REVOLVING only
  credit_limit   DOUBLE PRECISION,
  balance        DOUBLE PRECISION,        -- a SNAPSHOT you update, not a derivation
  balance_as_of  TEXT,
  apr            DOUBLE PRECISION,
  min_payment_pct DOUBLE PRECISION,

  -- RECURRING only
  amount      DOUBLE PRECISION,
  every_months INTEGER NOT NULL DEFAULT 1, -- 1 monthly, 12 annual, 3 quarterly

  asset_id    INTEGER REFERENCES assets(id),  -- the car/house this loan bought (see §6.3)
  active      BOOLEAN NOT NULL DEFAULT true,
  ended_on    TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE commitments ADD CONSTRAINT commitments_kind_check
  CHECK (kind IN ('LOAN','REVOLVING','RECURRING'));

-- Each kind carries what its math reads. Same guarantee goals_shape_check gives.
ALTER TABLE commitments ADD CONSTRAINT commitments_shape_check CHECK (
     (kind = 'LOAN'      AND principal > 0 AND rate_type IN ('FLAT','REDUCING')
                         AND term_months > 0 AND started_on IS NOT NULL)
  OR (kind = 'REVOLVING' AND apr IS NOT NULL)
  OR (kind = 'RECURRING' AND amount > 0 AND every_months > 0)
);
```

### `commitment_payments` — deviations, not the schedule

```sql
CREATE TABLE IF NOT EXISTS commitment_payments (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  commitment_id INTEGER NOT NULL REFERENCES commitments(id),
  date          TEXT NOT NULL,
  amount        DOUBLE PRECISION NOT NULL,
  extra_principal DOUBLE PRECISION NOT NULL DEFAULT 0,  -- an overpayment, which shortens the loan
  note          TEXT DEFAULT '',
  source        TEXT NOT NULL DEFAULT 'manual'
);
```

Deliberately **not** a full payment history. The schedule is derived (§5.2); this table
exists for the things a schedule cannot know — an extra RM 5,000 against the car, a missed
month, a settlement. An empty table means "everything went to plan", which is the common
case and should cost zero data entry.

### Two additive columns elsewhere

```sql
-- The house and the car, when you want them counted.
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_kind_check;
ALTER TABLE assets ADD CONSTRAINT assets_kind_check
  CHECK (kind IN ('SAVINGS','COMMODITY','ITEM'));

ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS liabilities_rm DOUBLE PRECISION NOT NULL DEFAULT 0;
```

`ITEM` is a single owned thing with a manually-set current value — a house, a car. It needs
no new table: one asset row, one `asset_entries` DEPOSIT for what you paid, and its value
maintained like a gold price. See §6.3 for why tracking it is optional but *asymmetric*.

`snapshots` now has four independent columns and four independent writers — broker
(`value_rm`, `cash_rm`), assets (`assets_rm`), liabilities (`liabilities_rm`) — each
`ON CONFLICT DO UPDATE`-ing only its own. None can clobber another, and no coordination is
needed.

---

## 5. The math

### 5.1 Gross to net

```
net = gross − (epf_employee + socso_employee + eis_employee + skbbk + pcb + zakat + other_deducted)

employer_cost = gross + epf_employer + socso_employer + eis_employer   -- never added to net
```

The waterfall uses `net`. `gross` appears only where it is the honest figure.

Five things about the Malaysian statutory block that a naive model gets wrong:

- **There is a new deduction line.** **SKBBK / LINDUNG 24 JAM** started **1 June 2026** —
  0.75% of wages, **employee-borne with no employer share**, capped at RM 44.65/month. It was
  made voluntary in July, but the opt-out window closed **31 August 2026**, so anyone who did
  not file a declaration is enrolled by default. Any payslip model written before mid-2026 is
  missing this line, and it must appear as its own row rather than folded into SOCSO.
- **None of these are flat percentages.** EPF uses a banded Third Schedule up to RM 20,000
  (contribution computed on the band's upper limit, rounded **up** to the next ringgit); SOCSO
  and EIS use banded tables computed on each band's **midpoint**, rounded up to 5 sen. At the
  RM 6,000 ceiling that fixes the employee side at exactly RM 29.75 SOCSO and RM 11.90 EIS.
- **Employer EPF is 13% at or below RM 5,000 of wages and 12% above it.** The employee side is
  always 11%. Only the employer rate moves.
- **PCB is not computed on take-home.** Its base is gross less EPF — **capped at RM 4,000 a
  year** — less reliefs. SOCSO, EIS and SKBBK do *not* reduce it unless a TP1 is filed claiming
  the RM 350 relief, which is why PCB slightly over-withholds for most people and most filers
  get a small refund.
- **Bonus is EPF-wages; overtime is not.** So is commission and most allowances. That asymmetry
  is why component classification has to be a per-line flag rather than one "is this wages?"
  boolean — a line can be EPF-wages, SOCSO-wages and PCB-taxable independently.

An irregular freelance source has no statutory block, so `net = gross` — but the tax is real
and arrives later. Malaysia bills it in advance through CP500 instalments, which map onto a
`RECURRING` commitment — see §9 for what about that is settled and what is not.

### 5.2 A loan's outstanding balance — and the flat-rate trap

This is the part with real local content, and the part most likely to be got wrong.

**Reducing balance (mortgages, most personal loans).** Standard amortisation:

```
r = annual_rate / 12 / 100
instalment = P · r · (1+r)^n / ((1+r)^n − 1)
balance(k) = P · ((1+r)^n − (1+r)^k) / ((1+r)^n − 1)     after k payments
```

Interest in month k is `balance(k−1) · r`; the rest is principal. Early payments are almost
all interest, which is why a five-year-old 35-year mortgage has barely moved — on a RM 500,000
loan at 4.25%, the very first instalment is 72% interest.

Malaysian mortgages actually accrue on **daily rest** (actual/365 on the outstanding balance),
not monthly rest, so the annuity formula above is an approximation. It is a good one: the
difference measures at about **RM 50 on a RM 500,000 loan over five years**, well inside the
noise for a tracker. It also reproduces banks' published instalments — RM 320,000 over 420
months at 4.50% gives RM 1,514.42 against RHB's printed RM 1,515.

**A rate change now moves the instalment, not the tenure.** This reversed on **1 July 2026**,
when Bank Negara's revised Reference Rate Framework made instalment revision the mandatory
default; the old convention of holding the instalment and quietly extending the tenure is now
the exception, allowed only in a closed list (distressed accounts, a facility near maturity,
the customer explicitly asking, or a change under RM 10 a month — and BNM calls relying on that
last one poor practice). An OPR move must reach the SBR within seven working days and the
instalment within sixty calendar days.

That matters here because **`instalment` is not stable across a loan's life**. Store the bank's
current figure, treat the derived schedule as "if this rate holds", and expect to re-base it
when the OPR moves. Today SBR = OPR = **2.75%**, unchanged since July 2025, and housing spreads
run SBR + 1.25% to + 2.35% — published effective rates of **4.00% to 5.10%**, clustering near
4.50%.

**Flat rate (Malaysian hire purchase — car loans).** Completely different arithmetic, and
the difference is not academic:

```
total_interest = P × flat_rate × years
total_payable  = P + total_interest
instalment     = total_payable / months
```

Interest is charged on the **original** principal for the whole term, no matter how much you
have repaid. So a 3.4% flat rate is nowhere near a 3.4% loan — the true cost is about
**1.8×** the quoted number, because on average you are only holding half the money.

**Use the statutory formula — it exists, and it is a closed form.** The tempting
approximation `flat × 2n/(n+1)` overstates by roughly half a percentage point, enough to move
a loan across a comparison. But there is no need to approximate *or* to solve an IRR: the
Hire-Purchase Act 1967's **Seventh Schedule** already prescribes the conversion, and s4C has
required lenders to disclose it since long before the 2026 reform:

```
F   = 100·C·T / (N·A)                          -- reduces to the quoted flat rate %
APR = 2·N·F·(300·C + N·F) / (2·N²·F + 300·C·(N+1))

  A = amount financed   T = total term charges
  N = total instalments C = instalments per year (12)
```

Checked against an exact IRR it agrees to within 0.015 percentage points across every case
tried, and it reproduces the effective rates lenders publish beside their own flat rates —
CIMB's 4.38% flat → 8.08%, Maybank's 2.30% over nine years → 4.26%, Alliance's 8.38% over
seven → 14.27%. The shortcut reproduces none of them.

Prefer this over a root-find for two reasons beyond convenience: it is the number the law
defines, so it is the number on the customer's own agreement; and it cannot fail to converge.

Worked, for the car in the mockup: RM 78,000 at 3.40% flat over 84 months gives an instalment
of RM 1,149.57 and a statutory APR of **6.27%** — above ASB's 5.75%, where the quoted 3.40%
would have put it comfortably below. That inversion is the whole point.

A useful sanity check: the flat→effective multiplier sits between **1.76× and 1.91×** across
the whole plausible range of rates and tenures, so ~1.85× spots a bad figure at a glance.

**This is the single most useful number this whole feature can surface.** Malaysian car loans
have been quoted flat while savings are quoted effective, and comparing them as though they
were the same unit is the most common expensive mistake in Malaysian personal finance. The
app stores the rate as quoted *and* shows the effective rate beside it — the same instinct as
showing gold's buyback price instead of the friendlier dealer price.

Where a product disclosure sheet already publishes both — and every personal-loan PDS checked
does — **record both rather than recomputing**, and use the derivation only to fill the gap.

There is a second, stronger reason for that preference: **no Malaysian regulator prescribes a
formula for the effective rate.** Bank Negara mandates its *disclosure* — beside any quoted
rate, and in advertising — but defines the term nowhere in its Product Transparency policy
document, and publishes no APR methodology. The Hire-Purchase Act's Seventh Schedule is the
lone statutory formula, and it governs hire purchase only. So two lenders can compute the same
loan's effective rate slightly differently and both be compliant. A number recomputed here may
therefore disagree with the customer's own agreement — which is exactly the wrong argument to
pick with a bank.

### The 2026 hire-purchase reform, and why it makes `rate_type` mandatory

The **Hire-Purchase (Amendment) Act 2026**, in force **1 June 2026**, abolished both the flat
rate and the Rule of 78 for new hire purchase, replacing them with reducing balance priced and
disclosed as an effective rate. New EIR caps are 17% for tenures to five years and 16% beyond;
the old ceiling was 10% *flat*.

Three consequences, and the third is the one that decides the schema:

1. **Existing agreements are not converted.** Bank Negara's own consumer guide: *"changes …
   will only apply to new hire-purchase agreements secured after the … Act 2026 takes effect.
   Existing hire-purchase agreements … will continue to follow the original contractual terms"*
   — with an option for hirer and lender to *mutually agree* to elect the new method. So a car
   loan signed in March 2023 stays on flat rate and Rule of 78 unless both parties opt in.
2. **Early settlement changed shape.** Under the new regime there is no rebate at all, because
   there is nothing to rebate — interest simply stops accruing. Settlement is outstanding
   principal plus interest to that date.
3. **The app cannot infer the method from the start date.** Only eleven providers went live on
   1 June, a second wave followed, and the compliance grace period runs to **31 March 2027** —
   so for roughly ten months both regimes are being written simultaneously. One bank's
   published hire-purchase disclosure sheet still carried the old *"% flat"* template weeks
   after it had announced its own switchover.

**Personal financing is following, on 1 January 2027.** Bank Negara's Personal Financing policy
document (issued 30 September 2025) prohibits computing interest by flat rate *or* Rule of 78 —
but defers that clause to 1 Jan 2027, which is why a lender's current disclosure sheet can still
lawfully quote 8.38% flat with a Rule-of-78 rebate. Already in force from the same document: a
**10-year maximum tenure**, and mandatory disclosure of the effective rate including in adverts.

**But flat rate does not disappear, because koperasi are not BNM's to regulate.** Co-operative
lenders sit under the Suruhanjaya Koperasi Malaysia and the Co-operative Societies Act, and
their personal financing — very common here, repaid by ANGKASA salary deduction — is still
quoted flat with Rule-of-78 settlement, in as many words on a current product sheet. So
`rate_type` is not a transitional field to be retired in 2027. It is permanent.

⚠️ **A naming trap that will corrupt data entry.** BNM's own definitions: **"flat rate"** means
interest on the *original* amount; **"fixed rate"** means a rate that does not change but *is*
computed on the reducing balance. Malaysian marketing routinely says "fixed" when it means flat.
So the entry form must not ask "is this a fixed rate?" — it has to ask what the interest is
computed *on*, and ideally cross-check the answer against the instalment the agreement states.

So `rate_type` is not a cosmetic label and cannot be derived. **It is captured from the
agreement, per loan.** Getting it wrong misstates the balance and the true cost at once, in the
flattering direction.

**One more asymmetry, if the financing is Islamic.** Bank Negara's Ibra' guidelines *require* an
Islamic financier to rebate the full **deferred profit** on early settlement. A conventional
flat-rate loan rebates on Rule of 78, which returns materially less. The same borrower, at the
same banking group, settling the same amount early, pays a different price depending on which
window they walked up to — worth a line wherever a settlement estimate is shown.

One legacy wrinkle worth a line on the card: since 1 June 2026 the industry associations offer
**goodwill discounts** on early settlement of surviving Rule-of-78 agreements, intended to
bring the figure closer to what reducing balance would have given. There is no published
formula and each lender computes its own — so a settlement estimate must be labelled as such
and never presented as a quote.

**Where the derivation breaks**, and what to do about each:

| Reality | Effect | Handling |
|---|---|---|
| Variable mortgage rate moves | Every future figure is wrong — and since 1 Jul 2026 the *instalment* moves too, not the tenure | `rate` is the current rate; label the schedule "if this rate holds" and re-base on an OPR move |
| Flexi / offset loan | Interest accrues on `balance − offset`, so the derived balance is simply wrong — and the **offset is capped**, at 100% (CIMB), 70% (Hong Leong MortgagePlus, Standard Chartered) or just 30% (Hong Leong's semi-flexi) | Out of scope for v1 — flag the loan "not derivable" rather than show a confident wrong number |
| Flexi under-utilisation | Two banks charge **RM 40/month** when the offset account is under-used — CIMB below 70% utilisation, HSBC below 50% for the first five years | A `RECURRING` commitment beside the loan, if it applies; it can quintuple the loan's RM 10 monthly fee |
| Overpayment | Loan ends early | `commitment_payments.extra_principal` |
| Payment holiday / moratorium | Balance is higher than derived | A recorded deviation, or re-baseline the loan |
| Restructuring | Terms no longer match the row | End the old commitment, create a new one |
| Early settlement | The settlement figure is rarely the derived balance | Hire purchase: §5.2. Mortgages: see below — most residential loans have no lock-in at all, and the ones that do use three incompatible formulas |

### 5.3 Revolving credit

Nothing is derived. The card carries a `balance` you update and a `balance_as_of` date, and
the screen shows how stale that is rather than pretending otherwise.

```
minimum_due    = max(balance × min_payment_pct, floor)   -- 5% is BNM-mandated; the RM50 floor is issuer practice
monthly_cost   = balance × apr / 12                      -- only if the balance is carried
```

Malaysia's **tiered card rate survives**, and it is identical at every bank checked — 15% / 17%
/ 18%, banded on payment history, with published conditions worth surfacing because they are
*actionable*: **12 prompt payments in 12 months earns 15%; 10 or 11 earns 17%; nine or fewer
earns 18%.** That is a rate the owner can move by three percentage points through behaviour
alone, which is more than any holding in this app will beat.

`min_payment_pct` barely needs to be a field: **5% or RM 50, whichever is higher** is standardised
across every issuer checked. So is the RM 100-capped late charge and the 20-day interest-free
period. Almost the only thing that genuinely differs between cards is the **cash advance fee**,
and it differs wildly — 5% with an RM 15 or RM 20 floor at some banks, 1.3% with no floor at
another, a flat RM 12.40 at a third. Cash advances also carry no interest-free period anywhere:
18% from the transaction date, always.

The grace period is the part most worth stating on screen, because it is counter-intuitive:
**20 interest-free days apply only if nothing was carried forward.** Carry any balance and the
grace period is lost entirely on *new* spending too, with interest backdated to each
transaction's posting date — so a partially-paid card is charged from the day of purchase, not
from the due date. One issuer puts it bluntly in its own disclosure sheet: pay the minimum and
*"you immediately lose the interest-free period on all new spending."*

A finer point, probably below this app's resolution but worth knowing before anyone tries to
model cost-of-carry exactly: banks backdate differently. Most charge from the posting date, one
from the day after, and one charges only from the due date on a *first* slip, converging with
the rest once a balance is genuinely revolving.

The one thing the app should say loudly: **a carried card balance costs more than any holding
in this app earns.** That is not advice, it is a comparison of two rates the app already knows.

### 5.4 The waterfall — the new headline

```
  net income           Σ income_events.net for the month
                       (+ an average for irregular sources — see §6.8)
− loan instalments     Σ LOAN instalments due
− recurring            Σ RECURRING due this month (annual items amortised /12)
− card minimums        Σ REVOLVING minimum_due
────────────────────
= uncommitted          what exists before you have lived at all
− goal budgets         Σ goals.monthly_budget already claimed
────────────────────
= unclaimed            what is genuinely spare
```

Two subtractions, two different meanings, and the screen must not merge them. **Uncommitted**
is a fact about your obligations. **Unclaimed** is a fact about your intentions — and it can
be negative while uncommitted is healthy, which is exactly the situation worth seeing.

### 5.5 Net worth, completed

```
netWorth(S) → {
  brokerRM,          // portfolio(S).totalRM        — unchanged
  assetsRM,          // Σ assetValueRM               — from the assets plan
  liabilitiesRM,     // Σ outstandingBalance         — new
  totalRM,           // broker + assets − liabilities
  itemsTracked,      // whether the house/car are counted (see §6.3)
}
```

---

## 6. How it all connects

This is the part the rest of the plan exists to serve. Ten connections, in rough order of
how much they change the app.

### 6.1 Goals stop being wishes

`goals.monthly_budget` is currently a number in a box. After this it is a **claim on a
finite, known pool**, and the app can check it:

> Your three goals claim **RM 1,300/month** against **RM 1,240 uncommitted**.
> The Tabung Haji goal cannot be met without changing something.

And the projections built on those budgets become honest. Today the Goals screen says *"at
RM 500/month ≈ 37 months"*. It can now also say *"at your actual unclaimed RM 440, 42
months"* — the app catching an optimistic plan rather than reflecting it back.

This is the highest-value integration in the document and it needs no new UI of its own: it
is a line on a card that already exists.

### 6.2 The waterfall is the missing top of the funnel

The app currently starts at "money is already invested". The waterfall starts one step
earlier, at "money arrived and most of it was already promised". Those two views joined
together are the whole picture, and the join is a single derived figure — **unclaimed** —
that feeds directly into every goal.

### 6.3 Net worth completes, and gets an asymmetry warning

`broker + assets − liabilities` is the true figure. But there is a trap, and the screen must
not walk into it:

**Tracking a mortgage without tracking the house understates net worth by the entire value
of the house.** A RM 420,000 mortgage against an untracked RM 550,000 property does not make
you RM 420,000 poorer; it makes you RM 130,000 richer than the app would say.

So the rule is: **a LOAN with an `asset_id` counts both sides; a LOAN without one counts
only the debt, and the screen says so in words.** Tracking the item is optional — plenty of
people do not want to guess at a house valuation every month — but the consequence of not
doing it must be stated, not silently absorbed. When items are untracked the headline reads
*"net worth excluding property and vehicles"*, which is a different and honest number.

### 6.4 EPF needs no new machinery at all

EPF is a balance that earns an annual dividend computed on contributions through the year.
That is precisely the `SAVINGS` kind from the assets plan — same shape as ASB and Tabung
Haji, no new code.

What is new is that **it is funded by payroll, not by you**. So an `EMPLOYMENT` income event
with `epf_employee` and `epf_employer` set generates a matching `asset_entries` DEPOSIT into
the linked EPF asset, in the same write:

```
income_events row  →  asset_entries DEPOSIT of (epf_employee + epf_employer)
                       into income_sources.epf_asset_id
```

One record, two effects, no double entry and no chance of the two drifting. It also means
the EPF balance grows without any separate maintenance, and the assets plan's
minimum-balance estimator works on it unchanged.

*(Whether EPF's dividend is computed on the same monthly-minimum basis as ASB is a question
for the research in §9 — if it uses a daily aggregate instead, that is what `rate_basis`
exists for.)*

### 6.5 Debt against investment, as arithmetic

Once both sides exist, one table falls out for free — every rate the app knows, converted to
the same unit and sorted:

| | Rate | Note |
|---|---|---|
| Credit card, if carried | ~18% | the only one that is unambiguous |
| Car loan, 3.5% **flat** | **~6.6% effective** | the conversion is the point |
| ASB | 5.75% | |
| Mortgage | ~4% | |
| Tabung Haji | 3.50% | |

The app's job here is the **conversion**, not the recommendation. Presenting a flat rate
next to an effective one would be the same category error the whole feature exists to
prevent. State the rates in one unit, sorted; let the owner draw the conclusion. This is the
same voice the app already uses for buyback prices and undeclared dividends — say the true
thing, do not editorialise on it.

### 6.6 The Calendar becomes a money calendar

The Calendar screen already draws a month grid of dated money events, distinguishing
**declared** (known, solid) from **projected** (estimated, hatched). Commitments and income
are exactly that shape:

- salary on the 25th — known, solid
- car on the 5th, mortgage on the 1st, rent on the 1st — known, solid
- card statement due on the 18th — known date, *unknown amount* until the statement lands
- freelance — neither date nor amount known, projected

So this is a data change, not a new screen: the same component, the same visual grammar,
more sources. And it answers a question the current calendar cannot — *"is there a week this
month where more leaves than arrives?"*

### 6.7 The ASB estimator meets the pay date

The assets plan established that ASB and Tabung Haji pay on the mean of twelve monthly
*minimum* balances, so a deposit never lifts the month it lands in. Knowing when you are
paid sharpens that from a general rule into a specific instruction:

> Your salary lands on the 25th. A transfer on the 25th and a transfer on the 30th are worth
> exactly the same — but one on 1 October is worth a month less. The last deposit that still
> earns four months of this year's distribution is **30 September**.

Neither half of the app can say that alone.

### 6.8 Variable income reuses the grammar that already exists

Freelance income cannot go into a waterfall as a fixed number. But the app already has a
pattern for exactly this: `monthlyIncomeRate()` averages the last three months of dividends,
and the UI draws projected amounts hatched and faded against solid declared ones.

Apply it unchanged. **Salary is solid; freelance is hatched.** The waterfall shows a firm
floor and an estimated band above it, so a good freelance quarter never silently becomes
the baseline you plan against — which is the specific way this goes wrong for people with
irregular income.

### 6.9 Snapshots gain their fourth column

With `liabilities_rm`, the equity curve becomes a net-worth curve, and it will show the one
thing a portfolio curve never can: debt falling. For most people in the first decade of a
mortgage, **the fastest-growing line in their net worth is the loan balance going down**,
not the investments going up. The app currently cannot show that at all.

### 6.10 What must NOT connect

The firewall from the assets plan holds, for the same reason and in the same direction:

- **Salary never becomes a `cash_movements` DEPOSIT.** That table is the moomoo wallet.
- **A commitment payment never becomes a `WITHDRAW`.** Rent does not leave your broker.
- **Neither ever touches `cashBal()`, `positions()` or `income()`.**
- **`income()` stays dividends only.** Salary is not portfolio income and must never enter
  the run-rate, the yield-on-cost, or the income goals. A month with a bonus in it would
  otherwise read as a spectacular month for the ETFs.

One derived figure joins the two worlds — net worth — and one more joins the flows —
unclaimed cash feeding goals. Everything else stays apart.

---

## 7. UI

### 7.1 A new screen: **Money**

The waterfall at the top, drawn as the segmented bar the app already uses for the income
hero: net income as the full width, with committed / claimed / unclaimed as segments, and
the variable freelance portion hatched.

Below it, two lists:

- **Coming in** — one row per source: name, cadence, next date, last amount, and for
  employment a gross→net breakdown on expand.
- **Going out** — grouped by kind. Each loan row shows the instalment, what is left, how
  many months remain, and (for a flat-rate loan) the effective rate beside the quoted one.
  Recurring rows show amount and cadence. The card shows balance, limit, utilisation, and
  how stale the balance is.

### 7.2 Dashboard

The net-worth strip from the assets plan gains a liabilities segment and a real total. One
new figure joins it: **free each month**, which is the number this whole plan produces.

Everything below stays broker-only and unchanged, exactly as before.

### 7.3 Goals

One line per goal card: what it claims, against what is available. And the second projection
from §6.1, shown whenever the claimed budget exceeds what is actually unclaimed.

### 7.4 Calendar

Money in and money out join the existing grid, per §6.6.

### 7.5 The rail is getting long

Ten screens: Dashboard, Positions, Instruments, History, Wallet, Calendar, Goals, Assets,
Money, Settings. The rail is vertical and scrolls, so it fits — but ten undifferentiated
items is a list, not a structure. Worth grouping with hairline separators:

```
Dashboard
── INVEST ──   Positions · Instruments · History · Wallet
── MONEY ──    Money · Assets · Calendar · Goals
── Settings
```

A grouping change to `TABS` and the rail, nothing more.

---

## 8. Phases

1. **Commitments.** The three kinds, the schedule derivation, the Money screen's "going out"
   half. Immediately useful on its own — it answers "what do I owe and when".
2. **Income.** Sources, events, gross→net, the "coming in" half.
3. **The waterfall**, and with it §6.1 — goals validated against real money. This is the
   payoff; phases 1 and 2 are its prerequisites.
4. **Net worth completion.** Liabilities in the Dashboard strip, `ITEM` assets for house and
   car, `liabilities_rm` snapshots and a backfill.
5. **The connections.** Calendar rows, the EPF auto-entry, the rate comparison table.

Phase 3 is the point. Phases 1–2 are worth shipping alone; phase 3 is not reachable without
both.

---

## 9. What is settled, and what is not

The research came back and most of this section's original list is now answered from primary
sources — Bank Negara policy documents, LHDN's own MTD specification, PERKESO's contribution
tables, and banks' product disclosure sheets. What follows is only what remains.

### Settled, and reflected above

| | Finding |
|---|---|
| Distribution basis | Mean of twelve monthly minima, confirmed in ASNB's and Tabung Haji's own wording |
| Flat → effective | The Hire-Purchase Act's **Seventh Schedule** closed form, matching an exact IRR to 0.015pp |
| HP reform | Flat rate and Rule of 78 abolished for **new** agreements from 1 June 2026; existing ones keep their original terms unless both parties elect otherwise |
| Rate changes | Since 1 July 2026 an OPR move revises the **instalment**, not the tenure — reversing the old convention |
| Reference rate | SBR = OPR exactly, **2.75%**, unchanged since July 2025; housing spreads SBR + 1.25% to + 2.35% |
| Mortgage accrual | Daily rest, but the monthly annuity is within ~RM 50 on RM 500k over 5 years |
| Card rates | The tiered 15 / 17 / 18% survives; grace period is lost entirely if any balance is carried |
| Payroll | SOCSO and EIS banded to a RM 6,000 ceiling (PERKESO primary); **SKBBK new from 1 June 2026**; EPF 11% employee, 13% at or below RM 5,000 and 12% above — *EPF is second-hand, KWSP blocks automated access* |
| PCB | Formula and YA2026 bands taken from LHDN's 2026 specification; EPF relief capped at RM 4,000 |
| Freelance tax | CP500 instalments map onto a `RECURRING` commitment — **cadence unverified**, see below |
| Personal financing | Flat rate and Rule of 78 prohibited from **1 Jan 2027**; a 10-year tenure cap is already in force |
| Koperasi | Outside BNM — SKM-regulated, so flat rate and Rule of 78 continue there indefinitely |
| Islamic settlement | Ibra' on the full deferred profit is mandatory — materially better than a Rule-of-78 rebate |
| Effective rate | Its *disclosure* is mandatory; its *computation* is prescribed nowhere except the Hire-Purchase Act's Seventh Schedule |
| Licensed moneylenders | Statutory caps of **12% secured / 18% unsecured**, with default interest capped at 8% simple — a useful upper bound when sanity-checking any rate |
| Stamp duty | 0.5% of the loan, but a first home at or under RM 500,000 is **fully exempt** on both transfer and loan agreement for SPAs to 31 Dec 2027 |

### Early settlement, corrected

The widely-repeated *"3-year lock-in, 2–3% of the original loan"* rule of thumb is **wrong for
Malaysian residential mortgages**, and worth correcting because it is the kind of number that
gets typed into a model once and never revisited. Of the banks whose disclosure sheets were
read directly, **most have no lock-in on residential loans at all** — Hong Leong, Public Bank's
HOME Plan, Bank Islam's Baiti, RHB's Full Flexi and Standard Chartered all state none.

Where a penalty does exist, three incompatible mechanisms are in use:

| | Mechanism |
|---|---|
| HSBC | 36 months, **1.75% × original facility × (months left in lock-in ÷ 36)** — pro-rated, so RM 500k settled at month 24 costs RM 2,917, not RM 8,750 |
| RHB | **5 years, 2% of the *outstanding* amount** — and only on specific products, not the Full Flexi |
| CIMB | Neither: a **clawback of the rate discount enjoyed**, plus RM 500 |

The familiar "2–3% on the approved amount within 3 years" does exist in Public Bank's published
table — under **commercial lending, corporate borrowers only**. It appears to be a commercial
term that migrated into folklore about home loans.

Two things that follow for the model: a settlement estimate cannot be computed from a single
`penalty_pct` field, so it should be **stored as free text from the letter of offer** rather
than derived; and settling via an EPF Account 2 withdrawal counts as early settlement at at
least one bank, which is worth a warning where the app knows about both.

### Genuinely open

- **Realised gain on a partial commodity sale**, carried over from the assets plan.
  `assetContributed()` is cash in minus cash out, which stops matching cost basis the moment
  part of a holding is sold above cost. `positions()` already solves this for the broker; the
  asset version should borrow it and carry a separate realised figure.
- **Flexi and offset loans break the derivation.** Interest accrues on the balance *net of* a
  linked current account, so a derived schedule is simply wrong — and offset caps exist (one
  bank limits it to 75% of the outstanding balance). Better to mark such a loan "not derivable"
  than to show a confident wrong number.
- **Early-settlement quotes are not derived balances**, and the gap runs the lender's way — a
  surviving Rule-of-78 personal loan rebates only ~8% of interest with 29% of the term left.
  See the correction above for mortgages. Show a settlement figure only as an estimate, or not
  at all.
- ~~**Does partial prepayment trigger a penalty?**~~ **Answered: no.** Every disclosure sheet
  read ties the charge to full settlement, redemption or account closure — consistent across six
  banks. Partial prepayment is the designed behaviour of a flexi loan and is not penalised.
- **Joint commitments.** A mortgage split with a spouse is half yours. A `share_pct` would
  handle it but raises whose income is being tracked. Out of scope until asked for.
- **`ITEM` valuations go stale silently.** A house value nobody updates distorts net worth in
  the direction that flatters. Same staleness treatment as a gold price, and probably a prompt
  after some months.
- **The waterfall has to keep restating its own limit.** §2 draws the line, but "unclaimed
  RM 2,675" will read as "RM 2,675 spare" unless the screen keeps saying it is before living
  costs.

### Sourcing caveats worth carrying forward

Not every figure above stands on the same footing, and the difference is worth recording rather
than flattening:

- **Read directly from the primary document:** the PCB formula, YA2026 bands and reliefs (LHDN's
  own 2026 MTD specification, whose worked example the RM 609.20 in the mockup reconciles
  against); the SOCSO/EIS ceiling and employee rates (PERKESO); Bank Negara's Reference Rate
  Framework and credit-card policy document; the Hire-Purchase Act's Seventh Schedule.
- **Corroborated but second-hand:** every EPF figure — KWSP blocks automated access entirely, so
  the contribution rates, the 75/15/10 account split and the dividend history rest on consistent
  secondary sources plus arithmetic self-consistency. SKBBK is similarly supported rather than
  read off PERKESO's own schedule.
- **Retracted by the research that produced it:** the CP500 cadence and revision windows, and
  the self-employment contribution schemes (SESSS plan tables, i-Saraan rates, the Gig Workers
  Act). A research pass flagged its own material there as recollection rather than sourced.
  **Nothing in this plan relies on any of it**, and the one CP500 row above is marked.

The rule this leaves: **before writing a rate into code, open the primary document.** Across
this whole research effort, aggregators and secondary sources were wrong often enough to matter
— one reported a bank's gold spread as 1.2% against an actual 10.0%, another carried a lender's
personal-loan rate a full percentage point stale, and a third published a Kijang Emas price that
does not exist in the API it claims to mirror.

### Known to go stale, and roughly when

- **The OPR decision on 3 September 2026** — two days after this was written. Everything
  priced off SBR = 2.75% needs re-checking after it.
- **The HP transition runs to 31 March 2027.** Until then both interest regimes are being
  written simultaneously, which is exactly why `rate_type` cannot be inferred from a start date
  and must be captured from the agreement.
- **Rates and thresholds are policy.** ASB's cap moved, Tabung Haji dropped a second tier, the
  hajj payment became means-tested, SOCSO's ceiling rose in 2024, SKBBK arrived in 2026 and
  steps up again in 2028 and 2031. All editable columns, none of them constants in code.
- **Every price and rate here is a snapshot of 1 September 2026** and was stale the moment it
  was written.

### Sources worth not re-deriving

Bank Negara's Reference Rate Framework (BNM/RH/PD 028-23) and its Credit Card policy document;
the Hire-Purchase Act 1967 Seventh Schedule and BNM's consumer guide to the 2026 amendment;
LHDN's *Specification for MTD Calculations Using Computerized Calculation for 2026*; PERKESO's
contribution rate tables; ASNB's and Tabung Haji's own distribution FAQs; Bank Negara's Kijang
Emas open API. Where a lender publishes both a flat and an effective rate, take both from the
disclosure sheet rather than recomputing.
