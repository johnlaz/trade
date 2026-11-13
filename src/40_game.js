// ══════════════════════════════════════════
//  HOST ACTIONS — start, settle a day, AI player, end, debrief. Plus the Groq model picker.
// ══════════════════════════════════════════

// ── Groq (key + model picker live in the host's browser only) ──
const GROQ_DEFAULT = 'qwen/qwen3.6-27b';
const GROQ_FALLBACK = 'llama-3.3-70b-versatile';
const GROQ_NON_CHAT = /whisper|tts|playai|orpheus|guard|safeguard|embed|compound|moderation|transcri/i;
const GROQ_STALE_MS = 3 * 24 * 3600 * 1000;
const groqKey = () => lsRaw('ta_groq_key');
const groqCache = () => lsGet('ta_groq_models', null);
const groqModel = () => lsRaw('ta_groq_model') || GROQ_DEFAULT;
function groqSize(id) { const m = /(\d+(?:\.\d+)?)b(?![a-z])/i.exec(id); return m ? parseFloat(m[1]) : 0; }
async function refreshGroqModels(silent) {
  const key = groqKey(); if (!key) return null;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + key } });
    if (!res.ok) throw new Error(res.status === 401 ? 'Groq rejected this key.' : 'Could not load models (' + res.status + ').');
    const body = await res.json();
    const list = (body.data || []).filter(m => m && m.id && m.active !== false && !GROQ_NON_CHAT.test(m.id))
      .sort((a, b) => (b.created || 0) - (a.created || 0)).slice(0, 6).map(m => ({ id: m.id }));
    if (!list.length) throw new Error('No chat models came back for this key.');
    const cur = lsRaw('ta_groq_model');
    const exists = (body.data || []).some(m => m.id === cur && m.active !== false);
    let missing = null;
    if (cur) { if (!list.some(m => m.id === cur)) list.push({ id: cur }); if (!exists) missing = cur; }
    else {
      const ids = (body.data || []).map(m => m.id);
      const pick = ids.includes(GROQ_DEFAULT) ? GROQ_DEFAULT : list.slice().sort((a, b) => groqSize(b.id) - groqSize(a.id))[0].id;
      lsRawSet('ta_groq_model', pick);
      if (!list.some(m => m.id === pick)) list.push({ id: pick });
    }
    lsSet('ta_groq_models', { at: Date.now(), list, missing });
    sched(); return list;
  } catch (e) { if (!silent) toast(e instanceof TypeError ? 'Couldn’t reach Groq.' : e.message, 'bad'); return null; }
}
async function groqChat(messages, opts, retried) {
  const key = groqKey(); if (!key) throw new Error('Add a Groq key in Settings to use the AI player.');
  const model = groqModel();
  const body = { model, messages, temperature: (opts && opts.temp != null) ? opts.temp : 0.4 };
  if (opts && opts.json) body.response_format = { type: 'json_object' };
  if (/qwen/i.test(model) && !(opts && opts.noReason)) body.reasoning_effort = 'none';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(body) });
  if (!res.ok) {
    let detail = ''; try { detail = JSON.stringify((await res.clone().json()).error || {}); } catch (e) {}
    if (res.status === 401) throw new Error('Groq rejected the key — check Settings.');
    if (res.status === 429) throw new Error('Groq rate limit — wait a minute and retry.');
    if (!retried && res.status === 400 && /reasoning_effort/i.test(detail)) return groqChat(messages, Object.assign({}, opts, { noReason: true }), true);
    if (!retried && res.status === 400 && /response_format|json/i.test(detail)) return groqChat(messages, Object.assign({}, opts, { json: false }), true);
    if (res.status === 400 || res.status === 404) { refreshGroqModels(true); throw new Error('Groq did not accept model “' + model + '”. Pick another in Settings.'); }
    throw new Error('Groq request failed (' + res.status + ').');
  }
  const data = await res.json();
  const txt = (((data.choices || [])[0] || {}).message || {}).content || '';
  return txt.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}
function parseJsonLoose(txt) {
  try { return JSON.parse(txt); } catch (e) {}
  const m = txt.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  return null;
}

// ── progress overlay for long host jobs ──
function busy(msg) { S.busy = msg; sched(); }
function unbusy() { S.busy = null; sched(); }

// ── lobby players ──
function playerIds() { return Object.keys(S.G.players || {}); }
function humanIds() { return playerIds().filter(p => !S.G.players[p].ai); }
function aiIds() { return playerIds().filter(p => S.G.players[p].ai); }
async function addAiPlayer() {
  const id = 'ai' + newId().slice(-4);
  const n = playerIds().length;
  await W.set('players/' + id, { n: 'AI Trader', ai: 1, m: groqModel(), c: 99, t: NOW() });
  return id;
}

// ── start ──
async function startGame() {
  const meta = META();
  if (!isHost() || meta.status !== 'lobby') return;
  const ids = playerIds();
  if (ids.length < 1) throw new Error('Add at least one player.');
  if (aiIds().length && !groqKey()) throw new Error('The AI player needs a Groq key (Settings).');
  const now = Date.now();
  const startedAt = now;
  const first = fillDayFor(now);
  let endDay = meta.endDay;
  if (!endDay) {
    let e = addDays(dayKey(now), meta.dur || 14);
    while (!isWeekday(e)) e = addDays(e, -1);
    endDay = e;
  }
  if (endDay < first) throw new Error('The end date is before the first trading day. Pick a later end date.');
  const upd = { 'meta/status': 'active', 'meta/startedAt': now, 'meta/firstDay': first, 'meta/endDay': endDay, 'meta/lastSettled': null };
  const r = RULES();
  ids.forEach(p => { upd['portfolios/' + p] = { cash: r.cash, pos: null }; upd['equity/start/' + p] = r.cash; });
  upd['equity/start/spy'] = r.cash;
  upd['meta/startedAt'] = now;
  await W.update(upd);
}
function nextSettleDay() {
  const m = META(); if (!m || m.status !== 'active') return null;
  return m.lastSettled ? nextWeekday(m.lastSettled) : (m.firstDay || fillDayFor(m.startedAt || Date.now()));
}

// ── AI player: sees closes through the day BEFORE the one it trades, same rules as everyone ──
async function aiOrdersFor(pid, day, pf, watch, onProg) {
  const r = RULES(); const p = S.G.players[pid];
  const rows = []; let done = 0;
  await Promise.all(watch.map(async t => {
    try {
      const d = await getBars(t);
      const bars = d.bars.filter(b => b.k < day);
      if (bars.length < 6) return;
      const c = bars.map(b => b.c), L = c[c.length - 1];
      const chg = n => c.length > n ? ((L / c[c.length - 1 - n] - 1) * 100) : null;
      const ma = n => c.length >= n ? c.slice(-n).reduce((a, b) => a + b, 0) / n : null;
      const m50 = ma(50);
      rows.push({ t, L, d1: chg(1), d5: chg(5), d20: chg(20), v50: m50 ? (L / m50 - 1) * 100 : null });
    } catch (e) {} finally { done++; onProg && onProg(done, watch.length); }
  }));
  if (rows.length < 5) throw new Error('Could not load enough market data for the AI (' + rows.length + ' tickers).');
  rows.sort((a, b) => a.t.localeCompare(b.t));
  const f = (v, d) => v == null ? 'n/a' : v.toFixed(d == null ? 1 : d);
  const table = rows.map(x => `${x.t} close ${x.L.toFixed(2)} | 1d ${f(x.d1)}% | 5d ${f(x.d5)}% | 20d ${f(x.d20)}% | vs 50d avg ${f(x.v50)}%`).join('\n');
  const lastClose = {}; rows.forEach(x => { lastClose[x.t] = x.L; });
  const held = Object.keys(pf.pos || {}).map(t => { const h = pf.pos[t]; const L = lastClose[t]; return `${t}: ${h.q} sh, avg cost ${(h.c / h.q).toFixed(2)}${L ? ', last close ' + L.toFixed(2) : ''}`; }).join('\n') || '(none)';
  const hist = [];
  Object.keys(S.G.fills || {}).sort().slice(-5).forEach(d => { const mine = (S.G.fills[d] || {})[pid] || {}; Object.keys(mine).forEach(id => { const x = mine[id]; if (x.st === 'filled') hist.push(`${d} ${x.s} ${x.q} ${x.t} @ ${x.px}`); }); });
  const univ = r.uni === 'list' ? `You may only BUY these tickers: ${(r.list || []).join(', ')}.` : 'You may buy any US-listed stock or ETF, but only the tickers in the market table below have data for you.';
  const sys = 'You are a player in a paper-trading game competing against humans. Goal: finish with the highest portfolio value. ' +
    'Reply with ONLY a JSON object: {"orders":[{"s":"buy"|"sell","t":"TICKER","q":<whole number>,"n":"<reason, max 100 chars>"}],"summary":"<one sentence>"}. ' +
    'Orders fill at the close of the trading day. Use at most the allowed number of orders; fewer (or none) is fine. Never invent prices.';
  const usr = `Trading day: ${day} (orders fill at today's close; you only see data through the previous close).
Rules: long-only, whole shares, max ${r.maxTr} orders today, max ${r.maxPos} different positions${r.maxPct > 0 ? `, no single stock over ${r.maxPct}% of total value` : ''}. ${univ}
Cash: ${pf.cash.toFixed(2)}
Positions:\n${held}
Your recent fills: ${hist.length ? hist.join('; ') : 'none'}
Market table (through previous close):\n${table}`;
  const txt = await groqChat([{ role: 'system', content: sys }, { role: 'user', content: usr }], { json: true, temp: 0.4 });
  const j = parseJsonLoose(txt);
  if (!j || !Array.isArray(j.orders)) throw new Error('The AI answered in a format I could not read.');
  return { orders: j.orders.slice(0, r.maxTr).map((o, i) => ({ id: 'ai_' + day + '_' + pid + '_' + i, s: o.s === 'sell' ? 'sell' : 'buy', t: normTicker(o.t), q: Math.floor(Number(o.q)), n: String(o.n || '').slice(0, 140), ts: i })), summary: String(j.summary || '').slice(0, 200) };
}

// ── settle one trading day ──
async function settleNext() {
  const meta = META();
  if (!isHost() || meta.status !== 'active') return;
  const day = nextSettleDay();
  if (!canSettle(day, Date.now())) throw new Error('The ' + dayLabel(day) + ' close is not final yet. Try after 4:20 pm ET.');
  const r = RULES();
  busy('Loading ' + dayLabel(day) + ' closing prices…');
  try {
    const spy = await getBars('SPY', true);
    const hasDay = closeOn(spy, day) != null;
    if (!hasDay) {
      unbusy();
      if (!confirm('No market data for ' + dayLabel(day) + '. Was the market closed (holiday)?\n\nOK = skip this day. Cancel = try again later.')) return;
      busy('Skipping ' + dayLabel(day) + '…');
      const upd = { 'meta/lastSettled': day };
      if (day >= meta.endDay) upd['meta/status'] = 'ended';
      await W.update(upd); unbusy(); toast(dayLabel(day) + ' skipped (market closed).'); return;
    }
    // gather tickers
    const pids = playerIds();
    const pending = {};
    const need = new Set(['SPY']);
    pids.forEach(p => {
      const cutoff = pendingFor(p).filter(o => fillDayFor(typeof o.ts === 'number' ? o.ts : 0) <= day);
      pending[p] = cutoff.map(o => ({ id: o.id, s: o.s, t: normTicker(o.t), q: o.q, n: o.n, ts: o.ts }));
      Object.keys(((S.G.portfolios[p] || {}).pos) || {}).forEach(t => need.add(t));
      pending[p].forEach(o => need.add(o.t));
    });
    // AI turns
    const aiNotes = {};
    for (const pid of aiIds()) {
      const pf = Object.assign({ cash: r.cash, pos: {} }, S.G.portfolios[pid] || {}); pf.pos = pf.pos || {};
      let watch = lsGet('ta_ai_watch', null) || AI_WATCH_DEFAULT;
      if (r.uni === 'list' && (r.list || []).length) watch = r.list.slice(0, 40);
      watch = Array.from(new Set(watch.concat(Object.keys(pf.pos)))).slice(0, 45);
      busy('AI is studying the market…');
      try {
        const res = await aiOrdersFor(pid, day, pf, watch, (a, b) => busy('AI is studying the market… ' + a + '/' + b));
        pending[pid] = (pending[pid] || []).concat(res.orders);   // AI orders have ts < any human order, so they sort first
        res.orders.forEach(o => need.add(o.t));
        aiNotes[pid] = res.summary;
      } catch (e) {
        unbusy();
        if (!confirm('The AI could not take its turn: ' + e.message + '\n\nOK = settle the day without the AI’s trades. Cancel = stop and fix it first.')) return;
        busy('Settling…');
      }
    }
    // closing prices for everything involved
    const closes = {}; const tl = Array.from(need); let n = 0;
    busy('Loading closing prices… 0/' + tl.length);
    const missingHeld = [];
    await Promise.all(tl.map(async t => {
      try { const d = await getBars(t, t === 'SPY' ? false : false); const c = closeOn(d, day); if (c != null) closes[t] = c; } catch (e) {}
      n++; busy('Loading closing prices… ' + n + '/' + tl.length);
    }));
    pids.forEach(p => Object.keys(((S.G.portfolios[p] || {}).pos) || {}).forEach(t => { if (!(closes[t] > 0) && !missingHeld.includes(t)) missingHeld.push(t); }));
    if (missingHeld.length) { unbusy(); throw new Error('Missing a close for held position(s): ' + missingHeld.join(', ') + '. Check your connection and try again.'); }
    // run the engine
    const pfs = {};
    pids.forEach(p => { const pf = S.G.portfolios[p] || { cash: r.cash, pos: {} }; pfs[p] = { cash: pf.cash, pos: pf.pos || {} }; });
    const out = settleDay(pids, pfs, pending, r, closes, day);
    const upd = {};
    pids.forEach(p => {
      const pf = out.portfolios[p];
      upd['portfolios/' + p] = { cash: round2(pf.cash), pos: Object.keys(pf.pos).length ? Object.fromEntries(Object.entries(pf.pos).map(([t, h]) => [t, { q: h.q, c: round2(h.c) }])) : null };
      upd['equity/' + day + '/' + p] = out.equity[p];
      pendingFor(p).forEach(o => { if (pending[p].some(x => x.id === o.id)) upd['orders/' + p + '/' + o.id] = null; });
    });
    out.fills.forEach(f => {
      const rec = { s: f.s, t: f.t, q: f.q, st: f.st };
      if (f.n) rec.n = f.n; if (f.px != null) rec.px = f.px; if (f.why) rec.why = f.why; if (f.pl != null) rec.pl = f.pl;
      upd['fills/' + day + '/' + f.pid + '/' + f.id] = rec;
    });
    Object.keys(aiNotes).forEach(p => { if (aiNotes[p]) upd['fills/' + day + '/' + p + '/_sum'] = { st: 'note', n: aiNotes[p], s: 'note', t: '', q: 0 }; });
    Object.keys(closes).forEach(t => { if (t !== 'SPY' || true) upd['prices/' + day + '/' + t] = round2(closes[t]); });
    // benchmark: buy-and-hold SPY from the first settled close
    let base = meta.spyBase;
    if (!base) { base = closes.SPY; upd['meta/spyBase'] = base; }
    upd['equity/' + day + '/spy'] = round2(r.cash * closes.SPY / base);
    upd['meta/lastSettled'] = day;
    if (day >= meta.endDay) upd['meta/status'] = 'ended';
    busy('Saving…');
    await W.update(upd);
    unbusy();
    toast(dayLabel(day) + ' settled.' + (day >= meta.endDay ? ' Game over!' : ''));
  } catch (e) { unbusy(); throw e; }
}
async function endGameNow() { await W.set('meta/status', 'ended'); }

// ── end-of-game debrief (AI) ──
async function makeDebrief() {
  const r = RULES(), meta = META();
  const st = standings();
  const lines = st.rows.map((x, i) => `${i + 1}. ${x.name}${x.ai ? ' (AI)' : ''}: ${x.pct.toFixed(2)}%`);
  const trades = [];
  Object.keys(S.G.fills || {}).sort().forEach(d => Object.keys(S.G.fills[d]).forEach(pid => Object.keys(S.G.fills[d][pid]).forEach(id => {
    const x = S.G.fills[d][pid][id]; if (x.st !== 'filled') return;
    trades.push(`${d} ${((S.G.players[pid] || {}).n) || pid}: ${x.s} ${x.q} ${x.t} @ ${x.px}${x.pl != null ? ' (P/L ' + x.pl + ')' : ''}${x.n ? ' — ' + x.n : ''}`);
  })));
  const spyRow = st.spy != null ? `SPY buy-and-hold: ${st.spy.toFixed(2)}%` : '';
  busy('Writing the debrief…');
  try {
    const txt = await groqChat([
      { role: 'system', content: 'You are a friendly trading coach reviewing a paper-trading game among friends. Be specific, concrete and kind. Plain text, no markdown headers, under 280 words. Teach 2-3 transferable lessons (position sizing, cutting losers, diversification, patience vs overtrading, etc.) tied to what actually happened. No investment advice about future picks.' },
      { role: 'user', content: `Game "${meta.name}", ${meta.firstDay} to ${meta.endDay}. Rules: ${r.maxTr} trades/day, ${r.maxPos} positions max.\nFinal standings:\n${lines.join('\n')}\n${spyRow}\nTrades:\n${trades.slice(-80).join('\n') || '(none)'}` }
    ], { temp: 0.6 });
    await W.set('meta/debrief', txt.slice(0, 2500));
  } finally { unbusy(); }
}

// ── standings (used by board, chart and debrief) ──
function standings() {
  const eqAll = S.G.equity || {}; const r = RULES(); const base = r.cash;
  const days = Object.keys(eqAll).filter(d => d !== 'start').sort();
  const last = days.length ? days[days.length - 1] : 'start';
  const rows = playerIds().map(pid => {
    const p = S.G.players[pid];
    const val = ((eqAll[last] || {})[pid]);
    const v = val != null ? val : base;
    const pf = S.G.portfolios[pid];
    return { pid, name: p.n, ai: !!p.ai, model: p.m, color: p.ai ? AI_COLOR : COLORS[(p.c || 0) % COLORS.length], val: v, pct: retPct(v, base), npos: pf && pf.pos ? Object.keys(pf.pos).length : 0, cash: pf ? pf.cash : base };
  }).sort((a, b) => b.val - a.val);
  const sv = (eqAll[last] || {}).spy;
  const series = {};
  playerIds().concat(['spy']).forEach(pid => { series[pid] = [base].concat(days.map(d => ((eqAll[d] || {})[pid]) != null ? eqAll[d][pid] : null)); });
  return { rows, spy: sv != null ? retPct(sv, base) : null, days, last, series };
}
