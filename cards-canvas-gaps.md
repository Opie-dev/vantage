# Vantage — Credit cards: the canvas against the build

Companion to `money-redesign-plan.md`. An audit of what the design canvas specifies for the
Credit cards screens against what `Cards.jsx`, `CardSheet.jsx`, `CommitmentRow.jsx` and `calc.js`
actually render, produced by ten readers working one canvas section each, with every claimed gap
then handed to a skeptic instructed to prove it already built. 90 claims went in; 88 survived.

Two caveats on that number. The survival rate is high enough to read as lenient, and twelve of the
skeptics ran without the harness's safety classifier — so treat each item as a strong lead, not a
verdict. The first item in §1 was checked by hand against `calc.js` and holds exactly as stated.

The sizes are the skeptics'. "No migration" means the data is already in `db/schema.sql` and the
gap is presentation or derivation; §3 is the only work that needs a schema change, and two of those
are product decisions before they are migrations.

---

Sizes are the verifier's. Every gap in sections 1 and 2 is presentation or derivation over data already stored — **no migration**. Section 3 is the only work that needs `db/schema.sql` to change.

---

## 1. The all-cards screen
`web/src/screens/Cards.jsx`, `web/src/screens/money/CommitmentRow.jsx`, `web/src/lib/calc.js`

### The figures that are wrong or unsayable

**A billed, unpaid balance has no state — it is either drawn as carried debt or it disappears** `medium · no migration`
- Canvas: CIMB owes RM 612.40 and carries nothing — band 1 is RM 0.00 "revolving — nothing has ever been carried", Carrying is an em dash, available is RM 24,387.60 of 25,000.
- Now: `const revolving = c.balance` (calc.js:3045) is treated as carried unconditionally. Enter the bill and it renders as a solid loss band plus RM 8.68/mo of invented interest (calc.js:3060); enter it as the model intends (`balance = 0`, per App.jsx:2994) and the RM 612.40 vanishes from `committed` and from `availableRM` entirely. This is the screen's own thesis failing: what the bill says is not what is free, in both directions.

**"Minimums, a month" is a calendar sum wearing a 30-day label** `medium · no migration`
- Canvas: "Minimums due in the next 30 days", RM 1,838.83, keyed to each account's own due date.
- Now: `monthlyOutRM` sums every active card's minimum regardless of when it falls (calc.js:3154), and the MonthStepper note calls it a month's figure. Key the window off the live statement's `due_date`, **not** `cycle.dueOn` — on the canvas's own Maybank fixture `cycle.dueOn` is 37 days out and would exclude the card the tile exists to show. Decide explicitly whether a card that settles in full contributes its minimum: the canvas's own figure says no while its label says yes.

**"Due next" is always the minimum, and never says when** `medium · no migration`
- Canvas: "RM 1,838.83 · in 6 days" and "RM 612.40 · in 22 days" — the minimum where the balance is carried, the whole bill where it is settled.
- Now: `monthlyOut: minimum` (calc.js:3071) captioned "minimum", no countdown anywhere. Both halves branch on data already on the row: the amount on `revolving > 0`, the countdown on `r.statement.live ? days to statement.due_date : r.cycle.daysOfFloat`. A naive `due_date` countdown prints "in −9 days" on the settled account.

**Committed prints no billed / still-to-be split** `small · no migration`
- Canvas: "5,704.89 billed · 7,269.45 still to be" beneath "Committed across every card".
- Now: eyebrow "Owed today" over the total, with the split written as prose. Add to `commitmentsTotal` (calc.js:3153-3158): `billed = Σ(revolving + instalments)`, `unbilled = Σ max(planOutstanding − instalments, 0)`. Σ`revolving` / Σ`planOutstanding` gives 4,037.31 / 7,269.45's wrong twin 8,937.03 — same headline total, wrong sub-line. Drop the canvas's "and 3 cards" clause here (see §3).

**No carrying / settled state exists anywhere** `medium · no migration` — one derivation, four render sites
- Canvas: a CARRYING (loss) / PAID IN FULL (gain) badge beside each account name, echoed as "one account carries · one settles in full" under the minimums figure, as "carrying · minimum only" / "settled in full every cycle" in the cycle table, and again in the single-account header.
- Now: neither string appears in `web/src`; the only badge on a REVOLVING row is "{staleDays}d old". Present tense is `revolving > 0`; prefer `statement.interest_charged > 0` where a statement exists, corroborate with payments-in-window, and render nothing rather than PAID IN FULL over a stale reading or no statements — the rule `cardFloat` already follows with `NO_STATEMENTS`. A live unpaid bill must not flip a settling account to CARRYING.

### The account as one object

**The per-account summary row does not exist as a row** `large · no migration`
- Canvas: one clickable row per account *inside the same card as the totals* — name, state badge, right-aligned terms, chevron; a 7px three-band bar; four labelled stats (Committed, Actually available, Due next, Carrying); the card closing with "Two limits, not one pool."
- Now: the pieces are split across "Room, per account" (name, "X free", one solid bar) and "The accounts" (CommitmentRow's flat run-on line), so the same free figure is stated twice under two labels. Assembling it means collapsing the three stat tiles *and* the room card into one card. Every figure is already on the row from `commitmentRows()`.

**The three-band utilisation bar is not on the row** `small · no migration`
- Canvas: 7px, `gap:1px`, band 1 solid `var(--loss)`, band 2 loss 62%, band 3 loss 30% under a 115° repeating-gradient hatch — the hatch is the claim that this stretch appears on no bill.
- Now: Cards.jsx:125-133 draws one 5px solid `--loss` segment at `utilisationPct`. Bands exist only in the sheet, in `--chart-2` with opacity instead of a hatch. Band 1 = `r.revolving` reproduces the canvas only for a card that carries — the settled case is the decision above. No band labels on the row; those belong to the sheet.

**The four labelled columns are missing** `small · no migration`
- Canvas: COMMITTED / ACTUALLY AVAILABLE / DUE NEXT / CARRYING in `auto-fit minmax(190px,1fr)`, with Actually available toned loss on a tight account and gain on a loose one, and Carrying as "RM 3,424.91 at 15%" or an em dash in faint.
- Now: no grid. Two of the four labels exist verbatim but only in the sheet (CardSheet.jsx:233-240) as a two-item flex pair; Due next and Carrying have no labelled form anywhere. Nothing in the codebase varies the availability colour by tightness — a tone rule has to be introduced, off `utilisationPct`.

**The right-hand terms line** `small · no migration`
- Canvas: right-pushed, nowrap, 11.5px — "RM 15,000 · 15% · closes 6th, due 26th".
- Now: the same facts scattered through the left meta in another order, rendering "closes 06" (a zero-padded ISO slice) and a full ISO date for due. Source `c.statement_day` / `c.due_day` and add an ordinal helper to `format.js` (none exists — the same helper fixes the sheet, the collected-by rows and the commitment rows). CommitmentRow is shared with Commitments and Loans, so guard by screen; do not thin the meta line until the stats columns exist, or information is deleted rather than moved.

**The row is not the click target, and there is no chevron** `small · no migration`
- Canvas: the whole row is a button with a `muted 50%` hover fill and a trailing chevron; the same pattern is used again for the collected-by rows.
- Now: only the account name is clickable; the chevron renders only behind `onOpenOwner`, which Cards.jsx never passes. Keep the existing destination (`onOpenSheet(r.id)`); copy Portfolio.jsx:318's hover classes. The nested plan/statement/edit/remove actions mean the row cannot literally be a `<button>` — it needs `stopPropagation`, which appears nowhere in `web/src` yet.

**The header is three tiles instead of one card with the two figures facing each other** `small · no migration`
- Canvas: one card, committed as the hero on the left with its split line, the 30-day minimums right-aligned and smaller in `--loss` with its state caption, account rows inside the same card. No third headline figure.
- Now: three equal stat tiles, the third ("Accounts with a limit") having no canvas counterpart, with the account list and headroom as separate cards below.

**"Two limits, not one pool" is paraphrased without its lead-in or its figures** `small · no migration`
- Canvas: a bold foreground lead-in over a hairline, then the sentence instantiated — RM 24,387.60 free on CIMB cannot pay the Maybank bill, "at 17% instead of 15%".
- Now: the same argument, generic, at text-faint 11.5px, naming no account, no amount and no rate — "usually at a worse rate" sits exactly where the canvas names both. Position is already correct; what is missing is the lead-in, the hairline, the 12.5px muted scale, and the instantiation from `withLimit`. Handle one account (no referent) and the case where the room sits on the *cheaper* card, where the "worse rate" clause must flip.

**The All cards / per-account tab strip** `large · no migration`
- Canvas: a TabsList above everything switching the page between the all-cards summary and one account's full page; triggers read "All cards", "Maybank", "CIMB".
- Now: no tabs; an account opens as a Sheet over the list, which CardSheet.jsx:1-9 documents as a deliberate choice. The short labels are already stored — `r.commitment.lender || r.name`, no truncation, no column. This is the one gap that contradicts a written decision: decide whether to replace the sheet with an inline tab panel or keep the sheet and use the strip only as a switcher.

**"Add a card account" loses its words the moment an account exists** `small · no migration`
- Canvas: an outline `sm` button carrying a plus icon *and* the text.
- Now: `size="icon-sm"` with a bare `<PlusIcon />`; the labelled version survives only in the empty state. The canvas's page-header placement depends on the tab strip and is not required to close this.

### The cycle panel (absent entirely)

**"What each cycle does to the month"** `small · no migration`
- Canvas: a card beside "Which account collects what" — a lead sentence on how far apart the accounts close and fall due, a per-account table (name, state note, closes, due, amount), and a closing line pointing at the calendar.
- Now: no panel, no `cycleCompare`, and "Which account collects what" sits full-width with no partner. Little new computation is needed: `r.cycle` is already on every row (calc.js:3089) and CommitmentRow already prints both dates inline. parts.jsx:135 already claims this panel exists. Rows sort by `monthlyOut`, not carrying-first; with one account there is nothing to compare — do not render.

**The amount column: what actually leaves on the due date** `medium · no migration`
- Canvas: RM 1,838.83 (Maybank's minimum) beside RM 612.40 (CIMB's whole bill) — the minimum where carried, the whole bill where settled.
- Now: no such figure. `moneyByDay` already computes both halves and throws one away: `clearAmount: stmt.closing_balance` at calc.js:3762 has exactly one occurrence in the repo — its own assignment — so the money calendar also shows RM 50 on a settled card's due day. One derivation, four consumers (this column, Due next, the sheet's due pill, the calendar). It contradicts the screen's own prose at Cards.jsx:229-234 and the "the minimum, never the balance" caption, which must be rewritten in the same commit.

**Both days per account, aligned, as ordinals** `small · no migration`
- Canvas: right-aligned numeric columns, "6th"/"26th" against "21st"/"11th", so the spread reads at a glance.
- Now: a sentence fragment inside the account list ("closes 06", then a raw ISO date). `cardCycle` returns `closesOn`/`dueOn` (calc.js:2876-2877) and returns null when either day is unrecorded — that null needs a fallback cell.

**The lead sentence — how far apart they close and fall due** `medium · no migration`
- Canvas: "Two accounts close eleven days apart and fall due fifteen days apart."
- Now: nothing compares one account's cycle to another's. Derive from the stored `statement_day`/`due_day`, not `cardCycle` (whose dates drift with today and which returns null if *either* day is missing). Days-of-month are circular, so `|a−b|` is wrong — 2nd vs 28th is 6 days apart, not 26. The canvas's own numbers do not reconcile; compute, never transcribe.

**The second sentence — the same purchase priced in days on each account** `medium · no migration`
- Canvas: "Something bought on the 7th waits fifty days on one card and nineteen on the other."
- Now: each account states its own float in isolation, and only the sheet prints the day count. `cardCycle(c, nowISO)` already accepts an arbitrary purchase date — do not add a parallel function. What is missing is the comparison and naming the longest and shortest accounts; skip cards whose `cycle` is null.

**The closing line pointing both dates at the money calendar** `small · no migration`
- Canvas: "Both dates are on the money calendar below, so a month is never read off a single due date."
- Now: absent. `moneyByDay` already emits both the due day and a "closes" informational event, and Calendar.jsx:347 renders them — so the claim is already true and unsaid. "Below" is false here; link with `setTab('calendar')`, the established idiom (Commitments.jsx:195, Overview.jsx:242).

### "Which account collects what"

**Direct-debit charges can never appear** `small · no migration`
- Canvas: a flat list mixing card-collected rows with "Home insurance · direct debit — no card involved" — the contrast is the panel's whole argument, and its lead sentence depends on it.
- Now: `commitmentRows(state).filter(r => r.collectedBy)` (Cards.jsx:78), then grouped under per-card headers, so a charge with no collector has neither a row nor a group. Worse, the panel is gated on `collected.length`, so a user whose recurring charges are *all* direct debits sees no panel at all. Build from `r.kind === 'RECURRING'`, flatten, and gate on any recurring charge existing.

**Each row omits its collector and its own due day** `small · no migration`
- Canvas: "Phone / Maybank card account · due the 8th" and "Netflix / … · due the 12th" — same account, different days, because the day is the charge's.
- Now: one per-account header states the *card's* day once; the rows carry only name, cadence and amount. Do **not** route this through `leavesOnDay` (calc.js:3129) — for exactly these rows it returns the collector's day (the 26th). Read `r.commitment.due_day`, and either leave `leavesOnDay` alone or delete it.

**Rows are not clickable** `small · no migration`
- Canvas: every row is a button navigating to Commitments, with the muted-50% hover.
- Now: plain divs. `setTab` lives at `web/src/lib/store.jsx:351` (exported 639) and is not yet in Cards.jsx's `useVantage()` destructure; follow Expenses.jsx:726-733. Keep the build's per-account grouping.

**No leading icon** `small · no migration`
- Canvas: 14px `receipt-text` on card-collected rows, `landmark` on the direct debit — the only instant signal of collection kind.
- Now: no icon. Note the ordering: until direct debits are included, the Landmark branch is dead and the icon distinguishes nothing. Both icons are already imported in App.jsx:37-38.

**No lead paragraph, and the sentence that survived changed its point** `small · no migration`
- Canvas: under the eyebrow — "A commitment names the account that collects it. Move a direct debit to the other card and the due date it lands on moves with it — which is the whole reason this is stored per account rather than per card." The contrast is account vs card.
- Now: no lead; a rewritten version sits in the footer saying "the other account" and "per charge". Add the lead at the codebase's 12.5px muted scale and delete the duplicate from the footer.

**The footer never says these charges are matched, not logged** `small · no migration`
- Canvas: "…subtracted from income once, on Commitments, and matched rather than logged when the statement arrives."
- Now: only the first half. Word the clause to what the importer does: a charge is skipped only when a statement-merchant rule with action `COMMITMENT` names it (statementIngest.service.js:96-107); unruled merchants land in `unmatched`. An unqualified "matched rather than logged" overpromises.

**Whether the panel should print a total at all — open decision** `medium · no migration`
- Canvas: "RM 144.90 a month is collected through cards", counting card-collected rows only.
- Now: no figure, and the comment at Cards.jsx:75-77 says the omission is deliberate ("says where the money goes out through, never what it costs"). Two verified corrections disagree: one says add it via a `collectedTotal(S)` helper and rewrite the comment in the same commit; the other says the omission is a documented decision to keep. Decide before writing code. If you do add it, `commitmentsTotal({ kinds })` is the wrong axis — it returns 293.40, not 144.90.

---

## 2. The single-card view
`web/src/screens/money/CardSheet.jsx`

### What the limit actually holds

**The billed, unpaid instalment is counted in neither Committed nor Actually available** `medium · no migration`
- Canvas: Committed RM 12,361.94 = statement balance 5,092.49 (revolving + the instalment billed this cycle) + 7,269.45 not yet billed; Actually available = limit − that.
- Now: `owed = revolving + planOutstanding` and `availableRM = limit − revolving − blocked`. `instalmentsPaid()` retires an instalment at its monthly anniversary (calc.js:2551-2558) — the plan's `started_on` day, not the due day — so it leaves `outstanding` and `blocked` up to ~20 days before it is paid, and it was never in `commitments.balance`. Both headline figures are loose by one billed instalment, and both are the numbers the screen exists to be right about. `liveStatement().closing_balance` is read for display and never feeds them. Same root cause makes `planFit`'s `apparentFree` (calc.js:3447) 11,575.09 where the canvas says 9,907.51.

**The middle band reads plans only, so a card with no plans draws nothing** `medium · no migration`
- Canvas: the middle band is what the live bill demands beyond the revolving balance — on CIMB that is RM 612.40 at 2.4% of the limit, labelled "billed and unpaid, due on the 11th"; it is exactly why available is 24,387.60 rather than 25,000.
- Now: `billed = row.instalments`, which is 0 without plans, so the band draws at 0% and the legend line is suppressed. Derive it as (live statement closing balance − revolving), gated on `stmt.live` and net of payments since the statement date, or a settled bill shows as a phantom demand. On Maybank both derivations coincide exactly, so nothing regresses there.

**The third band is a mixed basis** `medium · no migration`
- Canvas: band three is the unbilled amount still blocking the limit.
- Now: `unbilled = row.blocked − billed`, where `billed` is a whole instalment (principal + interest) and `blocked` is principal-only — so band two steals one cycle's plan interest from band three. Worth **RM 21.72** on the canvas data, not the RM 1,841 the difference from the canvas figure suggests: the rest is the deliberate principal-only release rule (calc.js:2722-2726) and the canvas's own overlapping bands. Subtract the principal share (`Σ p.amount / p.tenure`), which needs a new field on `planRows`. Do not "restore" the canvas figure.

**The whole "third band no statement shows" paragraph is never rendered** `medium · no migration`
- Canvas: below a hairline — the bill says 5,092.49 against 15,000 and reads as a third used; add the unbilled and the account is 82.4% used, with RM 2,638.06 free rather than RM 9,907.51; it comes back RM 1,668 a month.
- Now: nothing. The argument exists only as a source comment. It needs a statement-based apparent pair (`limit − closing_balance`, `closing_balance / limit`) — `planFit`'s existing `apparentFree` is limit − revolving and is the wrong figure. Render only when both `limit` and `row.statement` exist. The same expression should replace CommitmentRow.jsx:116, whose "The balance alone would suggest…" branch can never fire (`apparent <= availableRM` always).

**The clean account is told nothing where the canvas says plainly that nothing is hidden** `small · no migration`
- Canvas: "Nothing is hidden behind the third band here, so what the statement says is free and what is actually free are the same figure — RM 24,387.60. That is worth stating precisely because it is not true of the Maybank account."
- Now: no note under the bar in either state; the "hidden" half was built as a callout on the list row, gated on the card having plans. A paid-in-full card renders one legend line above an empty bar with nothing saying that emptiness is the good outcome.

**Zero bands vanish instead of being stated as RM 0.00** `small · no migration`
- Canvas: all three legend entries always render; the zeros are the point.
- Now: the billed and unbilled lines are gated on `> 0` (the revolving line is already unconditional). Drop the two guards, and branch the labels at zero — the revolving label currently prints "revolving, at 17% — costs RM 0.00 a month" on a card that has never revolved, asserting a cost that does not exist.

**The utilisation percentage never appears in the sheet** `small · no migration`
- Canvas: "the account is 82.4% used", set against the bill's "reads as a third used".
- Now: `utilisationPct` renders on the list row and as a bar width, never in the sheet; the statement-implied percentage is not computed anywhere.

**No sub-line under "Committed on this account"** `small · no migration`
- Canvas: "5,092.49 billed · 7,269.45 still to be", or "all of it billed · no instalment plans".
- Now: eyebrow and figure, nothing beneath. It composes from fields already on the row — `revolving + instalments` and `planOutstanding − instalments`, which sum to `owed` exactly. Do **not** source it from `statement.closing_balance`; that is null until an import and drifts stale.

**No sub-line under "Actually available"** `small · no migration`
- Canvas: "of a RM 15,000 limit" — the denominator beside the big number.
- Now: nothing; the limit appears once, far away in the description. `fmt(limit, row.cur)`, guarded on `limit` so it never contradicts the "No credit limit recorded" branch.

**"Actually available" is one colour on every account** `small · no migration`
- Canvas: loss on the tight account, gain on the clear one.
- Now: hardcoded `var(--chart-2)` in the sheet, and no colour at all on Cards.jsx:122 — where the bar beneath it is hardcoded `var(--loss)`, so a clear account gets a red bar. One tone rule off `utilisationPct`, used in both places.

**Band three has no hatch, and the legend dot no hollow ring** `small · no migration` (two entries, one pass)
- Canvas: bands are tints of one colour, the third under a 115° repeating gradient, its legend dot a hollow ring; segments 1px apart.
- Now: `--chart-2` for bands two and three, the third dimmed to 0.45 opacity, all three dots filled, no gap. If you keep the build's two-colour palette, border the ring in the band's own colour rather than `--loss`.

**Nothing says how fast the blocked limit comes back** `medium · no migration`
- Canvas: "It comes back RM 1,668 a month, as each instalment's principal is paid."
- Now: only the standing `blocked` total is exposed. The rate is `Σ amount / tenure` over live plans — 1,645.86 here; the canvas's 1,668 is the rounded *instalment* total and includes RM 21.72 of interest that releases no limit. Build from principal. ON_SETTLEMENT plans release nothing until the end, so report zero and name `endsOn` per plan rather than one account date.

### The cycle

**The panel cannot tell a paid bill from an unpaid one** `medium · no migration`
- Canvas: a settled cycle carries a payment marker ("paid in full", 9 Aug), the due marker reads "was due", the statement-balance note reads "paid in full on 9 August, two days early", and the minimum is dimmed with "never used".
- Now: a fixed five-marker list with no payment and no past tense — a due date that has gone still reads "RM 50.00 minimum". Half the trigger already exists: `liveStatement` stamps `live: due_date >= today`, so `!row.statement.live` is the relabel condition; the new part is summing payments in (statement_date, due_date] against `closing_balance`, the same filter-and-sum shape `cardFloat` uses on a different window.

**No due pill beside "The cycle"** `small · no migration`
- Canvas: a badge — "RM 1,838.83 DUE IN 6 DAYS" (loss) / "RM 612.40 DUE IN 22 DAYS" (neutral) — the only place the panel states *when* in days.
- Now: eyebrow, spacer, pay button. Both halves fork on liveness: while live, the statement's `minimum_due` and days to its `due_date`; once past, `cycle.daysOfFloat` (already printed as prose) and what the next bill will ask for. `fmt(row.minimum)` alone renders "RM 0.00 DUE IN 22 DAYS" on the settled card.

**"Cost of carrying" prints RM 0.00/mo where the canvas insists on an em dash** `small · no migration`
- Canvas: "—" in faint, noted "an em dash, not a zero: nothing is carried, so there is no cost".
- Now: always `fmt(row.interestThisMonth)` in `text-loss` with a `/mo` suffix, so a card that has never revolved shows a red zero. Guard on `row.revolving <= 0` (not on the interest being zero — a 0% APR with a real balance would then lie), move `text-faint` onto the value div, drop the suffix.

**The minimum-due note describes a formula that did not produce the figure** `small · no migration`
- Canvas: "5% of the balance or RM 50, whichever is higher — never used" — it names the limb that actually bound.
- Now: two fixed strings, one of which claims 5% produced a figure the RM 50 floor produced. Both the percentage and the floor are per-card stored columns, so both must be read from the row; cleaner still is for `cardMinimum` to return which limb bound, which also fixes the same fixed strings at CommitmentRow.jsx:94 and calc.js:3774.

**The cycle prose never states the interest-free window or that carrying voids it** `small · no migration`
- Canvas: "Twenty days from statement to due date — exactly the minimum Bank Negara requires, and only while nothing is carried forward."
- Now: only the second half is rendered, and "that bill" is never named by its dates. Derive grace from `cycle.dueOn − cycle.closesOn` (add `graceDays` beside `daysOfFloat`) rather than from the statement, which is null on a card with no bills yet.

**The timeline's four marker states collapse into two** `small · no migration`
- Canvas: done (solid), today (larger, with a 3px ring), due (hollow, loss-bordered), ahead (hollow on border).
- Now: one 9px size, solid for `hot || now`, so the bill that closed, today and the due date are three identical dots and the due date is drawn as an obligation already met. Derive state from the date, not from the marker's role — a past settled due date is `done`, and the code hardcodes the due marker to hot.

**Marker labels do not sit under their own dots** `small · no migration`
- Canvas: dot, date and note stacked in one grid cell per marker.
- Now: dots are absolutely positioned by real date while labels sit in a separate `justify-between` flex row, so two nearby dots get labels a fifth of the width apart and a label can point at the wrong dot. The marker count varies from three to five (statement entries drop out), so a fixed five-cell grid will not do; end dots also half-hang off the rail.

**The cycle prose does not compare this card's float with the other account's** `small · no migration`
- Canvas: "…22 days — barely half the float the same purchase would get on the Maybank card." Which card to put a purchase on is the decision the number is for.
- Now: nothing comparative. No new hook and no `cardCycle` calls needed — the sheet's top-level `useVantage()` already exists (add `state` to the destructure), and `commitmentRows(state)` already carries every other card's `cycle.daysOfFloat` and name. Skip cards whose cycle is null.

### Float — why Expenses lags

**One voice for every card** `medium · no migration`
- Canvas: a settled card gets a wholly different lead ("A card settled every cycle still carries float… Float is not debt") and a different closing note ("Small and steady, which is what a card used as a payment method rather than as credit looks like").
- Now: one lead and one note for every card, so a card paid in full since 2024 is told "This is why Expenses lags" in the same words as one revolving at 15%, and the "Float is not debt" sentence appears nowhere. Gate on `f.paidRM >= f.owedBefore` for the window; the canvas's "settled every cycle" is a historical claim the window does not prove.

**Headline and total are always loss-toned** `small · no migration`
- Canvas: the figure's colour is data — `--loss` on the revolving card, `--muted-foreground` on the settled one; the total row likewise `--loss` vs `--foreground` (two different tokens, not one shared "muted").
- Now: `text-loss` hardcoded on both, so a card that has never carried a sen paints its float the colour of debt — the same error the "Float is not debt" sentence exists to prevent.

**The closing note generalises away the two months that make the lag concrete** `small · no migration`
- Canvas: "RM 3,717.16 was lived in July and pays in August."
- Now: "was lived in one cycle and pays in the next". The lived month is the month of `f.from` (or of the window's midpoint), **not** `f.to` — `f.to` is the closing date and would print "lived in August and pays in August". The pays month is the closed statement's `due_date`; do not substitute `cycle.dueOn`, which is computed from today.

**The total row does not name the month** `small · no migration`
- Canvas: "Spent on the card in July".
- Now: "Spent on the card" — an amount with no period attached. Neither endpoint reproduces both artboards (Maybank is its `from` month, CIMB its `to`); the month containing the window's midpoint gives July for both. Use `monthLabel` (full month name), not `monthYear` ("Jul 2026").

**The lead paragraph drops "and charges", the "Two closing balances." beat, and the month** `small · no migration`
- Canvas: "…spending and charges that have already happened… it is the whole of last month's card activity, in one subtraction. Two closing balances. No transaction was needed to know it."
- Now: three of those are gone (four counting "card"), and "and charges" matters because `interest_charged` and `fees_charged` are inside the two balances the subtraction reads.

**The date range prints the two reading dates, not the cycle they bracket** `small · no migration`
- Canvas: "7 July → 6 August" — starting the day after the earlier close, months spelled in full.
- Now: `dfmt(f.from) → dfmt(f.to)` renders "6 Jul → 6 Aug". `cardFloat`'s own comment already treats the cycle as starting the day after `from`, so shift the start only. Add a `{day, month:'long'}` variant rather than changing `dfmt`, which the row labels and Overview also use.

**The "Paid off it" row loses the payment date** `small · no migration`
- Canvas: "Paid off it on 8 July" — the date is what shows the payment landed inside the window.
- Now: a bare label, though `cardFloat` already returns the payment rows and nothing reads them. Three cases, not two: none (keep the label bare rather than invent a date), one (format with `dfmt`, matching its neighbours), several (an open wording decision).

**The derivation rows have no rules, so the total does not read as a total** `small · no migration`
- Canvas: a hairline above each row, the heavier `--border` above the total, 7px/9px vertical padding.
- Now: `gap-1` with a rule above the last row only. Weight is already correct — the total inherits `font-semibold`.

**Float is a bordered strip inside a 560px sheet, not a card beside the cycle** `large · no migration`
- Canvas: Float is its own Card, two-up beside "The cycle", so the cycle and the float it produces are read side by side.
- Now: a `border-t` strip stacked below the cycle inside a sheet capped at 560px — where the canvas's own `minmax(430px,1fr)` grid would collapse to one column anyway. Only promoting the single-card view to a screen delivers the side-by-side reading. Do **not** restore the canvas's `clamp(32px,4.4vw,50px)` type: the whole app rescaled headline figures to 25-30px, and this one would become a lone outlier.

### Plans

**A rated plan's two billed lines are never split** `medium · no migration`
- Canvas: "The statement bills it as two lines — 241.35 principal and 21.72 interest".
- Now: one figure. Worse than cosmetic: the card's `principalThisMonth` is `minimum − revolving-band interest`, so the whole RM 263.07 books as principal and the RM 21.72 as equity, and that feeds `commitmentsTotal`'s interest/principal split rendered on Loans. Derive interest as `amount × rate / 1200` and principal as `instalment − interest` (the bank's rounded instalment is the stored truth); return null, not 0, for a genuinely 0% plan or the "no interest line beneath it" distinction is erased. Note the charge row the canvas puts this in has no host — see §3.

**A plan's rate is never measured against the card's own APR** `small · no migration`
- Canvas: "about 16.2% effective. Above what simply carrying the balance costs." — 15% is the comparison that makes 16.2% mean something.
- Now: the effective rate is stated and said to "compare with every other rate on screen" without the comparison being made, though `c.apr` and `p.effective` are both in the same closure. The 0% branch ("Its near-namesake EzyPay is genuinely free") is already built. Same clause belongs in the plan dialog.

**The rate is stated one way, not three** `small · no migration`
- Canvas: "0.75% a month, or 9% flat, or about 16.2% effective".
- Now: effective only. `planEffectiveRate` already computes the combined flat figure internally and discards it — a fee-only plan's flat rate is not `p.rate` (it is 0). Follow the loans pattern ("X% flat = Y% real"), and pick a distinct field name: `loanSchedule` already returns a boolean called `flat`.

**What kind of plan each row is** `small · no migration`
- Canvas: the row's second slot is a kind note — "RM 7,000 drawn to account", "a posted charge, converted", "EzyPay, at the merchant".
- Now: the merchant string only. The kind survives one bit (`isSpending: kind === 'EPP'`) but a cash instalment cannot be told from a balance transfer. The four phrasings already exist in the plan editor's Select — lift them into one shared map used by the editor, the sheet and CommitmentRow, and interpolate the amount into the "Not spending" clause.

**The bank's printed instalment counter is parsed and thrown away** `large · no migration`
- Canvas: "counter checked against the app's own count" on the plans header, with disagreements raised on the *import* screen.
- Now: no check anywhere. But capture already exists in `src/` under different names — `maybankStatement.js:52` and `parse_maybank_statement.py:51` both parse `:NNN/MMM` into `instalment_no`/`instalment_of`; every consumer discards them. No column needed: reconcile in memory at import, summing lines that share a counter (EzyPay Plus bills principal and interest as two `:003/012` lines), compare against `instalmentsPaid(started_on, statement_date, tenure)`, raise a row in the import dialog on disagreement, and add the faint caption to the plans header.

**End date renders as a raw ISO fragment** `small · no migration`
- Canvas: "ends Nov 2026".
- Now: `p.endsOn.slice(0,7)` → "2026-11", in both the sheet and CommitmentRow (which renders on Cards, Commitments and Loans). `monthYear` exists in format.js and has no call sites yet.

**The NONE pill, the empty state, and the Add-a-plan label** `small · no migration` (three small entries)
- Canvas: the header badge always renders, reading "NONE" on a card with no plans; the empty state is a dashed box tying the absence back to the bar ("what the bill says is free and what is actually free are the same figure here — the one case where reading the statement alone is safe"); Add a plan is an `xs` outline button with visible text.
- Now: the badge is gated on there being plans; the empty state is a plain muted line listing plan kinds; Add a plan is icon-only. Use `size="xs"` (it exists) — the sibling Import button is `sm` on purpose.

### Statements

**A flat list, not the six-column table** `small · no migration`
- Canvas: `Closed | Closing | Minimum | Interest | Fees | Due` in a scrolling `min-width:460px` grid, every cell always printed — a zero is the statement saying it charged you nothing.
- Now: a wrapping flex row with no header; interest and fees are concatenated into a sentence and suppressed at zero, so a zero-interest month is indistinguishable from one never entered. Two things the rewrite must place: the delete RowAction has no canvas column, and the Due cell is a date *plus* a status badge.

**No PAID / UNPAID badge on a row** `medium · no migration`
- Canvas: UNPAID (cash) on the open bill, PAID (gain) on both settled ones.
- Now: a bare due date and no notion of settlement in the block. The window is statement→**due date**, which is deliberately *not* `cardFloat`'s statement→statement window — do not merge them into one helper. The canvas only names two states; part-paid and overdue are additions to decide on. Watch for a contradiction: `moneyByDay` already treats a commitment with *any* payment this month as paid and suppresses its due entry, so a card part-paid at the minimum reads as paid to the calendar while the new badge would say otherwise.

**Cycles with no statement recorded are not shown at all** `medium · no migration`
- Canvas: four consecutive cycles always, unread ones as faint em-dash rows — the em dash names a cycle that happened and was never imported (specified on both accounts).
- Now: only recorded rows map, so the twelve months the note says are sitting unimported are invisible. Walk `statement_day`/`due_day` backwards N cycles and left-join; unread rows get no status badge.

**The statement note is conditional, uncounted and hardcodes one issuer** `small · no migration`
- Canvas: a dashed box printed unconditionally — "One statement read so far…", "Two statements read. Twenty-one months of prompt payment is what holds this account at the 17% tier…".
- Now: rendered only when `statements.length === 1`, no box, and it names "Maybank" for every issuer. `commitments.lender` exists but is not on the row (`row.commitment.lender`, not `row.lender`). Only the leading count clause is generatable; the issuer facts need the account's own text or must be dropped, not mis-attributed.

**The Closed date drops the year; the header has no caption** `small · no migration` (two entries)
- Canvas: "6 Aug 2026" in Closed (Due deliberately stays "26 Aug"), and a faint 11px "one row a month, off the bill" caption in the header.
- Now: `dfmt` on both, and no caption — the build's Import and plus buttons occupy the slot the canvas gives it. `dfmtLong` exists and is not imported here. Leave the "what the bill asked for on 6 August" sentence on the short formatter.

### The header

**No card-names line, no state badge, bare-integer days, no header actions** `medium/small · no migration`
- Canvas: the sub-line opens with the pieces of plastic ("myimpact Visa Signature · PETRONAS Gold · limit RM 15,000 · 15% if carried · statement 6th, due 26th"), a CARRYING/PAID IN FULL badge sits in the title, and the header's right group carries "Import a statement" and an edit pencil.
- Now: the title holds the name alone (its flex/gap classes waiting for badges that never arrive); the description ends at "statement 6, due 26" with raw integers and no card names; the sheet has no button row at all — Import lives three panels down labelled just "Import", and editing the account requires dismissing the sheet. The names need a form field, not a table: `commitments.note` already exists and is completely dead (the form's state has no `note` key). Prefix conditionally — an account whose name *is* the card would print it twice. `openStatementImport()` from the list header silently pre-selects the first active card, so a bill can be imported into the wrong account today; passing `{ commitment_id: c.id }` from the sheet header fixes the identified-account case.

**The account's payment-history clause** `medium · no migration`
- Canvas: "…· settled every cycle since Nov 2024" — the evidence behind the badge, and the reason the account holds the 17% tier.
- Now: the description ends at the due day; nothing walks statements for consecutive full settlement, and no per-statement "settled by its due date" test exists anywhere (a prerequisite). `cardFloat` is the pattern — generalise its filter-and-sum past the newest two statements, and stay silent below two cycles rather than printing the canvas's "Nov 2024", which the stored rows do not support.

**The alert comparing a carried balance against what money earns** `medium · no migration`
- Canvas: destructive alert — "A carried balance costs more than anything you hold earns. 15% against ASB's 5.75%. That is not advice — it is two rates this app already knows, stated in the same unit." — and a default-variant counterpart on the settled card.
- Now: no Alert anywhere on Cards or CardSheet; the APR appears three times as a neutral label and is never compared to anything. `latestRate`/`totalRate`/`withRates` already produce the 5.75%; what is missing is a selector for the best rate across held assets, and a home — the canvas puts this inside the charges card, which does not exist (§3).

---

## 3. Needs a schema change

Everything above is an afternoon each. These are migrations, and two of them are decisions before they are migrations.

**Per-card transactions** `large · migration`
- Canvas: "Transactions worth keeping" — a count badge ("9 OF 42 ROWS KEPT"), a five-column table (Bought | Posted | Merchant | Amount | Reads as) with foreign-currency notes and REVERSED/REFUNDED pairs, closing with why thirty-three rows were left uncategorised.
- Now: no panel, and the rows are not kept. The ingest either books a line as an expense (discarding the posted date; the merchant survives only as free text in `expenses.note`), matches it, ignores it or returns it unmatched. The parser already emits `posted`, `transacted` **and** a `foreign` block — all discarded on every import. Needs `public.card_transactions` (commitment_id, statement_id, transacted_on, posted_on, description, amount, orig_currency/orig_amount/fx_rate, kind over retail/instalment/credit/rate, disposition, expense_id, unique ext_id for idempotent re-import). Note the "Reads as" badge is not one enum: category when booked, disposition when not, plus derived FOREIGN and a reversal link.

**Typed charges per statement** `large · migration`
- Canvas: "Charges this cycle, and what they cost" — Interest charged, Late payment, Cash advance fee, EzyPay Plus interest, Overseas conversion, each printed *even at zero*, because a card costs nothing only if each named way it could cost you came out at zero.
- Now: `card_statements` stores two untyped aggregates, so an annual fee cannot be told from a late fee and a not-incurred kind cannot be shown at all. Needs `card_statement_charges (statement_id, kind, amount)` or typed columns — but drop PLAN_INTEREST from the enum and derive it from `card_plans`. The real blocker is upstream: the importer hardcodes `interestCharged: 0, feesCharged: 0` on every import, so even the existing aggregates only carry data when a statement is keyed in by hand. A new table inherits the same empty pipe unless the ingest emits typed charge lines.

**Account-level fee terms** `large · migration`
- Canvas: every charge row carries the rule that produces it — "1% of the statement balance, RM 10 floor and RM 100 ceiling — not incurred"; "no interest-free period anywhere: 18% from the transaction date, plus 5% with an RM 15 floor".
- Now: the card stores `apr`, `min_payment_pct`, `min_payment_floor` and nothing else; no fee term is stored or shown. Needs `late_fee_pct/floor/ceiling`, `cash_advance_pct/floor/apr` (18% is not derivable from a 15% retail APR), `annual_fee`, `fx_markup_pct` on the REVOLVING shape. Scope out the annual-fee waiver line — "waived on five swipes a year, and there were forty-one" needs a countable per-card swipe tally, i.e. the transactions table above.

**A card count on the account** `large · migration`
- Canvas: a neutral badge "2 CARDS, 1 LIMIT" / "1 CARD" beside the account name in the sheet, and "· across 2 accounts and 3 cards" on the all-cards committed figure. The point is that plastic and limits are different quantities.
- Now: nothing knows N. `credit_limit` even carries a comment saying two cards can share one limit without recording how many, and it cannot be inferred from an import (the parser emits card *numbers*, and drops any card settled to zero on that statement). Two verified corrections disagree on shape: one prefers a `public.cards` child table, the other a single `commitments.card_count integer` — and the canvas's own capture path is a single "Cards on this account" field with placeholder "2", while `cards-plan.md:851` states "No `cards` table". The cheap resolution is one nullable integer column plus a form field; the individual card names ride on the existing dead `note` column and need no table. While you are there, `const cards = out.rows.length` on Cards.jsx names three render sites for a value that is the account count — rename it to `accounts` so a real card count can take the name.

**Rewards** `large · migration — but a product decision first*
- Canvas: a footer strip — "Cashback earned, this cycle RM 38.42", noted that the RM 25 cap was reached on the 14th; or "1,224 pts… worth about RM 12.24, but only in RM 50 blocks, so today it redeems as RM 10.00".
- Now: nothing, and nothing stores a reward scheme or a per-cycle amount. This is a documented refusal, not an oversight: `cards-plan.md:868` lists rewards under "Deliberately not built" ("a screen that would quietly argue for spending. A different product"), and the parser *implements* the refusal, using 'TreatsPoints' and 'Mata Ganjaran' as stop markers to discard the rewards page. Resolve the canvas-vs-plan conflict before writing any column. The cap-reached-on-the-14th sentence additionally needs the transactions table, since `expenses` has no `commitment_id` and no merchant field.

---

## What I would build first

**1. The carried / settled distinction, and the billed-unpaid balance it implies.** One derivation with a dozen render sites, and the only reason the screen currently misstates its own subject. Today an account that settles every cycle is either drawn as carrying debt with RM 8.68/mo of interest the bank never charged, or its RM 612.40 bill disappears out of Committed *and* out of Actually available — and the billed instalment on the other account is counted in neither. That is precisely "what a bill says is not what is free", failing in both directions. It fixes the CARRYING/PAID IN FULL badge, the em-dash Cost of carrying, band 1 and band 2, the Due-next amount, the hero's billed/still-to-be split, and the `clearAmount` line that has sat dead in `moneyByDay` since it was written. No migration.

**2. The per-account row, assembled, with "Two limits, not one pool" instantiated.** The screen's thesis is that two limits are not one pool, and right now one account is split across two cards under two labels — "free" here, room there — with the paragraph carrying the argument naming no account, no amount and no rate. Building the row (state badge, three-band bar, the four canvas-named stats, the terms line, whole-row click and chevron) and folding the room card into it makes an account a single object you can compare against another, and lets the note say "RM 24,387.60 free on CIMB cannot pay the Maybank bill — at 17% instead of 15%" rather than gesturing at it. No migration. Do the tab-strip-vs-sheet decision consciously alongside, but it is not a prerequisite.

**3. The float panel's second voice, its tone, and its two named months.** Float is the whole reason Expenses lags a month, and this panel is the only place the app explains it — yet it speaks one voice: a card paid in full since 2024 is told "This is why Expenses lags" in words that name neither month, with its float painted the colour of debt. Adding the settled-card lead and note ("Float is not debt — it is spending that has happened and has not yet left your wallet"), toning the two figures off `revolving`, and naming the lived and paying months on the total row and the closer turns an abstract principle into this card's fact. Small, no migration, and it is the sentence a user needs before they believe any other number on the screen.
