// ══════════════════════════════════════════
//  HELPERS + MARKET DATA
// ══════════════════════════════════════════
const APP_VERSION = '1.6.0';
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const lsRaw = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const lsRawSet = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const money = n => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = n => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
const pctTxt = n => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
const dayLabel = k => { try { return new Date(k + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch (e) { return k; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Large-cap preset for "ticker list" games and the AI watchlist (a convenience list, not an official index).
const LARGE_CAPS = 'AAPL MSFT NVDA AMZN GOOGL META TSLA AVGO BRK-B JPM V UNH XOM LLY MA JNJ PG HD COST MRK ABBV CVX PEP KO WMT BAC CRM NFLX AMD ORCL ADBE TMO MCD CSCO ACN ABT LIN DHR WFC TXN PM DIS VZ NEE INTC INTU AMGN UPS PFE IBM QCOM LOW HON UNP CAT RTX SPGI GE BA AMAT BMY GS MS PLD NOW DE SBUX MDT BLK ISRG LMT AXP GILD MDLZ TJX ADI BKNG ADP CVS CB SYK VRTX REGN C ZTS SO MO USB COP T MMM F GM SPY QQQ DIA IWM'.split(' ');
const AI_WATCH_DEFAULT = ('AAPL MSFT NVDA AMZN GOOGL META TSLA AVGO NFLX CRM ORCL AMD INTC JPM V MA BAC GS UNH LLY JNJ PFE MRK ABBV PG KO PEP COST WMT HD XOM CVX CAT GE BA DIS LIN NEE T VZ SPY QQQ IWM DIA XLK XLF XLE XLV XLU TLT GLD').split(' ');
const AI_STYLES = {
  value: 'Your style: value investor. Favor quality companies trading below their recent trend or well off their highs, and avoid chasing stocks that just ran up.',
  momentum: 'Your style: momentum trader. Favor stocks and ETFs with strong 20-day trends trading above their 50-day average, and sell what loses momentum.',
  contrarian: 'Your style: contrarian. Look for beaten-down names and sectors that may bounce, and trim what looks overextended.',
  cautious: 'Your style: cautious and diversified. Spread across sectors and ETFs, hold some cash, and avoid big concentrated bets.'
};
const AI_STYLE_LABEL = { value: 'Value', momentum: 'Momentum', contrarian: 'Contrarian', cautious: 'Cautious' };

// ── Price fetching: hedged CORS-proxy race (same approach as AXIOM) ──
const PROXIES = [
  { id: 'allorigins', url: u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u) },
  { id: 'codetabs', url: u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u) }
];
// Shared price proxy (a free Cloudflare Worker that only forwards Yahoo chart requests). A proxy URL set in Settings overrides it.
const DEFAULT_PROXY = 'https://trade-prices.johnlazzaro25.workers.dev';
let proxyStats = lsGet('ta_proxy_stats', {});
const proxyScore = id => { const s = proxyStats[id] || { ok: 0, fail: 0, ms: 0 }; return s.ok - s.fail * 1.5 - (s.ms || 0) / 4000; };
function proxyNote(id, ok, ms) {
  const s = proxyStats[id] || (proxyStats[id] = { ok: 0, fail: 0, ms: 0 });
  if (ok) { s.ok = Math.min(s.ok + 1, 30); s.fail = Math.max(0, s.fail - .5); s.ms = s.ms ? s.ms * .7 + ms * .3 : ms; }
  else { s.fail = Math.min(s.fail + 1, 30); s.ok = Math.max(0, s.ok - 1); }
  lsSet('ta_proxy_stats', proxyStats);
}
function raceAttempts(attempts, stagger) {
  return new Promise((resolve, reject) => {
    let started = 0, failed = 0, done = false, timer = null, lastErr = 'All routes failed';
    const ctrls = [];
    const end = (fn, v) => { if (done) return; done = true; clearTimeout(timer); ctrls.forEach(c => { try { c.abort(); } catch (e) {} }); fn(v); };
    const arm = () => { clearTimeout(timer); if (!done && started < attempts.length) timer = setTimeout(launch, stagger); };
    const launch = () => {
      if (done || started >= attempts.length) return;
      const att = attempts[started++], ctrl = new AbortController();
      ctrls.push(ctrl);
      const t0 = Date.now(), tm = setTimeout(() => ctrl.abort(), 9000);
      att.run(ctrl.signal).then(v => { clearTimeout(tm); proxyNote(att.id, true, Date.now() - t0); end(resolve, v); })
        .catch(e => {
          clearTimeout(tm);
          if (done) return;
          if (e && e.fatal) return end(reject, e);
          if (e && e.name === 'AbortError') e = new Error('Timed out');
          lastErr = (e && e.message) || String(e);
          proxyNote(att.id, false, 0); failed++;
          if (failed >= attempts.length) return end(reject, new Error(lastErr));
          if (started < attempts.length) launch();
        });
      arm();
    };
    launch();
  });
}
async function parseYahoo(r) {
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) {}
  if (j && j.chart && j.chart.error && j.chart.error.code) { const e = new Error('No data for that ticker'); e.fatal = true; throw e; }
  if (r.status === 403 || r.status === 429) throw new Error('HTTP ' + r.status + ' (rate limited)');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  if (!txt || txt.trim()[0] === '<') throw new Error('Proxy returned a page, not data');
  if (j === null) throw new Error('Bad JSON');
  return j;
}
function proxyGet(urls) {
  const order = PROXIES.slice().sort((a, b) => proxyScore(b.id) - proxyScore(a.id));
  const mk = (id, mkUrl, u) => ({ id, run: async signal => parseYahoo(await fetch(mkUrl(u), { signal })) });
  const attempts = [];
  const custom = cleanProxyUrl(lsRaw('ta_proxy')) || DEFAULT_PROXY;
  if (custom) urls.forEach(u => attempts.push(mk('custom', x => custom + (custom.indexOf('?') >= 0 ? '&' : '?') + 'url=' + encodeURIComponent(x), u)));
  attempts.push(mk('direct', x => x, urls[0]));
  urls.forEach(u => order.forEach(p => attempts.push(mk(p.id, p.url, u))));
  return raceAttempts(attempts.slice(0, 7), 1800);
}
function cleanProxyUrl(v) {
  v = String(v || '').trim(); if (!v) return '';
  try { const u = new URL(v); return u.protocol === 'https:' ? (u.origin + u.pathname.replace(/\/+$/, '') + u.search) : ''; } catch (e) { return ''; }
}
// Cap concurrent races so free proxies don't 429 us.
let _act = 0; const _wait = [];
function limited(fn) {
  return new Promise((resolve, reject) => {
    const run = () => { _act++; fn().then(resolve, reject).finally(() => { _act--; const n = _wait.shift(); if (n) n(); }); };
    if (_act < 5) run(); else _wait.push(run);
  });
}
const barCache = {}, barInflight = {};   // ticker -> { at, data } / pending promise
// Daily bars for a ticker: { t, name, type, cur, last, bars:[{k:'YYYY-MM-DD', c}] }  (k is the New York trading date)
async function getBars(ticker, force) {
  const t = normTicker(ticker);
  const hit = barCache[t];
  if (!force && hit && Date.now() - hit.at < 3 * 60 * 1000) return hit.data;
  if (barInflight[t]) return barInflight[t];
  const path = '/v8/finance/chart/' + encodeURIComponent(t) + '?range=6mo&interval=1d&includePrePost=false';
  const p = limited(() => proxyGet(['https://query1.finance.yahoo.com' + path, 'https://query2.finance.yahoo.com' + path])).then(j => {
    const res = j.chart && j.chart.result && j.chart.result[0];
    if (!res || !res.timestamp) throw new Error('No data for ' + t);
    const cl = (res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close) || [];
    const bars = [];
    res.timestamp.forEach((ts, i) => { if (cl[i] != null && cl[i] > 0) bars.push({ k: dayKey(ts * 1000), c: cl[i] }); });
    const m = res.meta || {};
    const data = { t, name: m.longName || m.shortName || t, type: m.instrumentType || '', cur: m.currency || 'USD', last: m.regularMarketPrice || (bars.length ? bars[bars.length - 1].c : 0), bars };
    barCache[t] = { at: Date.now(), data };
    return data;
  }).finally(() => { delete barInflight[t]; });
  return (barInflight[t] = p);
}
function closeOn(data, day) { const b = data.bars.find(x => x.k === day); return b ? b.c : null; }
// Can this symbol be traded in-game? (US-dollar stocks and ETFs only.)
async function lookupTicker(raw) {
  const t = normTicker(raw);
  if (!TICKER_RE.test(t)) throw new Error('Enter a stock or ETF symbol like AAPL');
  const d = await getBars(t);
  if (d.type && !/^(EQUITY|ETF)$/i.test(d.type)) throw new Error(t + ' is a ' + d.type.toLowerCase() + ' — stocks and ETFs only');
  if (d.cur && d.cur !== 'USD') throw new Error(t + ' trades in ' + d.cur + ' — US-dollar listings only');
  return d;
}
