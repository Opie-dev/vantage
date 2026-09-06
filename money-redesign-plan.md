# Vantage — the Money redesign

Companion to `commitments-and-income-plan.md`, `cards-plan.md` and `expenses-plan.md`, and a
review of the design canvas that draws all three at once.

The canvas is a single interactive artboard: a rail of six pages — Overview, Income,
Commitments, Credit cards, Loans, Expenses — an Overview drawn two ways, a page-filtered money
calendar on four of the six, two full-screen overlays (statement Import, Add instalment plan),
and eight edit sheets. It is the first drawing of the whole feature set as one product rather
than three plans.

This document does two things: it records where the canvas does not add up, and it phases the
work of building it.

---

## 1. The canvas is right about the hard parts

Worth saying first, because the corrections below are all small by comparison. The figures that
carry an argument were re-derived and they hold:

| Claim | Check |
|---|---|
| Net pay RM 9,984.50 | 12,000 − (EPF 11% 1,320 + SOCSO 29.75 + EIS 11.90 + SKBBK 44.65 + PCB 609.20 = 2,015.50) |
| Employer cost RM 13,594.10 | 12,000 + (1,440 + 104.15 + 49.95) |
| EPF deposit RM 2,760.00 | employee 1,320 + employer 1,440 |
| Myvi instalment RM 1,149.57 | 78,000 × (1 + 0.034 × 7) ÷ 84 |
| Myvi 3.40% flat = **6.27%** | reproduces `flatToEffective()` (`web/src/lib/calc.js:2527`) exactly |
| House instalment RM 1,514.42 | 320,000 at 4.5% over 420 months |
| Card minimum RM 1,838.83 | 5% × 3,424.91 + 1,667.58 — the BNM 13.1 two-limb |
| Actually available RM 2,638.06 | 15,000 − 5,092.49 billed − 7,269.45 unbilled instalments |
| Three-month mean RM 1,682.33 | (1,142.00 + 1,302.00 + 2,603.00) ÷ 3 |
| The residual closes | 5,188.28 − 4,012.60 living − 2,000.00 saved = −824.32, the stated wallet fall |

The 6.27% is the one worth calling out. The tempting `flat × 2n/(n+1)` gives 6.72%, and the
canvas did not use it — it used the closed form the Hire-Purchase Act actually defines, which is
what `calc.js` already ships. The copy is load-bearing throughout in the same way: flat versus
reducing, two limits rather than one pool, gateway rows left uncategorised on purpose. None of
that needs revisiting.

---

## 2. Where it does not add up

Nine corrections. All of them are in the canvas, none of them are in the code, and every one
should be fixed on the canvas before any of it is built — because each phase below reads its
figures off this drawing.

§2.1–§2.7 came from reading the canvas against itself. §2.8 and §2.9 came from an independent
re-derivation afterwards, which is the more useful fact about them: the first pass found the
figures that disagreed with each other, and only a second pass starting from the raw wallet
readings found the row that agreed with nothing.

### 2.1 "Uncommitted" has two values

The sidebar and the Flow view say **RM 5,148.28**. The Waterfall says **RM 5,188.28**. Both are
defensible in isolation:

    9,984.50 − 4,836.22 run rate       = 5,148.28
    9,984.50 − 4,796.22 falling in Aug = 5,188.28

Only the second closes the month: 5,188.28 − 4,012.60 − 2,000.00 = −824.32, which is the wallet
fall the Expenses page measures. The sidebar states no basis at all, which is the worst of the
three, since it is the figure on screen at all times.

**Fix.** One basis for the headline, named in the label.

### 2.2 The waterfall column does not sum

    9,984.50 − 2,663.99 − 773.40 − 1,838.83 = 4,708.28

but the Uncommitted row below it reads 5,188.28. The gap is exactly RM 480.00 — the road tax.
The Recurring row uses the annual charge **whole** (148.50 + 89.00 + 55.90 + 480.00 = 773.40)
while Uncommitted was computed with it **amortised out of August** (293.40). Two bases in one
column, and the arithmetic is visibly wrong to anyone who adds it up.

This is the same defect as 2.1 wearing different clothes, and it is the more serious of the two,
because a waterfall's entire claim is that you can read it downward.

### 2.3 The Flow view repeats it in words

> Commitments · −RM 773.40 · four recurring charges · **nothing annual falls this month**

RM 773.40 is the figure that includes the annual item the note says does not fall.

### 2.4 Five bars disagree with their own labels

| Where | Label | Bar drawn |
|---|---|---|
| Waterfall · Card minimum | 18.4% | 4.5% |
| Waterfall · Uncommitted | 52.0% | 61.1% |
| Waterfall · Living costs | 40.2% | 39.2% |
| Segment strip · Committed | 48.0% | 38.9% |
| Segment strip · Living costs | 40.2% | 39.2% |

Every other bar on the canvas is `pctOf(amount)`, so these five are stale constants rather than a
different scale. Worse, the **Flow** view prints the card minimum as `4.5%` in the label as well —
so RM 1,838.83 is 18.4% of income in one overview mode and 4.5% in the other. Two views of one
month that disagree is precisely the failure the two-view idea has to avoid to earn its keep.

**Fix.** Derive every width from the same `pctOf` the label uses. Delete the constants.

### 2.5 The EzyPay Plus rate contradicts the shipped converter

The canvas states **16.6% effective** twice — on the cost pill and in the near-neighbours row —
and attributes it to the Seventh Schedule converter. That converter is `flatToEffective()`, and
for 9% flat it returns:

    12 months  16.22%      24 months  16.43%
    18 months  16.42%      36 months  16.25%

It never reaches 16.6% at any tenure. The argument is untouched — 16.2% is still above the 15%
charged for simply not paying the bill, which is the whole point of the panel — but the number is
wrong by 0.4pp against the app's own function.

**Fix.** Derive it from the tenure field rather than typing it. The form already collects
`Over [months]`, and the answer depends on it.

### 2.6 The mortgage balance is about three payments ahead of its own count

Signed 1 Jun 2021, due on the 1st, so August 2026 is payment 63 — which the canvas says. But
amortising 320,000 at 4.5% over 420 months leaves:

    after 63 payments   297,702.78   next interest 1,116.39
    after 66 payments   296,504.19   next interest 1,111.89

The canvas shows **296,412.88** and **1,111.55**. Those two agree with each other — 296,412.88 ×
0.045/12 = 1,111.55 — but they belong to payment 66, not 63. The balance is roughly RM 1,290 low.

This matters more than a rounding slip because equity (253,587.12), total owed (347,774.82) and
net worth all read off that one figure, and because the Loans page makes the claim that closes
the loop: *"Four fields and today's date give the whole schedule."* If the drawn balance is not
the derived balance, the page is arguing against itself.

### 2.7 The Myvi headline uses a number the app refuses to compute

The canvas shows **Outstanding principal RM 39,000.00** — straight-line, half of 78,000 at 42 of
84 paid — and feeds it into Total owed.

`loanSchedule()` (`calc.js:2600`) does not produce that. For FLAT it sets
`owedIsInstalments: true` and reports the instalments still to run — **RM 48,282.00** — precisely
because interest is charged on the original principal for the whole term, so any principal figure
implies a settlement quote that needs a Rule-of-78 rebate this app does not model.

Note the sen, because it is contested. 42 × the 1,149.57 printed on the page gives **48,281.94**,
and that is the figure a reader checking the screen will get. It is six sen short of what will
actually be paid: the contract total is 78,000 × 1.238 = **96,564.00**, the loan is exactly half
run at 42 of 84, and half of 96,564.00 is **48,282.00**. `loanSchedule()` lands on the same
48,282.00, because the loan sheet collects no instalment and the derived one is 1,149.5714…, not
the rounded display.

So the canvas states 48,282.00 and its caption now says *"42 of 84, on a RM 96,564.00 contract"* —
which a reader can verify on the page, where "42 × RM 1,149.57" invited a multiplication that does
not reproduce the figure above it. The rounding remainder lands on the final instalment, as it does
in the agreement.

Net worth moves **RM 9,282.00** depending on which convention wins. The canvas already says the
right thing in prose — *"Any settlement figure shown would be an estimate, never a quote"* — so
this is only a matter of making the headline agree with the paragraph under it.

**Recommendation.** Keep `owedIsInstalments`. Show RM 48,282.00 as owed, and show the
straight-line principal, if at all, as a clearly secondary figure that never enters a total.

### 2.8 The residual table was RM 1,004.32 out, and pointing the wrong way

The Expenses page walks income down to living costs in five rows. The fourth read:

> Less what the wallet kept · *the balances rose, so this much never left* · −RM 180.00

    9,984.50 − 4,796.22 − 2,000.00 − 180.00 = 3,008.28

against a stated total of RM 4,012.60. The wallet did not rise. Its own readings on the same page
say it fell: 4,180.00 + 96.20 on 1 August, 3,365.68 + 86.20 on the 31st — a fall of **824.32**. So
the buffer part-funded the month and the row is an **add-back**, not a deduction:

    9,984.50 − 4,796.22 − 2,000.00 + 824.32 = 4,012.60

This is the worst of the nine. The other eight are figures disagreeing with each other, which a
careful reader eventually catches; this one had the wrong sign, the wrong amount and prose
asserting the opposite of the page's own data, while contradicting the waterfall, the segment card
and the "What stayed −RM 824.32 · measured, not derived" tile simultaneously. It survived the first
pass precisely because it was self-consistent with nothing — there was no pair of figures to
compare. Finding it needed a re-derivation from the wallet readings up.

### 2.9 The instalment split bar summed to 100.3%

Fixing "73.4% is still interest" to 73.7% in §2.6 left its complement stranded at 26.6%, the
orphan of the superseded figure. 398.03 / 1,514.42 = **26.3%**. A one-line consequence of an
earlier fix, and the reason a second pass is worth running after the first.

*(Also swept up: `commitmentRows()` still hard-coded three bar widths — 45, 34, 55 against derived
45.50, 34.54, 55.25 — on the ×3 scale it computes for every other row. Small, and the same class as
§2.4, so the constants are gone.)*

---

## 3. The decision that blocked everything else — settled

**Settled: split into six, as drawn. One calendar, the standalone one. Both overview modes.**

- **The rail takes six items** — Overview, Income, Commitments, Credit cards, Loans, Expenses —
  as a Money group. Expenses goes back on the rail, reversing `654ad24` deliberately.
- **The embedded calendars are dropped.** `Calendar.jsx` stays the one place dated flows live. The
  canvas draws a filtered money grid on four pages; it is not built. Cheapest part of the canvas to
  drop and the most duplicative to keep.
- **Waterfall and Flow both ship**, as a stored preference alongside `dashboardTheme`. §2.4 is the
  standing warning: two views of one month must be derived from one set of figures, never two.

The reasoning that was open is kept below, because the argument against the split is still the
thing to hold onto while building it: the point of six pages is room, not separation, and the month
still has to read as one sentence across them.

---

**The canvas puts six items on the rail. Today there is one.**

`TABS` (`web/src/lib/store.jsx:16-25`) has a single `money` entry, and `expenses → money` is an
explicit retired-tab redirect (`store.jsx:105-110`) added by `654ad24` — *"Take Expenses off the
rail, because the screen behind it is Money."* The canvas puts Expenses back on the rail and
splits Money four further ways.

That may well be right. `Money.jsx` is 1,470 lines carrying Income, Commitments, Credit cards and
Loans as collapsible sections, with `Spending.jsx` a further 912 imported into it; a screen that
long is arguably already four screens wearing a trenchcoat. But it reverses a decision made
deliberately two commits ago, and it should be reversed deliberately or not at all.

Two smaller shape questions ride on the same decision and should be settled with it:

- **The calendar.** The canvas embeds a money-only calendar on four of six pages, filtered per
  page. `Calendar.jsx` (810 lines) already exists as a rail screen and already carries money
  events (`moneyByDay`, `calc.js:3247`) alongside broker ones. Two calendars, or one?
- **Two overview modes.** Waterfall and Flow ship as a stored preference — two layouts to keep
  correct forever. There is precedent (`dashboardTheme`), so it is viable; it should be a
  decision rather than a default. Note that they already disagree (§2.4).

Everything below is now schedulable.

---

## 4. What the canvas assumes that does not exist yet

Four of these are schema-level and one is pure frontend.

**(a) Item assets are blocked by a CHECK.** The House page shows equity against a RM 550,000
valuation and says "linked to an item asset". `assets.kind` permits only `'SAVINGS'`;
`src/services/assets.service.js:18-20` says COMMODITY and ITEM are "designed but not yet
permitted", and `netWorth().itemsTracked` is hardcoded `false` (`calc.js:3205`). Migration,
service and calc, before that page can be honest.

**(b) "Collected through" has no column.** The recurring sheet offers *Collected through ·
Maybank card account*, and the Cards page draws a "Which account collects what" panel off it.
`commitments` (`db/schema.sql:275`) has no FK from a RECURRING row to a REVOLVING one. One
nullable column, one CHECK, and the calendar logic to move a charge's date when it moves account.

**(c) Per-date FX does not exist.** The income sheet promises a USD amount "is converted at the
rate on the day it landed, and both figures are kept". There is one global scalar,
`settings.fx_usd_myr`, applied by `toRM()` (`calc.js:73`) and written by the moomoo sync. Storing
the pair on the event is the smaller half; deciding where the daily rate comes from is the larger.

**(d) "Pay this card" has no UI.** The overlay offers statement / minimum / everything-owed /
custom, paid from a named wallet. `POST /api/commitments/:id/payments` exists and nothing branches
on those four choices.

**(e) The Import overlay is a screen for a backend that already works.** This is the exception —
nothing is missing underneath it. `POST /api/ingest/statement`,
`src/services/statementIngest.service.js` (with the BNM minimum re-checked server-side and the
whole write refused on mismatch), `merchant_rules` with longest-prefix matching, and
`sync/parse_maybank_statement.py` are all shipped. What is absent is a caller:
`web/src/lib/api.js` has none, and there is no file input, no `FormData` and no paste target
anywhere in `web/src`. The only client today is the Python CLI.

That makes the Import screen the highest value per unit of work on the whole canvas, and it is
independent of §3.

**One thing to drop.** The canvas toggles `data-private` on the shell and styles from it. The app
masks at the formatter instead (`web/src/lib/format.js:47-58`), deliberately leaving chart
geometry and free-text notes legible. The formatter approach is better and already shipped; the
attribute should come off the drawing.

---

## 5. Phases

**Phase 0 — Make the canvas self-consistent.** ~~All nine corrections in §2.~~ **Done** — applied to
the canvas and republished. Design only, no code. It was first because every phase below quotes
figures off it, and because a canvas whose waterfall does not sum will be built exactly as drawn.
Note that viewers on the shared link stay on the pinned pre-fix version until the pin is moved.

**Phase 1 — Settle the shape.** **Done** — six rail items, one standalone calendar, both overview
modes. See §3.

**Phase 2 — The Import screen.** **Done** (#27). §4(e). Backend complete; add the `api.js` caller and build the
overlay — the three checks and the refusal, recorded-without-asking, plans matched against the
bank's own counter, known merchants, and the gateway rows left uncategorised with the reason
printed. Wire "decided once, remembered after" to the existing `merchant_rules` CRUD. Independent
of Phase 1, so it can run in parallel with it or before it.

**Phase 3 — Split Money into pages.** **Done** (#31). Extract Income, Commitments, Cards and Loans out of
`Money.jsx`; promote `Spending.jsx` to Expenses. Build the Overview — the segment strip and the
waterfall, which `calc.js:3106` already computes. Rail group, hash routes, redirects for the old
anchors. Only after Phase 1.

**Phase 4 — Cards, in depth.** **Done** (#29). Cycle, float, utilisation bands, statements and plans per account —
all derivable today from `cardCycle`, `floatFor`, `cardMinimum`, `liveStatement`, `planRows`. The
add-plan overlay with the limit refusal (limit − billed − unbilled instalments, which
`planRows().blocked` already gives). The pay-this-card sheet, §4(d).

**Phase 5 — Loans and item assets.** **Done** (#30). §4(a): permit `kind = 'ITEM'`, un-hardcode `itemsTracked`,
and build the equity line. Loan detail — the split instalment, the projected balance, the
flat-rate warning. Land the §2.7 decision here, since it changes net worth.

**Phase 6 — Commitments and income gaps.** **Mostly done.** §4(b) collected-through shipped: a
recurring charge names the card account that collects it, which adds nothing to the month and moves
the day the money leaves. The two bases are now shown together on Commitments with the difference
named and broken down, which is the permanent fix for §2.1 and §2.2 — a single figure labelled
"committed" is exactly how one basis silently became the other.

**§4(c) per-date FX is deferred, and not for want of time.** Storing the pair on the event is the
easy half; the open question in §6 is where a daily rate comes from, and a wrong rate kept forever
is worse than one global rate that is visibly approximate. It wants a decision before it wants
code.

**Phase 7 — Expenses.** **Done** (#33). Mostly shipped: `spendingFor`, `expensesFor` and `expenseHistory` already
produce everything on the page. What is new is the group drill-down and the "two bases, and the
gap between them" panel — which is the most valuable thing on that screen and the cheapest,
because both figures already exist.

**Phase 8 — Polish.** **Done.** The smoke suite covers the thirteen screens and every side-panel
form, plus `plan fit`, `equity`, `collected`, `two bases` and `overview`. `data-private` was never
an app change — the app has always masked at the formatter — so it was the *canvas* that promised a
blur, and the canvas now draws the mask instead. A blur is reversible from a screenshot, keeps the
width of what it hides so the order of magnitude leaks, and cannot make the two exceptions the app
makes on purpose: chart geometry and typed notes stay readable.

---

## 7. What running it found

The whole plan was built, and then the app was actually started: both migrations applied to a live
database, every new constraint exercised over HTTP, and the six screens driven in Chrome. Three
things came out of it that no amount of reading had.

**The Overview column had never been rendered by any test.** The fixture has no wallet, so
`overviewRows()` returns `NO_WALLET` and the screen correctly refuses to draw a column — which
means every assertion that claimed to cover Overview was asserting the refusal. It has real
coverage now, including that the wallet row points the right way, which is §2.8 in test form.

**A fixture can be wrong in a way that adds up.** `S.assetEntries` is newest-first and
`assetBalance()` reverses it before replaying, because a `BALANCE` reading resets the running total.
Readings pushed the other way round make both dates resolve to the opening figure: the delta comes
out zero, the residual becomes a different number, and every identity still balances. It only
surfaced when the delta was printed.

**`db/schema.sql` hand-synced across two migrations was structurally correct** — every constraint,
column, index and FK present — and differed from `pg_dump` only in ordering, parenthesisation and
two column comments. Worth knowing the hand-sync is reliable; worth still regenerating it.

**And one finding about the data, not the code.** The live database has no account marked `WALLET`.
Overview, the residual, the coverage bar and the two-bases panel all sit behind one, so they
correctly say they cannot compute. Every account in there is a savings or retirement product — ASB,
EPF, Tabung Haji — so this is not a re-tagging job: the account money is actually spent from is not
in the app at all.

The critical path is 0 → 1 → 3. Phase 2 hangs off nothing and should probably go first in
practice.

---

## 6. Settled, and not

**Settled.** The arithmetic in §1 is checked and correct. The Import backend is done and the
screen is a pure frontend task. The formatter-level privacy mask beats the attribute-level one.
`flatToEffective` is the converter of record — both the Myvi figure and the EzyPay figure must
come out of it rather than being typed.

**Genuinely open, and worth deciding before Phase 3:**

- **Which basis is the headline.** Run rate answers "what does a usual month cost";
  falling-this-month answers "what happens in August". The canvas needs both somewhere and can
  only have one in the sidebar. The Commitments page already shows the pair side by side and
  explains the RM 40.00 gap well — that treatment may simply be the answer, promoted.
- **Whether a FLAT loan has an "outstanding principal" at all** (§2.7). Saying no is more honest
  and makes net worth RM 9,282.00 worse. Saying yes requires modelling the rebate.
- **Where a daily FX rate comes from** (§4c). Storing the pair is easy; sourcing it is not, and a
  wrong rate kept forever is worse than one global rate that is visibly approximate.

**Standing risk.** The canvas is a mock — every figure on it is seeded in the component, not
fetched. It reads as a working app, which makes it easy to mistake a drawn number for a derived
one. §2.6 is exactly that mistake already made once, on the most-checked page of the set.
