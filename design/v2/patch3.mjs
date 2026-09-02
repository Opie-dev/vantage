import fs from 'fs';
let s = fs.readFileSync('Main.dc.html', 'utf8');
const hits = [];
function rep(label, a, b) {
  if (!s.includes(a)) { console.error('MISS: ' + label); process.exitCode = 1; return; }
  s = s.replace(a, b); hits.push(label);
}

// The app now computes this rather than assuming it. Cadence comes from each
// fund's own declared ex-dates: ETCO every 15 days, MSTY and AMDY every 7 —
// which lands on Thursdays, not the Fridays this mock guessed.
rep('hero-num', 'RM 1,236<span style="color:var(--faint)">.78</span>', 'RM 1,204<span style="color:var(--faint)">.54</span>');
rep('bar', '<span>RECEIVED RM 0</span><span>ESTIMATED RM 1,236.78</span>',
'<span>RECEIVED RM 0</span><span>ESTIMATED RM 1,204.54</span>');
rep('sub', 'estimated across 4 payout dates · no amounts declared yet',
'estimated across 6 payout dates · no amounts declared yet');

rep('payouts', `      payouts: [
        {date:'Fri 4 Sep', amt:'≈ RM 149.68', when:'MSTY + AMDY', color:'var(--mut)'},
        {date:'Fri 11 Sep', amt:'≈ RM 468.71', when:'all three', color:'var(--grn)'},
        {date:'Fri 18 Sep', amt:'≈ RM 149.68', when:'MSTY + AMDY', color:'var(--mut)'},
        {date:'Fri 25 Sep', amt:'≈ RM 468.71', when:'all three', color:'var(--grn)'}
      ],`,
`      payouts: [
        {date:'Thu 3 Sep', amt:'≈ RM 138.64', when:'MSTY + AMDY', color:'var(--mut)'},
        {date:'Thu 10 Sep', amt:'≈ RM 138.64', when:'MSTY + AMDY', color:'var(--mut)'},
        {date:'Sat 12 Sep', amt:'≈ RM 325.00', when:'ETCO', color:'var(--grn)'},
        {date:'Thu 17 Sep', amt:'≈ RM 138.64', when:'MSTY + AMDY', color:'var(--mut)'},
        {date:'Thu 24 Sep', amt:'≈ RM 138.64', when:'MSTY + AMDY', color:'var(--mut)'},
        {date:'Sun 27 Sep', amt:'≈ RM 325.00', when:'ETCO', color:'var(--grn)'}
      ],`);

rep('series', 'const SERIES = [6,61,91,121,260,1087,1256,1521,631,1237];',
'const SERIES = [6,61,91,121,260,1087,1256,1521,631,1205];');

rep('runrate', 'RM 14,841<span style="color:var(--faint);font-size:15px">/yr</span>',
'RM 14,454<span style="color:var(--faint);font-size:15px">/yr</span>');

fs.writeFileSync('Main.dc.html', s, 'utf8');
console.log('applied: ' + hits.join(', '));
