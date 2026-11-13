// ══════════════════════════════════════════
//  ACTIONS — every data-act button lands here
// ══════════════════════════════════════════
const ACT = {
  home() { leaveGame(); S.view = 'home'; sched(); },
  settings() { openSettings(); },
  closeSheet() { closeSheet(); },
  tab(el) { S.tab = el.dataset.v; sched(); window.scrollTo(0, 0); liveRefresh(); },
  newGame() { S.view = 'create'; sched(); },
  joinSheet() { openJoin(); },
  openGame(el) { const g = gamesList()[+el.dataset.i]; if (g) guard(() => openGame(g)); },
  copyCode() { copyText(S.game.code); },
  copyLink() { copyText(joinLink(S.game.code)); },
  shareLink() {
    const url = joinLink(S.game.code);
    if (navigator.share) navigator.share({ title: 'Trade Arena', text: 'Join my paper-trading game: ' + S.game.code, url }).catch(() => {}); else copyText(url);
  },
  forgetGame() { removeGameEntry(S.game.code); leaveGame(); },

  // create form
  cashChip(el) { $('#c-cash').value = el.dataset.v; },
  durChip(el) { CF.dur = +el.dataset.v; $('#c-dur').querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); $('#c-end').classList.toggle('hide', CF.dur !== 0); },
  uniChip(el) { CF.uni = el.dataset.v; $('#c-uni').querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); $('#c-list-wrap').classList.toggle('hide', CF.uni !== 'list'); },
  fillCaps() { $('#c-list').value = LARGE_CAPS.join(' '); },
  doCreate() {
    guard(async () => {
      const o = readCreate(); lsRawSet('ta_me', o.myName);
      if (o.online && !fbConfig()) throw new Error('Firebase is not set up. Turn off online play or add your config in Settings.');
      CF.name = o.name;
      await createGame(o);
      if (o.ai) await addAiPlayer();
      S.tab = 'board';
    });
  },

  // settings
  saveFb() {
    const raw = ($('#s-fb').value || '').trim(); if (!raw) return toast('Paste your config first', 'bad');
    try {
      let txt = raw.replace(/^[^{]*\{/, '{').replace(/\}[^}]*$/, '}');           // accept "const firebaseConfig = {...};"
      txt = txt.replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":').replace(/'/g, '"').replace(/,\s*\}/g, '}');
      const c = JSON.parse(txt);
      if (!c.apiKey || !c.databaseURL) throw new Error('The config needs apiKey and databaseURL. Is Realtime Database created?');
      lsSet('ta_fb_config', c); toast('Saved. Reloading…'); setTimeout(() => location.reload(), 700);
    } catch (e) { toast('Could not read that config: ' + e.message, 'bad'); }
  },
  clearFb() { lsRawSet('ta_fb_config', ''); toast('Cleared. Reloading…'); setTimeout(() => location.reload(), 600); },
  saveKey() {
    const v = ($('#s-key').value || '').trim(); if (!v) return toast('Paste a key first', 'bad');
    lsRawSet('ta_groq_key', v); lsRawSet('ta_groq_model', ''); lsRawSet('ta_groq_models', '');
    toast('Key saved. Loading models…'); refreshGroqModels().then(() => { openSettings(); });
  },
  clearKey() { ['ta_groq_key', 'ta_groq_model', 'ta_groq_models'].forEach(k => lsRawSet(k, '')); openSettings(); },
  refreshModels() { refreshGroqModels().then(() => openSettings()); },
  saveWatch() {
    const l = Array.from(new Set(($('#s-watch').value || '').toUpperCase().split(/[\s,;]+/).map(normTicker).filter(t => TICKER_RE.test(t)))).slice(0, 45);
    if (l.length < 5) return toast('Keep at least 5 tickers', 'bad'); lsSet('ta_ai_watch', l); toast('Watchlist saved (' + l.length + ')');
  },
  saveProxy() { const v = ($('#s-proxy').value || '').trim(); if (v && !cleanProxyUrl(v)) return toast('Proxy must be an https:// URL', 'bad'); lsRawSet('ta_proxy', v); toast('Saved'); },

  // join
  doJoin() {
    guard(async () => {
      const name = ($('#j-name').value || '').trim(); lsRawSet('ta_me', name);
      await joinOnline($('#j-code').value, name); closeSheet();
    });
  },
  doLoadFile() {
    guard(async () => {
      const obj = window._gf; const me = $('#j-me').value;
      const r = importGameFile(obj, me);
      const entry = { code: r.code, role: 'player', mode: 'local', me: r.me || me, name: obj.G.meta.name };
      saveGameEntry(entry); closeSheet(); await openGame(entry); toast('Game loaded');
    });
  },

  // lobby / host
  startGame() { if (confirm('Start the game now? No one can join after this.')) guard(startGame, 'Game started — good luck!'); },
  addAi() { guard(async () => { if (!groqKey()) throw new Error('Add a Groq key in Settings first.'); await addAiPlayer(); }); },
  addOffline() {
    openSheet('<h2>Add a player</h2><div class="mut small">For someone who will play offline, or who hasn’t got the app.</div><label class="f">NAME</label><input class="in" id="ao-name" maxlength="20"><button class="btn primary block" style="margin-top:14px" data-act="doAddOffline">Add</button>');
  },
  doAddOffline() {
    guard(async () => {
      const n = ($('#ao-name').value || '').trim(); if (!n) throw new Error('Enter a name.');
      await W.set('players/o' + newId(), { n, c: playerIds().length % COLORS.length, t: NOW() }); closeSheet();
    });
  },
  removePlayer(el) { if (confirm('Remove this player?')) guard(async () => { await W.set('players/' + el.dataset.id, null); }); },
  settle() { guard(settleNext); },
  debrief() { guard(makeDebrief, 'Debrief ready'); },
  endNow() { if (confirm('End the game now? Standings freeze at the last settled close.')) guard(endGameNow, 'Game ended'); },
  deleteGame() {
    if (!confirm('Delete this game for everyone? This cannot be undone.')) return;
    guard(async () => {
      if (S.game.mode === 'fb') await S.ref.remove();
      removeGameEntry(S.game.code); leaveGame();
    });
  },
  backup() { downloadJson('trade-arena-backup-' + S.game.code + '.json', { ta: 1, type: 'backup', exported: Date.now(), G: S.G }); },
  exportGame() { shareJson('trade-arena-game-' + S.game.code + '.json', gameFile(), 'Trade Arena game ' + S.game.code); },
  importCardSheet() { openImportCard(); },
  doImportCard() {
    guard(async () => {
      let c; try { c = JSON.parse($('#ic-text').value); } catch (e) { throw new Error('That isn’t valid JSON.'); }
      const r = await importCard(c, $('#ic-pid').value); closeSheet();
      toast('Imported ' + r.added + ' order' + (r.added === 1 ? '' : 's') + (r.skipped ? ' (' + r.skipped + ' skipped)' : ''));
    });
  },

  // trading
  newTrade() { TR = { d: null, side: 'buy' }; openTrade(); },
  lookup() { doLookup(); },
  side(el) { TR.side = el.dataset.v; $('#t-side').querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); },
  maxQty() { if (!TR.d) return toast('Look up a ticker first', 'bad'); $('#t-q').value = maxQty() || ''; tradeEstimate(); },
  placeOrder() { guard(placeOrder); },
  cancelOrder(el) { guard(async () => { await W.set('orders/' + ME() + '/' + el.dataset.id, null); }, 'Order cancelled'); },
  viewPlayer(el) { openPlayerSheet(el.dataset.id); },
  cardSheet() { openCardSheet(); },
  shareCard() { const c = window._card; shareJson(c.fname, c.card, 'Trade card'); },
  emailCard() {
    const c = window._card; const to = 'lazlab.io@gmail.com';
    location.href = 'mailto:' + to + '?subject=' + encodeURIComponent('Trade card ' + c.card.game + ' — ' + c.card.name) + '&body=' + encodeURIComponent('Paste this into Host → Import trade card:\n\n' + c.json);
  },
  copyCard() { copyText(window._card.json); }
};
function downloadJson(name, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
async function shareJson(name, obj, title) {
  const json = JSON.stringify(obj);
  try {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  downloadJson(name, obj); toast('Saved as a file — attach it to a message or email.');
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  if (el.tagName === 'A') e.preventDefault();
  fn(el, e);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

// ── boot ──
(function boot() {
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  const p = new URLSearchParams(location.search).get('join');
  if (p) { history.replaceState(null, '', location.pathname); openJoin(p.toUpperCase().slice(0, 6)); }
  if (groqKey()) { const c = groqCache(); if (!c || Date.now() - c.at > GROQ_STALE_MS) refreshGroqModels(true); }
  if (fbConfig()) fbInit().catch(() => {});
})();
