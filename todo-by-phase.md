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

## Phase 1a — Port the rail grouping and the keyboard shortcut

Unblocked, independent of every other phase, and the only unmerged work left in the repo. It sits
here rather than in a later phase because the branch it lives on will rot as `App.jsx` moves on.

- [ ] **Port `NAV_GROUPS` and ⌘B/Ctrl-B onto main's fold.**
      `rail-groups-and-fold` (`be6852c`) rewrites `App.jsx` (+340/−57) and does two things, of
      which **main has since reimplemented one independently** — `6d017f2` "Let the sidebar be
      collapsed on purpose" and `720ddd2` "Put the sidebar toggle beside the title", with the same
      212px ⇄ 58px widths, the same per-device localStorage reasoning and the same sr-only labels,
      but different code (main's state variable is `wide`, the branch's is `collapsed`).
      **So this will not fast-forward and will not merge cleanly — it is a port, not a merge.**

      What is genuinely absent from main, verified directly rather than taken on report:
      - **`NAV_GROUPS`** and the three-run rail — Portfolio / Money / Settings-at-foot, with
        membership listed explicitly so an unlisted new screen joins the last group rather than
        vanishing. Present twice on the branch, nowhere in main.
      - **The ⌘B / Ctrl-B shortcut** — three references on the branch, while main's `App.jsx`
        contains no `keydown`, `metaKey` or `ctrlKey` at all.

      Lift those two onto main's existing fold implementation and delete the branch afterwards.

---

## Phase 2 — Settle the decisions

No code. Each of these has downstream work that should not be written until it is decided, and
each is cheap to decide and expensive to get wrong.

- [ ] **Where a daily FX rate comes from.** **(decision)**
      Phase 6b shipped the storage half — `income_events.fx_rate` / `fx_date` exist and `eventToRM`
      converts. Sourcing is the open half, and the deferral is deliberate: *"a wrong rate kept
      forever is worse than one global rate that is visibly approximate."*
      `money-redesign-plan.md` §4(c), §6.

- [ ] **Which basis is the headline** — run-rate, or falling-this-month. **(decision)**
      The canvas needs both somewhere and has room for one in the sidebar. Commitments already
      shows the pair side by side with the RM 40.00 gap named and broken down; promoting that
      treatment may be the entire answer. `money-redesign-plan.md` §6.

- [ ] **Rewards: build or refuse.** **(decision)**
      A genuine contradiction between two documents in this repo. The canvas specifies a cashback
      and points footer strip; `cards-plan.md:868` lists rewards under *"deliberately not built —
      a screen that would quietly argue for spending. A different product."* The parser
      **implements** the refusal, using `TreatsPoints` and `Mata Ganjaran` as stop markers to
      discard the rewards page. Resolve the conflict before any column is written.
      `cards-canvas-gaps.md` §3.

- [ ] **Statutory rate tables: ship the table or ship nothing.** **(decision)**
      Only relevant if the app is ever to *compute* a deduction rather than record one. Today it
      stores per-payslip amounts and sums them, which the primary-source reader concluded is the
      right shape carrying no exposure — *all* the risk is in the copy, not the arithmetic.
      If tables are ever added they must be versioned and keyed by effective-from date, and
      PERKESO's amounts must not be derived by formula because the tie-breaking is not a standard
      rounding mode. `income-canvas-gaps.md` §7.

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

- [ ] **`employerCostOf()` has zero callers** — show it or delete it. It is written, correct, and
      referenced nowhere in the repo. The canvas puts employer cost third of three on the Day job
      card; the function's own comment argues it is *"a fact about the employer, not about your
      money"*, which is a defensible reason not to lead with it. Either way it should not sit dead.
      `income-canvas-gaps.md` §3.

- [ ] **"Next date" on the income row.** Specified in `commitments-and-income-plan.md` §7.1 as
      *"name, cadence, next date, last amount"*, never built — the row prints `Monthly · day 25`
      rather than a resolved date. `dueDayIn` already exists and is the same clamp the calendar
      uses. Small.

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

- [ ] **Fix the ingest first.** Two distinct losses on every import:
      the parser already emits `posted`, `transacted` **and** a `foreign` block, all of which are
      discarded; and the importer hardcodes `interestCharged: 0, feesCharged: 0`, so even the two
      existing untyped aggregates only carry data when a statement is keyed in by hand.

- [ ] **`card_transactions`.** **(migration, large)**
      commitment_id, statement_id, transacted_on, posted_on, description, amount,
      orig_currency / orig_amount / fx_rate, kind, disposition, expense_id, and a unique ext_id for
      idempotent re-import. Note the canvas's "Reads as" badge is not one enum: category when
      booked, disposition when not, plus derived FOREIGN and a reversal link.

- [ ] **Typed statement charges.** **(migration, large)**
      `card_statement_charges (statement_id, kind, amount)` or typed columns, so an annual fee can
      be told from a late fee and a charge that was *not* incurred can still be printed at zero —
      which is the point of the panel. Drop PLAN_INTEREST from the enum and derive it from
      `card_plans`.

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

No blockers. Each is a place the app can currently be confidently wrong, which is worse than a
place it is visibly incomplete.

- [ ] **Realised gain on a partial commodity sale.** `assetContributed()` is cash in minus cash
      out, which stops matching cost basis the moment part of a holding sells above cost.
      `positions()` already solves exactly this for the broker; the asset version should borrow it
      and carry a separate realised figure. `commitments-and-income-plan.md` §9.

- [ ] **Flexi and offset loans break the derivation.** Interest accrues on the balance *net of* a
      linked current account, so a derived schedule is simply wrong, and offset caps exist. Better
      to mark such a loan **"not derivable"** than to show a confident wrong number.

- [ ] **Early-settlement figures are not derived balances.** A settlement estimate cannot be
      computed from a single `penalty_pct` field — three incompatible mechanisms are in use across
      banks, and most Malaysian residential mortgages have no lock-in at all. Store the term as
      **free text from the letter of offer**; show a settlement figure only as an estimate, or not
      at all.

- [ ] **`ITEM` valuations go stale silently**, and the distortion flatters. A house value nobody
      updates inflates net worth. Same staleness treatment as a gold price, plus a prompt after
      some months.

- [ ] **The waterfall has to keep restating its own limit.** "Unclaimed RM 2,675" reads as
      "RM 2,675 spare" unless the screen keeps saying it is *before* living costs.

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
