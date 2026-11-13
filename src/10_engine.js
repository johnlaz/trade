// ══════════════════════════════════════════
//  ENGINE — pure rules + time logic. No DOM, no network. Unit-tested.
// ══════════════════════════════════════════
// <ENGINE>
const TZ = 'America/New_York';
const CLOSE_MIN = 16 * 60;          // 4:00 pm ET: orders placed before this fill at that day's close
const SETTLE_MIN = 16 * 60 + 20;    // host may settle a day 20 minutes after the close

function etParts(ms) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const o = {};
  f.formatToParts(new Date(ms)).forEach(p => { o[p.type] = p.value; });
  return { key: o.year + '-' + o.month + '-' + o.day, min: (+o.hour % 24) * 60 + (+o.minute) };
}
function dayKey(ms) { return etParts(ms).key; }
function addDays(key, n) { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function isWeekday(key) { const g = new Date(key + 'T12:00:00Z').getUTCDay(); return g > 0 && g < 6; }
function nextWeekday(key) { let k = addDays(key, 1); while (!isWeekday(k)) k = addDays(k, 1); return k; }
function prevWeekday(key) { let k = addDays(key, -1); while (!isWeekday(k)) k = addDays(k, -1); return k; }
// The trading day whose close an order placed at `ts` fills at (weekday calendar; holidays are skipped at settle time).
function fillDayFor(ts) {
  const p = etParts(ts);
  if (isWeekday(p.key) && p.min < CLOSE_MIN) return p.key;
  return nextWeekday(p.key);
}
// May the close of `day` be settled at `nowMs`?
function canSettle(day, nowMs) {
  const p = etParts(nowMs);
  if (p.key > day) return true;
  return p.key === day && p.min >= SETTLE_MIN;
}

const TICKER_RE = /^[A-Z]{1,5}(-[A-Z]{1,2})?$/;
function normTicker(t) { return String(t || '').trim().toUpperCase().replace(/\./g, '-'); }
function round2(n) { return Math.round(n * 100) / 100; }
function clonePf(pf) {
  const o = { cash: pf.cash, pos: {} };
  for (const t in (pf.pos || {})) o.pos[t] = { q: pf.pos[t].q, c: pf.pos[t].c };
  return o;
}
function equityOf(pf, px) {
  let v = pf.cash;
  for (const t in (pf.pos || {})) {
    const h = pf.pos[t];
    v += h.q * (px && px[t] != null ? px[t] : h.c / h.q);
  }
  return v;
}
function tickerAllowed(t, rules) {
  if (!rules || rules.uni !== 'list') return true;
  return (rules.list || []).includes(t);
}
// Apply one order at a close price. Returns { ok, reason, pf, pl }.
function applyOrder(pf, o, price, rules, eq) {
  const bad = r => ({ ok: false, reason: r });
  const t = normTicker(o.t);
  const q = Number(o.q);
  if (!TICKER_RE.test(t)) return bad('Invalid ticker');
  if (o.s !== 'buy' && o.s !== 'sell') return bad('Side must be buy or sell');
  if (!Number.isInteger(q) || q < 1) return bad('Quantity must be a whole number of at least 1');
  if (!(price > 0)) return bad('No closing price');
  const p = clonePf(pf);
  if (o.s === 'sell') {
    const h = p.pos[t];
    if (!h || h.q < q) return bad('Not enough shares to sell');
    const avg = h.c / h.q;
    h.c -= avg * q; h.q -= q;
    p.cash += q * price;
    if (h.q === 0) delete p.pos[t];
    return { ok: true, pf: p, pl: round2((price - avg) * q) };
  }
  if (!tickerAllowed(t, rules)) return bad('Not on this game’s ticker list');
  const cost = q * price;
  if (cost > p.cash + 1e-6) return bad('Not enough cash');
  const held = p.pos[t];
  if (!held && Object.keys(p.pos).length >= rules.maxPos) return bad('Position limit reached (' + rules.maxPos + ')');
  const newVal = ((held ? held.q : 0) + q) * price;
  if (rules.maxPct > 0 && newVal > eq * rules.maxPct / 100 + 1e-6) return bad('Over the ' + rules.maxPct + '% single-stock limit');
  if (held) { held.q += q; held.c += cost; } else p.pos[t] = { q, c: cost };
  p.cash -= cost;
  return { ok: true, pf: p };
}
// Settle one trading day for everyone.
//   playerIds: ids to process     portfolios: {pid: {cash,pos}}
//   pending:   {pid: [{id,s,t,q,n,ts}]}   rules: {cash,maxPos,maxTr,maxPct,uni,list}
//   closes:    {TICKER: close}    day: 'YYYY-MM-DD'
// Sells run before buys (so a sale frees cash for a buy placed earlier); each group in timestamp order.
// The first `maxTr` orders by timestamp are allowed; any extras are rejected.
function settleDay(playerIds, portfolios, pending, rules, closes, day) {
  const out = { portfolios: {}, fills: [], equity: {} };
  playerIds.forEach(pid => {
    let pf = clonePf(portfolios[pid] || { cash: rules.cash, pos: {} });
    const orders = (pending[pid] || []).slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const allowed = new Set(orders.slice(0, rules.maxTr).map(o => o.id));
    const sells = orders.filter(o => o.s === 'sell'), buys = orders.filter(o => o.s !== 'sell');
    sells.concat(buys).forEach(o => {
      const t = normTicker(o.t);
      const base = { pid, id: o.id, day, s: o.s, t, q: Number(o.q), n: o.n || '' };
      if (!allowed.has(o.id)) { out.fills.push(Object.assign(base, { st: 'rejected', why: 'Daily trade limit (' + rules.maxTr + ')' })); return; }
      const px = closes[t];
      if (!(px > 0)) { out.fills.push(Object.assign(base, { st: 'rejected', why: 'No closing price for ' + t })); return; }
      const r = applyOrder(pf, o, px, rules, equityOf(pf, closes));
      if (!r.ok) { out.fills.push(Object.assign(base, { st: 'rejected', why: r.reason, px })); return; }
      pf = r.pf;
      const f = Object.assign(base, { st: 'filled', px });
      if (r.pl != null) f.pl = r.pl;
      out.fills.push(f);
    });
    out.portfolios[pid] = pf;
    out.equity[pid] = round2(equityOf(pf, closes));
  });
  return out;
}
function retPct(eq, base) { return (eq / base - 1) * 100; }
// </ENGINE>
