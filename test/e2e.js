// Local-game end-to-end test in real Chrome with mocked Yahoo + Groq.  node test/e2e.js
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs');
const BASE = 'http://localhost:8765/index.html';
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const PRICE = { AAPL: 200, MSFT: 400, SPY: 600, NVDA: 150, QQQ: 500 };
function bars(t, upToIso) {
  // weekday bars, one per day ending at upToIso (inclusive); price drifts +1/day so closes differ by day
  const out = []; const end = new Date(upToIso + 'T14:30:00Z');
  const base = PRICE[t] || 100;
  let d = new Date(end), i = 0;
  while (out.length < 40) { const g = d.getUTCDay(); if (g > 0 && g < 6) { out.unshift({ ts: Math.floor(d.getTime() / 1000), c: +(base - i * 1.0).toFixed(2) }); i++; } d = new Date(d.getTime() - 86400000); }
  return out;
}
let lastDay = '2026-11-13';
function yahoo(t) {
  const b = bars(t, lastDay);
  return { chart: { result: [{ meta: { symbol: t, longName: t + ' Inc', instrumentType: t === 'SPY' || t === 'QQQ' ? 'ETF' : 'EQUITY', currency: 'USD', regularMarketPrice: b[b.length - 1].c }, timestamp: b.map(x => x.ts), indicators: { quote: [{ close: b.map(x => x.c) }] } }], error: null } };
}
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.route(/query[12]\.finance\.yahoo\.com/, r => { const t = decodeURIComponent(r.request().url().match(/chart(?:\/|%2F)([^%?&]+)/)[1]); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(yahoo(t)) }); });
  await ctx.route(/api\.groq\.com\/openai\/v1\/models/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ data: [{ id: 'qwen/qwen3.6-27b', created: 5, active: true }, { id: 'llama-3.3-70b-versatile', created: 4, active: true }, { id: 'whisper-large-v3', created: 9, active: true }] }) }));
  let groqBody = null;
  await ctx.route(/api\.groq\.com\/openai\/v1\/chat\/completions/, r => { groqBody = JSON.parse(r.request().postData()); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ choices: [{ message: { content: '{"orders":[{"s":"buy","t":"MSFT","q":50,"n":"quality compounder"},{"s":"buy","t":"NVDA","q":9999,"n":"too big"}],"summary":"Starting with a core holding."}' } }] }) }); });
  await ctx.route(/gstatic\.com|cdnjs\.cloudflare/, r => r.abort());
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  // Friday 2026-11-13 11:00 ET = 16:00Z
  await page.clock.install({ time: new Date('2026-11-13T16:00:00Z') });
  await page.goto(BASE);
  await page.evaluate(() => { localStorage.setItem('ta_groq_key', 'gsk_test'); });
  await page.reload();
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/shot-home.png' });
  ok(await page.locator('text=Best trader wins').count() === 1, 'home renders');

  // create local game
  await page.click('[data-act=newGame]');
  await page.fill('#c-name', 'Test Game'); await page.fill('#c-me', 'John');
  await page.fill('#c-tr', '2'); await page.fill('#c-pos', '4'); await page.fill('#c-pct', '50');
  ok(await page.locator('#c-online').isChecked(), 'online play defaults on now that Firebase is configured');
  await page.uncheck('#c-online');   // this test runs the offline path (no Firebase in the sandbox)
  await page.screenshot({ path: '/tmp/shot-create.png', fullPage: true });
  await page.click('[data-act=doCreate]'); await page.waitForTimeout(500);
  ok(await page.locator('text=Players (2)').count() === 1, 'lobby with host + AI');
  await page.screenshot({ path: '/tmp/shot-lobby.png' });
  // add offline player
  await page.click('[data-act=tab][data-v=host]'); await page.click('[data-act=addOffline]'); await page.fill('#ao-name', 'Sam'); await page.click('[data-act=doAddOffline]'); await page.waitForTimeout(400);
  await page.click('[data-act=tab][data-v=board]'); await page.waitForTimeout(300);
  ok(await page.locator('text=Players (3)').count() === 1, 'offline player added');
  await page.click('[data-act=startGame]'); await page.waitForTimeout(400);
  ok(await page.locator('text=Settle after 4:20').count() === 1, 'live; settle disabled before the close');

  // trade
  await page.click('[data-act=tab][data-v=trade]');
  await page.click('[data-act=newTrade]');
  await page.fill('#t-tk', 'aapl'); await page.click('[data-act=lookup]'); await page.waitForSelector('#t-info b');
  await page.click('[data-act=maxQty]');
  const maxv = await page.inputValue('#t-q');
  ok(maxv === '250', 'max buy = 50% cap of 100k at $200 = 250 (got ' + maxv + ')');
  await page.fill('#t-q', '400'); await page.click('[data-act=placeOrder]');
  ok(await page.locator('.note.bad:has-text("50%")').count() === 1, 'single-stock cap blocked client-side');
  await page.fill('#t-q', '100'); await page.fill('#t-n', 'big tech');
  await page.click('[data-act=placeOrder]'); await page.waitForTimeout(300);
  ok(await page.locator('text=100 AAPL').count() >= 1, 'order queued');
  await page.waitForTimeout(500);
  ok(await page.locator('text=since placed').count() >= 1, 'queued order shows live gain/loss since placed');
  // second order, then third should hit the 2/day cap
  await page.click('[data-act=newTrade]'); await page.fill('#t-tk', 'QQQ'); await page.click('[data-act=lookup]'); await page.waitForSelector('#t-info b'); await page.fill('#t-q', '10'); await page.click('[data-act=placeOrder]'); await page.waitForTimeout(200);
  await page.click('[data-act=newTrade]'); await page.fill('#t-tk', 'NVDA'); await page.click('[data-act=lookup]'); await page.waitForSelector('#t-info b'); await page.fill('#t-q', '5'); await page.click('[data-act=placeOrder]');
  ok(await page.locator('.note.bad:has-text("used all 2 trades")').count() === 1, 'daily trade cap enforced');
  await page.click('.sheet [data-act=closeSheet]');
  await page.screenshot({ path: '/tmp/shot-trade.png', fullPage: true });

  // trade card export for offline player flow: just check the sheet builds
  await page.click('[data-act=cardSheet]');
  ok(await page.locator('text=Trade card').count() >= 1, 'trade card sheet opens');
  await page.click('.sheet [data-act=closeSheet]');

  // jump to 17:00 ET Friday, settle
  await page.clock.setFixedTime(new Date('2026-11-13T22:00:00Z'));
  await page.reload(); await page.waitForTimeout(300);
  await page.click('.gitem'); await page.waitForTimeout(300);
  ok(await page.locator('[data-act=settle]:not([disabled])').count() === 1, 'settle enabled after the close');
  await page.click('[data-act=settle]'); await page.waitForTimeout(1500);
  ok(groqBody && groqBody.model === 'qwen/qwen3.6-27b' && groqBody.reasoning_effort === 'none', 'AI call used default qwen model with reasoning_effort none');
  await page.waitForTimeout(3600); await page.evaluate(()=>scrollTo(0,0)); await page.screenshot({ path: 'app/shot-phone-1.png' });
  const board = await page.innerText('.wrap');
  ok(/AI Trader/.test(board) && /John/.test(board) && /Sam/.test(board), 'leaderboard lists all three players');
  ok(/SPY buy/.test(board), 'benchmark row shown');
  // inspect state
  await page.click('[data-act=viewPlayer]'); await page.waitForTimeout(300);
  ok(await page.locator('.sheet:has-text("Holdings as of the last settled close")').count() === 1, 'tap a player shows holdings sheet');
  await page.click('.sheet [data-act=closeSheet]'); await page.waitForTimeout(200);
  const G = await page.evaluate(() => JSON.parse(localStorage.getItem('ta_local_' + gamesList()[0].code)));
  const code = Object.keys(G.fills)[0];
  ok(G.meta.lastSettled === '2026-11-13', 'lastSettled advanced');
  const fills = G.fills['2026-11-13'];
  const john = Object.values(fills).find(p => Object.values(p).some(f => f.t === 'AAPL'));
  ok(john && Object.values(john).filter(f => f.st === 'filled').length === 2, 'John: AAPL + QQQ filled at close');
  const aap = Object.values(john).find(f => f.t === 'AAPL'); ok(aap.px === 200 && aap.n === 'big tech', 'AAPL filled at close 200 with note');
  const aiFills = Object.values(fills).find(p => Object.values(p).some(f => f.t === 'MSFT'));
  const msft = Object.values(aiFills).find(f => f.t === 'MSFT'); ok(msft && msft.st === 'filled' && msft.px === 400, 'AI MSFT filled');
  const nv = Object.values(aiFills).find(f => f.t === 'NVDA'); ok(nv && nv.st === 'rejected', 'AI oversized order rejected by the rules engine (' + (nv && nv.why) + ')');
  const pf = G.portfolios; const johnId = G.meta.hostUid;
  ok(Math.abs(pf[johnId].cash - (100000 - 100 * 200 - 10 * 500)) < 0.01, 'John cash correct');
  ok(G.equity['2026-11-13'].spy === 100000, 'SPY benchmark starts at base on first settle');
  await page.click('[data-act=tab][data-v=trade]'); await page.waitForTimeout(300); await page.screenshot({ path: 'app/shot-phone-2.png' });
  // feed tab
  await page.click('[data-act=tab][data-v=feed]'); await page.screenshot({ path: '/tmp/shot-feed.png', fullPage: true });
  ok(/quality compounder/.test(await page.innerText('.wrap')), 'AI note visible in feed after the close');
  // next day: Monday close. orders placed after Friday close fill Monday
  await page.click('[data-act=tab][data-v=board]'); await page.waitForTimeout(300);
  ok(/Mon, Nov 16/.test(await page.innerText('.wrap')), 'next close is Monday');
  await page.setViewportSize({ width: 1280, height: 720 }); await page.click('[data-act=tab][data-v=board]'); await page.waitForTimeout(400);
  await page.screenshot({ path: 'app/shot-wide.png', scale: 'css' });
  ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
  await browser.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nAll e2e passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
