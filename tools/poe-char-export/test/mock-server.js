// Mock pathofexile.com with GGG-style rate-limit headers, a forced 429, and optional private-profile mode.
const http = require('http');
const F = require('./fixtures');
function createServer(opts = {}) {
  const hits = { char: [], item: [] };
  const log = [];
  let forced429 = opts.force429 ? 1 : 0;
  const violations = [];
  const chars = JSON.parse(JSON.stringify(opts.characters || F.characters));
  const failItems = new Set();
  const policies = {
    char: { name: 'backend-character-request-limit', rules: [[6, 4, 10], [40, 60, 60]] },
    item: { name: 'backend-item-request-limit', rules: [[8, 4, 10]] },
  };
  function limitHeaders(kind, res) {
    const now = Date.now();
    hits[kind].push(now);
    const p = policies[kind];
    const state = p.rules.map(([L, P]) => {
      const c = hits[kind].filter((t) => t > now - P * 1000).length;
      if (c > L) violations.push({ kind, L, P, c });
      return `${c}:${P}:0`;
    });
    res.setHeader('X-Rate-Limit-Policy', p.name);
    res.setHeader('X-Rate-Limit-Rules', 'Ip');
    res.setHeader('X-Rate-Limit-Ip', p.rules.map((r) => r.join(':')).join(','));
    res.setHeader('X-Rate-Limit-Ip-State', state.join(','));
  }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      log.push({ method: req.method, path: url.pathname, cookie: req.headers.cookie || null, ua: req.headers['user-agent'] });
      const send = (status, obj, type = 'application/json') => { res.statusCode = status; res.setHeader('Content-Type', type); res.end(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
      const authed = /POESESSID=good/.test(req.headers.cookie || '');
      if (opts.private && !authed && url.pathname.startsWith('/character-window/')) {
        limitHeaders(url.pathname.includes('items') ? 'item' : 'char', res);
        return send(403, { error: { code: 6, message: 'Forbidden' } });
      }
      if (url.pathname === '/character-window/get-characters') {
        limitHeaders('char', res);
        if (url.searchParams.get('accountName') !== 'Tester#1234') return send(404, { error: { code: 1, message: 'Resource not found' } });
        return send(200, chars);
      }
      if (url.pathname === '/character-window/get-items' && req.method === 'POST') {
        limitHeaders('item', res);
        if (failItems.has(new URLSearchParams(body).get('character'))) return send(500, { error: { code: 0, message: 'Internal error' } });
        if (forced429) { forced429--; res.setHeader('Retry-After', '2'); return send(429, { error: { code: 3, message: 'Rate limit exceeded' } }); }
        const f = new URLSearchParams(body);
        const c = chars.find((x) => x.name === f.get('character'));
        if (!c) return send(404, { error: { code: 1, message: 'Resource not found' } });
        const it = F.items(c.name, c.league); it.character = c; return send(200, it);
      }
      if (url.pathname === '/character-window/get-passive-skills') {
        limitHeaders('char', res);
        const n = url.searchParams.get('character');
        const kind = n === 'ClusterWarden' ? 'cluster' : n === 'freshscion' ? 'unascended' : 'normal';
        return send(200, F.passives(kind));
      }
      if (url.pathname === '/api/leagues') {
        res.setHeader('X-Rate-Limit-Policy', 'ladder-view'); res.setHeader('X-Rate-Limit-Rules', 'Ip'); res.setHeader('X-Rate-Limit-Ip', '5:5:10'); res.setHeader('X-Rate-Limit-Ip-State', '1:5:0');
        return send(200, opts.leagues || [
          { id: 'Standard', startAt: '2013-01-23T21:00:00Z', endAt: null, category: { id: 'Standard' }, rules: [] },
          { id: 'Allflame', startAt: '2026-07-24T20:00:00Z', endAt: null, category: { id: 'Allflame' }, rules: [] },
          { id: 'SSF R Allflame', startAt: '2026-07-24T20:00:00Z', endAt: null, category: { id: 'Allflame' }, rules: [{ id: 'NoParties' }, { id: 'HardMode' }] },
          { id: 'Exilecon 2026 PoE1 Qualifier #3', startAt: '2026-09-17T21:00:00Z', endAt: '2026-09-18T01:00:00Z', category: { id: 'Standard' }, event: true },
        ]);
      }
      if (url.pathname === '/passive-skill-tree' || url.pathname === '/passive-skill-tree/alternate') {
        const alt = url.pathname.endsWith('alternate');
        return send(200, `<html><script>require(['main'], function(){ require(['skilltree'], function (PassiveSkillTree) { var passiveSkillTreeData = ${JSON.stringify(F.tree(alt))};\n var opts = {"x":"}{"}; }); });</script></html>`, 'text/html');
      }
      send(404, 'nope', 'text/plain');
    });
  });
  return { server, log, violations, chars, hits, failItems };
}
module.exports = { createServer };
