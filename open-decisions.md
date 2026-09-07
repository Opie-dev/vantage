# Vantage — the open decisions, and what I would do

`money-redesign-plan.md` §6 and `income-canvas-gaps.md` §7 each end with a short list of things
that want deciding before they want code. This is one recommendation per item, with the reasoning
attached, so the choice is to accept or reject a position rather than to weigh four questions from
cold.

Written 7 September 2026, against `main` at `36fe462`. Each recommendation says what it is worth:
whether accepting it means writing code, changing a document, or doing nothing on purpose.

**Two of the four are not open.** They were answered in code and the documents were never updated,
which is the third and fourth time in this repo's audit trail that a finding has inverted on
reading the source rather than the summary. That pattern is the most useful thing in this file.

---

## 1. Where a daily FX rate comes from — **already answered, and shipped**

**Listed as:** *"Storing the pair is easy; sourcing it is not, and a wrong rate kept forever is
worse than one global rate that is visibly approximate."* (`money-redesign-plan.md` §6, §4c.)

**What is actually true.** Every part of this is built and running.

- **The source is Bank Negara**, `api.bnm.gov.my/public/exchange-rate`, free and unauthenticated.
  The migration that introduced it says so outright — *"It is answered now"* — and gives the
  reason the question closed: BNM is the source a Malaysian tax filing uses, so the app's figure
  and the owner's return agree by construction rather than by luck. The middle rate is taken, not
  buying or selling, because those are counter prices and this is a reference.
- **Weekends are handled and disclosed**, not papered over. BNM publishes on working days, so money
  landing on a Saturday is converted at Friday's rate and `fx_date` records that it was Friday's.
  The walk-back is capped at four days: beyond that the date is wrong, not unpublished.
- **It never guesses.** Unreachable, or a date BNM has nothing for, returns null; the caller stores
  null and the screen falls back to the global rate labelled approximate. This is exactly the
  failure mode §6 was worried about, and it was designed against.
- **It is wired, not merely written.** `income.service.js:180` calls `fx.rateOn(s.currency, date)`,
  and the live `fx_rates` table holds cached rows. This is the check that matters, because this
  repo has already produced one function that was correct and had no callers.

**Recommendation: strike it from §6.** No code. The only work is deleting a paragraph that
describes an open question the repo closed, and which would otherwise send the next reader looking
for a rate source that is already answering.

---

## 2. Which basis is the headline — **answered in principle, one placement left**

**Listed as:** run rate answers *"what does a usual month cost"*; falling-this-month answers
*"what happens in August"*; the canvas needs both and has room for one.

**What is actually true.** The principle is settled and implemented, and it is settled the right
way — *show both, labelled, and never mix them in one column*.

- `Commitments.jsx` leads with **"TWO TOTALS, TWO QUESTIONS"**, shows the pair side by side, and
  names the difference as exactly the annual items that do not land this month, *"because a screen
  with one of them invites the other to be guessed at."*
- `overviewRows()` keeps the run rate **out** of the measured column deliberately, and records
  why: the canvas mixed them — an annual charge amortised in one row and whole in the next — and
  *"the column stopped adding up by exactly the road tax."* A run rate *"belongs beside this,
  clearly labelled, never inside it."*

So §6's framing — pick one — was already rejected in favour of a better answer. What genuinely
remains is narrower than the plan makes it sound: **the sidebar has room for one figure.**

**Recommendation: the measured basis in the sidebar, the run rate labelled beside it.**

The measured figure is the one that *closes*. It comes from `spendingFor()`, is bracketed by two
wallet readings, and satisfies `inflow − committed − saved − walletDelta = spent` exactly — which
means a reader can check it against a bank statement. A run rate can be checked against nothing;
it is an average, and an average in a sidebar reads as a fact. When a figure will be glanced at
rather than studied, put the one that can be wrong in a detectable way.

The run rate keeps its place on Commitments, where it has the room to say what it is.

**Worth:** small, and mostly copy. The derivations both exist.

---

## 3. Rewards: build the strip, or honour the refusal — **honour the refusal**

**The conflict, which is real.** Three artefacts in this repo disagree, and they are not equally
weighted:

| | Position |
|---|---|
| The design canvas | Specifies a footer strip — cashback earned this cycle, the cap reached on the 14th, points worth about RM 12.24 but redeemable only in RM 50 blocks |
| `cards-plan.md:868` | Lists rewards under **"Deliberately not built"** — *"a screen that would quietly argue for spending. A different product."* |
| `sync/parse_maybank_statement.py` | **Implements the refusal**, using `TreatsPoints` and `Mata Ganjaran` as stop markers to discard the rewards page outright |

**Recommendation: keep the refusal, and correct the canvas.**

Two reasons, and the second is the one that decides it.

The weaker reason is arithmetic: two of three artefacts agree, and the canvas is the one the
repo's own documents repeatedly warn is a mock whose figures are seeded rather than derived.

The stronger reason is that the refusal is **argued** and the canvas is not. `cards-plan.md` does
not say rewards are hard or low-value; it says a rewards panel changes what the app is for. That is
a product thesis, and this app is unusually consistent about it — Expenses infers spending rather
than asking you to log it, the waterfall stops at *uncommitted* rather than calling it surplus, and
the canvas's own privacy blur was rejected because it leaked magnitude. A panel whose job is to
make spending feel productive is out of character in a way no other pending item is.

Note what changed and does **not** change this: the cap-reached-on-the-14th line needed a per-card
swipe tally, which `card_transactions` now makes possible. The technical objection has eased. The
product objection is untouched, and it was always the real one.

**Worth:** no code. Two edits — remove the strip from `design/cards/`, and add a line to the canvas
notes saying the omission is deliberate, so this does not get re-raised as a gap by the next audit.

---

## 4. Statutory rate tables: ship the table or ship nothing — **ship nothing**

**Listed as:** only relevant if the app is ever to *compute* a deduction rather than record one.

**Recommendation: ship nothing, and write down why, so "nothing" reads as a decision rather than
as an omission.**

The app stores per-payslip amounts and sums them. The primary-source reader's conclusion was that
this shape carries **no exposure at all** — *all* the risk was in the copy describing the
deductions, and that copy was corrected in #42. The app is already right, and it is right by
recording rather than by deriving.

What building tables would cost, all of it real:

- **Versioning by effective-from date is mandatory, not optional.** The EPF Third Schedule changed
  on 1 Oct 2025 (Parts B and D deleted, Part F added), PERKESO's ceilings on 1 Oct 2024, SKBBK
  steps again in 2028 and 2031, and LHDN respecifies PCB annually. A table without an
  effective-from column is wrong for every historical payslip the moment a rate moves.
- **PERKESO's amounts cannot be derived by formula.** Its tie-breaking is not a standard rounding
  mode, and the legislature agrees: Act A1788 substitutes the whole Third Schedule and states
  **ringgit amounts only, band by band — no percentage appears in the Act.** The 0.75% every
  summary quotes is PERKESO's FAQ plus arithmetic (44.65 ÷ 5,950 = 0.7504%). When the statute
  itself ships a table rather than a rate, re-deriving the rate is a harder and less accurate path
  than the one the law took.
- **The source document contains a trap.** LHDN's own MTD spec applies the EPF cap annually and
  cumulatively — the monthly figure is not clipped — and its worked examples on printed pages 46–50
  carry a stale `≤ RM 6,000.00 (limit)` label directly above arithmetic that uses RM 4,000, in four
  places. An implementer reading the label rather than the arithmetic builds the wrong cap **from
  the correct document.**

That last point is the argument in miniature. The failure mode here is not "we could not find the
rates" — it is "we found them, read them carefully, and still got them wrong." Against that, an app
that types in what the payslip already computed is not the lazy option. It is the accurate one.

**Worth:** no code. One paragraph in `income-canvas-gaps.md` §7 turning *"ship the table or ship
nothing"* into a recorded decision, with the conditions that would reopen it — the app needing to
*project* a future payslip rather than record a past one.

---

## What this leaves

Nothing in this file needs a migration, and only item 2 needs code — a placement change and some
copy. Three of the four resolve by editing documents so they stop describing questions the repo
has already answered.

That is worth stating plainly, because it is the pattern of this whole audit trail. Four findings
have now inverted on reading the source rather than the summary:

| Finding | What the document said | What the code said |
|---|---|---|
| The wallet account | No account is marked `WALLET` | `Personal Saver Account-i` is, and has been |
| `NAV_GROUPS` | The three-run rail is missing | Main groups the rail already, by a better mechanism |
| The FX rate source | Where a daily rate comes from is open | BNM, shipped, wired and caching |
| The headline basis | Pick one of two | Both, labelled, never mixed — already implemented |

The documents are not careless; they were accurate when written and the code moved. But it means
**a plan document is a lead, not a verdict**, and the cost of checking is a few minutes against the
cost of building something that already exists — or worse, replacing something better with
something staler, which is what porting `NAV_GROUPS` would have done.
