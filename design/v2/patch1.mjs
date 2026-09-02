import fs from 'fs';
let s = fs.readFileSync('raw.dc.html', 'utf8');
const hits = [];
function rep(label, a, b) {
  if (!s.includes(a)) { console.error('MISS: ' + label); process.exitCode = 1; return; }
  s = s.replace(a, b); hits.push(label);
}

// 1 — the real stored FX rate
rep('rate', 'const RATE = 4.04;', 'const RATE = 4.0364;');

// 2 — real positions, with BOTH P&L bases so the toggle drives the table too,
//     plus the fund facts and goals the redesign dropped.
rep('POS', `const POS = [
  {sym:'ETCO', name:'Grayscale Ethereum Covered Call ETF', color:'var(--grnd)', qty:'691', avg:'$11.87', px:'$8.91', value:'$6,155.08', pl:'−$1,312.69', plPct:'−16.0%', net:'$733.75', returned:'13%', w:60, divs:'$1,048.22', fees:'$45.13', wht:'−$314.47', loss:'−$2,045.72', paidW:'36%'},
  {sym:'MSTY', name:'YieldMax MSTR Option Income Strategy', color:'var(--blu)', qty:'170', avg:'$17.99', px:'$16.30', value:'$2,769.44', pl:'−$288.86', plPct:'−9.4%', net:'$412.06', returned:'13%', w:27, divs:'$588.66', fees:'$18.40', wht:'−$176.60', loss:'−$287.30', paidW:'100%'},
  {sym:'AMDY', name:'YieldMax AMD Option Income Strategy', color:'var(--orn)', qty:'176', avg:'$7.29', px:'$6.42', value:'$1,128.19', pl:'−$153.24', plPct:'−12.1%', net:'$99.87', returned:'8%', w:11, divs:'$142.67', fees:'$9.30', wht:'−$42.80', loss:'−$153.24', paidW:'65%'}
];`,
`const POS = [
  {sym:'ETCO', name:'Grayscale Ethereum Covered Call ETF', color:'var(--grnd)', qty:'691', avg:'$11.87', px:'$8.91', value:'$6,155.08',
   plNet:'−$1,312.69', plNetPct:'−16.0%', plPrice:'−$2,046.44', plPricePct:'−25.0%',
   net:'$733.75', returned:'9%', w:60, divs:'$1,048.22', fees:'$45.13', wht:'−$314.47', loss:'−$2,046.44', paidW:'36%'},
  {sym:'MSTY', name:'YieldMax MSTR Option Income Strategy ETF', color:'var(--blu)', qty:'182.312', avg:'$17.68', px:'$15.35', value:'$2,798.49',
   plNet:'−$134.12', plNetPct:'−4.2%', plPrice:'−$424.94', plPricePct:'−13.2%',
   net:'$290.82', returned:'9%', w:27, divs:'$415.45', fees:'$31.99', wht:'−$124.63', loss:'−$424.94', paidW:'68%'},
  {sym:'AMDY', name:'YieldMax AMD Option Income Strategy ETF', color:'var(--orn)', qty:'25.607', avg:'$53.85', px:'$42.51', value:'$1,088.55',
   plNet:'−$152.18', plNetPct:'−11.0%', plPrice:'−$290.48', plPricePct:'−21.1%',
   net:'$138.30', returned:'10%', w:11, divs:'$197.57', fees:'$12.51', wht:'−$59.27', loss:'−$290.48', paidW:'48%'}
];

// Fund facts from moomoo's snapshot, and the fund's OWN declared distributions —
// a different list from your receipts: it runs ahead by the settlement gap.
const INSTR = [
  {sym:'ETCO', name:'Grayscale Ethereum Covered Call ETF', color:'var(--grnd)', aum:'$4.2M', nav:'$8.78', prem:'+1.4%',
   units:'480,000', yld:'144.8%', net:'$733.75', returned:'9%', payments:'12', share:'0.144%', tiny:true,
   decls:'23 on record', trend:'−32.1%',
   list:[{d:'28 Aug 2026', v:'$0.1466', pending:true},{d:'13 Aug 2026', v:'$0.1100', pending:false},{d:'30 Jul 2026', v:'$0.2058', pending:false},{d:'14 Jul 2026', v:'$0.1911', pending:false}]},
  {sym:'MSTY', name:'YieldMax MSTR Option Income Strategy ETF', color:'var(--blu)', aum:'$924.3M', nav:'$14.80', prem:'+3.7%',
   units:'62,170,113', yld:'180.4%', net:'$290.82', returned:'9%', payments:'29', share:'<0.01%', tiny:false,
   decls:'40 on record', trend:'−2.7%',
   list:[{d:'27 Aug 2026', v:'$0.2836', pending:true},{d:'20 Aug 2026', v:'$0.1620', pending:false},{d:'13 Aug 2026', v:'$0.1809', pending:false},{d:'06 Aug 2026', v:'$0.2083', pending:false}]},
  {sym:'AMDY', name:'YieldMax AMD Option Income Strategy ETF', color:'var(--orn)', aum:'$384.7M', nav:'$42.15', prem:'+0.9%',
   units:'9,049,975', yld:'81.9%', net:'$138.30', returned:'10%', payments:'12', share:'<0.01%', tiny:false,
   decls:'40 on record', trend:'−24.3%',
   list:[{d:'27 Aug 2026', v:'$0.4843', pending:true},{d:'20 Aug 2026', v:'$0.6094', pending:false},{d:'13 Aug 2026', v:'$0.5636', pending:false},{d:'06 Aug 2026', v:'$0.6754', pending:false}]}
];

// Two shapes: accumulate shares, or reach an income level. Both answer the same
// question — how much more, and what does that cost.
const GOALS = [
  {kind:'Shares held', title:'1,000 shares of ETCO', color:'var(--grnd)', pct:69,
   aLabel:'You hold', a:'691', bLabel:'Still need', b:'309',
   cLabel:'Capital at $8.91', c:'$2,752.42', cSub:'≈ RM 11,110',
   note:'The closest goal you have. Your idle RM 864 covers 97 of the 309 shares outstanding.'},
  {kind:'Shares held', title:'1,000 shares of MSTY', color:'var(--blu)', pct:18,
   aLabel:'You hold', a:'182.312', bLabel:'Still need', b:'817.688',
   cLabel:'Capital at $15.35', c:'$12,551.51', cSub:'≈ RM 50,660',
   note:'The furthest. At your current pace this one is measured in years, not months.'},
  {kind:'Per dividend payment', title:'RM 200.00 per MSTY payment', color:'var(--blu)', pct:47,
   aLabel:'Averaging', a:'RM 94.24', bLabel:'Still need', b:'RM 105.76',
   cLabel:'Buy 205 more', c:'$3,141.96', cSub:'≈ RM 12,683',
   note:'Your last 3 MSTY payments averaged RM 94.24 on 182.312 shares — about RM 0.52 per share each time. This assumes the fund keeps paying at that rate, which is the shaky part: a direction, not a promise.'}
];`);

// 3 — real monthly income. September is the one estimate, and it is derived:
//     recent per-share rates × shares actually held × each fund's real cadence.
rep('SERIES', 'const SERIES = [0,84,132,198,366,1014,1164,1521,555,1187];',
`const SERIES = [6,61,91,121,260,1087,1256,1521,631,1237];`);

// 4 — the two dropped screens rejoin the nav
rep('nav', "const navItems = [['Overview','overview'],['Positions','positions'],['Income','income'],['Wallet','wallet'],['History','history'],['Settings','settings']];",
"const navItems = [['Overview','overview'],['Positions','positions'],['Instruments','instruments'],['Income','income'],['Goals','goals'],['Wallet','wallet'],['History','history'],['Settings','settings']];");

// 5 — these funds declare weekly. The DATES are known; the AMOUNTS are not.
rep('hero-sub', '<span style="font-size:13.5px;color:var(--mut)">scheduled across 4 payouts · nothing landed yet</span>',
'<span style="font-size:13.5px;color:var(--mut)">estimated across 4 payout dates · no amounts declared yet</span>');
rep('hero-num', 'RM 1,187<span style="color:var(--faint)">.40</span>', 'RM 1,236<span style="color:var(--faint)">.78</span>');
rep('bar-labels', '<span>RECEIVED RM 0</span><span>SCHEDULED RM 1,187.40</span>',
'<span>RECEIVED RM 0</span><span>ESTIMATED RM 1,236.78</span>');

// 6 — a run rate off falling per-share rates is the optimistic case; say so
rep('runrate', `<div style="font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;font-size:26px;margin-top:6px">RM 14,249<span style="color:var(--faint);font-size:15px">/yr</span></div><div style="font-size:11.5px;color:var(--faint);margin-top:4px">at today's distribution rates</div>`,
`<div style="font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;font-size:26px;margin-top:6px;color:var(--amb)">RM 14,841<span style="color:var(--faint);font-size:15px">/yr</span></div><div style="font-size:11.5px;color:var(--faint);margin-top:4px">if per-share rates hold — they are falling</div>`);

fs.writeFileSync('raw.dc.html', s, 'utf8');
console.log('applied: ' + hits.join(', '));
