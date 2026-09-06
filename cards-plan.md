# Vantage — credit cards

Companion to `commitments-and-income-plan.md` and `expenses-plan.md`. Two real cards:
Maybank and BSN.

---

## 1. What a card is in Vantage today, and the four things it cannot say

A card is one row in `commitments` with `kind = 'REVOLVING'`: a `balance` you type in, a
`balance_as_of` so the screen can say how stale it is, a `credit_limit`, an `apr`, and the
5%-or-RM-50 minimum. `commitmentRows()` turns that into a monthly out, a utilisation
percentage and a staleness badge. The calendar puts a mark on the due day and admits the
amount is a guess.

The migration that created it explains why it is shaped that way, and the sentence is worth
quoting because this plan has to answer it:

> A revolving card is the opposite: nothing about it is derivable, so it keeps a balance you
> update and a date saying when you last did.

That is true and this plan does not overturn it. What it says is that **a card is not only a
revolving balance.** An instalment plan sitting on the same card is derivable in exactly the
way a car loan is — a principal, a tenure, a start date and a fixed instalment — and today
the app has nowhere to put it except to fold it into the one number that was deliberately
designed to be underivable. That fold is where everything breaks.

**(a) It gets the monthly obligation wrong, on the flattering side, and it does so by
implementing half of a rule.** BNM's *Credit Card and Credit Card-i* policy document
(BNM/RH/PD 028-141, issued 19 December 2025) sets the minimum monthly repayment at
paragraph 13.1 as three things added together:

> "(a) At least 5% of the total amount outstanding; (b) The total amount of the contracted
> monthly instalments of any easy payment plan (EPP) and balance transfer plan (BTP); and
> (c) The contracted monthly term loan instalment for any Automatic Balance Conversion under
> paragraph 14.1."

`cardMinimum()` implements limb (a) and nothing else — and the issuers' own worked examples
show that limb (a) runs on the balance with the instalments **taken out**, which are then added
back at 100%. Bank Islam publishes the arithmetic outright: `5% × (statement balance − each
monthly instalment − any overlimit excess) + the instalments + past due`. CIMB's clause
13(a)(iii) defines its 5% base as "retail transactions + cash advance + finance charges and
fees" — instalments are not in it, and appear separately at "100% of all monthly instalments
due". So the real shape is:

```
minimum = max( 5% × (billed balance, instalments excluded)
             + 100% × instalments due this month
             + 100% × card service tax
             + past due + any overlimit excess,
               the issuer's floor )
```

OCBC states it in one clause and is worth quoting because it removes every ambiguity at once:
"(i) 5% of your OCBC Card outstanding balance **excluding** the contracted monthly instalments…
and (ii) 100% of all your contracted monthly instalment amounts… **or RM50, whichever is
higher.**" CIMB's 13(a)(iii) has the same shape. Note where the floor sits: on the **sum**, not
on the 5% limb. It almost never bites on a card carrying a plan, and putting it in the wrong
place would be invisible for years and then wrong by tens of ringgit on a quiet card.

Fold two 0% plans into `balance` — the only thing this schema allows — and today's app reports
5% of everything. On the two real cards that lands at RM 716.89 against a true RM 1,133.76: it
is not merely wrong by RM 416.87, it is **wrong in a way that cannot be corrected by adjusting
the percentage**, because it has lost the distinction the number is for. RM 991.63 of that
obligation is contracted and missing it is a default; RM 142.13 is a floor under a balance you
could clear tomorrow. One figure cannot say which is which, and the one the app prints happens
to sit between them.

Those figures are invented. §8 runs the same arithmetic against a real August statement, where today's function would report **RM 209.00 against a printed minimum of RM 1,451.60** — 14% of it. The invented example was the kind one.

**(b) It cannot tell the expensive balance from the free one.** RM 4,800 at 0% on a 12-month
EPP and RM 4,800 revolving at 18% are the same number in this schema. One costs nothing and
the other costs about RM 864 a year. `interestThisMonth` charges APR against both.

**(c) It has no cycle, so it cannot say *when*.** There is a `due_day` and no statement day.
A card's single most useful sentence — *"anything you buy today lands on the bill due 15
November, so you have 51 days"* — needs both, and the app has one. It also means the amount
shown on the due day is `cardMinimum` off a balance that might be five weeks old, when the
statement was an actual document with an actual figure on it.

**(d) It silently breaks the spending residual.** This is the serious one and it gets its own
section.

---

## 2. The four things a card is

1. **A limit.** A claim on your future, not an asset. Already modelled.
2. **A revolving balance.** Underivable, snapshot, expensive. Already modelled.
3. **A set of instalment plans.** Derivable, cheap or free, each with a fixed end date. Not
   modelled, and it is a *list of unknown length*, which is a table and cannot be columns.
4. **A payment instrument.** The thing purchases go on — which is where it collides with the
   expense log and the residual. See §3.

### Three ways to hold (3), and why two are wrong

**(a) Keep folding plans into `balance`.** This is what happens today, and §1 is the report.

**(b) A plan is its own `LOAN` commitment.** Genuinely tempting, because an EPP *is* a loan:
fixed principal, fixed tenure, fixed instalment, derivable schedule, and `loanSchedule()`
would work on it unmodified. Rejected on three counts, each load-bearing:

- **It does not leave your wallet on its own.** An EPP instalment is a line *inside* one card
  payment. A free-standing LOAN row would put a second mark on the calendar for a debit that
  never happens separately, and `spendingFor()` would subtract it as its own committed flow
  on top of the card payment that already contains it. Double-counted, quietly.
- **It consumes the card's limit,** and a LOAN row cannot know that. Utilisation would read
  low on a card with no room left on it.
- **They drift.** Close the card, or settle the plan early, and there are two rows that have
  to be ended together by hand, forever.

**(c) A child table of the card.** Chosen. The plan belongs to the card the way
`commitment_payments` belongs to a commitment: it cannot exist without it, it is read through
it, and the card's arithmetic is the sum of its own balance and its children.

### And a fourth: replace `REVOLVING` with a `cards` table

Rejected. `REVOLVING` already carries the limit, the APR and the minimum correctly; the
waterfall, the calendar and the residual all read `commitments`; and moving cards out would
touch all three for no arithmetic gain. Extend it.

---

## 3. The float — how a card breaks the residual, and the identity that fixes it

`expenses-plan.md` built the whole spending figure on one assumption:

```
spending = income − commitments − (money moved into things the app tracks)
```

which works because every ringgit that arrives either goes to an obligation, moves somewhere
visible, or is spent — and *spent* means it left a wallet. **A credit card is a device whose
entire purpose is to break that last step.** It lets money be spent in September and leave
the wallet in October.

### What actually happens today

Charge RM 2,000 of groceries and dinners to the Maybank card in September and pay the bill in
October. Reading `spendingFor()` line by line:

- **September.** `inflowRM` unchanged. `walletDeltaRM` unchanged — no money moved.
  `committedRM` picks up `cardMinimum()` off whatever balance was last typed in, a guess.
  So **September's living costs come out RM 2,000 too low.**
- **October.** The RM 2,000 payment leaves the wallet, so `walletDeltaRM` falls 2,000 and
  `spentRM` rises 2,000 — while `committedRM` already subtracted a ~RM 100 minimum for the
  same card. **October overstates by about RM 1,900, and RM 100 is lost entirely.**

And if the groceries *were* logged in the expense log, they were logged in September, against
a residual that is RM 2,000 too small — so the Spending screen reports the log as *over* 100%
complete in September and badly incomplete in October. The reconciliation that was built to
catch an abandoned log instead reports a fault in the one part that is accurate.

### The fix, without a transaction ledger

The residual answers **"what left my pockets"**. With a card in play that is a genuinely
different question from **"what did living cost"**. Both are real, so name both rather than
fudging one into the other:

```
float        = card purchases − card repayments, over the window
leftPocket   = inflow − committed − saved − walletDelta      ← today's figure, unchanged
livingCost   = leftPocket + float
```

`card purchases` is not knowable without the ledger this app refuses to keep. It does not
have to be, because:

```
Δ(card owed) = purchases + interest and fees − repayments
```

so **the float is just the change in what the card owes, over the window.** No purchase is
ever entered. Writing S for cash spending, P for card purchases, C for charges and R for
repayments:

```
walletDelta = inflow − committed − saved − S − R
leftPocket  = inflow − committed − saved − walletDelta = S + R
float       = Δowed = P + C − R
livingCost  = leftPocket + float = S + P + C          ✓ exactly right
```

The repayment cancels. Interest and fees land in the month they are charged, which is where
they belong — they are a real cost of living, and the taxonomy already has `CARD_CHARGES` and
`BANK_FEES` waiting for them.

### The rule this generalises to

The app already refuses to compute a residual without a wallet reading at **both** ends of
the window, and says so instead of inventing one. A card is another pocket — a negative one.
So the existing rule simply widens:

> A window can be reconciled only when **every pocket, positive and negative, has a dated
> reading at both ends of it.**

Which is the argument for §4's `card_statements`, and note where it comes from: not from
wanting a nicer screen, but from an arithmetic identity that needs `owed` evaluated at two
dates. A single mutable `balance` column can be read at one date only — today's.

`SPEND_UNKNOWN` gains `NO_CARD_READING`, alongside `NO_OPENING_READING` and
`NO_CLOSING_READING`, and behaves the same way: say so, show nothing.

### The consequence worth printing

Once the float is a figure, the app can say the thing a card owner most needs to hear and
currently cannot:

> **RM 3,180 of what you have spent has not left your account yet.**

That is not a warning and not advice. It is the size of the gap between how much money you
appear to have and how much you have.

---

## 4. Schema

Three changes: one column, and two tables.

### (a) `commitments` — the cycle

```sql
ALTER TABLE commitments ADD COLUMN statement_day  INTEGER;  -- 1..31, when the cycle closes
ALTER TABLE commitments ADD COLUMN limit_release  TEXT;     -- PROGRESSIVE | ON_SETTLEMENT
```

With `due_day` this is the whole cycle, and it is what lets the app place a purchase on a
bill. Both are days-of-month rather than dates because the cycle repeats; `dueDayIn()`
already clamps the 31st into a short month, and the statement day uses the same clamp so the
two can never disagree about February.

`balance` narrows in meaning to **the revolving balance only — what is carried at APR,
excluding instalment plans.** Plan outstanding is derived from the child table and added on
top. Existing rows keep their stored value: nothing can know which part of an old figure was
an EPP, so nothing guesses. An owner who folded one in will see it counted twice the first
time the card screen shows a plan — a one-time correction that is visible rather than silent,
and the screen names the two numbers side by side so it is obvious which to fix.

**`limit_release` is a column because the banks genuinely disagree.** When a plan blocks the
credit limit, two mechanics exist in the Malaysian market and both are written down in issuers'
own terms. *Progressive* restores the limit as each instalment's principal lands; *on settlement*
holds the whole amount until the last one. Hong Leong, AmBank and UOB publish the first; HSBC,
Alliance and Standard Chartered publish the second. It cannot be a constant, and it is not
something BNM prescribes for EPP at all — the only place the regulator mandates a mechanic is
Automatic Balance Conversion, where paragraph 14.3(c) says the limit "shall be restored only
after the term loan/financing is fully repaid".

**Both of these two cards are `PROGRESSIVE`,** which is the good case and settles §5's
utilisation question. Maybank EzyPay Plus, clause 12: the limit "will be progressively restored
and made available for your use by the amount of **the principal portion** of each EzyPay Plus
monthly payment paid and to the extent that actual payment is received by the bank." BSN EasyCash
clause 16(a) is the same mechanic in the same words. Note the two refinements in Maybank's
wording — principal portion only, and on receipt rather than on schedule — which is why the app
derives available credit from remaining principal and not from instalments elapsed.

One provenance caveat on that Maybank clause, because it is load-bearing: `maybank2u.com.my`
refused every direct request across several attempts, and the wording above was recovered twice
by different routes — once as a quoted clause, once as a search-index extract of the same PDF —
which agree on the text. Treat the wording as reliable and **the clause number as indicative**
until it is read off the document itself. The rest of the Maybank figures in §7 came from files
that *were* retrieved end to end, by substituting `www.maybank.com` onto the same path.

**`min_payment_floor` should not default to 50 for both of these cards.** BSN is RM 50
(Cardmember Agreement cl 21.1(a)); **Maybank is RM 25**. Maybank's own Product Disclosure Sheet
of 15 December 2025 states both figures in a single sentence and cannot be reconciled from the
document, so RM 25 is taken as operative because it is the one attached to the current additive
formula — and this is exactly the kind of thing to check against a real statement rather than
trust either of us on.

**The limit belongs to the account, not the card.** A real statement covers two cards under one *combined* credit limit, one due date and one minimum, so `credit_limit` and everything beside it describe the statement rather than the plastic. See §8 — it is a correction to this section, not an addition to it.

**No new fee columns.** An annual fee, the government service tax and a late charge are all
things that appear on a statement, on a date, for a specific amount. They are charges, not
properties of the card, so they live in `card_statements.fees_charged` and reach the expense
log as `CARD_CHARGES`. A column for the annual fee would be a figure to keep fresh that
answers nothing the statement does not.

### (b) `card_plans` — the derivable part

```sql
CREATE TABLE card_plans (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  commitment_id  INTEGER NOT NULL REFERENCES commitments(id),
  kind           TEXT NOT NULL,               -- EPP | BALANCE_TRANSFER | CASH_INSTALMENT
                                              --   | AUTO_BALANCE_CONVERSION
  name           TEXT NOT NULL,               -- 'Fridge', 'Aircond', 'BT from CIMB'
  merchant       TEXT DEFAULT '',
  amount         DOUBLE PRECISION NOT NULL,   -- what was charged against the limit
  tenure_months  INTEGER NOT NULL,
  instalment     DOUBLE PRECISION NOT NULL,   -- the BANK's figure, not a derivation
  rate           DOUBLE PRECISION NOT NULL DEFAULT 0,   -- almost always 0 on an EPP
  upfront_fee    DOUBLE PRECISION NOT NULL DEFAULT 0,   -- where the real cost of "0%" hides
  purchased_on   TEXT NOT NULL,               -- the day it was spent
  started_on     TEXT NOT NULL,               -- the first instalment; usually a cycle later
  settled_on     TEXT,                        -- early settlement; NULL while running
  status         TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | RETRACTED | SETTLED
  category       TEXT,                        -- the expense category, for the log
  note           TEXT DEFAULT '',
  source         TEXT NOT NULL DEFAULT 'manual'
);
```

**Why `instalment` is stored rather than derived.** `amount / tenure_months` rarely divides
evenly, the bank rounds and puts the remainder on the last month, and on a 0% plan the
instalment simply *is* the bank's number. This is the same call `commitments.instalment`
already makes — the bank's own figure overrides the derived one — and for the same reason:
the derived figure would be wrong by sen every month, forever, and sen accumulate into a
balance that never quite settles.

**Why both `amount` and `instalment`.** `amount` is what came off the limit on the day of
purchase. `instalment × tenure` is what will be paid. They differ by rounding and by any fee,
and both are facts about different questions.

**Why `purchased_on` and `started_on` are separate.** A purchase on 3 September, on a cycle
closing on the 25th, has its first instalment on the October statement. The expense happened
in September; the money starts moving in October. Collapsing them would put the spending in
the wrong month, which is the exact error §3 is about.

**Why `upfront_fee` earns a column.** It is where the cost of a "0% instalment plan" actually
lives, and it is the one number that makes an EPP comparable to anything else. See §5.

**Why `AUTO_BALANCE_CONVERSION` is in the enum before anything uses it.** It is new — BNM
introduced it at paragraphs 14.1–14.2 of the December 2025 policy document — and it is the one
plan kind that is *not* 0%: a cardholder who qualifies as vulnerable may convert an outstanding
card balance into a three-year term loan "at an effective interest/profit rate of not more than
13% per annum". That is why `rate` is a column with a default rather than an assumption. It
also settles the shape: three kinds would have made a boolean plausible, four with one of them
interest-bearing makes it a table, which is where §2 already landed for a different reason.

The qualifying test is worth recording because it is not a thing the owner can be asked: a
vulnerable cardholder earns up to RM 5,000 a month, has been a consistent revolver for twelve
months, and has averaged repayments of 10% or less of outstanding balances over those twelve
months. **The app does not evaluate that test and must not.** It records a conversion that has
happened; it does not tell you that you qualify for one.

**Why `category`.** An EPP purchase is real spending on the day it happened — RM 4,800 of
`THINGS` on 3 September. Creating a plan offers to write that one `expenses` row, defaulted
**on** for `EPP` and `CASH_INSTALMENT` and defaulted **off** for `BALANCE_TRANSFER`, because
a balance transfer is refinancing, and logging it as spending would invent RM 10,000 of
living costs out of a debt you already had. This does not double-count: the log and the
residual are two independent estimates that the Spending screen *compares*, and this makes
both of them more complete at once.

### (c) `card_statements` — the dated reading

```sql
CREATE TABLE card_statements (
  id               INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  commitment_id    INTEGER NOT NULL REFERENCES commitments(id),
  statement_date   TEXT NOT NULL,              -- the day the cycle closed
  due_date         TEXT NOT NULL,
  closing_balance  DOUBLE PRECISION NOT NULL,  -- TOTAL owed, plans included, as printed
  minimum_due      DOUBLE PRECISION,
  interest_charged DOUBLE PRECISION NOT NULL DEFAULT 0,
  fees_charged     DOUBLE PRECISION NOT NULL DEFAULT 0,
  note             TEXT DEFAULT '',
  source           TEXT NOT NULL DEFAULT 'manual',
  UNIQUE (commitment_id, statement_date)
);
```

One row per card per month — 24 a year for two cards, copied off a statement that arrives
whether the app exists or not. This is the `asset_entries` pattern: a dated reading, never a
derivation.

**Two dated sources for one number is normally the thing this app refuses.** It is not two
here, because they are the same kind of thing at different precisions. A statement is a
reading that also happens to carry what the month cost and when it is due.
`owedOn(card, date)` takes whichever dated fact is latest at or before `date`, across
`card_statements.closing_balance` and `commitments.balance` — exactly the way wallet balance
already reads across entries of several sources. So `balance` keeps working as the mid-cycle
check on the app, and a statement outranks it by being more recent, not by being special.

This is also what makes Phase 1 useful before Phase 4 exists: the float math is written
against `owedOn()`, so it works at reduced precision on typed balances alone and gets sharper
when statements start arriving.

**`interest_charged` and `fees_charged` are kept apart** for the reason
`principalPerMonth` and `interestPerMonth` are kept apart on the Money strip: one is the
price of carrying a balance and can be driven to zero by paying in full, the other is the
price of holding the card and cannot. A screen that totals them tells you to do the wrong
thing.

---

## 5. The math

All of it in `calc.js`, none of it stored.

### Per plan

```
paid        = whole months elapsed from started_on to now, capped at tenure_months
left        = tenure_months − paid            (0 once settled_on is set)
outstanding = left × instalment
ends_on     = started_on + tenure_months
monthlyOut  = left > 0 ? instalment : 0
```

The same shape as `loanSchedule()` and for the same stated reason: you do not type 24
instalments, you type five fields and today's date does the rest.

### Per card

```
revolving   = balance                              ← at APR
plans       = Σ outstanding over active plans      ← at 0%, usually
owed        = revolving + plans
minimum     = max( revolving × min_payment_pct/100
                 + Σ instalments of plans now running,
                   min_payment_floor )
interest    = revolving × apr / 12                 ← plans excluded, deliberately
utilisation = owed / credit_limit          ← both of these cards release progressively
monthlyOut  = minimum
```

`utilisation` reads `outstanding` rather than the plan's original `amount` because both cards
restore the limit as principal is repaid — see §4(a). On an `ON_SETTLEMENT` card it would read
`amount` until `settled_on`, which is the whole reason that column exists.

Both lines that changed are direct corrections. `minimum` now has BNM 13.1's second limb in it,
which is §1(a). `interest` stops charging APR against a 0% balance, which is §1(b).

**`cardMinimum()` changes in two places, and they pull in opposite directions.** BNM 13.1(a)
says "the total amount outstanding", which read alone would put the percentage on everything;
every issuer example checked instead strips the instalments out of the base and adds them back
whole, and unbilled plan principal is not on the statement to be percentaged at all. So the
percentage base **narrows** to the revolving balance — while the floor **widens** to sit outside
the whole sum rather than around the percentage. Today's function has both the other way round.

**§8 confirms this against a real statement**, where the formula reproduces a printed Maybank minimum of RM 1,451.60 exactly. Everything above was reasoned from other issuers' published examples before that statement existed; it now has a witness.

**A plan only contributes once its instalments have started.** A purchase made after the
statement closed is on the limit immediately but is not billed until the next cycle, which is
exactly why `purchased_on` and `started_on` are separate columns.

**Where the derived minimum is only an estimate, and says so.** Two limbs above are things the
app cannot see: past due carries from a statement it may not hold, and an overlimit excess
depends on a limit the bank can change without telling it. So the formula is a floor on a
floor. It does not have to be more than that — **the minimum due is printed on the statement,
so record it and stop deriving.** `card_statements.minimum_due` is the fact; the formula above is the estimate used
for a cycle no statement has closed on yet, and the screen labels it as one. This is the same
call the app already makes between a wallet reading and an inferred balance, and it is the
strongest single argument for §4(c).

**The RM 50 floor is issuer practice, not regulation, and the schema should stop implying
otherwise.** `RM50` appears in the policy document exactly twice, both times inside a worked
example BNM requires issuers to reprint on every statement (Appendices III and V, mandated by
paragraph 21.20) — "Minimum payment amount is 5% of the monthly outstanding balance or RM50,
whichever is higher." The binding requirement on issuers in 13.1 carries no floor at all. So
`min_payment_floor` stays, because every issuer checked does apply one — but the default of 50
is only right for one of these two cards, and the migration comment that calls it "standardised
across every issuer checked" should say *issuer practice*, not imply a rule. See §7.

### What a 0% plan actually costs

An upfront fee on a 0% EPP is not free money, and the app already owns the machinery to say
what it costs. A fee `F` on principal `P` over `n` months is a flat charge of

```
flatPct = (F / P) / (n / 12) × 100
```

and `flatToEffective(flatPct, n)` — already written, already exported, already used to turn a
hire-purchase 3.40% flat into 6.27% effective — converts it to the reducing-balance rate that
can be compared against anything else in the app.

An RM 4,800 plan over 12 months with a 3% fee is RM 144, which is 3.00% flat, which is about
**5.45% effective.** That is not nothing, but it is a fraction of what the same balance costs
revolving — so the app can say "dearer than paying cash, cheaper than carrying it" as
arithmetic rather than as advice. Reusing the converter rather than writing a second one also
means there is one place where a rate conversion can be wrong.

### The float

```
floatFor(S, from, to) = Σ over active cards of ( owedOn(card, to) − owedOn(card, from) )
```

evaluated over the identical `(from, to]` window `spendingFor()` already computes from wallet
readings, so the two cannot drift apart. If any card lacks a dated reading at either end,
return `NO_CARD_READING` and show nothing, exactly as a missing wallet reading does today.

`spendingFor()` gains `floatRM` and `livingCostRM = spentRM + floatRM`, and **`spentRM` is not
touched** — it is still an honest answer to "what left my pockets", it is what the wallet
readings actually support, and every screen reading it today keeps meaning what it meant.

One change inside it: for a `REVOLVING` commitment, `committedRM` should use **recorded
payments** (`commitment_payments` rows falling in the window) in preference to the derived
`cardMinimum`. For a loan the derived figure is right and the app says so; for a card it is a
guess, and here a fact is available. Where no payment is recorded, fall back to the minimum
as now.

---

## 6. Where it appears

**Money.** The existing card row gains a plan sub-list — the plans nested under the card the
way they are nested on the statement, each with its instalment, its months remaining and its
end date. The headline figure on the row becomes the corrected `monthlyOut`, and the
underivable revolving balance and the derivable plan total are shown as two numbers rather
than one, because the whole plan is that they are different things.

**A card sheet, not a rail screen.** Two cards do not justify a fifth item on the rail — and
`654ad24` took Expenses off it for the same reason. The card opens as a sheet from Money:
cycle, plans, statements, and the float it is carrying.

**Calendar.** Two marks per card instead of one. The statement day is informational and moves
no money; the due day carries `minimum_due` and `closing_balance` off the actual statement as
a **fact** rather than the estimate the calendar currently apologises for. And the sentence
that needs both: *anything bought today is due on <date>*.

**Spending.** The float line, and the reconciliation corrected. Today's "the log is 67%
complete" is computed against a residual that a card makes wrong in both directions; with
`livingCostRM` it is computed against a figure that survives a card.

---

## 7. The mechanics, and where they come from

Two different kinds of fact are mixed together in any description of a Malaysian credit card,
and the difference decides where each belongs in the schema. A **regulated rule** applies to
every card in the country, so it is a constant in `calc.js`. A **product choice** varies by
issuer and by card, so it is a column. Sorting them wrongly is how an app ends up with a
per-card setting for something nobody can change, or a hardcoded constant for something both
of these cards disagree about.

### Regulated — the same on the Maybank card and the BSN one

All of this is from BNM's *Credit Card and Credit Card-i* policy document
([BNM/RH/PD 028-141](https://www.bnm.gov.my/documents/20124/938039/credit_card_and_credit_card-i_PD.pdf),
issued 19 December 2025, superseding the 2 July 2019 documents). It is the current version:
the accompanying
[feedback statement](https://www.bnm.gov.my/documents/20124/938039/payment_card_feedback_statement.pdf)
says the review was "centred on strengthening security controls for payment cards" and that
"all other requirements in the existing policy documents remain unchanged".

- **Minimum payment** — paragraph 13.1, quoted in §1(a). 5% of the total outstanding, **plus**
  contracted EPP and balance-transfer instalments, **plus** any Automatic Balance Conversion
  instalment. The RM 50 floor is not in it; see §5.
- **The interest-free period is measured from the statement date** — paragraph 18.2: at least
  **20 calendar days from the statement date**, and only for a cardholder with no balance
  carried forward. Paragraph 18.3 makes extending it to everyone else optional. This is the
  regulation that makes `statement_day` load-bearing rather than cosmetic: the due date alone
  cannot tell you when a purchase stops being free.
- **A second, different grace period** — paragraph 13.3 requires at least **four calendar days
  after the payment due date**, to absorb due dates landing on weekends and holidays. It is a
  late-payment grace, not an interest-free one, and the two are easy to conflate. The calendar
  should not draw it as slack in the cycle.
- **The tiered rate is intact**, which the existing schema comment already assumes and is worth
  confirming rather than inheriting. Paragraph 18.1(a): Tier-I a maximum of 15% p.a., Tier-II
  17%, Tier-III 18%; paragraph 17.1 sets the tiers by payment history — twelve consecutive
  prompt minimum payments for Tier-I, ten or more in twelve for Tier-II, everyone else Tier-III.
  So `apr` stays per-card and stays a question worth asking, because it is a fact about the
  owner's own conduct on that card and can differ between the two.
- **Cash advances are capped at 1.5% a month (18% p.a.)** — paragraph 18.1(b) — and are
  therefore always at or above the retail rate. The *fee* is not capped for a conventional
  card; the "actual cost, without mark-up" rule at 8.5(a) is in Part B and binds credit card-i
  only. Applying it to a conventional card would be wrong.
- **Late payment charge** — paragraph 20.2: the lower of 1% of the outstanding balance or
  RM 100, with any minimum the issuer sets capped at RM 10.
- **Payment allocation is prescribed** — paragraph 13.4: highest interest rate first, so cash
  advances, then retail including EPP and balance-transfer instalments, then fees and charges.
  This matters if a payoff projection is ever built. It is not, deliberately — see §9 — but the
  rule is recorded here so that a future attempt starts from it rather than from intuition.
- **Finance charges are not compounded** on carried-forward finance charges — paragraph 18.1,
  opening — except where the issuer has implemented Automatic Balance Conversion.

None of the above is a column. All of it is either a constant, a comment, or a reason a column
exists.

### Per-bank — what actually gets typed in

Everything in §4 and §5 is per-row and neither bank is special-cased in code. What differs:

| | Maybank | BSN |
|---|---|---|
| Minimum floor | **RM 25** | **RM 50** |
| Retail rate | 15 / 17 / 18 — priced *at* the BNM caps | **8.88%–17.5%**, a ladder |
| What sets the rate | payment history alone | payment history **×** employment sector **×** card product |
| Annual fee | RM 60 to RM 800 by tier, many Free-For-Life | **RM 0 on every card**, principal and supplementary |
| Limit release | progressive, **principal portion**, on receipt | progressive |
| Statement export | PDF only | PDF only, 12 months online, RM 5 a copy after |

**BSN's rate is not a single number and this matters more than it looks.** A private-sector
cardholder sits on 13.5 / 16 / 17.5 and a teacher on 8.88 / 9.99 / 14 — so `apr` on the BSN row
could legitimately be anything from 8.88% to 17.5%, and the app cannot infer it. It is read off
the statement, per card, as the schema already assumes.

**The product names are not interchangeable, and two of them are traps.**

- Maybank **EzyPay** is a merchant point-of-sale plan and is genuinely 0% with no fee. Maybank
  **EzyPay Plus** converts an already-posted transaction and is **0.75% a month — 9% p.a.
  flat**, which `flatToEffective` puts near 16%: barely under the 15–18% of simply carrying the
  balance. Two products, one name, a factor of infinity between their costs. This is precisely
  what §5's converter is for.
- BSN **0% EasyPay Plan** is genuinely 0%. BSN **Instalment-Pay Plan** is a one-off charge of
  3% / 4% / 5% at 6 / 12 / 24 months. BSN **EasyCash** and **Balance Transfer** are 0% plus a
  1.99%–3.99% upfront fee at short tenures, and a stated p.a. rate at long ones.
- **BSN already runs Automatic Balance Conversion** — 36 months, 7.1% flat, an effective 13%,
  no fee. So §4(b)'s fourth kind is not hypothetical on this card.

**Early settlement costs more than nothing at both, without either charging a fee.** Neither
bank levies an early-settlement fee, but both accelerate every remaining instalment *and* add
one further month's finance charge (Maybank EzyPay Plus cl 13; BSN ECP cl 18), and neither
refunds an upfront fee. So `outstanding = left × instalment` is right for a plan run to term
and slightly **understates** a plan settled early — which is the safe direction, and is worth a
note on the screen rather than a column.

**A 0% plan can stop being one.** Miss two consecutive minimum payments and the concession is
retracted: the unbilled balance is billed at the prevailing retail rate. BSN terminates a plan
after three consecutive missed instalments. That is a state transition, not a rate change, and
it is why `card_plans` should carry a `status` of `ACTIVE | RETRACTED | SETTLED` rather than
inferring liveness from dates alone.

**One contradiction that cannot be resolved from the documents.** BSN's own Balance Transfer
terms say progressive restoration at clause 23 and no restoration until settlement at clause 8,
in the same document. Model it as progressive, matching clause 23 and every other issuer
checked, and treat the BSN balance-transfer row as the one to verify against a real statement.

---


## 8. Reading the statement

An August statement arrived while this plan was being written. It does three things at once:
it **settles §5 exactly**, it **breaks one assumption in §4**, and it **reopens a question §10
had closed**.

### It confirms the minimum, to the sen

> **A note on the figures in this section.** The arithmetic below is exactly what a real statement
> produced — the formula reproduced its printed minimum to the sen, and that is the finding. The
> *amounts* have been replaced with representative ones that preserve every relationship between
> them, because this repository is public and the originals are the owner's. Where this section
> says a figure matched, it matched.

The statement bills RM 4,180.00 and demands a minimum of **RM 1,451.60**. Four of its lines are
instalments, marked with their own counter:

```
INSURER-EC*E12              :004/012        190.00     merchant EzyPay, no interest line
EZYPAY PLUS -E12            :003/012        200.00     principal
EZYPAY PLUS -E12 INTEREST   :003/012         18.00     ...and its interest, billed separately
EZYCASH-M2U                 :002/006        900.00     a cash-out
                                          --------
                                          1,308.00
```

Take those out of the balance and apply the percentage to what is left:

```
5% × (4,180.00 − 1,308.00) = 5% × 2,872.00 =   143.60
+ 100% of the instalments                   = 1,308.00
                                              --------
                                              1,451.60    →  RM 1,451.60   ✓ as printed
```

**That is §5's formula reproducing a real Maybank minimum exactly.** The stripped-base reading
is no longer an inference from other issuers' worked examples — it is confirmed on the card this
app is being built for. The floor never enters at this balance, so the RM 25-versus-RM 50
question in §7 stays open and stays harmless.

It also makes §1(a) concrete rather than illustrative. Today's `cardMinimum()` would charge 5%
of the whole RM 4,180.00 and report **RM 209.00** against a true RM 1,451.60 — **14% of the real
obligation, understated by RM 1,242.60.** The invented example in §1(a) was too kind.

Two further facts fall out of those four lines:

- **Merchant EzyPay really is 0% and EzyPay Plus really is not.** the insurer bills one line; EzyPay
  Plus bills a principal line *and* an interest line, both inside the minimum. So a plan's
  `instalment` must be **what is billed monthly in total** — 200.00 + 18.00 = RM 218.00 — because
  that is what limb (b) counts and what actually leaves. Maybank prints it as two lines and the
  importer has to sum them by plan.
- **The counter is the bank's own progress count.** `:003/012` is `paid`/`tenure`, stated rather
  than derived. §5 derives `paid` from dates, and it must keep doing so for a cycle no statement
  has closed on — but where both exist they are two independent claims about one fact, and a
  disagreement means a deferred or missed instalment. Reconcile them and say so; do not overwrite
  one with the other.

### It breaks the assumption that a card has its own limit

The statement covers **two cards on one account** — a myimpact Visa Signature sitting at zero
and a PETRONAS Gold carrying everything — under one heading:

```
YOUR COMBINED CREDIT LIMIT (RM)     14,000
```

One limit, one statement date, one due date, one minimum, two pieces of plastic. §4 assumed
`credit_limit` belongs to a card. It does not: **it belongs to the account, and so does
everything else this plan models.** A `REVOLVING` commitment should therefore represent the
*statement*, not the plastic — which is also the only reading under which `owedOn()`,
`utilisation` and the float have a well-defined subject.

The cards do not vanish; they stop being the unit. Card-level facts exist — the myimpact card
carries no late-payment charge at all, which is genuinely per-card — but none of them is read by
any figure in §5, so none earns a table until one is. Record the account, note the cards.

### It is not a scan, so this is not OCR

The file carries a **text layer**. Every figure in it is already exact, so the tool is a text
extractor rather than an optical one — and the distinction is worth insisting on, because OCR
would take a document that is exact and make it probabilistic. In a finance app the failure mode
is not a typo. It is `900.00` read as `90000`, silently, in a column nobody re-reads.

```
pdftotext -table statement.pdf -          # -upw <password> if the file is locked
```

**Use `-table`, not `-layout`.** This was found the hard way, on the first real file: `-layout`
groups text into guessed line boxes and on this statement the columns **shear**. Descriptions
and amounts drift onto neighbouring rows, so the EzyPay Plus interest line comes out carrying
EzyCash's RM 900.00 instead of its own RM 18.00. Nothing errors. The page still looks like a
statement. `-table` groups by ruled columns and gets it right.

The general lesson is worth more than the flag. **An extractor can be confidently wrong**, which
is exactly why the gates below are not optional politeness — they are the only thing standing
between a silent column-shear and forty-one wrong rows in the expense log.

Keep OCR (`ocrmypdf`, which writes a text layer beneath the image) strictly as the fallback for
a statement that exists only on paper, and put it through the same gates.

### The grammar is regular enough to parse without a model

Five line shapes, and nothing else:

```
07/07  06/07  SHELL SELECT-EC-EC   KUALA LUMPUR MY       3.25    retail
09/07  09/07  EZYPAY PLUS -E12            :003/012            200.00    instalment
08/07  08/07  PYMT@MAYBANK2U.COM                            1,120.00CR  credit
07/07  07/07  RETAIL INTEREST RATE = 15.00%                             rate notice
              TRANSACTED AMOUNT      USD    108.00                      continuation
```

- Two `DD/MM` dates anchor a new record; a line without them continues the previous one — an FPX
  reference number, or the original foreign-currency amount.
- `CR` suffixed to the amount is the sign, and it is the **only** sign marker. A payment is not a
  negative number; it is a suffixed one.
- `:NNN/MMM` in the description is what makes a line an instalment rather than a purchase.
- The year appears nowhere on a transaction line. It comes from the statement date, and a
  December statement carrying `02/01` postings has to roll forward — the one place this parser
  can be wrong by a year and not notice.
- `RETAIL INTEREST RATE = 15.00%` is the Tier-I rate, printed as though it were a transaction.
  It is `apr` for the account, free.

### The statement carries its own checksum, and that is what makes importing safe

It states both sides of an identity that must hold:

```
previous balance + total debit − total credit = closing balance
    1,120.00     +  4,180.00   −   1,120.00   =   4,180.00    ✓
```

and it prints the minimum, which §5 derives independently. A third check falls out for free and
is the only one that touches every row: **the parsed rows must themselves sum to the balance.**
The first gate compares the header against itself and would pass happily while the parser
dropped an entire page; this one cannot.

```
balance   previous + debit − credit         = closing balance
rows      Σ(retail + instalment rows)       = closing balance
minimum   5% × (balance − instalments) + Σ instalments = printed minimum
```

**An import failing any of the three is refused, not corrected.** All three are computed from
figures the bank printed on the same document. Same instinct as `SPEND_UNKNOWN`: the app would
rather say it could not read the statement than book forty-one rows it is not sure about.

**This is built.** `sync/parse_maybank_statement.py` does the extraction, the five line shapes,
the classification and the three gates, and prints JSON. On the August statement all three pass:
closing 4,180.00 both ways, and a derived minimum of 1,451.60 against 1,451.60 printed. It
writes nothing to the database — deciding which rows are expenses, which are already
commitments and which are not spending at all is the importer's job, and §8 keeps it separate on
purpose.

### Where each line lands

| Statement | Table | Notes |
|---|---|---|
| Header: statement date, due date, closing balance, minimum | one `card_statements` row | the whole reason §4(c) exists |
| Combined credit limit | `commitments.credit_limit` | per account, per the correction above |
| `RETAIL INTEREST RATE = …` | `commitments.apr` | |
| `:NNN/MMM` lines | match a `card_plans` row; reconcile `NNN` against the derived count | sum principal + interest lines per plan |
| Retail purchases | `expenses` rows | **only after categorisation — see below** |
| `…CR` payment | `commitment_payments` row | which §5 already prefers over the derived minimum |
| Interest and fee lines | `card_statements.interest_charged` / `fees_charged` | and to `CARD_CHARGES` in the log |
| TreatsPoints pages | nowhere | §10 refuses rewards, and still does |

`ext_id` — already on `expenses`, for exactly this — takes a hash of (account, posting date,
transaction date, description, amount), so re-importing a statement is a no-op rather than a
duplicate. It is `UNIQUE`, so the database enforces that rather than the parser remembering to.

### The three ways this importer would lie, and what stops each

**1. It would double-count the commitments.** This statement carries an electricity bill, a
phone bill and an insurance premium. All three are already `RECURRING` commitments, already
subtracted from income on the Money screen. Booking them as expenses as well would count them
twice — the precise error `expenses-plan.md` drew its scope line to avoid, arriving through a
door that did not exist when the line was drawn. So an imported merchant resolves to one of
three things: an expense category, **an existing commitment (matched, not booked)**, or
unmatched.

**2. It would book a cash-out as spending.** `EZYCASH-M2U` moves RM 5,400 from the card into the
owner's own account. That is not consumption, it is a drawdown — the same shape as the balance
transfer §4(b) already defaults to *not* logging. Importing it as an expense would invent
RM 5,400 of living costs. `EZYCASH`, `PYMT@` and every `:NNN/MMM` line are excluded from the
expense log by rule, not by the parser's judgement.

**3. It would guess a category.** Fuel and fast food are unambiguous; a bank reference number and
an unfamiliar acronym are not. **An unmatched merchant is left `UNCATEGORISED` and surfaced,
never guessed** — a wrong category is worse than an empty one, because the group totals on
Spending are read as fact and nothing would ever flag them. The merchant map is learned from
what the owner confirms once; it is not shipped as a guess.

The float in §3 needs none of this. It reads two closing balances and is exact whether or not a
single transaction line is ever parsed — so the importer is an accelerator for the expense log,
never a dependency of the arithmetic.

### What this does not become

A statement importer is not a bank feed, and the refusal in §10 stands. This reads a file the
owner already receives and already has to open. It holds no credentials, reaches no network, and
runs when asked. It cannot go stale, cannot be revoked and cannot leak — which is more than the
aggregator route can say, and it works today rather than in 2029.

---

## 9. Phases

Each is useful shipped alone, and each is a commit in the sense the log already uses.

1. **Plans.** `card_plans`, the per-plan and per-card math, the Money row. Fixes §1(a) and
   §1(b) — the two arithmetic errors — and needs nothing else to exist.
2. **The cycle.** `statement_day`, the calendar's two marks, "anything bought today is due
   on…". Fixes §1(c).
3. **The float.** `owedOn()`, `floatFor()`, `livingCostRM`, `NO_CARD_READING`, and the
   corrected `committedRM` for cards. Fixes §1(d), at typed-balance precision.
4. **Statements.** `card_statements`, the card sheet, charges reaching the expense log. Makes
   phase 3 exact, and makes the due-day amount a fact.
5. **The importer.** §8: text extraction, the two arithmetic gates, the merchant map, the review
   screen. Last, because every table it writes into has to exist first — and because it is the
   only phase that is pure convenience. Phases 1 to 4 are arithmetic that is currently wrong.

---

## 10. Settled, and not

**Settled.**

- A card stays a `REVOLVING` commitment. No `cards` table.
- The commitment is the **account** — one statement, one limit, one due date — not the card. Two cards can share all three, and on these cards they do.
- A statement is read from its text layer, never OCR'd, and an import that fails either of §8's two arithmetic gates is refused rather than corrected.
- Plans are a child table, never free-standing loans.
- `balance` means the revolving balance; plan outstanding is derived and added.
- The minimum follows BNM 13.1 — percentage on the total, instalments on top — and a
  statement's printed `minimum_due` outranks the formula wherever one exists.
- The plan schedule is derived. You never type an instalment twice.
- `spentRM` keeps its meaning. The float is a new figure beside it, not a correction to it.
- A card payment is **never** an expense — it settles spending already counted. Card
  *charges* are expenses, under the `CARD_CHARGES` and `BANK_FEES` leaves that already exist.
- No card number is stored. Not the PAN, not the last four. The name and the issuer are what
  the screen needs, and the rest is a liability with no reader.

**Deliberately not built.**

- **Rewards and points.** Unknowable values, expiring terms, and a screen that would quietly
  argue for spending. A different product.
- **A payoff simulator.** "Pay RM 800 instead of the minimum and save RM 412" is advice, and
  every other number in this app is a fact. The APR and the balance are both on screen; the
  arithmetic is not hidden.
- **Per-card budgets.** Envelopes were rejected in `expenses-plan.md` and the rejection does
  not weaken because a card is involved.
- **A bank feed.** Reading a PDF the owner already receives is a different thing, and §8 builds it. What stays refused is anything that holds bank credentials or polls an account: both banks issue PDF statements and nothing else — no CSV, no OFX.
  BNM's Open Finance exposure draft (BNM/RH/ED 028-36, 18 November 2025) would change that, and
  puts credit card transactions and balances explicitly in scope, but it is **still a draft**:
  feedback closed 1 March 2026, no final policy document has issued, and the proposed start is
  1 January 2027 for banks the size of Maybank and **1 January 2029 for prescribed DFIs, which
  is BSN**. Worse for this app specifically, the draft defines "data consumer" by **enumeration**
  — licensed bank, investment bank, Islamic bank, insurer, takaful operator, prescribed DFI,
  eligible e-money issuer — and a personal finance app run by its own owner is none of those. As
  drafted it has no route to the platform at all; the mandated single-account view is something
  the *banks* must build into their own apps. Bilateral arrangements outside the platform survive
  under para 8.2, which is what today's aggregators use, and para 10.7 caps recurring-access
  consent for personal finance management at six months. Four separate reasons not to plan
  around it. `source` on both new tables is what tells §8's importer apart from typing,
  exactly as `expenses.source` and `asset_entries.source` already do.
- **A purchase ledger.** The float identity in §3 exists precisely so that spending on a card
  can be known without one.
- **Any eligibility test.** The app records an Automatic Balance Conversion that has happened.
  It does not evaluate BNM's vulnerable-cardholder criteria and tell you that you qualify —
  that is the app advising you about your own hardship, off three inputs it holds imperfectly.

**Open.**

- **Two figures to check against a real statement**, because the banks' own documents disagree
  with themselves rather than with each other. Maybank's 15 December 2025 PDS states both RM 25
  and RM 50 as the minimum-payment floor in one sentence. BSN's Balance Transfer terms state
  both progressive and on-settlement limit restoration in one document. Neither is resolvable
  from the paperwork, and both are answered by one glance at a statement you already receive.
- **Balance transfers that are not instalment plans.** Two issuers checked (Hong Leong, HSBC)
  run a balance transfer as a *revolving* balance at a promotional rate — 5% minimum, no
  contracted instalment, and in Hong Leong's case a "lifetime" tenure with no repayment period
  at all. `card_plans` cannot hold that: it requires a tenure and an instalment, and rightly so,
  because everything derivable about a plan derives from those. Such a balance would have to sit
  in `balance` with its promotional rate unmodelled, which the card screen should say out loud
  rather than quietly averaging into `apr`. Whether either of these two cards has one is part of
  the question above.
