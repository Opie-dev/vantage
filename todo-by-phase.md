# Vantage — the open work, by phase

The four planning documents in this repo each audit one surface and end with their own list of
what is left. This file is the single place those lists are sequenced and tracked. It holds no
argument and no research — when an item needs the reasoning behind it, the source document is
cited and that is where the reasoning stays.

Sources: `money-redesign-plan.md`, `commitments-and-income-plan.md`, `cards-canvas-gaps.md`,
`income-canvas-gaps.md`.

Last reconciled against the code and the live database on **7 September 2026**, with `main` at
`36fe462`.

## How to read this

| Marker | Meaning |
|---|---|
| `[ ]` | Open |
| `[~]` | In progress, or under investigation |
| `[x]` | Done |
| **(owner)** | Needs the owner's own data or judgement. Cannot be delegated — an invented figure in a finance app is worse than a missing one |
| **(decision)** | Blocked on a decision, not on effort |
| **(migration)** | Needs `db/schema.sql` to change |

The phase order is a dependency order. Where a document states the dependency itself, it is quoted
at the item; the rest is sequencing applied on top.

---

## Phase 1 — Make the app tell the truth about itself

No decisions and no design. Each item makes a later phase verifiable instead of speculative.

- [x] **A `WALLET` account exists.** `Personal Saver Account-i` (asset id 24) is marked `WALLET` in
      the live database. `money-redesign-plan.md` §7 records that no wallet existed; that note is
      **stale** and should not be acted on again.

- [ ] **Record a second balance reading on the wallet.** **(owner)**
      The account carries exactly one `BALANCE` entry — RM 9,368.98 on 2026-09-06. One reading is a
      point, not a window, so no month closes: September falls to `NO_CLOSING_READING` (the 6th
      becomes the opening and nothing follows it) and August to `NO_OPENING_READING`.
      Record one dated **on or before 1 September** — an anchor from the previous month is accepted
      by design, so 31 August works — and September closes with the 6th as its closing reading.
      Thereafter one reading per month end keeps it running.
      *This is the single cheapest unblock in the whole list.* Behind it sit `spentRM`,
      `livingCostRM`, the Overview column, the month strip on all six Money screens, the coverage
      bar and the two-bases panel.

- [ ] **Record the day job's payslips.** **(owner)**
      `firmRM` is RM 0.00, so the salary draws faded as an estimate, and Overview, Goals and the
      Calendar all read that figure. `income-canvas-gaps.md` calls this out as not a build item but
      the one that gates the whole Income page: *"Everything below is worth less until this is
      done."*

- [x] **Re-check everything priced off SBR = 2.75% — done, 7 Sep 2026. The rate did not move.**
      BNM's MPC **held at 2.75%** on 3 September 2026: *"the Monetary Policy Committee (MPC) of
      Bank Negara Malaysia decided to maintain the Overnight Policy Rate (OPR) at 2.75%"*
      (`bnm.gov.my/-/monetary-policy-statement-03092026`). That is the seventh consecutive hold
      since the −25bp cut of 9 July 2025. SBR follows by regulation, not by observation — the
      Reference Rate Framework paras 9.2 and 9.3 set SBR = the prevailing OPR exactly — so
      **`SBR = OPR = 2.75%, unchanged since July 2025` is confirmed and is not stale.** No figure
      in the app or the documents needed changing on account of the decision.
      **Next MPC meeting: 5 November 2026.** The staleness note at
      `commitments-and-income-plan.md:874-875` was repointed to that date on 7 Sep 2026 and now
      records the result of this check rather than asking for it.

      Two real corrections came out of the check anyway:

      - [x] **The housing-spread range was attributed to BNM, which has never published one.
            Corrected 7 Sep 2026** — `:343-344` now labels the range as observed and sampled, with
            the RRF paragraph numbers showing what BNM does and does not specify, and the settled
            table carries a separate **Housing spreads** row marked *observed market pricing, NOT
            BNM guidance* so the primary-sourced row above it stays honest.
            `commitments-and-income-plan.md:784` carries *"housing spreads SBR + 1.25% to
            + 2.35%"* in a row labelled **Reference rate**, inside a table whose header states it
            is *"answered from primary sources — Bank Negara policy documents"*; `:343-344`
            repeats it with derived *"published effective rates of 4.00% to 5.10%"*. A full read
            of the March 2026 RRF finds **no numeric spread guidance anywhere** — no cap, no
            floor, no range. Para 1.4 leaves lending rates to *"FSPs' internal and commercial
            considerations"*; 9.4 defines only `lending rate = SBR + spread`; 9.5 lists what the
            spread must cover; 9.8/9.9 restrict when it may rise. The **SBR = OPR** half of that
            row is properly primary-sourced; the spread half is **observed market pricing wearing
            a regulator's attribution**. Relabel it as an observed range with a date stamp — it
            will drift with no BNM announcement to signal the drift, which is exactly why the
            mislabel matters.

      - [~] **The Reference Rate Framework was reissued 27 March 2026 under the same PD number.**
            **Citation corrected 7 Sep 2026** — `:887` now carries the version date, the effective
            date and the note that the number stayed while the content changed.
            **Still open, and deliberately not applied yet:** the docs already have the 60-day
            instalment-repricing deadline (`:339`), but are missing: **Phase 2 shortens it to 30 calendar days from 2 January
            2028** (para 9.13/9.14), and the customer must receive the revised instalment and its
            effective date **at least 7 calendar days beforehand** — 60 where the loan is
            administered by a government-related entity (para 9.15). Relevant only if the app
            ever models the lag between an OPR move and the borrower's instalment changing;
            60 calendar days is the current regulatory ceiling.

      **Two sourcing traps caught, recorded so they are not walked into again.** A search-engine
      AI summary asserted the SBR was *"revised from 3.85% to 3.60% in March 2026"* — false;
      both figures are placeholders inside Appendix 1's template notification letter, which also
      contains `[DD/MM/YYYY]` and `ACCOUNT NUMBER: XXXXXXXX`. And `bnm.gov.my/base-rates/blr`
      serves a table *"as at 6 August 2020"*, predating the SBR regime entirely — do not cite it.
      BNM publishes no live consolidated SBR table; the figure is established by regulation
      (SBR = prevailing OPR) plus the OPR from the MPS.

      **Scope of any future rate move is known, and it is small.** A full sweep of `src/`, `web/src/`, `db/`,
      `design/` and the root documents found **no OPR-pinned constant anywhere in code or SQL** —
      the literal `2.75` does not occur in any source or schema file, and `SBR`/`OPR` appear only
      in one explanatory comment (`web/src/lib/calc.js:2661`). Verified directly, not only
      reported. **An OPR move is therefore a data edit, not a code change:** every rate the app
      reasons about is a column — `commitments.rate` / `rate_type` / `instalment` (whose own
      migration comment already anticipates this: *"since 1 Jul 2026 a rate change moves THIS
      rather than the tenure, so it is not stable"*), `commitments.apr`, `assets.last_rate`, the
      `declared_rates` table and `card_plans.rate`.

      The prose to correct, once the decision is known, is four lines in one file:
      `commitments-and-income-plan.md:343-344` (the rate, the spreads, and the derived
      *"published effective rates of 4.00% to 5.10%"*), `:784` (the settled-findings table),
      and `:874-875` (the staleness note that named this date). Candidate on the canvas:
      `design/assets/Money.dc.html:241` shows `4.10%`, which sits inside the SBR + spread band —
      a mock figure, so confirm before touching it.

      The sweep found four non-OPR rate literals in code as a by-product. Two are seed catalogues
      with a documented editable override (`web/src/lib/institutions.js`, where `withRates()` lets
      the user's `declared_rates` row win and `rateIsStale()` reports rot) and satisfy the spirit
      of the "no constants" rule. Two are bare form defaults with no such backstop —
      `App.jsx:2785` defaults a new card's APR to `18`, and `:2789` defaults
      `min_payment_floor` to `50`. Both seed an editable column, so the worst case is a wrong
      prefill; logged here rather than in a phase, since 3 September does not touch them.

- [x] **Regenerate `db/schema.sql`.** Verified 7 Sep 2026: a fresh
      `pg_dump --schema-only --no-owner --no-privileges` is **identical to the committed file apart
      from line endings** (the file is CRLF, pg_dump emits LF; 1,247 lines either way).
      **No action — do not commit a regeneration**, because it would land as a 1,247-line diff of
      pure line-ending churn and bury any real schema change that followed it. The hand-sync across
      two migrations is confirmed reliable, which was the open question.

- [~] **Repo hygiene.** Branch deletion and `git push` stay the owner's call.

      **Read this before any future branch cleanup: `git branch --merged` is useless in this
      repo.** PRs are squash-merged, so ancestry is broken by design and the command reports
      nothing as merged even when its content landed months ago. Compare **tip trees and blob
      hashes** instead. This is the single most useful thing the investigation produced, because
      the obvious command gives a confidently wrong answer.

      - [x] **`tmp-p3` — deleted 7 Sep 2026** (was `4a76bde`, recoverable by SHA should it ever
            be wanted, though its content is in `main` regardless). Proven redundant before
            deletion, and independently re-verified: its tip tree
            (`43c0295c…`) is byte-identical to main's `2ffde4a`, `git diff 2ffde4a tmp-p3` is
            empty, `2ffde4a` is an ancestor of main, and `git cherry main tmp-p3` marks all three
            commits `-`. Its patch-ids match main's `7612c79` (#31), `e707d86` (#29) and
            `2ffde4a` (#30) one-to-one. A pre-PR staging branch whose content landed under new
            SHAs. **No hunk is unique to it.**

      - [x] **`rail-groups-and-fold` — keep, do not delete.** It holds the only genuinely
            unmerged work in the repo. Promoted out of hygiene to **Phase 1a** below, because it
            is a feature port rather than repo tidying.

      - [ ] **Remote branches — all 12 safe to delete; none holds work absent from main.**
            Every one of their squash commits is already an ancestor of `main`, which is the
            decisive safety property. Nine have a tip tree byte-identical to that commit;
            `cards-canvas-gaps` and `income-canvas-gaps` are blob-identical across every file
            they touch (the latter's subject was reworded in #42, which is why matching by
            message fails); `phase-7-expenses` is tree-identical to `bbbf732` (#33), both its
            commits squashed into that one PR.
            Three differed from their squash commit and were resolved by inspecting the lines
            unique to the branch — all superseded, none lost, each re-verified here:
            **`cards-cycle-and-float`** differs in one file only, and the two lines unique to it
            are stale Phase 8 plan prose that main rewrote when the phase closed;
            **`phase-8-close`** carries seven lines that are the pre-FX forms of an insert column
            list, its parameter list and a date CHECK — all rewritten in place by #35, whose
            column list still stands in `src/models/income.model.js` on main;
            **`cards-canvas-gaps`** differs only by predating later main work, its single file
            blob-identical upstream.
            Branches: `card-timeline-today`, `cards-canvas-gaps`, `cards-carried-settled`,
            `cards-cycle-and-float`, `fix-dead-card-actions`, `import-pdf-in-process`,
            `income-canvas-gaps`, `phase-5-item-assets`, `phase-6-commitments-income`,
            `phase-6b-per-date-fx`, `phase-7-expenses`, `phase-8-close`.
            **Keep `rail-groups-and-fold`** — see above.

      - [x] **`.claude/settings.json` — staged for tracking, 7 Sep 2026.** Contents are two portable settings only
            (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`, `teammateMode`): no secrets, no absolute
            paths, nothing host- or user-specific. The repo's convention already answers the
            question — `.claude/launch.json` has been tracked since the initial commit and
            `.gitignore` carries no `.claude/` rule at all, so `.claude/` is shared project
            config here, not local scratch. Both verified directly.
            One caveat to weigh: `teammateMode: "auto"` is a workflow preference rather than a
            project fact, so tracking it makes it the default for anyone who clones. Costless on
            a solo repo; if collaborators ever join, the conventional home for a personal
            preference is `.claude/settings.local.json`.

- [ ] **Land the current branch.** **(owner)**
      `overview-flow-and-loans-copy` is 2 commits ahead of `origin/main` and unpushed.

---

## Phase 1a — Port the rail grouping and the keyboard shortcut — **done**

Unblocked, independent of every other phase, and the only unmerged work left in the repo. It sat
here rather than in a later phase because the branch it lived on would rot as `App.jsx` moved on.

- [x] **Done 7 Sep 2026, on `rail-fold-shortcut` (two commits, off `main`).** Lint, `vite build`
      and the smoke suite all pass, with three assertions added.
      `rail-groups-and-fold` could not be merged: main reimplemented the fold itself after that
      branch diverged (`6d017f2`, `720ddd2`), reaching the same 212px ⇄ 58px widths and the same
      per-device reasoning by different code (main's state is `wide`, the branch's `collapsed`).
      So only the parts main never grew were taken.
      - **⌘B / Ctrl-B**, bound in `TopBar` beside the button it duplicates, with the tooltip
        naming it. Skipped while typing, since the pair means bold in a text field. The smoke
        test dispatches the key **on an input** rather than at the window, because the guard reads
        only the event's target — fired at the window it would pass while the guard did nothing.
      - **`foot: true` on Settings**, hanging it at the bottom of the column via `mt-auto`.
      - **Three runs — Portfolio / Planning / Money**, every entry carrying a group.

- [x] **`NAV_GROUPS` was deliberately NOT ported, and the audit finding that asked for it was
      wrong.** Recorded because it is the clearest example in this file of why a search result is
      not a verdict. The constant is genuinely absent from main, which is what the audit reported
      — but the **feature** is not: main already groups the rail per entry via `TABS[].group`,
      rendering a heading when wide and a rule when folded. And the branch's constant names
      `positions`, `instruments`, `wallet` and `money`, four screens that stopped existing when
      Money split into six (#31). Porting it would have replaced a working mechanism with a stale
      one and dropped the six Money screens into an unnamed leftover group.
      The lesson worth keeping: **an audit that greps for a symbol finds the symbol, not the
      capability.** Two of this file's findings have now inverted on reading the code — this one,
      and the wallet that already existed.

- [ ] **Delete `rail-groups-and-fold` once the port lands.** It holds nothing else.

---

## Phase 2 — Settle the decisions

No code. Each of these has downstream work that should not be written until it is decided, and
each is cheap to decide and expensive to get wrong.

**A recommendation for each is now written up in [`open-decisions.md`](open-decisions.md)** — what
is at stake, what the code actually does, and a position with its reasoning. **Two of the four
turned out not to be open at all.** Nothing below needs a migration, and only the second needs
code.

- [x] **Where a daily FX rate comes from — NOT OPEN. Answered and shipped.**
      The source is **Bank Negara** (`api.bnm.gov.my/public/exchange-rate`), free and
      unauthenticated, and the same source a Malaysian tax filing uses — so the app's figure and
      the owner's return agree by construction. Middle rate, not buying or selling. Weekends walk
      back up to four days with `fx_date` recording which day the rate actually came from. It
      **never guesses**: unreachable or unpublished returns null and the screen falls back to the
      global rate labelled approximate, which is precisely the failure mode §6 feared.
      **Wired, not merely written** — `income.service.js:180` calls it and the live `fx_rates`
      table holds cached rows. That check matters here, because this repo has already produced one
      function that was correct and had no callers.
      **Action: delete the paragraph from `money-redesign-plan.md` §6**, which otherwise sends the
      next reader hunting for a rate source that is already answering.

- [ ] **Which basis is the headline — the question is answered, the placement is not.**
      "Pick one" was already rejected in code, correctly: `Commitments.jsx` shows both under
      **"TWO TOTALS, TWO QUESTIONS"**, and `overviewRows()` keeps the run rate *out* of the
      measured column because mixing them once made it stop adding up by exactly the road tax.
      **What is left is only the sidebar, which has room for one figure.**
      Recommendation on the table (`open-decisions.md` §2): **the measured basis**, because it
      closes against two wallet readings and can therefore be checked against a statement, while a
      run rate can be checked against nothing and an average in a sidebar reads as a fact.
      Deferred by the owner on 7 Sep — it is a visible change to the most-looked-at screen and
      reversible by taste rather than right or wrong. Small when picked up: a placement change and
      copy; both derivations exist.

- [x] **Rewards — decided 7 Sep 2026: the refusal stands.** Recorded in `cards-canvas-gaps.md` §3
      so it is not raised as a gap again. Decided on the ground that **the refusal is argued and
      the canvas is not** — `cards-plan.md:868` does not say rewards are hard, it says a rewards
      panel changes what the app is for, and this app is consistent about that elsewhere.
      Two notes: `card_transactions` has since removed the *technical* objection while leaving the
      product one untouched, so any reopening is on the merits; and the strip is not in
      `design/cards/*.dc.html` at all, so there was nothing to remove from the design.

- [x] **Statutory rate tables — decided 7 Sep 2026: ship nothing.** Recorded in
      `income-canvas-gaps.md` §7 with the one condition that reopens it — the app needing to
      *project* a future payslip rather than record a past one. The specification stays beneath it
      for whoever does. The deciding argument was not difficulty: LHDN's own spec carries a stale
      `≤ RM 6,000.00` label above arithmetic using RM 4,000 in four places, and the statute ships
      ringgit amounts band by band with no percentage in it — so the failure mode is reading the
      rates carefully and still getting them wrong.

- [ ] **Close two stale document items.** No code, no decision left — only the doc is behind.
      - The FLAT loan "outstanding principal" question (`money-redesign-plan.md` §2.7 / §6) is
        listed as open, but the code keeps `owedIsInstalments` and the canvas was corrected in
        Phase 0. The recommendation is already implemented; §6 should stop listing it as open.
      - `epf_member` is specified in `commitments-and-income-plan.md` §4 and was never built; the
        form gates on `kind === 'EMPLOYMENT'` instead. The audit's verdict is that the substitution
        is fine and **the plan should be corrected rather than the schema**.

---

## Phase 3 — Income

Depends on Phase 1's payslips. The internal order is the audit's own, not applied on top.

- [x] **`employerCostOf()` has a caller — done 7 Sep 2026**, on
      `income-employer-cost-and-next-date` (off `main`). **Shown, not deleted.** It sits last in
      the meta line and never beside net, because what it cost to employ you is a fact about the
      employer and the money never passed through your hands — the function's own comment is
      right, and the answer was placement rather than omission. Rendered only where there IS a
      top-up, so a freelance or rental source carries no "cost" that merely repeats the gross
      printed next to it.

- [x] **"Next date" on the income row — done 7 Sep 2026**, same branch.
      `nextPayDate()` walks `dueDayIn`'s clamp forward rather than re-deriving it, so day 31 lands
      on the 30th in September and `-1` resolves to whatever the last day is. **Today counts as
      next** — a row that rolled forward the moment the date matched would say the salary was four
      weeks away on the morning it landed. An IRREGULAR source resolves to nothing rather than
      promising a date its cadence cannot keep.
      The rule and the resolved date both stay on the row: they are different facts in a short
      month, and "last working day" is a rule with no date in it at all, which is the case that
      wanted this most.
      Six clamp cases are asserted directly rather than through a row, because the ones that
      matter are the ones a fixture will never happen to hold — a 31st in a 30-day month, the pay
      day falling on today, and a December that must roll the year rather than only the month.

- [ ] **Per-deduction rule notes.** Every deduction carrying the rule that produced it.
      **Build these from the verified text, never from the canvas** — two of the canvas's four
      notes are wrong and a third is right but incomplete (`income-canvas-gaps.md` §0.3, §3).

- [ ] **The twelve-month income chart.** The largest single gap on the page: roughly 25 lines of
      derivation plus a card patterned on the twelve-month bars `Expenses.jsx` already has.
      **Explicitly gated on the payslips** — *"Build it after (3), not before — drawn on today's
      data it reports the opposite of the truth."* `income-canvas-gaps.md` §2.

---

## Phase 4 — Cards: the ingest before the tables

The ordering here is stated outright by the audit rather than inferred. The importer is the
upstream blocker, and *"a new table inherits the same empty pipe unless the ingest emits typed
charge lines."* Building the migrations first produces empty tables.

**The phase's own ordering turned out to be half right.** The ingest fix and `card_transactions`
are not two steps but one — there is no way to stop discarding a field without somewhere to put
it. Typed charges are a genuinely separate blocker, and not on a table.

- [x] **The ingest keeps every line — done 7 Sep 2026**, on `cards-ingest-keeps-what-it-parses`
      (off `main`), together with the table below.
      Both dates now survive, the location keeps its own column instead of being appended to the
      merchant where a rule would have to step over it, and the foreign block is stored rather
      than referenced nowhere. A `rate` row is the one kind not kept: it is a fact about the card,
      with no amount and no merchant.

- [x] **`card_transactions` — done, migration applied.** **(large · migration)**
      Not a widening of `expenses`, because most of these lines must never become spending — an
      instalment billing is counted through `card_plans`, a credit is a payment, and a
      rule-matched line is already subtracted as a commitment. Widening `expenses` would need a
      column meaning *"do not treat this as spending"*, which is the column that gets forgotten in
      a SUM. The link is `expense_id`, null far more often than not.
      `disposition` is the point rather than a status, and `card_transactions_booked_check` ties
      it to `expense_id` in both directions so a booked row that counts nothing cannot exist —
      which is why `expenses.findByExtId` is new: `insertImported` returns null on a re-import,
      saying a line was booked without saying by which row.
      Constraints exercised against the live schema in a rolled-back transaction: a booked row
      with no expense and a half-filled foreign block are both refused; an unmatched retail line,
      a complete foreign line and an instalment billing are accepted. `db/schema.sql` was
      regenerated from `pg_dump` **with the file's CRLF preserved**, so the diff is 99 lines of
      new table and zero deletions — the trick that makes regeneration safe here.
      **Note:** the migration is applied to the dev database, but the migration FILE lives only on
      that branch. `npm run db:status` from another branch will show a row it has no file for
      until the branch lands.

- [ ] **Typed statement charges — still blocked, but the reason is now known rather than
      guessed.** **(large · migration)**
      A real statement was read on 7 Sep 2026 (an August cycle), and it changes the shape of this
      item:
      **Maybank's statement has no charges box at all.** The summary carries only the combined
      credit limit, the previous balance, total credit and total debit this month, and a sub-total.
      Every charge is a *transaction line*, so the canvas's "Charges this cycle, each printed even
      at zero" cannot be transcribed from the statement — it would have to be **derived by
      classifying descriptions**, and a type that was not incurred leaves no line to classify.
      **A clean month exhibits almost no charge types.** That cycle was settled in full, so there
      was no retail interest, no late payment, no cash advance fee and no annual fee — the only
      charge line present was `EZYPAY PLUS -E12 INTEREST`, billed beside its principal line at the
      same plan position, exactly as the `card_plans` migration anticipated. And that is the one
      type the audit says to **derive from `card_plans` rather than store**.
      So: one more statement does not unblock this. What would is a cycle that actually **carried**
      a balance or a late payment, since only an incurred charge prints its own wording.
      Also worth knowing: the canvas lists "overseas conversion" as a charge, and there is **no
      such line** — a foreign purchase posts as one converted ringgit amount with the original
      currency and amount beneath it. Any markup is inside the rate, not itemised beside it.
      `card_statements.interest_charged` and `fees_charged` are still hardcoded to 0 on every
      import, and a new table would inherit the same empty pipe. The blocker is upstream of both:
      **the parser has no rule that recognises a charge line.** The only thing it matches near
      interest is `RETAIL INTEREST RATE = 15.00%`, which is a rate and not an amount, and
      `src/lib/maybankStatement.test.js` carries no charge line either — so neither the code nor
      the fixture can tell you how Maybank words an interest or late-payment row.
      **What unblocks it: the statement PDF.** Writing patterns for a bank's charge wording from
      guesswork is precisely how a wrong figure enters a finance app, and this repo's own rule —
      *before writing a rate into code, open the primary document* — applies to a charge line as
      much as to a rate.

- [ ] **Account-level fee terms.** **(migration, large)**
      `late_fee_pct/floor/ceiling`, `cash_advance_pct/floor/apr`, `annual_fee`, `fx_markup_pct` on
      the REVOLVING shape. The card stores `apr`, `min_payment_pct` and `min_payment_floor` and
      nothing else today. An 18% cash-advance rate is **not** derivable from a 15% retail APR.
      Scope out the annual-fee waiver line — it needs a per-card swipe tally, i.e. the transactions
      table above.

- [ ] **A card count on the account.** **(migration, large — but the cheap resolution is small)**
      Nothing currently knows how many cards share a limit; `credit_limit` even carries a comment
      saying two cards can share one without recording how many, and it cannot be inferred from an
      import. Two verified corrections disagree on shape (a `cards` child table vs a single
      `commitments.card_count` integer) and `cards-plan.md:851` states "No `cards` table" — the
      cheap resolution is one nullable integer plus a form field, with individual card names riding
      the existing dead `note` column.
      **Independent of the rest of Phase 4 and can move earlier.** While there:
      `const cards = out.rows.length` in `Cards.jsx` names three render sites for what is really
      the *account* count — rename it to `accounts` so a real card count can take the name.

---

## Phase 5 — Standing correctness items

**Investigated 7 Sep 2026, and four of the six were not what the audit described.** Three had
already been done or cannot occur; the one live case of the app being confidently wrong was not on
this list at all. Recorded in full so the next reader does not re-investigate four dead ends.

### The live one, which was not on the list

- [x] **A loan was recorded with the wrong rate type, and every derived figure for it was wrong.
      Corrected 7 Sep 2026.**
      `GX FlexiCredit Loan` (id 6) was stored `rate_type = REDUCING` at 13.94% over 60 months with
      an instalment of RM 616.58. That instalment is the **flat** figure, exact to the sen:
      `21,800 × (1 + 0.1394 × 5) ÷ 60 = 616.58`, where a REDUCING loan at 13.94% would instalment
      at 506.57. A match to the sen is not coincidence.
      **What it cost while it stood:** paying 616.58 against a falling balance at 13.94% clears the
      loan in **45.8 months rather than 60** — the app showed it finishing fourteen months early —
      and reported RM 6,433 of interest against the RM 15,195 a flat 13.94% actually charges.
      **Understated by RM 8,761.77.** It also displayed the cost of borrowing as 13.94% when the
      effective rate is **23.19%** by the Hire-Purchase Act's Seventh Schedule — which
      `flatToEffective()` already implements, and which agrees to 0.03pp with the rate obtained
      independently by solving the annuity for 616.58.
      This is precisely the trap `commitments-and-income-plan.md` §5.2 is named after, occurring on
      a real loan while the document describing it sat in the same repo.
      `rate_type` is now `FLAT`, so the loan reports instalments still to run rather than
      amortising a balance, and says so.

- [ ] **`Ativa` (id 9) has no principal.** **(owner)** Recorded 2.79% FLAT over 108 months with
      `principal` null, so nothing derives for it at all — no schedule, no outstanding figure, and
      no effective rate (it would be 5.14%). Needs the financed amount from the agreement. Sits
      with the wallet reading and the payslips as data only the owner has.

### The six as audited

- [x] **The waterfall restating its own limit — already done, in both places.** Overview closes
      the column with *"A ceiling, not a surplus. Everything you actually live on is still ahead of
      this figure — the column on the left is where it lands."* Goals says *"RM X is spare, before
      anything you actually live on."* Nothing to build.

- [x] **Realised gain on a partial commodity sale — cannot occur.** `assets_kind_check` permits
      only `SAVINGS` and `ITEM`; there is no `COMMODITY` kind, so there is no holding to sell part
      of and `assetContributed()` cannot drift from cost basis. Reopens only if commodities are
      ever permitted, and `positions()` is the thing to borrow when they are.

- [x] **Early-settlement figures — nothing to make honest.** The app shows no settlement figure
      anywhere in `web/src`; the only matches for "settlement" are trade settlement and dividend
      lag. The audit's guidance stands as a rule for whoever builds one — store the term as free
      text from the letter of offer, never derive it from a single `penalty_pct` — but there is no
      current defect.

- [ ] **`ITEM` valuations go stale silently.** Still open, and **cheaper than the audit implies**:
      an ITEM's value comes from `asset_entries` BALANCE readings, so its age is derivable with no
      migration. But **there are zero `ITEM` assets**, so there is nothing to go stale yet. Build
      it with the house, not before.

- [ ] **Flexi and offset loans break the derivation.** Genuinely open, and the only Phase 5 item
      needing a schema change: nothing in `commitments` or `db/schema.sql` can mark a loan
      not-derivable. Note the near miss — the loan corrected above is named *FlexiCredit*, but its
      arithmetic is plain flat-rate hire purchase, not an offset facility. The name is marketing.

- [ ] **The rate-comparison table** — debt against investment as arithmetic
      (`commitments-and-income-plan.md` §6.5). Specified, no implementation found.

---

## Not scheduled

- **Joint commitments** (`share_pct`). A mortgage split with a spouse is half yours, but the column
  raises whose income is being tracked. Explicitly *"out of scope until asked for."*
- **Rewards** and **statutory rate tables** stay here until Phase 2 decides them.

---

## Recently closed

Recorded so they are not proposed again. Verified in the code, not merely claimed by a commit
message.

- Money redesign **Phases 0–8** complete.
- **Cards, all three "build first" items:** the carried / settled distinction (#41), the assembled
  per-account row (`money/AccountRow.jsx`), and the float panel's second voice
  (`CardSheet.jsx:422`).
- **Income:** the EPF double-write removed and its three false promises with it (#42); the
  statutory copy corrected in all five places; `payer` and `Total deducted` now render; a foreign
  payslip converts.
- **The wallet account itself** — see Phase 1.

---

## Standing caveats

**The canvas is a mock.** Every figure on it is seeded in the component, not fetched. It reads as a
working app, which makes it easy to mistake a drawn number for a derived one — a mistake already
made once, on the most-checked page of the set, and again when a canvas figure reached
`money-redesign-plan.md` §1 under the heading *the arithmetic that holds*.

**Phase 4's items are strong leads, not verdicts.** `cards-canvas-gaps.md` reports 88 of 90 claims
surviving a skeptic pass, but notes twelve of those skeptics ran without the harness's safety
classifier. Re-confirm each item against the code before building it.

**Before writing a rate into code, open the primary document.** Across the research behind these
plans, aggregators and secondary sources were wrong often enough to matter — one reported a bank's
gold spread as 1.2% against an actual 10.0%, another carried a lender's personal-loan rate a full
percentage point stale, and a third published a Kijang Emas price absent from the API it claimed to
mirror.

**Every price and rate in the planning documents is a snapshot of 1 September 2026.** The HP
transition runs to 31 March 2027, during which both interest regimes are being written
simultaneously — which is why `rate_type` cannot be inferred from a start date and must be captured
from the agreement.
