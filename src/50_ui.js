// ══════════════════════════════════════════
//  UI — rendering, sheets, home, create, settings
// ══════════════════════════════════════════
let _raf = 0;
function sched() { if (_raf) return; _raf = requestAnimationFrame(() => { _raf = 0; render(); }); }
function toast(msg, kind) {
  const t = document.createElement('div'); t.className = 'toast' + (kind === 'bad' ? ' bad' : ''); t.textContent = msg;
  $('#toast').appendChild(t); setTimeout(() => t.remove(), kind === 'bad' ? 6000 : 3200);
}
async function guard(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { console.error(e); toast(e && e.message ? e.message : String(e), 'bad'); }
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('Copied'); }
  catch (e) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); toast('Copied'); } catch (x) { toast('Copy failed', 'bad'); } a.remove(); }
}
const joinLink = code => location.origin + location.pathname + '?join=' + code;

// ── sheets (kept out of the main render so typing is never interrupted) ──
function openSheet(html, bind) {
  const root = $('#sheet-root');
  root.innerHTML = '<div class="scrim" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true"><button class="icon-btn" data-act="closeSheet" aria-label="Close" style="position:absolute;right:12px;top:12px;width:34px;height:34px;font-size:16px">\u2715</button><div class="grip"></div>' + html + '</div>';
  root.classList.add('on');
  linkLabels(root);
  if (bind) bind(root.querySelector('.sheet'));
}
function closeSheet() { const r = $('#sheet-root'); r.classList.remove('on'); r.innerHTML = ''; }

// ── main render ──
function render() {
  const app = $('#app');
  let html = '';
  if (S.view === 'home') html = viewHome();
  else if (S.view === 'create') html = viewCreate();
  else if (S.view === 'game') html = viewGame();
  app.innerHTML = html + (S.busy ? '<div class="overlay"><div><div class="spin"></div><b>' + esc(S.busy) + '</b><div class="mut small" style="margin-top:6px">Keep this screen open.</div></div></div>' : '');
  linkLabels(app);
  if (S.view === 'game') afterGameRender();
  if (S.view === 'create') afterCreateRender();
}
// Associate each form label with the control that follows it (screen readers, tap-to-focus)
let _lid = 0;
function linkLabels(root) {
  root.querySelectorAll('label.f').forEach(l => {
    if (l.htmlFor) return;
    const n = l.nextElementSibling;
    const el = n && (n.matches('input,select,textarea') ? n : n.querySelector('input,select,textarea'));
    if (!el) return;
    if (!el.id) el.id = 'f' + (++_lid);
    l.htmlFor = el.id;
  });
}
function footer() {
  return '<div class="foot">Trade Arena v' + APP_VERSION + ' · © 2026 LAZLAB Creations · <a href="mailto:lazlab.io@gmail.com?subject=Trade%20Arena">Note to self</a><br>Paper trading only. Not financial advice.</div>';
}

// ── home ──
function viewHome() {
  const games = gamesList();
  return '<div class="wrap"><div class="top"><div class="brand">TRADE<span>ARENA</span></div><button class="icon-btn" data-act="settings" aria-label="Settings">⚙</button></div>' +
    '<div class="hero"><h1>Same cash.<br>Same rules.<br><em>Best trader wins.</em></h1><p>A paper-trading game for you, your friends and an AI player. Everyone starts equal, trades are capped, and the closing bell decides.</p></div>' +
    '<div class="stack" style="margin-top:22px"><button class="btn primary block" data-act="newGame">Host a game</button><button class="btn block" data-act="joinSheet">Join with a code</button></div>' +
    (games.length ? '<div class="sec">Your games</div><div class="stack">' + games.map((g, i) => '<button class="gitem" data-act="openGame" data-i="' + i + '"><span><b>' + esc(g.name || 'Game') + '</b><span class="mut small code">' + esc(g.code) + '</span></span><span class="row"><span class="chip ' + (g.role === 'host' ? 'acc' : '') + '">' + (g.role === 'host' ? 'Host' : 'Player') + '</span>' + (g.mode === 'local' ? '<span class="chip">Offline</span>' : '') + '</span></button>').join('') + '</div>' : '') +
    footer() + '</div>';
}

// ── create ──
const CF = { dur: 14, ai: true, uni: 'any' };
const PRESETS = [
  { id: 'casual', n: 'Casual', d: '2 weeks · 3 trades/day · 25% cap', dur: 14, cash: 100000, tr: 3, pos: 10, pct: 25 },
  { id: 'picker', n: 'Stock-picker', d: '1 month · 2 trades/day · 8 positions', dur: 30, cash: 100000, tr: 2, pos: 8, pct: 30 },
  { id: 'diversify', n: 'Diversify', d: '1 month · 15 positions · 15% cap', dur: 30, cash: 100000, tr: 3, pos: 15, pct: 15 },
  { id: 'beginner', n: 'Beginner', d: '2 weeks · $50k · simple limits', dur: 14, cash: 50000, tr: 2, pos: 6, pct: 40 },
  { id: 'sprint', n: 'Sprint', d: '1 week · 5 trades/day', dur: 7, cash: 100000, tr: 5, pos: 10, pct: 25 }
];
function viewCreate() {
  const hasFb = !!fbConfig(); const hasKey = !!groqKey();
  return '<div class="wrap"><div class="top"><button class="icon-btn" data-act="home" aria-label="Back">‹</button><div class="brand">NEW <span>GAME</span></div><span style="width:40px"></span></div>' +
    '<div class="sec" style="margin-top:4px">Quick start</div><div class="card"><div class="seg" id="c-presets" style="flex-wrap:wrap">' + PRESETS.map(p => '<button type="button" data-act="preset" data-v="' + p.id + '">' + p.n + '</button>').join('') + '</div><div class="small mut" id="c-preset-d" style="margin-top:8px">One tap fills the rules below. You can still change anything.</div></div>' +
    '<div class="card" style="margin-top:12px"><label class="f" style="margin-top:0">GAME NAME</label><input class="in" id="c-name" maxlength="30" value="' + esc(CF.name || 'Friday Showdown') + '">' +
    '<label class="f">YOUR NAME</label><input class="in" id="c-me" maxlength="20" value="' + esc(lsRaw('ta_me') || '') + '" placeholder="Host name">' +
    '<label class="f">STARTING CASH (EVERYONE GETS THE SAME)</label><input class="in num" id="c-cash" type="number" inputmode="numeric" min="1000" max="10000000" step="1000" value="' + (CF.cash || 100000) + '">' +
    '<div class="seg" style="margin-top:8px" id="c-cash-chips">' + [10000, 25000, 50000, 100000, 1000000].map(v => '<button type="button" data-act="cashChip" data-v="' + v + '">' + money0(v) + '</button>').join('') + '</div>' +
    '<label class="f">TIME FRAME</label><div class="seg" id="c-dur">' + [[1, '1 day'], [7, '1 week'], [14, '2 weeks'], [30, '1 month'], [90, '3 months'], [0, 'Custom']].map(d => '<button type="button" data-act="durChip" data-v="' + d[0] + '" class="' + (CF.dur === d[0] ? 'on' : '') + '">' + d[1] + '</button>').join('') + '</div>' +
    '<input class="in ' + (CF.dur === 0 ? '' : 'hide') + '" id="c-end" type="date" style="margin-top:8px" value="' + esc(CF.end || '') + '">' +
    '</div>' +
    '<div class="sec">Fair-play rules</div><div class="card">' +
    '<div class="row"><div style="flex:1"><label class="f" style="margin-top:0">MAX TRADES / DAY</label><input class="in num" id="c-tr" type="number" inputmode="numeric" min="1" max="20" value="' + (CF.tr || 3) + '"></div>' +
    '<div style="flex:1"><label class="f" style="margin-top:0">MAX POSITIONS</label><input class="in num" id="c-pos" type="number" inputmode="numeric" min="1" max="30" value="' + (CF.pos || 10) + '"></div></div>' +
    '<label class="f">MAX % OF PORTFOLIO IN ONE STOCK (0 = NO LIMIT)</label><input class="in num" id="c-pct" type="number" inputmode="numeric" min="0" max="100" value="' + (CF.pct != null ? CF.pct : 25) + '">' +
    '<label class="f">WHAT CAN BE BOUGHT</label><div class="seg" id="c-uni"><button type="button" data-act="uniChip" data-v="any" class="' + (CF.uni === 'any' ? 'on' : '') + '">Any US stock or ETF</button><button type="button" data-act="uniChip" data-v="list" class="' + (CF.uni === 'list' ? 'on' : '') + '">Only a list</button></div>' +
    '<div id="c-list-wrap" class="' + (CF.uni === 'list' ? '' : 'hide') + '"><textarea class="in" id="c-list" style="margin-top:8px" placeholder="AAPL MSFT NVDA …">' + esc(CF.list || '') + '</textarea><button type="button" class="btn sm" style="margin-top:8px" data-act="fillCaps">Fill with large caps</button></div>' +
    '<div class="note small" style="margin-top:14px">Long-only, whole shares, no leverage. Orders placed before 4:00 pm ET fill at that day’s close; later orders fill at the next close.</div></div>' +
    '<div class="sec">Players</div><div class="card">' +
    '<label class="row" style="gap:12px"><input type="checkbox" id="c-ai" ' + (CF.ai ? 'checked' : '') + ' style="width:22px;height:22px"><span><b>Add an AI player</b><br><span class="small mut">' + (hasKey ? 'Uses your Groq key. Players see it as one of them.' : 'Needs a free Groq key — add it in Settings before starting.') + '</span></span></label>' +
    '<label class="f">AI STYLE (OPTIONAL)</label><select class="in" id="c-style"><option value="">No style: the AI decides freely</option>' + Object.keys(AI_STYLE_LABEL).map(k => '<option value="' + k + '"' + (CF.style === k ? ' selected' : '') + '>' + AI_STYLE_LABEL[k] + '</option>').join('') + '</select><div class="small mut" style="margin-top:6px">A style nudges how the AI trades and shows on its card. Leave it on “No style” to let it make its own calls.</div>' +
    '<label class="row" style="gap:12px;margin-top:14px"><input type="checkbox" id="c-online" ' + (hasFb ? 'checked' : 'disabled') + ' style="width:22px;height:22px"><span><b>Play online with friends</b><br><span class="small mut">' + (hasFb ? 'Friends join with a code or link.' : 'Firebase isn’t set up, so this will be an offline game: friends send you trade cards.') + '</span></span></label></div>' +
    '<button class="btn primary block" style="margin-top:18px" data-act="doCreate">Create game</button></div>';
}
function afterCreateRender() {}
function readCreate() {
  const v = id => ($('#' + id) || {}).value;
  const cash = Math.round(Number(v('c-cash')));
  const uni = CF.uni;
  const list = uni === 'list' ? Array.from(new Set(String(v('c-list') || '').toUpperCase().split(/[\s,;]+/).map(normTicker).filter(t => TICKER_RE.test(t)))) : [];
  const o = {
    name: (v('c-name') || '').trim() || 'Trade Arena game', myName: (v('c-me') || '').trim(),
    cash, maxTr: Math.round(Number(v('c-tr'))), maxPos: Math.round(Number(v('c-pos'))), maxPct: Math.round(Number(v('c-pct'))),
    uni, list, dur: CF.dur, endDay: null, ai: $('#c-ai').checked, aiStyle: v('c-style') || '', online: $('#c-online').checked
  };
  if (!o.myName) throw new Error('Enter your name.');
  if (!(cash >= 1000 && cash <= 10000000)) throw new Error('Starting cash must be between $1,000 and $10,000,000.');
  if (!(o.maxTr >= 1 && o.maxTr <= 20)) throw new Error('Max trades per day must be 1–20.');
  if (!(o.maxPos >= 1 && o.maxPos <= 30)) throw new Error('Max positions must be 1–30.');
  if (!(o.maxPct >= 0 && o.maxPct <= 100)) throw new Error('Single-stock limit must be 0–100.');
  if (o.maxPct > 0 && o.maxPct * o.maxPos < 100) throw new Error('With ' + o.maxPos + ' positions, a ' + o.maxPct + '% cap means nobody could ever invest everything. Raise one of them.');
  if (uni === 'list' && list.length < 3) throw new Error('Add at least 3 tickers to the list.');
  if (CF.dur === 0) {
    const e = v('c-end'); if (!e) throw new Error('Pick an end date.');
    if (e <= dayKey(Date.now())) throw new Error('The end date must be in the future.');
    o.endDay = isWeekday(e) ? e : prevWeekday(e);
  }
  return o;
}

// ── settings sheet ──
function openSettings() {
  const cache = groqCache(); const key = groqKey(); const cfg = fbConfig(); const model = groqModel();
  const modelOpts = (cache && cache.list ? cache.list.map(m => m.id) : []); if (!modelOpts.includes(model)) modelOpts.unshift(model);
  openSheet('<h2>Settings</h2><div class="mut small">Saved on this device only.</div>' +
    '<label class="f">YOUR NAME</label><input class="in" id="s-me" maxlength="20" value="' + esc(lsRaw('ta_me')) + '">' +
    '<div class="sec">Online play (Firebase)</div>' +
    '<div class="note ' + (cfg ? 'good' : '') + '">' + (cfg ? 'Connected to project <b>' + esc(cfg.projectId || cfg.databaseURL) + '</b>.' : 'Not set up. Paste your Firebase web config below, or put it in the app file (see the README).') + (S.fbErr ? '<br><span class="dn">' + esc(S.fbErr) + '</span>' : '') + '</div>' +
    '<textarea class="in" id="s-fb" style="margin-top:8px" placeholder=\'{"apiKey":"…","authDomain":"…","databaseURL":"…","projectId":"…","appId":"…"}\'></textarea>' +
    '<div class="row" style="margin-top:8px"><button class="btn sm" data-act="saveFb">Save config</button>' + (lsGet('ta_fb_config', null) ? '<button class="btn sm" data-act="clearFb">Clear</button>' : '') + '</div>' +
    '<div class="sec">AI player (Groq)</div>' +
    '<input class="in" id="s-key" type="password" autocomplete="off" placeholder="' + (key ? 'Key saved — paste a new one to replace' : 'Paste your Groq API key') + '">' +
    '<div class="row" style="margin-top:8px"><button class="btn sm" data-act="saveKey">Save key</button>' + (key ? '<button class="btn sm" data-act="clearKey">Clear</button>' : '') + '</div>' +
    (key ? '<label class="f">MODEL</label><div class="row"><select class="in" id="s-model" style="flex:1">' + modelOpts.map(id => '<option ' + (id === model ? 'selected' : '') + '>' + esc(id) + '</option>').join('') + '</select><button class="btn sm" data-act="refreshModels">Refresh</button></div>' +
      (cache && cache.missing && cache.missing === model ? '<div class="note bad small" style="margin-top:8px">Groq no longer lists this model. It stays selected — pick another if the AI fails.</div>' : '') +
      '<label class="f">AI WATCHLIST (TICKERS THE AI CAN SEE DATA FOR)</label><textarea class="in" id="s-watch" placeholder="AAPL MSFT …">' + esc((lsGet('ta_ai_watch', null) || AI_WATCH_DEFAULT).join(' ')) + '</textarea><button class="btn sm" style="margin-top:8px" data-act="saveWatch">Save watchlist</button>' : '') +
    '<div class="sec">Price data</div><input class="in" id="s-proxy" type="url" placeholder="Optional: https://your-worker.workers.dev" value="' + esc(lsRaw('ta_proxy')) + '"><button class="btn sm" style="margin-top:8px" data-act="saveProxy">Save proxy</button>' +
    '<div class="foot" style="margin-top:26px">Trade Arena v' + APP_VERSION + '</div><button class="btn block" style="margin-top:14px" data-act="closeSheet">Done</button>');
}

// ── join sheet ──
function openJoin(prefill) {
  openSheet('<h2>Join a game</h2><div class="mut small">Enter the code your host shared.</div>' +
    '<label class="f">GAME CODE</label><input class="in code" id="j-code" maxlength="6" autocapitalize="characters" autocomplete="off" value="' + esc(prefill || '') + '" style="text-transform:uppercase;font-size:20px">' +
    '<label class="f">YOUR NAME</label><input class="in" id="j-name" maxlength="20" value="' + esc(lsRaw('ta_me')) + '">' +
    '<label class="f">EMAIL (OPTIONAL)</label><input class="in" id="j-email" type="email" autocomplete="email" placeholder="So the host can send recaps">' +
    '<div class="small mut" style="margin-top:6px">Only the host can see it, and only for this game.</div>' +
    '<button class="btn primary block" style="margin-top:16px" data-act="doJoin">Join</button>' +
    '<div class="sec">No internet game? Use a game file</div>' +
    '<div class="small mut">If your host sent you a game file, load it here and pick who you are.</div>' +
    '<input type="file" id="j-file" accept=".json,application/json" class="in" style="margin-top:8px;padding-top:12px">' +
    '<div id="j-pick"></div>');
  const fi = $('#j-file');
  fi.addEventListener('change', async () => {
    const f = fi.files[0]; if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      if (obj.type !== 'game' || !obj.G || !obj.G.meta) throw new Error('That is not a Trade Arena game file.');
      window._gf = obj;
      const pl = obj.G.players || {};
      $('#j-pick').innerHTML = '<label class="f">I AM…</label><select class="in" id="j-me">' + Object.keys(pl).filter(p => !pl[p].ai).map(p => '<option value="' + esc(p) + '">' + esc(pl[p].n) + '</option>').join('') + '</select><button class="btn primary block" style="margin-top:12px" data-act="doLoadFile">Load game</button>';
    } catch (e) { toast(e.message, 'bad'); }
  });
}
