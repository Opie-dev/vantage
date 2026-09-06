"""
Read a Maybank credit card e-statement PDF into structured rows.

This is the extractor described in cards-plan.md §8. It writes nothing to the
database: it parses, it checks its own arithmetic against figures the bank
printed, and it prints JSON. Deciding what to do with those rows — which are
expenses, which are already RECURRING commitments, which are not spending at all
— is the importer's job and is deliberately not done here.

    python sync/parse_maybank_statement.py statement.pdf > statement.json
    python sync/parse_maybank_statement.py statement.pdf --text   # what it saw

WHY `-table` AND NOT `-layout`. This matters more than it looks. Run the same
file through `pdftotext -layout` and the columns SHEAR: descriptions and amounts
drift onto neighbouring rows, so the EzyPay Plus interest line comes out holding
EzyCash's RM 900.00 instead of its own RM 18.00. Nothing errors. The totals
still look plausible. `-table` groups by ruled columns instead of by guessed line
boxes and gets it right — but the lesson is the reason §8 insists on the gates at
the bottom of this file rather than trusting any extractor.

WHY NOT OCR. The file has a text layer; every figure in it is already exact.
Running OCR over it would turn `900.00` into a probabilistic guess at
`90000`, silently, in a column nobody re-reads. OCR is the fallback for a
statement that only ever existed on paper, and even then it goes through the same
gates.

Needs `pdftotext` on PATH (Xpdf or Poppler). If the e-statement is locked, pass
the password through with --password; Maybank uses one on emailed statements.
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import date

# ── the five line shapes ─────────────────────────────────────────────────────

# Two DD/MM dates anchor a new record. A line without them continues the one
# above it — an FPX reference number, or the foreign-currency original.
ROW = re.compile(r'^\s*(\d{2}/\d{2})\s+(\d{2}/\d{2})\s+(\S.*?)\s*$')

# The amount is always last, and `CR` suffixed to it is the ONLY sign marker on
# the statement. A payment is not a negative number; it is a suffixed one.
AMOUNT = re.compile(r'(?P<amt>-?[\d,]+\.\d{2})(?P<cr>CR)?$')

# `:004/012` is instalment 4 of 12 — the bank's own progress count, which
# cards-plan.md §8 reconciles against the count derived from dates.
INSTALMENT = re.compile(r':(\d{1,3})/(\d{1,3})\b')

# Printed as though it were a transaction. It is the card's tier rate, free.
RATE = re.compile(r'RETAIL INTEREST RATE\s*=\s*([\d.]+)\s*%')

# `TRANSACTED AMOUNT   USD   108.00` under a foreign charge.
FOREIGN = re.compile(r'TRANSACTED AMOUNT\s+([A-Z]{3})\s+([\d,]+\.\d{2})')

CARD_NO = re.compile(r'\b(\d{4} \d{4} \d{4} \d{4})\b')
MONEY = re.compile(r'-?[\d,]+\.\d{2}')
STATEMENT_DATES = re.compile(r'(\d{2} [A-Z]{3} \d{2})\s+(\d{2} [A-Z]{3} \d{2})')

MONTHS = {m: i + 1 for i, m in enumerate(
    'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split())}

# Lines that are furniture, not transactions. Matched on the English only; the
# Malay twin carries no figures and falls out on its own.
FURNITURE = (
    'STATEMENT OF CREDIT CARD ACCOUNT', 'PENYATA AKAUN', 'Page/Halaman',
    'Posting Date', 'Tarikh Pos', 'WARNING ON PAYING', 'AMARAN KE ATAS',
    'Malayan Banking Berhad',
)

# Where the transaction list stops. Without these the final row keeps swallowing
# every line after it — the totals block, then the whole TreatsPoints page — as
# though they were its own continuations. A continuation is only ever the line or
# two directly under a row, so anything that opens a new section closes the row.
TERMINATORS = (
    'TOTAL CREDIT THIS MONTH', 'TOTAL DEBIT THIS MONTH', 'SUB TOTAL',
    'TreatsPoints', 'Mata Ganjaran', 'YOUR COMBINED CREDIT LIMIT',
    'YOUR PREVIOUS STATEMENT BALANCE',
)

# Not spending, whatever else they are. A cash-out moves money to your own
# account and a payment settles what you already owe — booking either as an
# expense would invent living costs that never happened. See §8.
NOT_SPENDING = ('EZYCASH', 'PYMT@', 'EZYPAY', 'BALANCE TRANSFER')


def money(s):
    return float(s.replace(',', ''))


def extract(pdf, password=None, mode='-table'):
    """Shell out to pdftotext. `-table` for the reason in the module docstring."""
    if not shutil.which('pdftotext'):
        sys.exit('pdftotext not found on PATH — install Xpdf or Poppler')
    cmd = ['pdftotext', mode]
    if password:
        cmd += ['-upw', password]
    cmd += [pdf, '-']
    out = subprocess.run(cmd, capture_output=True)
    if out.returncode != 0:
        sys.exit(f'pdftotext failed: {out.stderr.decode(errors="replace").strip()}')
    text = out.stdout.decode('utf-8', errors='replace')
    if not text.strip():
        sys.exit('no text layer in this PDF — it is a scan, and needs OCR first '
                 '(ocrmypdf), which §8 only allows behind the gates below')
    return text


def parse_header(lines):
    """Statement date, due date, the per-card summary, and the shared limit."""
    h = {'statement_date': None, 'due_date': None, 'combined_limit': None,
         'cards': [], 'previous_balance': None,
         'total_credit': None, 'total_debit': None, 'closing_balance': None}

    for ln in lines:
        if h['statement_date'] is None:
            m = STATEMENT_DATES.search(ln)
            if m:
                h['statement_date'] = as_iso(m.group(1))
                h['due_date'] = as_iso(m.group(2))

        # The account summary block: card number, balance, minimum, on one row.
        # This only aligns in `-table` mode; in `-layout` they land apart.
        m = CARD_NO.search(ln)
        if m and 'Account Number' not in ln:
            amounts = MONEY.findall(ln)
            if len(amounts) >= 2:
                h['cards'].append({
                    'number': m.group(1),
                    'balance': money(amounts[-2]),
                    'minimum': money(amounts[-1]),
                })

        if 'COMBINED CREDIT LIMIT' in ln:
            n = re.findall(r'[\d,]+', ln.split(')')[-1])
            if n:
                h['combined_limit'] = money(n[-1] + '.00' if '.' not in n[-1] else n[-1])

        # These appear once per card section; the LAST one is the card that
        # actually carries a balance, which is the account the rows belong to.
        for key, label in (('previous_balance', 'YOUR PREVIOUS STATEMENT BALANCE'),
                           ('total_credit', 'TOTAL CREDIT THIS MONTH'),
                           ('total_debit', 'TOTAL DEBIT THIS MONTH'),
                           ('closing_balance', 'SUB TOTAL')):
            if label in ln:
                n = MONEY.findall(ln)
                if n:
                    h[key] = money(n[-1])
    return h


def as_iso(s):
    d, mon, y = s.split()
    return f'20{y}-{MONTHS[mon]:02d}-{int(d):02d}'


def with_year(ddmm, statement_iso):
    """
    Transaction lines carry no year. It comes from the statement date, and a
    posting month AFTER the statement month belongs to the year before — the one
    place this parser can be wrong by twelve months and not notice, so it is the
    one place worth writing down.
    """
    d, m = (int(x) for x in ddmm.split('/'))
    y, sm = int(statement_iso[:4]), int(statement_iso[5:7])
    if m > sm:
        y -= 1
    return date(y, m, d).isoformat()


def parse_rows(lines, statement_iso):
    rows, prev = [], None
    for ln in lines:
        # Collapse runs of spaces before matching furniture: the same banner is
        # set with one space on page 2 and two on page 3, and the loose one was
        # landing in the previous row's continuation list.
        flat = re.sub(r'\s+', ' ', ln)
        if any(f in flat for f in FURNITURE):
            continue
        if any(t in flat for t in TERMINATORS):
            prev = None
            continue

        m = ROW.match(ln)
        if not m:
            # A continuation of the row above: an FPX reference, or the original
            # foreign amount. Kept, because `TRANSACTED AMOUNT USD 108.00` is the
            # only place the pre-conversion figure appears.
            t = ln.strip()
            if prev is not None and t and not t.startswith(('JUMLAH', '(')):
                # The only continuation worth structuring: the pre-conversion
                # amount on a foreign charge. It is the sole place the statement
                # shows what was actually billed abroad, and dividing the two
                # gives the all-in rate Maybank applied — scheme markup included.
                fx = FOREIGN.search(t)
                if fx:
                    prev['foreign'] = {
                        'currency': fx.group(1), 'amount': money(fx.group(2)),
                        'rate': round(prev['amount'] / money(fx.group(2)), 4),
                    }
                else:
                    prev.setdefault('extra', []).append(t)
            continue

        posting, txn, rest = m.groups()

        rate = RATE.search(rest)
        if rate:
            rows.append({'kind': 'rate', 'posted': with_year(posting, statement_iso),
                         'apr': float(rate.group(1))})
            prev = None
            continue

        a = AMOUNT.search(rest)
        if not a:
            prev = None
            continue

        amount = money(a.group('amt'))
        credit = bool(a.group('cr'))
        text = rest[:a.start()].strip()

        # Columns are separated by runs of two or more spaces; the first field is
        # the merchant, the rest is where it happened (or the instalment marker).
        fields = [f for f in re.split(r'\s{2,}', text) if f]
        description = fields[0] if fields else ''
        tail = ' '.join(fields[1:])

        inst = INSTALMENT.search(text)
        if inst:
            kind = 'instalment'
        elif credit:
            kind = 'credit'
        else:
            kind = 'retail'

        row = {
            'kind': kind,
            'posted': with_year(posting, statement_iso),
            'transacted': with_year(txn, statement_iso),
            'description': description,
            'location': None if inst else (tail or None),
            'amount': amount,
            'credit': credit,
        }
        if inst:
            row['instalment_no'] = int(inst.group(1))
            row['instalment_of'] = int(inst.group(2))
        # Never a candidate for the expense log, by rule rather than by judgement.
        row['spending_candidate'] = (
            kind == 'retail'
            and not any(p in description.upper() for p in NOT_SPENDING))
        rows.append(row)
        prev = row
    return rows


def check(header, rows):
    """
    The two gates. Both are computed from figures the bank printed on the same
    page, and an import that fails either is REFUSED rather than corrected —
    the same instinct as SPEND_UNKNOWN. See cards-plan.md §8.
    """
    out = []

    prev, cr, db, close = (header['previous_balance'], header['total_credit'],
                           header['total_debit'], header['closing_balance'])
    if None not in (prev, cr, db, close):
        got = round(prev + db - cr, 2)
        out.append({'gate': 'balance', 'expected': close, 'derived': got,
                    'ok': abs(got - close) < 0.005,
                    'how': 'previous + debit - credit = closing'})

    # Do the rows we parsed actually add up to the balance the bank printed?
    # The gate above only checks the header against itself, so it would pass
    # happily while the parser silently dropped a page. This one cannot: it is
    # the only check that touches every row.
    carrying = [c for c in header['cards'] if c['balance'] > 0]
    if carrying:
        booked = round(sum(r['amount'] for r in rows
                           if r['kind'] in ('retail', 'instalment')), 2)
        target = carrying[-1]['balance']
        out.append({'gate': 'rows', 'expected': target, 'derived': booked,
                    'ok': abs(booked - target) < 0.02,
                    'how': 'every parsed retail + instalment row = closing balance'})

    # 5% of the balance with the instalments taken out, plus 100% of them.
    # BNM/RH/PD 028-141 para 13.1, and the reason cards-plan.md §5 reads the way
    # it does.
    if carrying:
        card = carrying[-1]
        inst = sum(r['amount'] for r in rows if r['kind'] == 'instalment')
        revolving = round(card['balance'] - inst, 2)
        got = round(revolving * 0.05 + inst, 2)
        out.append({'gate': 'minimum', 'expected': card['minimum'], 'derived': got,
                    'ok': abs(got - card['minimum']) < 0.02,
                    'how': '5% x (balance - instalments) + 100% x instalments',
                    'instalments': round(inst, 2), 'revolving': revolving})
    return out


def post_statement(base, card_id, header, rows):
    """
    Send the header to /api/commitments/:id/statements — and ONLY the header.

    The statement row is the load-bearing one: the float reads two closing
    balances and nothing else, so importing this alone already makes the month's
    spending figure exact. The transaction rows are a convenience for the expense
    log and need a human, because the statement genuinely does not contain the
    answer: an electricity bill on a card is already a RECURRING commitment and
    booking it again would count it twice, a cash-out is not spending at all, and
    a payment gateway hides the merchant it was paid to. See cards-plan.md §8.
    """
    import urllib.error
    import urllib.request

    card = [c for c in header['cards'] if c['balance'] > 0]
    if not card:
        sys.exit('no card on this statement carries a balance — nothing to record')
    card = card[-1]

    charges = [r for r in rows if r['kind'] in ('retail', 'instalment')]
    body = {
        'statement_date': header['statement_date'],
        'due_date': header['due_date'],
        'closing_balance': card['balance'],
        'minimum_due': card['minimum'],
        # Interest and fees are not separated out by this parser yet: they sit in
        # the retail rows under their own descriptions. Left at zero rather than
        # guessed, so the card sheet shows an honest blank.
        'interest_charged': 0,
        'fees_charged': 0,
        'source': 'import',
        'note': f'imported from {header["statement_date"]}',
    }
    req = urllib.request.Request(
        f'{base.rstrip("/")}/api/commitments/{card_id}/statements',
        data=json.dumps(body).encode(),
        headers={'content-type': 'application/json'},
        method='POST')
    try:
        with urllib.request.urlopen(req) as r:
            out = json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f'the server refused it: {e.code} {e.read().decode(errors="replace")[:300]}')
    except urllib.error.URLError as e:
        sys.exit(f'could not reach {base}: {e.reason}')

    print(f'recorded statement {out["statement_date"]}, closing {out["closing_balance"]:,.2f}, '
          f'minimum {out["minimum_due"]:,.2f}')

    plans = [r for r in rows if r['kind'] == 'instalment']
    spend = [r for r in charges if r.get('spending_candidate')]
    print(f'\nNOT sent, and deliberately:')
    print(f'  {len(plans)} instalment line(s) - match these against the card\'s plans by hand once;')
    print(f'     the bank prints its own counter, so a mismatch means a deferred or missed month')
    print(f'  {len(spend)} purchase(s) - each needs a category, an existing commitment, or nothing.')
    print(f'     An unmatched merchant is left uncategorised rather than guessed at.')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('pdf')
    ap.add_argument('--password', help='e-statement password, if the file is locked')
    ap.add_argument('--text', action='store_true', help='dump what pdftotext saw and stop')
    ap.add_argument('--post', metavar='BASE_URL',
                    help='record the statement against a card, e.g. http://127.0.0.1:8123')
    ap.add_argument('--card', type=int, metavar='ID',
                    help='the REVOLVING commitment id to record it against')
    args = ap.parse_args()

    text = extract(args.pdf, args.password)
    if args.text:
        print(text)
        return

    lines = text.splitlines()
    header = parse_header(lines)
    if not header['statement_date']:
        sys.exit('could not find the statement date — is this a Maybank card statement?')

    rows = parse_rows(lines, header['statement_date'])
    gates = check(header, rows)
    failed = [g for g in gates if not g['ok']]

    if args.post:
        if not args.card:
            sys.exit('--post needs --card <id>: which card account is this statement for?')
        # The gates run BEFORE anything is sent, every time. An import that does
        # not add up is refused rather than corrected.
        for g in gates:
            print(('PASS' if g['ok'] else 'FAIL'),
                  f"{g['gate']:<8} expected {g['expected']:>12,.2f}  derived {g['derived']:>12,.2f}")
        if failed:
            print('\nGATE FAILED — nothing was sent.', file=sys.stderr)
            sys.exit(2)
        print()
        post_statement(args.post, args.card, header, rows)
        return

    print(json.dumps({'statement': header, 'gates': gates, 'rows': rows},
                     indent=2, ensure_ascii=False))

    # Exit non-zero on a failed gate so a shell pipeline stops rather than
    # importing rows nobody has checked.
    if failed:
        print('\nGATE FAILED — do not import these rows.', file=sys.stderr)
        sys.exit(2)


if __name__ == '__main__':
    main()
