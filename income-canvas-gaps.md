# Vantage — Income: the canvas against the build

Companion to `money-redesign-plan.md` and `commitments-and-income-plan.md`, and the second of these
audits after `cards-canvas-gaps.md`. What the design canvas specifies for the Income page against
what `Income.jsx`, `App.jsx`'s two income sheets, `income.service.js` and `calc.js` actually do.

Produced by four readers: one over the canvas bundle, one over the build's whole income surface
from the form down to the migration, one over the derivations and the live database, and one over
the Malaysian primary sources — KWSP's Third Schedule, PERKESO's schedules and gazettes, and
LHDN's 2026 MTD specification. That fourth reader is why §0.3 and §6 exist, and it is the one whose
findings changed what the other three concluded.

Two things to know before reading. **The canvas is a mock and its arithmetic is not sound** — §6
lists eight figures that must not be transcribed, one of which has already been copied into
`money-redesign-plan.md` §1 under the heading *the arithmetic that holds*. And **§0 is not about
the canvas at all**: it is three things wrong in the build today, found while looking for gaps.

Every gap in §1–§5 is presentation or derivation over data already stored — **no migration**. §7 is
the only work that needs a schema change, and it is a decision before it is a migration.

Line numbers are from `origin/main` at `050a755`. The unmerged `cards-carried-settled` branch adds
~560 lines to `calc.js` and will shift everything below `overviewRows`.

---

## 0. Wrong now, independent of the canvas

### 0.1 The EPF double-write is promised in three places and cannot fire `small · no migration`

The server still does it. `addEvent()` in `src/services/income.service.js` writes an
`asset_entries` DEPOSIT of `epf_employee + epf_employer` into `income_sources.epf_asset_id`, in the
same transaction as the payslip, with a docblock explaining why the two halves belong together and
why one transaction is not optional.

The form no longer sets `epf_asset_id`. `IncomeDialog` (`web/src/App.jsx:3115-3253`) offers `kind`,
`name`, `cadence`, `pay_day`, `gross_default` and `payer` — the EPF link is not among them, and the
column defaults to null. So every source created through the app has `epf_asset_id` null,
`bookEpf` is false, and the deposit is never written. Both live sources confirm it: null and null.

Three surfaces still tell the owner otherwise:
- `App.jsx:3381` — *"Never subtracted from net. EPF from both groups is booked into your EPF account in the same write."* This sits in the record-payment sheet, directly above the fields being filled in.
- `Income.jsx:162-166` — *"…RM X of EPF lands in your account either way, and Vantage books it there in the same write."*
- `Income.jsx:266-271` — *"Employment pay with EPF on it also books the full contribution — both halves — into the linked EPF account in the same save, so one record has two effects and the two cannot drift."*

Every one of those is false for every source the app can create. Fix it in one direction or the
other — restore the field, or delete the write and all three sentences. Leaving a promise the code
cannot keep is the worse option, and it is the one currently shipped.

### 0.2 A comment records a decision that was not carried out `small · no migration`

`web/src/App.jsx:3105-3113` states the EPF link was removed deliberately and that the payslip's EPF
columns *"simply no longer write anywhere else."* The write is still there, the column is still
there, and the three sentences above still promise it. The only thing that was removed is the form
field. Whatever the intent was, the tree does not match the comment, and the comment is the thing a
future reader will trust.

### 0.3 The statutory copy is wrong in four places, one of them in the schema `small · no migration`

Verified against KWSP's Third Schedule (effective 1 Oct 2025), the Act A1724/A1725 gazettes,
PERKESO's SKBBK FAQ (Ver 2.0), Act A1788 and P.U.(B) 196/2026, LHDN's MTD 2026 specification, the
Income Tax (Deduction from Remuneration) Rules 1994 and their ten amending instruments, and the AGC
text of the Income Tax Act 1967 as at 1 Jan 2026.

**`commitments-and-income-plan.md` §5.1 is largely right**, and this section is narrower than a
first reading suggests. It correctly has EPF banded on the **upper limit** and PERKESO banded on
the **midpoint**; it correctly caps the PCB EPF relief at RM 4,000; and it correctly says SKBBK was
*"made voluntary in July"*. Four things are wrong, and two of them are outside that document.

**(a) "Fixed at the RM 6,000 wage ceiling" — the canvas's phrasing, not the plan's.** The
schedules compute on the band's **assumed wage of RM 5,950**, which they print as their own column.
RM 6,000 × 0.5% is 30.00; the published employee figure is 29.75, which is 5,950 × 0.5%. The plan
gets this right ("each band's midpoint"); the canvas's deduction note does not, and anyone checking
that sentence against that number concludes the app is broken. If the notes are ever built, say
"capped at RM 6,000" and show the figure — do not explain the derivation in a sentence.

**(b) SKBBK is real. Two places state the owner's enrolment as fact, and cannot.** The scheme
exists — Employees' Social Security (Amendment) Act 2026 [Act A1788], commenced by P.U.(B)
196/2026, 0.75% employee-borne with no employer share, capped at RM 44.65 (5,950 × 0.75% = 44.625).
A Cabinet decision of **8 July 2026** made it **voluntary for local employees**; the 31 August
default applies only to those who filed nothing by then, and a new local hire gets a **fresh 30-day
window from registration**, so the window is not closed in general.

The plan says all of this. Two other places drop it:
- `db/migrations/20260902022642_create_income.sql:60-63` — *"live since 1 June 2026 … and enrolled by default since the opt-out window closed on 31 August 2026"*, with the voluntary qualifier gone. A migration is the last place a contestable claim should live, because it is the one file nobody edits again.
- `design/assets/Money.dc.html:196` — *"enrolled by default unless you filed to opt out before 31 August"*, addressed to the reader. This is checked-in canvas source, so it ships with the repo.

The app cannot know which case describes its owner. It must not assert enrolment — it can only
describe the line when a payslip shows it.

**(c) The phase rates are already gazetted and the copy stops at the first one.** 0.75% runs to
31 May 2028, then 1.00%, then 1.25% from 1 June 2031. Anything that hard-codes 0.75% is a dated
time bomb; the app is structurally safe here because it stores per-payslip amounts, but the prose
should not imply the rate is the rate.

**(d) Two real errors in §5.1.** Line 282 says SOCSO and EIS round *"up to 5 sen"* — that fails
mid-table (band 5,400–5,500 gives 95.375, published 95.35, not 95.40). The real rule is nearest
5 sen with ties resolved to the odd multiple, which is not a rule worth stating in copy and not one
to re-derive: ship the table. Line 289 says *"Bonus is EPF-wages; overtime is not"* — true for EPF,
**inverted** for SOCSO/EIS/SKBBK, where Act 4 s.2(24) includes overtime and excludes the annual
bonus. The per-line-flag design the plan argues for is right; the example under it would produce
wrong PERKESO figures.

**Two refinements worth recording, neither an error.** The RM 4,000 EPF relief is **not in the
Rules** — P.U.(A) 507/1994 as amended says only *"the total qualifying amount per year"*, and the
figure lives in LHDN's annual computerised-calculation specification, which the Rules incorporate
by reference. It is a spec value that can move without a gazette, so it is data, not a constant.
And the RM 350 PERKESO relief the plan mentions is **already exhausted by ordinary SOCSO** for a
ceiling earner — 29.75 × 12 = RM 357 — so SKBBK changes PCB by nothing. No copy should imply the
new deduction reduces tax.

---

## 1. "The month, end to end · declared" — a shell strip, not an Income section
`web/src/screens/Overview.jsx`, `web/src/lib/calc.js`

**It is already built, on one page instead of six** `medium · no migration · decision first`
- Canvas: a `<section>` in the shell (`template.html:1860-1878`), rendered above **every** page, with the note *"every page shows its own segment of this"*. Five tiles — Declared in, Committed, Moved to savings, Living costs, What stayed — each with a 4px proportion bar whose width is the tile's share of declared income.
- Now: the same five rows, from `overviewRows()` (`calc.js:3476`), rendered only on Overview's Flow view (`Overview.jsx:150-205`) with the same stat-share-bar idiom and the rule the canvas needs — *"Widths are shares of what arrived"* (`Overview.jsx:199`), the share computed from the same expression as the printed percentage (`Overview.jsx:154`).
- So this is not a missing section. It is a placement decision, and it carries a trap: Income's own three tiles are a **run rate** (`waterfall().incomeRM`, projecting a source with no event from `gross_default`) while the strip's "Declared in" is a **measured month** (`spendingFor().inflowRM`, which excludes projections by design). Two bases, one screen, is the §2.4 failure `money-redesign-plan.md` warns against. If the strip lands on Income it replaces those tiles; it does not sit above them.

**Four of the five tiles cannot render on this database** `small · no migration · blocked on data`
- "What stayed" is `walletDeltaRM`, which needs two wallet BALANCE readings bracketing the month. `asset_entries` holds exactly one (RM 9,368.98 on 2026-09-06). Without a closing reading `spendingFor()` returns `NO_CLOSING_READING` and `overviewRows()` returns **zero rows**, so the strip has nothing to draw.
- Overview already handles this by printing prose instead of the column. Any second home for the strip must carry the same refusal path, or it will show an −8.3% that no reading supports.

---

## 2. "Income, month by month · net" — the chart
`web/src/screens/Income.jsx`, `web/src/lib/calc.js`

**There is no month-by-month income series anywhere** `medium · no migration`
- Canvas: twelve stacked bars, day-job net as a solid floor with freelance above it, the open month hatched, value labels above, a dashed "a usual month" line across the plot, and four stats beneath.
- Now: nothing on Income, and no helper to build it from. Every use of `incomeEvents` in `calc.js` either filters by source (`eventsForSource`), flattens without a month key (`historyRows`), or buckets by day within one month (`moneyByDay`). `annualIncome`, `incomeMonths` and Calendar's "Income by month" chart are **dividends**, not salary — a naming trap worth knowing before grepping.
- A new `incomeHistory(S, months = 12)` is ~25 lines, patterned on `dividendMonths` (`calc.js:342`, which already zero-fills) and `expenseHistory` (`calc.js:4339`, the only existing fixed-twelve-month window, and the one that already distinguishes a logged month from an empty one — which is what "months with no freelance" needs). Convert with `eventToRM` (`calc.js:91`), never the global `toRM`, or the chart's shape changes every time the ringgit moves.

**The nearest build precedent is not the one it looks like** `small · no migration`
- Canvas: no charting library. Three flex rows sharing `gap:6px` keep labels, bars and months in register; the hatch is `repeating-linear-gradient(115deg, …)`; the mean line is an absolutely-positioned zero-height div with `border-top:1px dashed`.
- Now: the app has Recharts, and `Calendar.jsx:558-600` is its only stacked bar chart with labels and an SVG pattern hatch. But `Expenses.jsx:264-338` already draws a twelve-month bar chart as **flex divs with percentage heights**, including a dashed target line at `Expenses.jsx:320` that is exactly the canvas's mean line. That is the closer port, and it renders in jsdom, where a `ResponsiveContainer` has zero width and draws no marks.

**The chart would misreport this account today** `small · blocked on data`
- `income_events` holds three rows, all from the freelance source, RM 5,000 each, July–September 2026. The employment source has **zero recorded payslips**, so its monthly figure falls back to `gross_default` and is flagged an *estimate* — `firmRM` is RM 0.00 and `variableRM` is the whole of it.
- Drawn today the green floor is flat zero across twelve months and three blue bars float above it, and "from the day job 88.5%" inverts to nothing. The chart is the right idea and the thing that would make this visible, but it needs payslips behind it before it says anything true.

---

## 3. The two source cards
`web/src/screens/Income.jsx`

**Gross, net and employer cost are not shown together** `small · no migration`
- Canvas: the Day job card leads with Net RM 9,984.50, with Gross and Employer cost beside it at smaller size.
- Now: the row shows net (`Income.jsx:74-80`) and last gross in the meta line (`:64-72`). `employerCostOf()` exists at `calc.js:3189` and **has zero callers in the repo** — its own comment says it is *"a fact about the employer, not about your money"*, which is a defensible reason not to lead with it, but the canvas puts it third of three and the function is already written.

**No "total deducted" on the page** `small · no migration`
- Canvas: the deduction list closes with a bold `Total deducted −RM 2,015.50` above a heavier rule.
- Now: `Income.jsx:126-145` lists the six lines with no total, and `:146-161` does the same for the employer group. `deductionsOf()` returns `deducted`, `onTop` and `epfTotal` (`calc.js:3193`) and all three are computed — they are rendered only inside the record-payment sheet (`App.jsx:3400-3414`), where they inform the person typing rather than the person reading.

**No per-deduction rule note — and §0.3 is why that is not simply a gap** `small · no migration`
- Canvas: every deduction carries the rule that produced it — *"banded Third Schedule, computed on the band's upper limit"*, *"fixed at the RM 6,000 wage ceiling"*, the SKBBK sentence, *"computed on gross less EPF, and the EPF relief is capped at RM 4,000 a year"*.
- Now: the six lines are `LABEL 123.45` and nothing else; no band table, ceiling or rate constant exists anywhere in `src/` or `web/src/`.
- Two of those four notes are wrong (§0.3a, §0.3b) and a third is right but incomplete. The EPF one is verified correct. If these are built, they are built from the verified text, not from the canvas — and the enrolment claim is not built at all.

**A foreign source cannot be created, and its two figures are never shown** `small · no migration`
- Canvas: the Design work card shows `Three-month mean ≈RM 1,682.33` beside `In USD ≈$400.73`, and the payment sheet promises *"converted at the rate on the day it landed, and both figures are kept"*.
- Now: the pair is stored and converted — `income_events.fx_rate`/`fx_date` from the per-date FX migration, `eventToRM` returning `{rm, dated, rate, on}`, `incomeRows` setting `monthlyRM` and `fxDated`. But `income_sources.currency` **has no form field**, so a foreign source can only be created through the API, and **no screen reads `fxDated`** — grep across `web/src/screens/` returns nothing. Phase 6b shipped the hard half and none of the display.

**"Next date" was specified and never built** `small · no migration`
- `commitments-and-income-plan.md` §7.1 asks for *"name, cadence, next date, last amount"*. The row prints `Monthly · day 25`, not a resolved next date, though `dueDayIn` already exists for the calendar.

**`payer` is captured and rendered nowhere** `small · no migration`
- The form writes it (`App.jsx:3235-3236`); zero renders in `web/src`. Either show it — the canvas's own subtitle line is where it would go — or drop the field.

---

## 4. "What actually arrived" — the ledger
`web/src/screens/Income.jsx`

**Recorded payments are per-source and collapsed, not a page-level table** `small · no migration`
- Canvas: its own card, a four-column table (Date | Source | Net | actions) across **all** sources newest-first, with per-row edit and delete, and a footnote — *"Salary never becomes a broker deposit and never enters portfolio income."*
- Now: a `Show N recorded payments` toggle inside each source row (`Income.jsx:89-124`), so the two sources' payments can never be read against each other. Delete exists per row; **edit does not** — a mistyped payslip can only be removed and re-entered.
- The cross-source chronological view does exist, on History, as PAY rows. Worth deciding whether the ledger is a second home for that or a replacement for the collapsed list.

**No empty state and no count on the payments list** `small · no migration`
- The toggle renders only when `events.length`, so a source with no payments says nothing at all — which is precisely the live employment source's situation, and the reason its figure is a `gross_default` estimate is never stated on the row.

---

## 5. Recording a payslip
`web/src/App.jsx`

The build's sheet is **better than the canvas's** and should not be aligned to it. The canvas's own
prototype subtracts a flat RM 2,015.50 whatever gross is entered, never saves an edited source,
opens both source cards' pencils on a form pre-filled as the day job, and appends a duplicate when
you edit a ledger row. The build separates the two column groups, computes net live rather than
accepting it typed, and the API refuses a payslip whose deductions exceed gross with a message
naming the employer fields. Keep all of that.

**`other_deducted` has a column, a reader and no input** `small · no migration`
- Sent as 0 from the form (`App.jsx:3313`), summed by `netOf`, rendered as `Other` on the page. Nothing can put a value in it.

**The deduction fields are bare acronyms** `small · no migration`
- Six inputs labelled `EPF`, `SOCSO`, `EIS`, `SKBBK`, `PCB`, `Zakat`, no hint on any. SKBBK especially — a line that appeared in mid-2026 and that many payslips will not carry at all — deserves one sentence saying what it is and that it may legitimately be absent.

**A source cannot be ended from the UI** `small · no migration`
- The API refuses to delete a source with payments and says *"end it instead of deleting, or that history goes with it"* — but `active`, `started_on` and `ended_on` have no control anywhere, so the instruction cannot be followed.

---

## 6. Figures not to transcribe

The canvas is seeded, not derived. `money-redesign-plan.md` §6 already says so; this is the list.

1. **Employer EIS RM 49.95 is wrong.** EIS is symmetric — 0.2% each side — so at the schedule's assumed wage the employer figure is **RM 11.90**, the same as the employee's, which the canvas prints two rows above. RM 49.95 is not any rate on any base here. **This has already been copied into `money-redesign-plan.md` §1**, where `Employer cost RM 13,594.10 = 12,000 + (1,440 + 104.15 + 49.95)` is listed under *the arithmetic that holds*. Corrected, employer cost is **RM 13,556.05**. (SOCSO's 29.75/104.15 pair *is* the real 0.5%/1.75% asymmetry, so the error is specific, not a pattern.)
2. **The RM 44.65 SKBBK cap is correct** — 5,950 × 0.75% = 44.625, rounded to 44.65. It looks wrong against the RM 6,000 the note cites, which is §0.3a again: the number is right and the sentence explaining it is not.
3. **"The flat green floor" is contradicted by its own data.** The chart's closing sentence rests on a flat day-job floor; the fixture gives December `job: 12984.50`, and that bar's own tooltip says *"including a RM 3,000.00 bonus"*.
4. **That bonus enters a net series untaxed.** The card is headed *net*, and 12,984.50 − 9,984.50 is exactly 3,000.00 — no EPF, no PCB. On the canvas's own rules a RM 3,000 bonus nets well under RM 3,000.
5. **The twelve-month total includes the projection; the stat beside it excludes it.** RM 138,707.83 is labelled *"net, across both sources"* and contains the RM 1,682.33 the same card calls *"a mean, not a promise"*, while `3 of 11` correctly counts only closed months. Excluding August: RM 127,041.00 and 11.2%.
6. **"A usual month · RM 11,549" is inflated by the bonus** — it averages eleven months including December. Without it, RM 11,276.45; the dashed line sits RM 272.73 too high, and it is the line the legend calls a usual month.
7. **A RM 0.50 conflict between the chart and the ledger.** June freelance is 1,302.00 in the chart and 1,301.50 in the ledger ($310.00 at the page's own rate). The three-month mean would be RM 1,682.17, not the RM 1,682.33 hard-coded in four places — which every stat above is built on.
8. **Living costs RM 4,012.60 vs RM 3,957.30.** The Expenses page's closing sentence uses the second; with it the month is RM 55.30 out of balance, and the strip's own tile renders directly above it.

Also: the five percentages sum to 108.2 against a −8.3% tile (independent `toFixed(1)` rounding),
and the chart's day-job figure is flat across months that precede SKBBK's 1 June 2026 start, when
net was RM 44.65 higher.

**For fixtures:** RM 12,000 and RM 8,500 are both EPF band ceilings, where the banded lookup and a
flat percentage agree exactly. Neither can catch the most likely implementation bug. Use a
mid-band wage — RM 11,850 gives 1,309 / 1,428 banded against 1,303.50 / 1,422.00 flat.

---

## 7. Needs a schema change, or a decision first

**Nothing in §1–§5 needs a migration.** Every figure the canvas shows is derivable from
`income_sources` and `income_events` as they stand, and the per-date FX pair is already there.

**Statutory rate tables** `large · migration · decision first`. Only if the app is ever to compute
a deduction rather than record one. Today it stores per-payslip amounts and sums them, which is the
right shape and carries no exposure — the primary-source reader's conclusion was that *all* the
risk is in the copy, not the arithmetic. If tables are ever added they must be versioned and keyed
by effective-from date: the EPF Third Schedule changed on 1 Oct 2025 (Parts B and D deleted, Part F
added), the PERKESO ceilings on 1 Oct 2024, SKBBK steps in 2028 and 2031, and LHDN respecifies PCB
annually. And PERKESO's amounts must not be derived by formula — the tie-breaking is not a standard
rounding mode. Ship the table or ship nothing.

**The legislature agrees.** Act A1788 substitutes Act 4's whole Third Schedule and states **ringgit
amounts only, band by band — no percentage appears anywhere in the Act.** The 0.75% every summary
quotes comes from PERKESO's FAQ plus arithmetic on the table (44.65 ÷ 5,950 = 0.7504%). When the
statute itself ships a table rather than a rate, an app that re-derives the rate has chosen a
harder and less accurate path than the one the law took.

Two cautions for whoever does that. LHDN's MTD spec applies the EPF cap **annually and
cumulatively** — the monthly figure is not clipped; a `K2` term spreads the remaining allowance
over the remaining months so the projected year lands on the cap. And the spec's own worked
examples on printed pages 46–50 still carry a stale `≤ RM 6,000.00 (limit)` label directly above
arithmetic that uses RM 4,000 — pre-YA2019 boilerplate LHDN never cleaned up, in four places. An
implementer reading the label rather than the arithmetic would build the wrong cap from the correct
document, which is the sharpest possible argument for shipping the table rather than the rule.

**`epf_member`** — `commitments-and-income-plan.md` §4 specifies this column and it was never
built; the form uses `kind === 'EMPLOYMENT'` as the gate instead. That substitution is fine, and the
plan should be corrected rather than the schema.

---

## What I would build first

**1. Make the EPF promise true, or delete it** (§0.1, §0.2). Three sentences currently tell the
owner their contributions are being booked into their EPF account, and for every source this app
can create, they are not. It is the only item in this audit where the app states something false
about money that has already moved. Small either way, and the decision — restore the field, or
remove the write and the sentences — wants making before anything else on this page is touched.

**2. Correct the statutory copy** (§0.3). No code, five edits: two sentences in
`commitments-and-income-plan.md` §5.1, the `skbbk` column comment in the migration,
`design/assets/Money.dc.html:196`, and the `money-redesign-plan.md` §1 employer-cost line. It costs
nothing now and it stops the next reader building on it — which has already happened once, which is
how the RM 49.95 got into a document headed *the arithmetic that holds*.

**3. Record the day job's payslips.** Not a build item, but it gates the whole page: with no
employment events, `firmRM` is RM 0.00, the salary is an estimate drawn faded, and Overview, Goals
and the Calendar all read from the same figure. Everything below is worth less until this is done.

**4. The twelve-month chart** (§2). The largest single gap, ~25 lines of derivation plus a card
patterned on `Expenses.jsx`'s existing twelve-month bars, and the thing that would have made the
missing payslips obvious a month ago. Build it after (3), not before — drawn on today's data it
reports the opposite of the truth.

**5. The source cards' missing halves** (§3) — the total-deducted line, the USD twin for a foreign
source with the form field that makes one creatable, and `payer` either shown or dropped. Small,
independent, and each closes a case where the data is already stored and simply not said.
