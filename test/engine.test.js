// Run: node test/engine.test.js
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../src/10_engine.js', 'utf8');
const m = src.match(/\/\/ <ENGINE>([\s\S]*?)\/\/ <\/ENGINE>/);
const E = new Function(m[1] + '; return {etParts,dayKey,addDays,isWeekday,nextWeekday,prevWeekday,fillDayFor,canSettle,normTicker,applyOrder,settleDay,equityOf,retPct,round2,marketStatus,nextMarketDay};')();
let fails = 0;
function eq(a, b, msg) { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fails++; console.log('FAIL', msg, '\n  got', JSON.stringify(a), '\n  exp', JSON.stringify(b)); } else console.log('ok  ', msg); }
const ms = (iso) => Date.parse(iso); // helper (UTC ISO)

// --- time logic (Nov = EST, UTC-5) ---
eq(E.fillDayFor(ms('2026-11-13T15:00:00Z')), '2026-11-13', 'Fri 10:00 ET fills Fri close');
eq(E.fillDayFor(ms('2026-11-13T20:59:00Z')), '2026-11-13', 'Fri 15:59 ET fills Fri close');
eq(E.fillDayFor(ms('2026-11-13T21:00:00Z')), '2026-11-16', 'Fri 16:00 ET fills Mon close');
eq(E.fillDayFor(ms('2026-11-14T15:00:00Z')), '2026-11-16', 'Sat fills Mon close');
eq(E.fillDayFor(ms('2026-11-16T03:00:00Z')), '2026-11-16', 'Sun 22:00 ET fills Mon close');
// DST: July is EDT (UTC-4): 15:59 ET = 19:59Z
eq(E.fillDayFor(ms('2026-07-15T19:59:00Z')), '2026-07-15', 'EDT 15:59 fills same day');
eq(E.fillDayFor(ms('2026-07-15T20:00:00Z')), '2026-07-16', 'EDT 16:00 fills next day');
eq(E.canSettle('2026-11-13', ms('2026-11-13T21:19:00Z')), false, 'cannot settle 16:19');
eq(E.canSettle('2026-11-13', ms('2026-11-13T21:20:00Z')), true, 'can settle 16:20');
eq(E.canSettle('2026-11-13', ms('2026-11-14T14:00:00Z')), true, 'can settle next day');
eq(E.canSettle('2026-11-16', ms('2026-11-13T22:00:00Z')), false, 'cannot settle future day');
eq(E.nextWeekday('2026-11-13'), '2026-11-16', 'next weekday skips weekend');
eq(E.prevWeekday('2026-11-16'), '2026-11-13', 'prev weekday skips weekend');
eq(E.normTicker(' brk.b '), 'BRK-B', 'ticker normalize');

// --- rules ---
const R = { cash: 100000, maxPos: 3, maxTr: 3, maxPct: 30, uni: 'any', list: [] };
let pf = { cash: 100000, pos: {} };
let r = E.applyOrder(pf, { s: 'buy', t: 'AAPL', q: 100 }, 200, R, 100000);
eq([r.ok, r.pf.cash, r.pf.pos.AAPL], [true, 80000, { q: 100, c: 20000 }], 'buy within limits');
r = E.applyOrder(pf, { s: 'buy', t: 'AAPL', q: 200 }, 200, R, 100000);
eq([r.ok, r.reason], [false, 'Over the 30% single-stock limit'], 'concentration cap');
r = E.applyOrder({ cash: 1000, pos: {} }, { s: 'buy', t: 'AAPL', q: 6 }, 200, R, 1000);
eq([r.ok, r.reason], [false, 'Not enough cash'], 'insufficient cash');
r = E.applyOrder(pf, { s: 'buy', t: 'AAPL', q: 1.5 }, 200, R, 100000);
eq(r.ok, false, 'fractional rejected');
r = E.applyOrder(pf, { s: 'sell', t: 'AAPL', q: 1 }, 200, R, 100000);
eq([r.ok, r.reason], [false, 'Not enough shares to sell'], 'no shorting');
const full = { cash: 50000, pos: { A: { q: 1, c: 10 }, B: { q: 1, c: 10 }, C: { q: 1, c: 10 } } };
r = E.applyOrder(full, { s: 'buy', t: 'D', q: 1 }, 10, R, 50030);
eq([r.ok, r.reason], [false, 'Position limit reached (3)'], 'position limit');
r = E.applyOrder(full, { s: 'buy', t: 'A', q: 1 }, 10, R, 50030);
eq(r.ok, true, 'adding to existing position ok at the limit');
const L = Object.assign({}, R, { uni: 'list', list: ['MSFT'] });
r = E.applyOrder(pf, { s: 'buy', t: 'AAPL', q: 1 }, 10, L, 100000);
eq([r.ok, r.reason], [false, 'Not on this game’s ticker list'], 'ticker list enforced');
// partial sell realizes P/L on average cost
const held = { cash: 0, pos: { AAPL: { q: 10, c: 1000 } } };
r = E.applyOrder(held, { s: 'sell', t: 'AAPL', q: 4 }, 120, R, 1200);
eq([r.ok, r.pl, r.pf.cash, r.pf.pos.AAPL], [true, 80, 480, { q: 6, c: 600 }], 'partial sell P/L + cost basis');
r = E.applyOrder(held, { s: 'sell', t: 'AAPL', q: 10 }, 100, R, 1000);
eq(Object.keys(r.pf.pos).length, 0, 'full sell removes position');

// --- settle ---
const closes = { AAPL: 200, MSFT: 400 };
const pend = {
  p1: [
    { id: 'a', s: 'buy', t: 'MSFT', q: 50, ts: 2 },   // sell-first ordering: this buy needs cash freed by the sale below
    { id: 'b', s: 'sell', t: 'AAPL', q: 100, ts: 3 },
    { id: 'c', s: 'buy', t: 'AAPL', q: 1, ts: 4 },
    { id: 'd', s: 'buy', t: 'AAPL', q: 1, ts: 5 }       // 4th order: over daily cap of 3
  ],
  p2: []
};
const pfs = { p1: { cash: 15000, pos: { AAPL: { q: 100, c: 18000 } } } };
const out = E.settleDay(['p1', 'p2'], pfs, pend, Object.assign({}, R, { maxPct: 0 }), closes, '2026-11-17');
const st = Object.fromEntries(out.fills.map(f => [f.id, f.st]).sort());
eq(st, { a: 'filled', b: 'filled', c: 'filled', d: 'rejected' }, 'sells first, cap enforced');
eq(out.portfolios.p1.cash, 15000 + 20000 - 20000 - 200, 'cash after settle');
eq(out.equity.p2, 100000, 'idle player gets starting cash equity');
eq(out.fills.find(f => f.id === 'b').pl, 2000, 'sell P/L in fill');
const out2 = E.settleDay(['p1'], { p1: { cash: 1000, pos: {} } }, { p1: [{ id: 'z', s: 'buy', t: 'NOPE', q: 1, ts: 1 }] }, R, closes, '2026-11-17');
eq(out2.fills[0].st, 'rejected', 'missing close price rejected');
const ms2 = x => Date.parse(x);
eq(E.marketStatus(ms2('2026-11-13T17:00:00Z')).open, true, 'Fri 12:00 ET market open');
eq(E.marketStatus(ms2('2026-11-13T17:00:00Z')).left, 240, 'Fri 12:00 ET closes in 4h');
eq(E.marketStatus(ms2('2026-11-14T15:00:00Z')).day, '2026-11-16', 'Saturday: next fill Monday');
eq(E.marketStatus(ms2('2026-11-25T22:00:00Z')).day, '2026-11-27', 'Wed after close: skips Thanksgiving to Fri');
console.log(fails ? '\n' + fails + ' FAILED' : '\nAll passed');
process.exit(fails ? 1 : 0);
