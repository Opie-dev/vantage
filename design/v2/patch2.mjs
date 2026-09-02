import fs from 'fs';
let s = fs.readFileSync('raw.dc.html', 'utf8');
const hits = [];
function rep(label, a, b) {
  if (!s.includes(a)) { console.error('MISS: ' + label); process.exitCode = 1; return; }
  s = s.replace(a, b); hits.push(label);
}

/* ── data corrections ─────────────────────────────────────────────────── */

// Legend: all-time net per holding, in RM. The three open holdings do not sum
// to the total — RM 340 came from BCCC, BITO and MAXI, since sold.
rep('legend', `<div style="display:flex;align-items:center;gap:7px"><span style="width:9px;height:9px;border-radius:2px;background:var(--grnd)"></span><span style="font-size:11.5px;color:var(--mut)">ETCO</span><span style="font-family:'IBM Plex Mono',monospace;font-size:11.5px">RM 672</span></div>
<div style="display:flex;align-items:center;gap:7px"><span style="width:9px;height:9px;border-radius:2px;background:var(--blu)"></span><span style="font-size:11.5px;color:var(--mut)">MSTY</span><span style="font-family:'IBM Plex Mono',monospace;font-size:11.5px">RM 386</span></div>
<div style="display:flex;align-items:center;gap:7px"><span style="width:9px;height:9px;border-radius:2px;background:var(--orn)"></span><span style="font-size:11.5px;color:var(--mut)">AMDY</span><span style="font-family:'IBM Plex Mono',monospace;font-size:11.5px">RM 129</span></div>`,
`<div style="display:flex;align-items:center;gap:7px"><span style="width:9px;height:9px;border-radius:2px;background:var(--grnd)"></span><span style="font-size:11.5px;color:var(--mut)">ETCO</span><span style="font-family:'IBM Plex Mono',monospace;font-size:11.5px">RM 2,962</span></div>
<div style="display:flex;align-items:center;gap:7px"><span style="width:9px;height:9px;border-radius:2px;background:var(--blu)"></span><span style="font-size:11.5px;color:var(--mut)">MSTY</span><span style="font-family:'IBM Plex Mono',monospace;font-size:11.5px">RM 1,174</span></div>
<div style="display:flex;align-items:center;gap:7px"><span style="width:9px;height:9px;border-radius:2px;background:var(--orn)"></span><span style="font-size:11.5px;color:var(--mut)">AMDY</span><span style="font-family:'IBM Plex Mono',monospace;font-size:11.5px">RM 558</span></div>
<div style="display:flex;align-items:center;gap:7px"><span style="width:9px;height:9px;border-radius:2px;background:var(--faint)"></span><span style="font-size:11.5px;color:var(--mut)">Sold</span><span style="font-family:'IBM Plex Mono',monospace;font-size:11.5px">RM 340</span></div>`);

// Payout dates are real September Fridays; amounts are estimates, and the note
// says which funds pay on each rather than pretending to a countdown.
rep('payouts', `      payouts: [
        {date:'Fri 4 Sep', amt:'RM 168.20', when:'in 3 days', color:'var(--grn)'},
        {date:'Fri 11 Sep', amt:'RM 96.44', when:'in 10 days', color:'var(--mut)'},
        {date:'Fri 18 Sep', amt:'RM 32.21', when:'in 17 days', color:'var(--mut)'},
        {date:'Fri 25 Sep', amt:'RM 890.55', when:'in 24 days', color:'var(--mut)'}
      ],`,
`      payouts: [
        {date:'Fri 4 Sep', amt:'≈ RM 149.68', when:'MSTY + AMDY', color:'var(--mut)'},
        {date:'Fri 11 Sep', amt:'≈ RM 468.71', when:'all three', color:'var(--grn)'},
        {date:'Fri 18 Sep', amt:'≈ RM 149.68', when:'MSTY + AMDY', color:'var(--mut)'},
        {date:'Fri 25 Sep', amt:'≈ RM 468.71', when:'all three', color:'var(--grn)'}
      ],`);

rep('price-pnl', `      pnlValue: s.basis === 'income' ? '−RM 6,114.49' : '−RM 11,147.99',
      pnlPct: s.basis === 'income' ? '−11.8%' : '−21.5%',`,
`      pnlValue: s.basis === 'income' ? '−RM 6,114.49' : '−RM 11,148.00',
      pnlPct: s.basis === 'income' ? '−11.8%' : '−21.6%',`);

// The basis toggle now drives the per-position column too, as it does in the app.
rep('positions', `      positions: POS.map((q, i) => ({...q, wPct: q.w + '%', open: () => this.setState({screen:'detail', pos:i})})),`,
`      positions: POS.map((q, i) => ({...q, wPct: q.w + '%',
        pl: s.basis === 'income' ? q.plNet : q.plPrice,
        plPct: s.basis === 'income' ? q.plNetPct : q.plPricePct,
        open: () => this.setState({screen:'detail', pos:i})})),`);

// Under the real figures NONE of the three has been paid back yet — MSTY is the
// closest at 68%, not "more than covered". The verdict is now computed, not typed.
rep('verdict', `      dSym: p.sym, dName: p.name, dColor: p.color, dPx: p.px, dValue: p.value, dPlPct: p.plPct,
      dNet: p.net, dLoss: p.loss, dPaidW: p.paidW,
      dVerdict: p.sym === 'MSTY'
        ? 'Distributions have more than covered the price decline. On a total-return basis this position is roughly flat — the yield is doing its job.'
        : 'Distributions have not yet covered the price decline. You are being paid well, but the capital is eroding faster than the income replaces it.',`,
`      dSym: p.sym, dName: p.name, dColor: p.color, dPx: p.px, dValue: p.value,
      dPlPct: s.basis === 'income' ? p.plNetPct : p.plPricePct,
      dNet: p.net, dLoss: p.loss, dPaidW: p.paidW,
      dVerdict: 'Distributions have covered ' + p.paidW + ' of the price decline so far. '
        + (parseInt(p.paidW, 10) >= 60
            ? 'The closest of your three to breaking even — the yield is most of the way there, but the capital is still ahead of it.'
            : 'You are being paid well, but the capital is eroding faster than the income replaces it.'),`);

/* ── the two screens the redesign dropped ─────────────────────────────── */

rep('flags', `      isSettings: s.screen === 'settings', isStates: s.screen === 'states',
      goPositions: this.go('positions'), goIncome: this.go('income'), goWallet: this.go('wallet'),
      goSettings: this.go('settings'), goStates: this.go('states'),`,
`      isSettings: s.screen === 'settings', isStates: s.screen === 'states',
      isInstruments: s.screen === 'instruments', isGoals: s.screen === 'goals',
      goPositions: this.go('positions'), goIncome: this.go('income'), goWallet: this.go('wallet'),
      goSettings: this.go('settings'), goStates: this.go('states'),
      instruments: INSTR.map(i => ({...i, shareColor: i.tiny ? 'var(--amb)' : 'var(--fg)'})),
      goals: GOALS.map(g => ({...g, pctLabel: g.pct + '%', barW: g.pct + '%'})),`);

const SCREENS = `<sc-if value="{{ isInstruments }}" hint-placeholder-val="{{ false }}">
<div style="padding:clamp(18px,3vw,26px) clamp(14px,2.4vw,28px) 40px;display:flex;flex-direction:column;gap:18px;animation:vfade .3s ease both">
<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><div style="font-size:20px;font-weight:700;letter-spacing:-.02em">Instruments</div><span style="font-size:12px;color:var(--mut)">what you actually own a piece of · figures from moomoo, refreshed each sync</span></div>

<sc-for list="{{ instruments }}" as="f" hint-placeholder-count="3">
<div style="border:1px solid var(--line);border-radius:12px;background:var(--surf);padding:22px">
<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">
<span style="width:3px;height:26px;border-radius:2px;background:{{ f.color }};flex:none"></span>
<div style="font-size:16px;font-weight:700">{{ f.sym }}</div>
<div style="flex:1;font-size:12.5px;color:var(--mut);min-width:180px">{{ f.name }}</div>
</div>

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:16px;margin-top:18px">
<div><div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)">Fund size</div><div style="font-family:'IBM Plex Mono',monospace;font-size:16px;font-weight:600;margin-top:5px;color:{{ f.shareColor }}">{{ f.aum }}</div></div>
<div><div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)">NAV / unit</div><div style="font-family:'IBM Plex Mono',monospace;font-size:16px;font-weight:600;margin-top:5px">{{ f.nav }}</div></div>
<div><div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)">Price vs NAV</div><div style="font-family:'IBM Plex Mono',monospace;font-size:16px;font-weight:600;margin-top:5px;color:var(--red)">{{ f.prem }}</div></div>
<div><div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)">Units in issue</div><div style="font-family:'IBM Plex Mono',monospace;font-size:16px;font-weight:600;margin-top:5px">{{ f.units }}</div></div>
<div><div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)">Your share</div><div style="font-family:'IBM Plex Mono',monospace;font-size:16px;font-weight:600;margin-top:5px;color:{{ f.shareColor }}">{{ f.share }}</div></div>
</div>

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:16px;margin-top:18px;padding-top:16px;border-top:1px solid var(--hair)">
<div><div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)">Quoted yield</div><div style="font-family:'IBM Plex Mono',monospace;font-size:16px;font-weight:600;margin-top:5px;color:var(--amb)">{{ f.yld }}</div><div style="font-size:10.5px;color:var(--faint);margin-top:3px">annualised projection</div></div>
<div><div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)">Paid you, net</div><div style="font-family:'IBM Plex Mono',monospace;font-size:16px;font-weight:600;margin-top:5px;color:var(--grn)">{{ f.net }}</div><div style="font-size:10.5px;color:var(--faint);margin-top:3px">actually received</div></div>
<div><div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)">Returned on cost</div><div style="font-family:'IBM Plex Mono',monospace;font-size:16px;font-weight:600;margin-top:5px;color:var(--grn)">{{ f.returned }}</div><div style="font-size:10.5px;color:var(--faint);margin-top:3px">cumulative, not annual</div></div>
<div><div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)">Payments</div><div style="font-family:'IBM Plex Mono',monospace;font-size:16px;font-weight:600;margin-top:5px">{{ f.payments }}</div><div style="font-size:10.5px;color:var(--faint);margin-top:3px">to you, since first buy</div></div>
</div>

<div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--hair)">
<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
<div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)">Fund distributions · {{ f.decls }}</div>
<div style="font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:var(--red)">{{ f.trend }} per share vs the previous 4</div>
</div>
<div style="margin-top:10px">
<sc-for list="{{ f.list }}" as="d" hint-placeholder-count="4">
<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:7px 0;border-bottom:1px solid var(--hair)">
<span style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--mut)">{{ d.d }}</span>
<span style="display:flex;align-items:baseline;gap:9px">
<sc-if value="{{ d.pending }}" hint-placeholder-val="{{ false }}"><span style="font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--amb);border:1px solid var(--amb);border-radius:999px;padding:1px 7px">pending</span></sc-if>
<span style="font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:600">{{ d.v }}</span>
</span>
</div>
</sc-for>
</div>
<div style="font-size:11px;color:var(--faint);margin-top:10px;line-height:1.55">Per share, as declared by the fund. This is the fund's own schedule, not your account — it runs ahead of you by the settlement gap, so the newest line is usually still on its way.</div>
</div>
</div>
</sc-for>

<div style="border:1px dashed var(--line);border-radius:10px;padding:14px 16px;font-size:12px;color:var(--mut);line-height:1.6">
No holdings breakdown, because these funds do not have one: they hold cash and options against a single underlying, not a basket. The number worth watching is <b style="color:var(--fg)">your share of the fund</b> — ETCO is a $4.2M vehicle you own 0.144% of, which is a different risk from MSTY at $924M.
</div>
</div>
</sc-if>

<sc-if value="{{ isGoals }}" hint-placeholder-val="{{ false }}">
<div style="padding:clamp(18px,3vw,26px) clamp(14px,2.4vw,28px) 40px;display:flex;flex-direction:column;gap:18px;animation:vfade .3s ease both">
<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><div style="font-size:20px;font-weight:700;letter-spacing:-.02em">Goals</div><span style="font-size:12px;color:var(--mut)">how much more, and what it costs · income targets count what reaches your wallet after tax</span></div>

<sc-for list="{{ goals }}" as="g" hint-placeholder-count="3">
<div style="border:1px solid var(--line);border-radius:12px;background:var(--surf);padding:22px">
<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap">
<div style="display:flex;align-items:baseline;gap:12px;min-width:0">
<span style="width:3px;height:26px;border-radius:2px;background:{{ g.color }};flex:none"></span>
<div><div style="font-family:'IBM Plex Mono',monospace;font-size:17px;font-weight:600">{{ g.title }}</div><div style="font-size:11.5px;color:var(--mut);margin-top:3px">{{ g.kind }}</div></div>
</div>
<span style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--amb);border:1px solid var(--amb);border-radius:999px;padding:2px 10px;white-space:nowrap">{{ g.pctLabel }} there</span>
</div>

<div style="height:10px;border-radius:6px;background:var(--hair);margin-top:16px;overflow:hidden"><div style="width:{{ g.barW }};height:10px;background:{{ g.color }}"></div></div>

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:18px;margin-top:16px">
<div><div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)">{{ g.aLabel }}</div><div style="font-family:'IBM Plex Mono',monospace;font-size:18px;font-weight:600;margin-top:5px;color:var(--grn)">{{ g.a }}</div></div>
<div><div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)">{{ g.bLabel }}</div><div style="font-family:'IBM Plex Mono',monospace;font-size:18px;font-weight:600;margin-top:5px">{{ g.b }}</div></div>
<div><div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)">{{ g.cLabel }}</div><div style="font-family:'IBM Plex Mono',monospace;font-size:18px;font-weight:600;margin-top:5px">{{ g.c }}</div><div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--faint);margin-top:3px">{{ g.cSub }}</div></div>
</div>

<div style="font-size:12.5px;color:var(--mut);line-height:1.6;margin-top:16px;padding-top:14px;border-top:1px solid var(--hair);text-wrap:pretty">{{ g.note }}</div>
</div>
</sc-for>

<div style="border:1px dashed var(--line);border-radius:10px;padding:14px 16px;font-size:12px;color:var(--mut);line-height:1.6">
A share goal is reached by buying; an income goal is reached by buying <i>more</i>. Neither is reached by waiting, so there is no countdown on these cards — the only figure that moves them is capital.
</div>
</div>
</sc-if>

<sc-if value="{{ modalOpen }}" hint-placeholder-val="{{ false }}">`;

rep('screens', '<sc-if value="{{ modalOpen }}" hint-placeholder-val="{{ false }}">', SCREENS);

// startScreen tweak should offer the new screens too
rep('tweak', '&quot;options&quot;:[&quot;overview&quot;,&quot;positions&quot;,&quot;income&quot;,&quot;wallet&quot;,&quot;history&quot;,&quot;settings&quot;,&quot;states&quot;]',
'&quot;options&quot;:[&quot;overview&quot;,&quot;positions&quot;,&quot;instruments&quot;,&quot;income&quot;,&quot;goals&quot;,&quot;wallet&quot;,&quot;history&quot;,&quot;settings&quot;,&quot;states&quot;]');

fs.writeFileSync('raw.dc.html', s, 'utf8');
console.log('applied: ' + hits.join(', '));
