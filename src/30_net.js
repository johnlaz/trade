// ══════════════════════════════════════════
//  STATE + SYNC (Firebase Realtime Database, or a local-only game)
//  The whole game lives under games/{CODE}: meta, players, portfolios, fills, prices, equity, orders
// ══════════════════════════════════════════
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyA19u6l0a3ueq8AGK4qHOM0JHR6KZ5XLgY",
  authDomain: "trade-arena-2238c.firebaseapp.com",
  databaseURL: "https://trade-arena-2238c-default-rtdb.firebaseio.com",
  projectId: "trade-arena-2238c",
  storageBucket: "trade-arena-2238c.firebasestorage.app",
  messagingSenderId: "1038401283575",
  appId: "1:1038401283575:web:0df743218228705a3d7af2"
};
const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const COLORS = ['#ffb020', '#3ddc97', '#4cc9f0', '#ff6b9a', '#b794f6', '#f4845f', '#9be15d', '#f6e05e'];
const AI_COLOR = '#a78bfa';

const S = {
  view: 'home', tab: 'board', game: null, uid: null, fbOk: false, fbErr: '',
  G: emptyG(), loaded: {}, off: [], ref: null, notFound: false, busy: null
};
function emptyG() { return { meta: null, players: {}, portfolios: {}, fills: {}, prices: {}, equity: {}, orders: {}, contacts: {} }; }

function fbConfig() {
  const o = lsGet('ta_fb_config', null);
  const c = o && o.apiKey ? o : FIREBASE_CONFIG;
  return c && c.apiKey && c.apiKey !== 'PASTE_API_KEY_HERE' && c.databaseURL ? c : null;
}
let _fbPromise = null;
function fbInit() {
  if (_fbPromise) return _fbPromise;
  _fbPromise = (async () => {
    const cfg = fbConfig();
    if (!cfg) throw new Error('Firebase is not set up yet (Settings → Online play).');
    if (typeof firebase === 'undefined') throw new Error('Could not load Firebase. Check your connection.');
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    const user = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Sign-in timed out')), 12000);
      const un = firebase.auth().onAuthStateChanged(u => { if (u) { clearTimeout(t); un(); resolve(u); } });
      firebase.auth().signInAnonymously().catch(e => { clearTimeout(t); reject(new Error(e.code === 'auth/operation-not-allowed' || e.code === 'auth/admin-restricted-operation' ? 'Anonymous sign-in is off. Turn it on in Firebase → Authentication.' : (e.message || 'Sign-in failed'))); });
    });
    S.uid = user.uid; S.fbOk = true; S.fbErr = '';
    return firebase.database();
  })().catch(e => { _fbPromise = null; S.fbOk = false; S.fbErr = e.message; throw e; });
  return _fbPromise;
}
const NOW = () => (S.game && S.game.mode === 'fb') ? firebase.database.ServerValue.TIMESTAMP : Date.now();
const localId = () => { let id = lsRaw('ta_localid'); if (!id) { id = 'u' + newId(); lsRawSet('ta_localid', id); } return id; };
const ME = () => S.game ? (S.game.mode === 'fb' ? S.uid : S.game.me) : null;
const isHost = () => !!(S.game && S.game.role === 'host');
const META = () => S.G.meta;
const RULES = () => (S.G.meta && S.G.meta.r) || { cash: 100000, maxPos: 10, maxTr: 3, maxPct: 25, uni: 'any', list: [] };

// ── saved games list ──
const gamesList = () => lsGet('ta_games', []);
function saveGameEntry(e) {
  const l = gamesList().filter(x => !(x.code === e.code && x.mode === e.mode));
  l.unshift(e); lsSet('ta_games', l.slice(0, 30));
}
function removeGameEntry(code) { lsSet('ta_games', gamesList().filter(x => x.code !== code)); lsRawSet('ta_local_' + code, ''); }
function genCode() { let c = ''; for (let i = 0; i < 6; i++) c += CODE_ALPHA[Math.floor(Math.random() * CODE_ALPHA.length)]; return c; }

// ── path helpers for local games ──
function setPath(obj, path, val) {
  const ks = path.split('/'); let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; }
  if (val === null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = val;
}
function saveLocal() { if (S.game && S.game.mode === 'local') lsSet('ta_local_' + S.game.code, S.G); }

// ── writes: same call for Firebase and local games ──
const W = {
  set(path, val) {
    if (S.game.mode === 'fb') return S.ref.child(path).set(val);
    setPath(S.G, path, val); saveLocal(); sched(); return Promise.resolve();
  },
  update(map) {
    if (S.game.mode === 'fb') return S.ref.update(map);
    Object.keys(map).forEach(k => setPath(S.G, k, map[k])); saveLocal(); sched(); return Promise.resolve();
  }
};

// ── attach / detach ──
function detach() { S.off.forEach(f => { try { f(); } catch (e) {} }); S.off = []; S.ref = null; }
async function openGame(entry) {
  detach();
  S.game = entry; S.G = emptyG(); S.loaded = {}; S.notFound = false; S.tab = 'board'; S.view = 'game';
  if (entry.mode === 'local') {
    const g = lsGet('ta_local_' + entry.code, null);
    if (g) S.G = Object.assign(emptyG(), g);
    S.loaded = { all: true }; S.notFound = !g; sched(); return;
  }
  sched();
  try {
    const db = await fbInit();
    if (S.game !== entry) return;
    const g = db.ref('games/' + entry.code); S.ref = g;
    ['meta', 'players', 'portfolios', 'fills', 'prices', 'equity'].forEach(k => {
      const r = g.child(k);
      const fn = r.on('value', s => {
        S.G[k] = s.val() || (k === 'meta' ? null : {});
        S.loaded[k] = true;
        if (k === 'meta') S.notFound = !s.exists();
        sched();
      }, err => { toast('Sync error: ' + err.message, 'bad'); });
      S.off.push(() => r.off('value', fn));
    });
    if (entry.role === 'host') {
      const cr = g.child('contacts');
      const cf = cr.on('value', s => { S.G.contacts = s.val() || {}; sched(); }, () => {});
      S.off.push(() => cr.off('value', cf));
    }
    const or = entry.role === 'host' ? g.child('orders') : g.child('orders/' + S.uid);
    const fn = or.on('value', s => {
      S.G.orders = entry.role === 'host' ? (s.val() || {}) : { [S.uid]: s.val() || {} };
      S.loaded.orders = true; sched();
    }, err => { toast('Sync error: ' + err.message, 'bad'); });
    S.off.push(() => or.off('value', fn));
  } catch (e) { S.fbErr = e.message; sched(); }
}
function leaveGame() { detach(); S.game = null; S.G = emptyG(); S.view = 'home'; sched(); }

// ── create / join ──
async function createGame(opt) {
  const code = genCode();
  const meta = {
    name: opt.name, code, status: 'lobby', created: 0,
    r: { cash: opt.cash, maxPos: opt.maxPos, maxTr: opt.maxTr, maxPct: opt.maxPct, uni: opt.uni, list: opt.list },
    dur: opt.dur, endDay: opt.endDay || null, ver: APP_VERSION
  };
  if (opt.aiStyle) meta.aiStyle = opt.aiStyle;
  const mePlayer = { n: opt.myName, c: 0, t: 0 };
  if (opt.online) {
    const db = await fbInit();
    meta.hostUid = S.uid; meta.created = firebase.database.ServerValue.TIMESTAMP;
    mePlayer.t = firebase.database.ServerValue.TIMESTAMP;
    const g = db.ref('games/' + code);
    const ex = await g.child('meta').once('value');
    if (ex.exists()) return createGame(opt);          // vanishingly rare code clash
    await g.child('meta').set(meta);                 // meta first: the player rules look it up
    await g.child('players/' + S.uid).set(mePlayer);
    const entry = { code, role: 'host', mode: 'fb', me: S.uid, name: opt.name };
    saveGameEntry(entry); await openGame(entry);
  } else {
    const me = 'h' + newId();
    meta.hostUid = me; meta.created = Date.now(); mePlayer.t = Date.now();
    const G = Object.assign(emptyG(), { meta, players: { [me]: mePlayer } });
    lsSet('ta_local_' + code, G);
    const entry = { code, role: 'host', mode: 'local', me, name: opt.name };
    saveGameEntry(entry); await openGame(entry);
  }
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
async function joinOnline(code, name, email) {
  code = String(code || '').trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error('Codes are 6 letters and numbers.');
  const db = await fbInit();
  const g = db.ref('games/' + code);
  const m = await g.child('meta').once('value');
  if (!m.exists()) throw new Error('No game found with that code.');
  const meta = m.val();
  const mine = await g.child('players/' + S.uid).once('value');
  if (!mine.exists()) {
    if (meta.status !== 'lobby') throw new Error('That game has already started.');
    if (!name) throw new Error('Enter a name to join.');
    const pl = await g.child('players').once('value');
    const n = Object.keys(pl.val() || {}).length;
    await g.child('players/' + S.uid).set({ n: name.slice(0, 20), c: n % COLORS.length, t: firebase.database.ServerValue.TIMESTAMP });
    if (EMAIL_RE.test(email || '')) { try { await g.child('contacts/' + S.uid).set(email.trim().slice(0, 100)); } catch (e) {} }   // optional; never blocks joining
  }
  const role = meta.hostUid === S.uid ? 'host' : 'player';
  const entry = { code, role, mode: 'fb', me: S.uid, name: meta.name };
  saveGameEntry(entry); await openGame(entry);
}

// ── offline players: game file + trade cards ──
function gameFile() {
  const G = JSON.parse(JSON.stringify(S.G));
  G.orders = {};   // pending orders stay private to the host
  return { ta: 1, type: 'game', code: S.game.code, exported: Date.now(), G };
}
function importGameFile(obj, pickMe) {
  if (!obj || obj.type !== 'game' || !obj.G || !obj.G.meta) throw new Error('That is not a Trade Arena game file.');
  const code = obj.code || obj.G.meta.code;
  const prev = lsGet('ta_local_' + code, null);
  const entry = gamesList().find(x => x.code === code && x.mode === 'local');
  const me = (entry && entry.me) || pickMe;
  const G = Object.assign(emptyG(), obj.G);
  // keep my own unsent orders that have not been settled yet
  const settled = new Set();
  Object.values(G.fills || {}).forEach(day => Object.values(day || {}).forEach(pl => Object.keys(pl || {}).forEach(id => settled.add(id))));
  G.orders = {};
  if (prev && prev.orders && me && prev.orders[me]) {
    const keep = {}; Object.keys(prev.orders[me]).forEach(id => { if (!settled.has(id)) keep[id] = prev.orders[me][id]; });
    if (Object.keys(keep).length) G.orders[me] = keep;
  }
  lsSet('ta_local_' + code, G);
  return { code, G, me };
}
function buildCard() {
  const me = ME();
  const orders = pendingFor(me);
  return {
    ta: 1, type: 'tradecard', game: S.game.code, pid: me, card: newId(), created: Date.now(),
    name: ((S.G.players[me] || {}).n) || 'Player',
    orders: orders.map(o => ({ id: o.id, s: o.s, t: o.t, q: o.q, n: o.n || '', ts: typeof o.ts === 'number' ? o.ts : Date.now() }))
  };
}
function pendingFor(pid) {
  const o = (S.G.orders || {})[pid] || {};
  return Object.keys(o).map(id => Object.assign({ id }, o[id])).sort((a, b) => (a.ts || 0) - (b.ts || 0));
}
// Host: take a card and queue its orders for that player. Returns { added, skipped }.
async function importCard(card, pid) {
  if (!card || card.type !== 'tradecard') throw new Error('That is not a trade card.');
  if (card.game !== S.game.code) throw new Error('This card is for game ' + card.game + ', not ' + S.game.code + '.');
  if (!S.G.players[pid]) throw new Error('Pick which player this card belongs to.');
  const meta = META();
  if (meta.status !== 'active') throw new Error('The game is not running.');
  if ((meta.cards || {})[card.card]) throw new Error('This card was already imported.');
  const known = new Set();
  Object.values(S.G.fills || {}).forEach(day => Object.values(day || {}).forEach(pl => Object.keys(pl || {}).forEach(id => known.add(id))));
  const existing = (S.G.orders || {})[pid] || {};
  const now = Date.now(); const upd = {}; let added = 0, skipped = 0;
  (card.orders || []).slice(0, 20).forEach(o => {
    const t = normTicker(o.t), q = Number(o.q);
    if (!o.id || known.has(o.id) || existing[o.id] || !TICKER_RE.test(t) || (o.s !== 'buy' && o.s !== 'sell') || !Number.isInteger(q) || q < 1) { skipped++; return; }
    upd['orders/' + pid + '/' + o.id] = { s: o.s, t, q, n: String(o.n || '').slice(0, 140), ts: Math.min(Number(o.ts) || now, now) };
    added++;
  });
  upd['meta/cards/' + card.card] = now;
  await W.update(upd);
  return { added, skipped };
}
