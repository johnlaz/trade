// ══════════════════════════════════════════
//  UI — game screens (board, trade, feed, host)
// ══════════════════════════════════════════
function lastPrices() {
  const px = {}; const days = Object.keys(S.G.prices || {}).sort();
  days.forEach(d => Object.keys(S.G.prices[d]).forEach(t => { px[t] = S.G.prices[d][t]; }));
  return px;
}
function myPortfolio() {
  const pf = S.G.portfolios[ME()];
  return pf ? { cash: pf.cash, pos: pf.pos || {} } : { cash: RULES().cash, pos: {} };
}
function tradingDaysLeft() {
  const m = META(); if (!m || !m.endDay) return 0;
  let d = nextSettleDay() || m.firstDay; let n = 0;
  for (let i = 0; i < 400 && d <= m.endDay; i++) { if (isWeekday(d)) n++; d = addDays(d, 1); }
  return n;
}
function viewGame() {
  const g = S.game, m = META();
  const topBar = '<div class="top"><button class="icon-btn" data-act="home" aria-label="Back">‹</button><div style="text-align:center;min-width:0"><div style="font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(m ? m.name : g.name) + '</div><button class="mut small code" data-act="copyCode" style="padding:0">' + esc(g.code) + '</button></div><button class="icon-btn" data-act="settings" aria-label="Settings">⚙</button></div>';
  if (S.fbErr && g.mode === 'fb' && !S.loaded.meta) return '<div class="wrap">' + topBar + '<div class="note bad">' + esc(S.fbErr) + '</div><button class="btn block" style="margin-top:12px" data-act="settings">Open settings</button></div>';
  if (S.notFound) return '<div class="wrap">' + topBar + '<div class="card"><b>Game not found.</b><div class="mut small" style="margin-top:6px">It may have been deleted by the host.</div></div><button class="btn danger block" style="margin-top:12px" data-act="forgetGame">Remove from my list</button></div>';
  if (!m) return '<div class="wrap">' + topBar + '<div class="card mut">Loading…</div></div>';
  const tabs = [['board', '🏆', 'Board'], ['trade', '📈', 'Trade'], ['feed', '🧾', 'Feed']]; if (isHost()) tabs.push(['host', '⚙️', 'Host']);
  const body = S.tab === 'trade' ? tabTrade() : S.tab === 'feed' ? tabFeed() : S.tab === 'host' && isHost() ? tabHost() : tabBoard();
  return '<div class="wrap">' + topBar + body + footer() + '</div><nav class="tabbar"><div class="in-bar">' + tabs.map(t => '<button data-act="tab" data-v="' + t[0] + '" class="' + (S.tab === t[0] ? 'on' : '') + '"><span>' + t[1] + '</span>' + t[2] + '</button>').join('') + '</div></nav>';
}
function afterGameRender() {
  const q = $('#qr-box');
  if (q && typeof QRCode !== 'undefined' && !q.firstChild) { try { new QRCode(q, { text: joinLink(S.game.code), width: 168, height: 168, colorDark: '#0b0f14', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M }); } catch (e) {} }
}
function statusChip(m) { return m.status === 'lobby' ? '<span class="chip warn">Lobby</span>' : m.status === 'active' ? '<span class="chip acc">Live</span>' : '<span class="chip">Finished</span>'; }
function rulesChips(r) {
  return '<div class="row" style="flex-wrap:wrap;gap:6px"><span class="chip">' + money0(r.cash) + ' start</span><span class="chip">' + r.maxTr + ' trades/day</span><span class="chip">' + r.maxPos + ' positions</span>' + (r.maxPct > 0 ? '<span class="chip">≤' + r.maxPct + '% per stock</span>' : '') + '<span class="chip">' + (r.uni === 'list' ? (r.list || []).length + '-ticker list' : 'Any US stock/ETF') + '</span><span class="chip">Long-only</span></div>';
}

// ── Board ──
function tabBoard() {
  const m = META(), r = RULES(), st = standings(), me = ME();
  let h = '';
  if (m.status === 'lobby') {
    const pl = playerIds().map(p => S.G.players[p]);
    h += '<div class="card"><div class="mut small" style="text-align:center">' + (S.game.mode === 'fb' ? 'Friends join with this code' : 'Offline game — share a game file from the Host tab') + '</div><div class="bigcode code">' + esc(S.game.code) + '</div>' +
      (S.game.mode === 'fb' ? '<div class="qr" id="qr-box"></div><div class="row" style="justify-content:center"><button class="btn sm" data-act="copyLink">Copy link</button><button class="btn sm" data-act="shareLink">Share</button></div>' : '') + '</div>';
    h += '<div class="sec">Players (' + pl.length + ')</div><div class="lb">' + playerIds().map((pid, i) => { const p = S.G.players[pid]; const col = p.ai ? AI_COLOR : COLORS[(p.c || 0) % COLORS.length]; return '<div class="lrow" style="grid-template-columns:18px 1fr auto"><span class="dot" style="background:' + col + '"></span><span class="nm">' + esc(p.n) + (p.ai ? ' <span class="chip ai">AI</span>' : '') + (pid === m.hostUid ? ' <span class="chip acc">Host</span>' : '') + '</span><span class="mut small">' + (pid === ME() ? 'you' : '') + '</span></div>'; }).join('') + '</div>';
    h += '<div class="sec">Rules</div><div class="card">' + rulesChips(r) + '<div class="small mut" style="margin-top:10px">' + (m.endDay ? 'Ends ' + dayLabel(m.endDay) : 'Runs ' + (m.dur || 14) + ' days from the start') + '. The host starts the game when everyone is in.</div></div>';
    if (isHost()) h += '<button class="btn primary block" style="margin-top:16px" data-act="startGame">Start game</button>';
    else h += '<div class="note" style="margin-top:16px">Waiting for the host to start…</div>';
    return h;
  }
  const next = nextSettleDay();
  if (m.status === 'ended') {
    const w = st.rows[0];
    h += '<div class="banner"><div class="mut small">GAME OVER</div><h2>' + esc(w.name) + ' wins</h2><div class="num"><b class="' + (w.pct >= 0 ? 'up' : 'dn') + '">' + pctTxt(w.pct) + '</b> · ' + money0(w.val) + (st.spy != null ? ' · SPY ' + pctTxt(st.spy) : '') + '</div></div>';
  } else {
    h += '<div class="card row sp"><div><div class="mut small">NEXT CLOSE</div><b>' + (next ? dayLabel(next) : '—') + '</b></div><div style="text-align:right"><div class="mut small">ENDS</div><b>' + dayLabel(m.endDay) + '</b><div class="mut small">' + tradingDaysLeft() + ' trading days left</div></div></div>';
    if (isHost() && next) {
      const ready = canSettle(next, Date.now());
      let nReady = 0; for (let d = next; d && nReady < 30 && canSettle(d, Date.now()) && d <= m.endDay; d = nextWeekday(d)) nReady++;
      if (nReady > 1) h += '<div class="note" style="margin-top:10px">' + nReady + ' trading days are ready to settle. Tap Settle ' + nReady + ' times to catch up.</div>';
      h += '<button class="btn ' + (ready ? 'primary' : '') + ' block" style="margin-top:10px" data-act="settle"' + (ready ? '' : ' disabled') + '>' + (ready ? 'Settle ' + dayLabel(next) + ' close' : 'Settle after 4:20 pm ET on ' + dayLabel(next)) + '</button>';
    }
  }
  h += '<div class="sec">Leaderboard</div><div class="lb">';
  const maxAbs = Math.max(5, ...st.rows.map(x => Math.abs(x.pct)), st.spy != null ? Math.abs(st.spy) : 0);
  let spyDone = st.spy == null;
  st.rows.forEach((x, i) => {
    if (!spyDone && st.spy > x.pct) { h += benchRow(st.spy); spyDone = true; }
    h += '<div class="lrow ' + (x.pid === me ? 'me' : '') + '" data-act="viewPlayer" data-id="' + esc(x.pid) + '" style="cursor:pointer"><span class="rk">' + (i + 1) + '</span><div><div class="nm"><span class="dot" style="background:' + x.color + '"></span>' + esc(x.name) + (x.ai ? ' <span class="chip ai">AI' + (x.model ? ' · ' + esc(x.model.split('/').pop()) : '') + '</span>' : '') + (x.pid === me ? ' <span class="chip acc">You</span>' : '') + '</div><div class="sub">' + x.npos + ' position' + (x.npos === 1 ? '' : 's') + ' · ' + money0(x.cash) + ' cash</div></div><div class="pv num"><b>' + money0(x.val) + '</b><span class="' + (x.pct >= 0 ? 'up' : 'dn') + ' small">' + pctTxt(x.pct) + '</span></div></div>';
  });
  if (!spyDone) h += benchRow(st.spy);
  h += '</div>';
  if (st.days.length) h += '<div class="sec">Progress</div><div class="card">' + lineChart(st) + '</div>';
  if (m.status === 'ended') {
    h += '<div class="sec">Debrief</div><div class="card">' + (m.debrief ? '<div class="pre">' + esc(m.debrief) + '</div>' : '<div class="mut small">' + (isHost() ? 'Have the AI coach write a short debrief of what happened and what to learn.' : 'The host can add an AI debrief.') + '</div>' + (isHost() ? '<button class="btn sm" style="margin-top:10px" data-act="debrief">Write debrief</button>' : '')) + '</div>';
  }
  h += '<div class="sec">Rules</div><div class="card">' + rulesChips(r) + '</div>';
  return h;
}
function benchRow(spy) {
  return '<div class="lrow bench"><span class="rk">—</span><div><div class="nm"><span class="dot" style="background:#8c9bb0"></span>SPY buy &amp; hold</div><div class="sub">the market benchmark</div></div><div class="pv num"><b class="' + (spy >= 0 ? 'up' : 'dn') + '">' + pctTxt(spy) + '</b></div></div>';
}
function lineChart(st) {
  const W = 320, H = 150, pl = 34, pr = 8, pt = 8, pb = 18;
  const ids = Object.keys(st.series); const base = RULES().cash;
  let lo = 0, hi = 0;
  ids.forEach(id => st.series[id].forEach(v => { if (v != null) { const p = retPct(v, base); lo = Math.min(lo, p); hi = Math.max(hi, p); } }));
  if (hi - lo < 2) { hi += 1; lo -= 1; }
  const n = st.days.length + 1;
  const X = i => pl + (n === 1 ? 0 : i * (W - pl - pr) / (n - 1));
  const Y = p => pt + (hi - p) * (H - pt - pb) / (hi - lo);
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Portfolio return by day">';
  [lo, 0, hi].forEach(p => { s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(p) + '" y2="' + Y(p) + '" stroke="' + (p === 0 ? '#3a4a60' : '#1c2735') + '" stroke-width="1"/><text x="' + (pl - 4) + '" y="' + (Y(p) + 3) + '" fill="#8c9bb0" font-size="9" text-anchor="end">' + p.toFixed(1) + '%</text>'; });
  const legend = [];
  ids.forEach(id => {
    const pts = []; st.series[id].forEach((v, i) => { if (v != null) pts.push(X(i).toFixed(1) + ',' + Y(retPct(v, base)).toFixed(1)); });
    const isSpy = id === 'spy'; const pr = S.G.players[id];
    const col = isSpy ? '#8c9bb0' : (pr && pr.ai ? AI_COLOR : COLORS[((pr && pr.c) || 0) % COLORS.length]);
    if (pts.length > 1) s += '<polyline fill="none" stroke="' + col + '" stroke-width="' + (isSpy ? 1.5 : 2.2) + '"' + (isSpy ? ' stroke-dasharray="4 3"' : '') + ' stroke-linejoin="round" stroke-linecap="round" points="' + pts.join(' ') + '"/>';
    legend.push('<span><i style="background:' + col + '"></i>' + (isSpy ? 'SPY' : esc(pr ? pr.n : id)) + '</span>');
  });
  const lastLbl = st.days.length ? dayLabel(st.days[st.days.length - 1]) : '';
  s += '<text x="' + pl + '" y="' + (H - 4) + '" fill="#8c9bb0" font-size="9">Start</text><text x="' + (W - pr) + '" y="' + (H - 4) + '" fill="#8c9bb0" font-size="9" text-anchor="end">' + esc(lastLbl) + '</text></svg>';
  return s + '<div class="legend">' + legend.join('') + '</div>';
}

// ── Trade ──
function pendingEst(pid) {
  const px = Object.assign({}, lastPrices()); Object.keys(barCache).forEach(t => { if (barCache[t].data && barCache[t].data.last) px[t] = barCache[t].data.last; });
  return px;
}
function tabTrade() {
  const m = META(), r = RULES(), me = ME();
  if (m.status === 'lobby') return '<div class="note">The game hasn’t started yet. Trading opens when the host presses Start.</div>';
  if (!S.G.players[me]) return '<div class="note">You’re not a player in this game.</div>';
  const pf = myPortfolio(), px = pendingEst(); const pend = pendingFor(me);
  const val = equityOf(pf, px); const pct = retPct(val, r.cash);
  const fd = fillDayFor(Date.now());
  const usedToday = pend.filter(o => fillDayFor(typeof o.ts === 'number' ? o.ts : Date.now()) === fd).length;
  let h = '<div class="card"><div class="mut small">YOUR PORTFOLIO</div><div class="row sp" style="align-items:flex-end"><div class="num" style="font-size:30px;font-weight:900">' + money0(val) + '</div><div class="num ' + (pct >= 0 ? 'up' : 'dn') + '" style="font-weight:800">' + pctTxt(pct) + '</div></div>' +
    '<div class="kpis" style="margin-top:12px"><div class="kpi"><small>Cash</small><b class="num">' + money0(pf.cash) + '</b></div><div class="kpi"><small>Positions</small><b>' + Object.keys(pf.pos).length + ' / ' + r.maxPos + '</b></div><div class="kpi"><small>Trades queued</small><b>' + usedToday + ' / ' + r.maxTr + '</b></div></div></div>';
  { const segs = Object.keys(pf.pos).map(t => ({ t, v: pf.pos[t].q * (px[t] != null ? px[t] : pf.pos[t].c / pf.pos[t].q) })).sort((a, b) => b.v - a.v);
    const tot = val > 0 ? val : 1; const cols = ['#22c06a', '#3b82f6', '#f59e0b', '#a78bfa', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];
    h += '<div style="display:flex;height:8px;border-radius:4px;overflow:hidden;background:#1d2733;margin-top:10px">' + segs.map((s, i) => '<span title="' + esc(s.t) + '" style="width:' + (s.v / tot * 100).toFixed(2) + '%;background:' + cols[i % cols.length] + '"></span>').join('') + '</div>' +
      '<div class="small mut" style="margin-top:6px">' + (segs.length ? segs.slice(0, 4).map(s => esc(s.t) + ' ' + Math.round(s.v / tot * 100) + '%').join(' · ') + ' · cash ' + Math.round(pf.cash / tot * 100) + '%' + (r.maxPct > 0 ? ' · limit ' + r.maxPct + '% per stock' : '') : 'All cash so far.') + '</div>'; }
  if (m.status === 'active') h += '<button class="btn primary block" style="margin-top:12px" data-act="newTrade">New trade</button><div class="mut small" style="text-align:center;margin-top:8px">Orders now fill at the ' + dayLabel(fd) + ' close.</div>';
  h += '<div class="sec">Queued orders</div>';
  if (!pend.length) h += '<div class="card mut small">No orders placed yet. Tap New trade. Orders placed now fill at the ' + dayLabel(fd) + ' close.</div>';
  else {
    let qpl = 0, qn = 0;
    const live = o => { const L = liveOf(o.t); if (L == null) return ''; let t = ' <span class="mut small">· now ' + money(L) + '</span>'; if (o.p > 0) { const d = (o.s === 'buy' ? L - o.p : o.p - L) * o.q; qpl += d; qn++; t += ' <span class="small ' + (d >= 0 ? 'up' : 'dn') + '">' + (d >= 0 ? '+' : '') + money0(d) + ' since placed</span>'; } return t; };
    const rowsQ = pend.map(o => { const fdo = fillDayFor(typeof o.ts === 'number' ? o.ts : Date.now()); return '<div class="fillrow"><span class="tag ' + o.s + '">' + o.s.toUpperCase() + '</span><span><b>' + o.q + ' ' + esc(o.t) + '</b> <span class="mut small">· ' + dayLabel(fdo) + ' close</span><div>' + live(o) + '</div>' + (o.n ? '<div class="mut small">' + esc(o.n) + '</div>' : '') + '</span><button class="btn sm" data-act="cancelOrder" data-id="' + esc(o.id) + '">Cancel</button></div>'; }).join('');
    h += '<div class="card">' + (qn ? '<div class="row sp small" style="padding-bottom:6px"><span class="mut">Live estimate if filled now</span><b class="num ' + (qpl >= 0 ? 'up' : 'dn') + '">' + (qpl >= 0 ? '+' : '') + money0(qpl) + '</b></div>' : '') + rowsQ + '<div class="mut small" style="margin-top:6px">Estimate only. Real fills happen at the close.</div></div>';
    if (S.game.mode !== 'fb') h += '<button class="btn block" style="margin-top:10px" data-act="cardSheet">Share as trade card…</button>';
  }
  h += '<div class="sec">Positions</div>';
  const ts = Object.keys(pf.pos);
  if (!ts.length) h += '<div class="card mut small">No positions yet. You’re 100% cash.</div>';
  else {
    h += '<div class="card"><div class="pos h"><span>Ticker</span><span class="r">Qty</span><span class="r">Value</span><span class="r">P/L</span></div>' + ts.map(t => {
      const p = pf.pos[t]; const L = px[t] != null ? px[t] : p.c / p.q; const v = p.q * L; const pl = v - p.c;
      return '<div class="pos"><b>' + esc(t) + '</b><span class="r num">' + p.q + '</span><span class="r num">' + money0(v) + '</span><span class="r num ' + (pl >= 0 ? 'up' : 'dn') + '">' + (pl >= 0 ? '+' : '') + money0(pl) + '</span></div>';
    }).join('') + '</div>';
  }
  return h;
}

// ── Feed ──
function tabFeed() {
  const days = Object.keys(S.G.fills || {}).sort().reverse();
  if (!days.length) return '<div class="note">Settled trades show up here after each close, with every player’s notes.</div>';
  return days.map(d => {
    const byP = S.G.fills[d]; const eq = (S.G.equity || {})[d] || {};
    const blocks = Object.keys(byP).map(pid => {
      const p = S.G.players[pid] || { n: pid, c: 0 }; const col = p.ai ? AI_COLOR : COLORS[(p.c || 0) % COLORS.length];
      const items = Object.keys(byP[pid]).map(id => Object.assign({ id }, byP[pid][id]));
      const sum = items.find(x => x.id === '_sum');
      const rows = items.filter(x => x.id !== '_sum').map(x => {
        if (x.st === 'filled') return '<div class="fillrow"><span class="tag ' + x.s + '">' + x.s.toUpperCase() + '</span><span><b>' + x.q + ' ' + esc(x.t) + '</b> <span class="mut">@ ' + money(x.px) + '</span>' + (x.pl != null ? ' <span class="' + (x.pl >= 0 ? 'up' : 'dn') + ' small">' + (x.pl >= 0 ? '+' : '') + money0(x.pl) + '</span>' : '') + (x.n ? '<div class="mut small">“' + esc(x.n) + '”</div>' : '') + '</span><span></span></div>';
        return '<div class="fillrow"><span class="tag rej">NO FILL</span><span class="mut"><b>' + esc(x.s) + ' ' + x.q + ' ' + esc(x.t) + '</b><div class="small">' + esc(x.why || 'Rejected') + '</div></span><span></span></div>';
      }).join('');
      return '<div style="margin-top:12px"><div class="nm row" style="gap:8px"><span class="dot" style="background:' + col + '"></span><b>' + esc(p.n) + '</b>' + (p.ai ? '<span class="chip ai">AI</span>' : '') + (eq[pid] != null ? '<span class="mut small num" style="margin-left:auto">' + money0(eq[pid]) + '</span>' : '') + '</div>' + (sum ? '<div class="mut small" style="margin:4px 0">' + esc(sum.n) + '</div>' : '') + (rows || '<div class="mut small">No trades.</div>') + '</div>';
    }).join('');
    return '<div class="sec row sp"><span>' + dayLabel(d) + '</span><button class="btn sm" data-act="recap" data-day="' + esc(d) + '">Share recap</button></div><div class="card" style="margin-top:0">' + (blocks || '<span class="mut small">No orders.</span>') + '</div>';
  }).join('');
}

// ── Host ──
function tabHost() {
  const m = META();
  let h = '<div class="sec" style="margin-top:4px">Players</div><div class="card">' + playerIds().map(pid => { const p = S.G.players[pid]; return '<div class="row sp" style="padding:6px 0"><span class="row"><span class="dot" style="background:' + (p.ai ? AI_COLOR : COLORS[(p.c || 0) % COLORS.length]) + '"></span>' + esc(p.n) + (p.ai ? ' <span class="chip ai">AI · ' + esc((p.m || '').split('/').pop()) + '</span>' : '') + '</span>' + (m.status === 'lobby' && pid !== ME() ? '<button class="btn sm danger" data-act="removePlayer" data-id="' + esc(pid) + '">Remove</button>' : '') + '</div>'; }).join('') + '</div>';
  if (m.status === 'lobby') {
    h += '<div class="row" style="margin-top:10px;flex-wrap:wrap"><button class="btn sm" data-act="addOffline">+ Add player by name</button>' + (aiIds().length ? '' : '<button class="btn sm" data-act="addAi">+ AI player</button>') + '</div>';
  }
  if (m.status === 'active') {
    h += '<div class="sec">Offline players</div><div class="card"><div class="small mut">For anyone not online: send them the game file, they send back a trade card.</div><div class="row" style="margin-top:10px;flex-wrap:wrap"><button class="btn sm" data-act="exportGame">Share game file</button><button class="btn sm" data-act="importCardSheet">Import trade card</button></div></div>';
  } else if (S.game.mode === 'local') {
    h += '<div class="sec">Offline players</div><div class="card"><button class="btn sm" data-act="exportGame">Share game file</button></div>';
  }
  if (m.status === 'active') {
    const qs = playerIds().filter(pid => !(S.G.players[pid] || {}).ai).map(pid => ({ pid, list: pendingFor(pid) })).filter(x => x.list.length);
    h += '<div class="sec">Queued orders (fill at the next close)</div><div class="card">' + (qs.length ? qs.map(x => '<div style="padding:6px 0"><b>' + esc(S.G.players[x.pid].n) + '</b>' + x.list.map(o => '<div class="small"><span class="tag ' + o.s + '">' + o.s.toUpperCase() + '</span> ' + o.q + ' ' + esc(o.t) + (o.n ? ' <span class="mut">“' + esc(o.n) + '”</span>' : '') + '</div>').join('') + '</div>').join('') + '<div class="mut small" style="margin-top:6px">Only you can see these. The AI player decides at settle time, so it never shows here.</div>' : '<div class="mut small">Nothing queued yet. Imported trade cards and players\' orders appear here.</div>') + '</div>';
  }
  h += '<div class="sec">AI player</div><div class="card small"><div class="mut">' + (aiIds().length ? 'The AI takes its turn automatically when you settle each day. It sees the same prices as everyone else and obeys the same limits.' : 'No AI in this game.') + '</div><div style="margin-top:8px">Model: <b>' + esc(groqModel()) + '</b> · key ' + (groqKey() ? '<span class="up">saved</span>' : '<span class="dn">missing</span>') + '</div><button class="btn sm" style="margin-top:10px" data-act="settings">AI settings</button></div>';
  h += '<div class="sec">Backup</div><div class="card"><button class="btn sm" data-act="backup">Download backup (JSON)</button></div>';
  h += '<div class="sec">Danger zone</div><div class="card stack">' + (m.status === 'active' ? '<button class="btn danger block" data-act="endNow">End game now</button>' : '') + '<button class="btn danger block" data-act="deleteGame">Delete game</button></div>';
  return h;
}

// ── Trade sheet ──
function openTrade(prefill) {
  const m = META(), r = RULES(), me = ME(); const fd = fillDayFor(Date.now());
  TR = { d: null, side: 'buy' };
  const late = fd !== dayKey(Date.now()) && isWeekday(dayKey(Date.now())) ? '<div class="note" style="margin-top:8px">It’s after 4:00 pm ET, so this fills at the <b>' + dayLabel(fd) + '</b> close, not today’s.</div>' : '';
  const lastDay = m.endDay && fd >= m.endDay ? '<div class="note bad" style="margin-top:8px">' + dayLabel(fd) + ' is the game’s last scoring day. An order filled at that close can’t change your return.</div>' : '';
  const chipList = Array.from(new Set(Object.keys(myPortfolio().pos).concat(['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA', 'AMZN']))).slice(0, 8);
  openSheet('<h2>New trade</h2><div class="mut small">Fills at the <b>' + dayLabel(fd) + '</b> close.</div>' + late + lastDay +
    '<div class="seg" style="margin-top:10px;flex-wrap:wrap">' + chipList.map(t => '<button type="button" data-act="chip" data-v="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div>' +
    '<label class="f">TICKER</label><div class="row"><input class="in code" id="t-tk" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="AAPL" style="flex:1;text-transform:uppercase;letter-spacing:.1em" value="' + esc(prefill || '') + '"><button class="btn" data-act="lookup">Look up</button></div>' +
    '<div id="t-info" class="small mut" style="margin-top:8px;min-height:20px"></div>' +
    '<label class="f">SIDE</label><div class="seg buy" id="t-side"><button type="button" data-act="side" data-v="buy" class="on">Buy</button><button type="button" data-act="side" data-v="sell">Sell</button></div>' +
    '<div id="t-hint" class="small mut" style="margin-top:8px;min-height:18px"></div><label class="f">SHARES</label><div class="row"><input class="in num" id="t-q" type="number" inputmode="numeric" min="1" step="1" placeholder="0" style="flex:1"><button class="btn sm" data-act="maxQty">Max</button></div>' +
    '<div id="t-est" class="small mut" style="margin-top:8px;min-height:20px"></div>' +
    '<label class="f">WHY? (OPTIONAL — EVERYONE SEES IT AFTER THE CLOSE)</label><input class="in" id="t-n" maxlength="100" placeholder="e.g. strong earnings, buying the dip…">' +
    '<div id="t-msg" style="margin-top:12px"></div>' +
    '<button class="btn primary block" style="margin-top:12px" data-act="placeOrder">Place order</button>', sh => {
    const tk = $('#t-tk', sh), q = $('#t-q', sh);
    const upd = () => tradeEstimate();
    tk.addEventListener('input', () => { TR.d = null; $('#t-info').textContent = ''; $('#t-est').textContent = ''; });
    tk.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doLookup(); } });
    q.addEventListener('input', upd);
    if (prefill) doLookup();
  });
}
let TR = { d: null, side: 'buy' };
async function doLookup() {
  const el = $('#t-info'); const tk = normTicker($('#t-tk').value);
  el.className = 'small mut'; el.textContent = 'Looking up ' + tk + '…';
  try {
    const d = await lookupTicker(tk);
    const r = RULES();
    TR.d = d; $('#t-tk').value = d.t;
    el.innerHTML = '<b>' + esc(d.name) + '</b> · last ' + money(d.last) + ' <span class="mut">(delayed)</span>' + (r.uni === 'list' && !tickerAllowed(d.t, r) ? '<div class="dn">Not on this game’s ticker list (you can still sell it).</div>' : '');
    tradeEstimate();
  } catch (e) { TR.d = null; el.className = 'small dn'; el.textContent = e.message; }
}
function tradeHint() {
  const h = $('#t-hint'); if (!h) return;
  if (TR.side !== 'sell') { h.textContent = ''; return; }
  const t = TR.d ? TR.d.t : normTicker(($('#t-tk') || {}).value || ''); if (!t) { h.textContent = 'Pick a ticker to sell.'; return; }
  const own = myHeld(t), qd = queuedFor(t, 'sell');
  h.innerHTML = own ? 'You own <b>' + own + '</b> shares of ' + esc(t) + (qd ? ' (' + qd + ' already queued to sell)' : '') + '.' : '<span class="dn">You don’t own any ' + esc(t) + ', so there’s nothing to sell.</span>';
}
function tradeEstimate() {
  tradeHint();
  const est = $('#t-est'); if (!est) return;
  const q = Math.floor(Number($('#t-q').value) || 0);
  if (!TR.d || !q) { est.textContent = ''; return; }
  est.innerHTML = '≈ <b>' + money(q * TR.d.last) + '</b> at the last price. Actual fill is the closing price.';
}
function myHeld(t) { const p = myPortfolio().pos[t]; return p ? p.q : 0; }
function queuedFor(t, side) { return pendingFor(ME()).filter(o => o.t === t && o.s === side).reduce((a, o) => a + o.q, 0); }
function maxQty() {
  if (!TR.d) return 0; const r = RULES(), pf = myPortfolio(); const px = TR.d.last;
  if (TR.side === 'sell') return Math.max(0, myHeld(TR.d.t) - queuedFor(TR.d.t, 'sell'));
  const est = pendingEst(); let cash = pf.cash;
  pendingFor(ME()).forEach(o => { const p = est[o.t]; if (!p) return; cash += o.s === 'sell' ? o.q * p : -o.q * p; });
  let q = Math.floor(Math.max(0, cash) / px);
  if (r.maxPct > 0) { const eq = equityOf(pf, est); const cap = Math.floor(eq * r.maxPct / 100 / px) - myHeld(TR.d.t) - queuedFor(TR.d.t, 'buy'); q = Math.min(q, Math.max(0, cap)); }
  return q;
}
function checkClient(o) {
  const r = RULES(), pf = myPortfolio(), me = ME(); const pend = pendingFor(me); const est = pendingEst();
  const fd = fillDayFor(Date.now());
  const used = pend.filter(x => fillDayFor(typeof x.ts === 'number' ? x.ts : Date.now()) === fd).length;
  if (used >= r.maxTr) return 'You’ve used all ' + r.maxTr + ' trades for the ' + dayLabel(fd) + ' close.';
  if (o.s === 'sell') { if (o.q > myHeld(o.t) - queuedFor(o.t, 'sell')) return 'You only have ' + Math.max(0, myHeld(o.t) - queuedFor(o.t, 'sell')) + ' shares of ' + o.t + ' available to sell.'; return ''; }
  if (!tickerAllowed(o.t, r)) return o.t + ' is not on this game’s ticker list.';
  const held = Object.keys(pf.pos); const newNames = new Set(pend.filter(x => x.s === 'buy' && !pf.pos[x.t]).map(x => x.t));
  if (!pf.pos[o.t] && !newNames.has(o.t) && held.length + newNames.size >= r.maxPos) return 'Position limit reached (' + r.maxPos + '). Sell something first.';
  let cash = pf.cash; pend.forEach(x => { const p = est[x.t]; if (p) cash += x.s === 'sell' ? x.q * p : -x.q * p; });
  if (o.q * TR.d.last > cash + 0.5) return 'Not enough cash (about ' + money(Math.max(0, cash)) + ' available after queued orders).';
  if (r.maxPct > 0) { const eq = equityOf(pf, est); const tot = (myHeld(o.t) + queuedFor(o.t, 'buy') + o.q) * TR.d.last; if (tot > eq * r.maxPct / 100 + 0.5) return 'That would put you over the ' + r.maxPct + '% single-stock limit.'; }
  return '';
}
async function placeOrder() {
  const msg = $('#t-msg'); msg.innerHTML = '';
  if (!TR.d || TR.d.t !== normTicker($('#t-tk').value)) { TR.d = null; await doLookup(); if (!TR.d) return; }
  const q = Math.floor(Number($('#t-q').value) || 0);
  if (q < 1) { msg.innerHTML = '<div class="note bad">Enter a whole number of shares.</div>'; return; }
  const o = { s: TR.side, t: TR.d.t, q, n: ($('#t-n').value || '').trim().slice(0, 100) };
  const err = checkClient(o);
  if (err) { msg.innerHTML = '<div class="note bad">' + esc(err) + '</div>'; return; }
  const ord = { s: o.s, t: o.t, q: o.q, n: o.n, ts: NOW() }; if (TR.d && TR.d.last > 0) ord.p = Math.round(TR.d.last * 100) / 100;
  await W.set('orders/' + ME() + '/' + newId(), ord);
  S.tab = 'trade'; sched();
  const fdo = fillDayFor(Date.now());
  openSheet('<div style="text-align:center;padding:8px 0"><div style="font-size:44px;line-height:1">✓</div><h2 style="margin:8px 0 4px">Order placed</h2><div class="num" style="font-size:20px;font-weight:800"><span class="tag ' + o.s + '">' + o.s.toUpperCase() + '</span> ' + o.q + ' ' + esc(o.t) + '</div>' +
    '<div class="mut small" style="margin-top:8px">Fills at the <b>' + dayLabel(fdo) + '</b> close' + (ord.p ? ' · price now about ' + money(ord.p) : '') + '. You can cancel it from the Trade tab until then.</div>' +
    '<button class="btn primary block" style="margin-top:16px" data-act="closeSheet">Done</button></div>');
}

// ── trade card sheet (player → host, for offline play) ──
function openCardSheet() {
  const card = buildCard(); const json = JSON.stringify(card);
  const fname = 'trade-card-' + card.game + '-' + card.name.replace(/[^a-z0-9]+/gi, '').slice(0, 12) + '.json';
  openSheet('<h2>Trade card</h2><div class="mut small">Send your queued orders to the host as a file. Online players don’t need this — their orders already sync.</div>' +
    '<div class="card" style="margin-top:12px">' + card.orders.map(o => '<div class="fillrow"><span class="tag ' + o.s + '">' + o.s.toUpperCase() + '</span><span><b>' + o.q + ' ' + esc(o.t) + '</b></span><span></span></div>').join('') + '</div>' +
    '<div class="stack" style="margin-top:14px"><button class="btn primary block" data-act="shareCard">Share file…</button><button class="btn block" data-act="emailCard">Email it</button><button class="btn block" data-act="copyCard">Copy JSON</button></div>', () => { window._card = { card, json, fname }; });
}
function openImportCard() {
  openSheet('<h2>Import trade card</h2><div class="mut small">Load the file a player sent you, or paste its contents.</div>' +
    '<input type="file" id="ic-file" accept=".json,application/json" class="in" style="margin-top:12px;padding-top:12px"><textarea class="in" id="ic-text" style="margin-top:8px" placeholder="…or paste the card JSON here"></textarea>' +
    '<label class="f">PLAYER</label><select class="in" id="ic-pid">' + humanIds().map(p => '<option value="' + esc(p) + '">' + esc(S.G.players[p].n) + '</option>').join('') + '</select>' +
    '<div id="ic-msg" style="margin-top:12px"></div><button class="btn primary block" style="margin-top:12px" data-act="doImportCard">Import orders</button>', sh => {
    const fi = $('#ic-file', sh);
    fi.addEventListener('change', async () => { const f = fi.files[0]; if (f) { $('#ic-text').value = await f.text(); autoPickCard(); } });
    $('#ic-text', sh).addEventListener('input', autoPickCard);
  });
}
function autoPickCard() { try { const c = JSON.parse($('#ic-text').value); if (c && c.pid && S.G.players[c.pid]) $('#ic-pid').value = c.pid; } catch (e) {} }

// Anyone can open a player's holdings (as of the last settled close). Pending orders stay private.
function openPlayerSheet(pid) {
  const p = S.G.players[pid]; if (!p) return;
  const pf = S.G.portfolios[pid] || { cash: RULES().cash, pos: null }; const pos = pf.pos || {}; const px = lastPrices();
  const rows = Object.keys(pos).map(t => { const q = pos[t].q, c = pos[t].c, L = px[t] != null ? px[t] : c / q; return { t, q, c, L, v: q * L }; }).sort((a, b) => b.v - a.v);
  const inv = rows.reduce((a, x) => a + x.v, 0), tot = inv + pf.cash;
  openSheet('<h2>' + esc(p.n) + (p.ai ? ' <span class="chip ai">AI</span>' : '') + '</h2><div class="mut small">Holdings as of the last settled close</div>' +
    '<div class="kpis" style="margin-top:12px"><div class="kpi"><small>Total</small><b class="num">' + money0(tot) + '</b></div><div class="kpi"><small>Cash</small><b class="num">' + money0(pf.cash) + '</b></div><div class="kpi"><small>Invested</small><b class="num">' + (tot ? Math.round(inv / tot * 100) : 0) + '%</b></div></div>' +
    '<div class="card" style="margin-top:12px">' + (rows.length ? rows.map(x => { const pl = x.v - x.c; return '<div class="row sp" style="padding:7px 0"><span><b>' + esc(x.t) + '</b> <span class="mut small">' + x.q + ' sh @ ' + money(x.c / x.q) + ' avg</span></span><span class="num" style="text-align:right">' + money0(x.v) + '<div class="small ' + (pl >= 0 ? 'up' : 'dn') + '">' + (pl >= 0 ? '+' : '') + money0(pl) + ' (' + pctTxt(retPct(x.v, x.c)) + ')</div></span></div>'; }).join('') : '<div class="mut small">All cash, no positions.</div>') + '</div>');
}

// ── live prices for the Trade tab (positions + queued tickers), refreshed while it is open ──
function liveOf(t) { const c = barCache[t]; return c && c.data && c.data.last > 0 ? c.data.last : null; }
let liveBusy = false;
async function liveRefresh() {
  if (liveBusy || S.view !== 'game' || S.tab !== 'trade' || document.hidden) return;
  const m = META(); if (!m || m.status !== 'active' || !S.G.players[ME()]) return;
  const ts = new Set(Object.keys(myPortfolio().pos)); pendingFor(ME()).forEach(o => ts.add(o.t));
  if (!ts.size) return;
  liveBusy = true;
  try {
    const before = JSON.stringify([...ts].map(liveOf));
    await Promise.all([...ts].map(t => getBars(t).catch(() => null)));
    if (JSON.stringify([...ts].map(liveOf)) !== before && S.tab === 'trade' && !$('#sheet-root.on')) sched();
  } finally { liveBusy = false; }
}
setInterval(liveRefresh, 60000);

// Plain-text recap of one settled day for pasting into a group chat.
function recapText(d) {
  const r = RULES(), eq = (S.G.equity || {})[d] || {}, byP = (S.G.fills || {})[d] || {};
  const rows = playerIds().filter(p => eq[p] != null).map(p => ({ p, n: S.G.players[p].n + (S.G.players[p].ai ? ' (AI)' : ''), v: eq[p], pct: retPct(eq[p], r.cash) })).sort((a, b) => b.v - a.v);
  const lines = ['Trade Arena: ' + (META().name || '') + ', ' + dayLabel(d) + ' close', ''];
  rows.forEach((x, i) => lines.push((i + 1) + '. ' + x.n + ' ' + money0(x.v) + ' (' + pctTxt(x.pct) + ')'));
  if (eq.spy != null) lines.push('SPY: ' + pctTxt(retPct(eq.spy, r.cash)));
  const tr = [];
  Object.keys(byP).forEach(pid => Object.keys(byP[pid]).forEach(id => { const x = byP[pid][id]; if (id === '_sum' || x.st !== 'filled') return; tr.push((S.G.players[pid] || {}).n + ': ' + x.s + ' ' + x.q + ' ' + x.t + ' @ ' + money(x.px) + (x.n ? ' (' + x.n + ')' : '')); }));
  if (tr.length) { lines.push('', 'Trades:'); tr.forEach(t => lines.push(t)); }
  lines.push('', 'Join the next game: ' + location.origin + location.pathname.replace(/app\/?$/, ''));
  return lines.join('\n');
}
