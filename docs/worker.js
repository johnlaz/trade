// Trade Arena price proxy: a free Cloudflare Worker (about 2 minutes to set up, see README).
// It only forwards Yahoo Finance chart requests and adds the CORS header the browser needs.
export default {
  async fetch(req) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Cache-Control': 'public, max-age=120' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const target = new URL(req.url).searchParams.get('url') || '';
    let u; try { u = new URL(target); } catch (e) { return new Response('bad url', { status: 400, headers: cors }); }
    if (u.protocol !== 'https:' || !/^query[12]\.finance\.yahoo\.com$/.test(u.hostname) || !u.pathname.startsWith('/v8/finance/chart/'))
      return new Response('not allowed', { status: 403, headers: cors });
    const r = await fetch(u.toString(), { headers: { 'User-Agent': 'Mozilla/5.0' }, cf: { cacheTtl: 120, cacheEverything: true } });
    return new Response(r.body, { status: r.status, headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });
  }
};
