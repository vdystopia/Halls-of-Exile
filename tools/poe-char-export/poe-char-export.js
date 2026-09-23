/*!
 * poe-char-export.js — export every Path of Exile 1 character on an account (equipped items,
 * tree jewels, passive allocations) as one normalized JSON document for dashboards.
 *
 * One file, two runtimes:
 *   Browser  (any https://www.pathofexile.com page; DevTools console or a saved Snippet)
 *              await PoeExport.exportToFile()                 // account auto-detected on a profile page
 *              await PoeExport.exportToFile({ account: 'Name#1234' })
 *              const data = await PoeExport.run({ account: 'Name#1234' })   // no file, returns object
 *   Node 18+  node poe-char-export.js --account "Name#1234" --out characters.json [--csv characters.csv]
 *
 * Source: the website's character-window endpoints (the same calls the profile page makes).
 * They are undocumented; GGG's documented route is the OAuth API (api.pathofexile.com, scope account:characters).
 */
(function () {
  'use strict';

  const VERSION = '1.0.0';
  const SCHEMA_VERSION = 1;
  const IS_BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined';
  const DEFAULT_BASE = 'https://www.pathofexile.com';
  const BASE_CLASSES = ['Scion', 'Marauder', 'Ranger', 'Witch', 'Duelist', 'Templar', 'Shadow'];
  // Used only when tree data cannot be loaded (Phrecia-style alternate ascendancies).
  const KNOWN_ALT_ASCENDANCIES = new Set(['Scavenger', 'Ancestral Commander', 'Behemoth', 'Antiquarian', 'Wildspeaker', 'Whisperer',
    'Daughter of Oshabi', 'Harbinger', 'Herald', 'Bog Shaman', 'Aristocrat', 'Gambler', 'Paladin', 'Architect of Chaos', 'Puppeteer',
    'Polytheist', 'Servant of Arakaali', 'Blind Prophet', 'Surfcaster']);
  const RARITY_BY_FRAME = { 0: 'Normal', 1: 'Magic', 2: 'Rare', 3: 'Unique', 4: 'Gem', 5: 'Currency', 6: 'DivinationCard', 7: 'Quest', 8: 'Prophecy', 9: 'Foil', 10: 'SupporterFoil', 11: 'Necropolis', 12: 'Gold', 13: 'BreachSkill' };
  const ITEM_FLAGS = ['corrupted', 'mirrored', 'fractured', 'synthesised', 'split', 'duplicated', 'mutated', 'veiled',
    'searing', 'tangled', 'isRelic', 'foreseeing', 'unmodifiable', 'ruthless', 'replica', 'scourged', 'abyssJewel', 'delve', 'elder', 'shaper'];

  // ---------------------------------------------------------------------------------------------
  // League calendar for origin-league inference: [apiName, fullName, version, 'challenge'|'event', startUTC, endUTC|null].
  // Leagues missing here are appended at runtime from /api/leagues while they are live (see leagues.calendar_additions).
  // ---------------------------------------------------------------------------------------------
  const LEAGUE_CALENDAR = [
    ['Harbinger', 'Harbinger', '3.0', 'challenge', '2017-08-04T20:00:00Z', '2017-11-27T21:00:00Z'],
    ['Abyss', 'Abyss', '3.1', 'challenge', '2017-12-08T20:00:00Z', '2018-02-26T21:00:00Z'],
    ['Bestiary', 'Bestiary', '3.2', 'challenge', '2018-03-02T20:00:00Z', '2018-05-28T21:00:00Z'],
    ['Incursion', 'Incursion', '3.3', 'challenge', '2018-06-01T20:00:00Z', '2018-08-27T21:00:00Z'],
    ['Delve', 'Delve', '3.4', 'challenge', '2018-08-31T20:00:00Z', '2018-12-03T21:00:00Z'],
    ['Betrayal', 'Betrayal', '3.5', 'challenge', '2018-12-07T20:00:00Z', '2019-03-04T21:00:00Z'],
    ['Synthesis', 'Synthesis', '3.6', 'challenge', '2019-03-08T20:00:00Z', '2019-06-03T21:00:00Z'],
    ['Legion', 'Legion', '3.7', 'challenge', '2019-06-07T20:00:00Z', '2019-09-02T21:00:00Z'],
    ['Blight', 'Blight', '3.8', 'challenge', '2019-09-06T20:00:00Z', '2019-12-09T21:00:00Z'],
    ['Metamorph', 'Metamorph', '3.9', 'challenge', '2019-12-13T20:00:00Z', '2020-03-09T21:00:00Z'],
    ['Delirium', 'Delirium', '3.10', 'challenge', '2020-03-13T20:00:00Z', '2020-06-15T21:00:00Z'],
    ['Harvest', 'Harvest', '3.11', 'challenge', '2020-06-19T20:00:00Z', '2020-09-14T21:00:00Z'],
    ['Heist', 'Heist', '3.12', 'challenge', '2020-09-18T20:00:00Z', '2021-01-11T21:00:00Z'],
    ['Ritual', 'Ritual', '3.13', 'challenge', '2021-01-15T20:00:00Z', '2021-04-12T21:00:00Z'],
    ['Ultimatum', 'Ultimatum', '3.14', 'challenge', '2021-04-16T20:00:00Z', '2021-07-19T21:00:00Z'],
    ['Expedition', 'Expedition', '3.15', 'challenge', '2021-07-23T20:00:00Z', '2021-10-18T21:00:00Z'],
    ['Scourge', 'Scourge', '3.16', 'challenge', '2021-10-22T20:00:00Z', '2022-02-01T21:00:00Z'],
    ['Archnemesis', 'Siege of the Atlas', '3.17', 'challenge', '2022-02-04T20:00:00Z', '2022-05-10T21:00:00Z'],
    ['Sentinel', 'Sentinel', '3.18', 'challenge', '2022-05-13T20:00:00Z', '2022-08-16T21:00:00Z'],
    ['Kalandra', 'Lake of Kalandra', '3.19', 'challenge', '2022-08-19T20:00:00Z', '2022-12-06T21:00:00Z'],
    ['Sanctum', 'The Forbidden Sanctum', '3.20', 'challenge', '2022-12-09T20:00:00Z', '2023-04-03T21:00:00Z'],
    ['Crucible', 'Crucible', '3.21', 'challenge', '2023-04-07T20:00:00Z', '2023-08-15T21:00:00Z'],
    ['Ancestor', 'Trial of the Ancestors', '3.22', 'challenge', '2023-08-18T20:00:00Z', '2023-12-05T21:00:00Z'],
    ['Affliction', 'Affliction', '3.23', 'challenge', '2023-12-08T20:00:00Z', '2024-03-26T21:00:00Z'],
    ['Necropolis', 'Necropolis', '3.24', 'challenge', '2024-03-29T20:00:00Z', '2024-07-23T21:00:00Z'],
    ['Settlers', 'Settlers of Kalguur', '3.25', 'challenge', '2024-07-26T20:00:00Z', '2025-06-09T21:00:00Z'],
    ['Phrecia', 'Legacy of Phrecia', '3.25', 'event', '2025-02-20T20:00:00Z', '2025-04-23T21:00:00Z'],
    ['Mercenaries', 'Secrets of the Atlas', '3.26', 'challenge', '2025-06-13T20:00:00Z', '2025-10-27T21:00:00Z'],
    ['Keepers', 'Keepers of the Flame', '3.27', 'challenge', '2025-10-31T20:00:00Z', '2026-03-02T21:00:00Z'],
    ['Phrecia 2.0', 'Legacy of Phrecia 2.0', '3.27', 'event', '2026-01-29T21:00:00Z', '2026-02-19T21:00:00Z'],
    ['Mirage', 'Mirage', '3.28', 'challenge', '2026-03-06T20:00:00Z', '2026-07-20T20:00:00Z'],
    ['Allflame', 'Curse of the Allflame', '3.29', 'challenge', '2026-07-24T20:00:00Z', null],
  ];

  const state = { phase: 'idle', done: 0, total: 0, current: null, waitingUntil: null, requests: 0, log: [] };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const toIso = (unix) => (Number.isFinite(unix) && unix > 0 ? new Date(unix * 1000).toISOString().replace('.000Z', 'Z') : null);
  const int = (v) => { const m = String(v ?? '').match(/-?\d+/); return m ? Number(m[0]) : null; };

  function stripMarkup(s) {
    if (typeof s !== 'string') return s;
    return s.replace(/<<set:[^>]*>>/g, '').replace(/\[([^|\]]+)\|([^\]]+)\]/g, '$2').replace(/\[([^|\]]+)\]/g, '$1');
  }

  function normalizeAccount(input) {
    if (!input) return null;
    let a = String(input).trim();
    try { a = decodeURIComponent(a); } catch (_) { /* keep as-is */ }
    if (!a.includes('#')) { const m = a.match(/^(.+)-(\d{4})$/); if (m) a = `${m[1]}#${m[2]}`; }
    return a;
  }

  function detectAccountFromUrl(href) {
    const m = String(href || '').match(/\/account\/view-profile\/([^/?#]+)/);
    return m ? normalizeAccount(m[1]) : null;
  }

  function makeLogger(sink) {
    return (level, msg) => {
      const line = `[${new Date().toISOString().slice(11, 19)}] ${level.toUpperCase()} ${msg}`;
      state.log.push(line); if (state.log.length > 200) state.log.shift();
      if (sink) sink(level, line);
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Rate limiting — driven by GGG's X-Rate-Limit-* headers ("hits:period:penalty" / "count:period:restricted").
  // ---------------------------------------------------------------------------------------------
  class RateLimiter {
    constructor(log, { minGapMs = 750, margin = 1, maxWaitMs = 20 * 60 * 1000 } = {}) {
      this.log = log; this.minGapMs = minGapMs; this.margin = margin; this.maxWaitMs = maxWaitMs;
      this.policies = new Map();      // policy name -> { rules: [], own: [], blockedUntil }
      this.endpointPolicy = new Map(); // endpoint key -> policy name
      this.lastSent = 0; this.waitedMs = 0;
    }

    requiredWait(endpoint, now) {
      let wait = Math.max(0, this.lastSent + this.minGapMs - now);
      const p = this.policies.get(this.endpointPolicy.get(endpoint));
      if (!p) return wait;
      if (p.blockedUntil > now) wait = Math.max(wait, p.blockedUntil - now);
      for (const r of p.rules) {
        const P = r.period * 1000;
        const cap = Math.max(1, r.limit - this.margin);
        const inWindow = p.own.filter((t) => t > now - P);
        let est;
        if (now - r.at >= P) est = inWindow.length;
        else {
          const expired = p.own.filter((t) => t <= r.at && t > r.at - P && t <= now - P).length;
          const after = p.own.filter((t) => t > r.at).length;
          est = Math.max(inWindow.length, r.count - expired + after);
        }
        if (est + 1 > cap) {
          const need = est + 1 - cap;
          const expiries = inWindow.map((t) => t + P).sort((a, b) => a - b);
          const until = expiries.length >= need ? expiries[need - 1] : r.at + P;
          wait = Math.max(wait, until - now + 1000);
        }
      }
      return wait;
    }

    async acquire(endpoint) {
      for (;;) {
        const now = Date.now();
        const wait = this.requiredWait(endpoint, now);
        if (wait <= 0) break;
        if (wait > this.maxWaitMs) {
          const e = new Error(`Rate limit would require waiting ${Math.round(wait / 1000)}s (> maxWait ${Math.round(this.maxWaitMs / 1000)}s) for ${endpoint}`);
          e.code = 'RATE_LIMIT_WAIT'; throw e;
        }
        if (wait >= 5000) this.log('info', `rate limit: waiting ${Math.round(wait / 1000)}s before ${endpoint}`);
        state.waitingUntil = new Date(now + wait).toISOString();
        this.waitedMs += wait;
        await sleep(wait);
        state.waitingUntil = null;
      }
      this.lastSent = Date.now();
      return this.lastSent;
    }

    update(endpoint, res, sentAt) {
      const name = res.headers.get('x-rate-limit-policy');
      if (!name) return;
      this.endpointPolicy.set(endpoint, name);
      let p = this.policies.get(name);
      if (!p) { p = { rules: [], own: [], blockedUntil: 0 }; this.policies.set(name, p); }
      p.own.push(sentAt);
      const now = Date.now();
      const rules = [];
      const parse = (h) => String(h || '').split(',').filter(Boolean).map((x) => x.split(':').map(Number));
      for (const rn of String(res.headers.get('x-rate-limit-rules') || '').split(',').map((s) => s.trim()).filter(Boolean)) {
        const lim = parse(res.headers.get(`x-rate-limit-${rn}`));
        const st = parse(res.headers.get(`x-rate-limit-${rn}-state`));
        lim.forEach(([limit, period, penalty], i) => {
          const s = st.find((x) => x[1] === period) || st[i] || [0, period, 0];
          rules.push({ rule: rn, limit, period, penalty, count: s[0], at: now });
          if (s[2] > 0) p.blockedUntil = Math.max(p.blockedUntil, now + s[2] * 1000 + 1000);
        });
      }
      if (rules.length) p.rules = rules;
      const maxPeriod = Math.max(0, ...p.rules.map((r) => r.period)) * 1000;
      p.own = p.own.filter((t) => t > now - maxPeriod - 1000);
      if (res.status === 429) {
        const ra = Number(res.headers.get('retry-after')) || 60;
        p.blockedUntil = Math.max(p.blockedUntil, now + ra * 1000 + 1000);
        this.log('warn', `HTTP 429 on ${endpoint}; blocked for ${ra}s`);
      }
    }

    snapshot() {
      const out = {};
      for (const [name, p] of this.policies) out[name] = p.rules.map((r) => `${r.rule} ${r.count}/${r.limit} per ${r.period}s`);
      return out;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // HTTP client
  // ---------------------------------------------------------------------------------------------
  class Client {
    constructor(opts) {
      this.base = (opts.baseUrl || (IS_BROWSER ? '' : DEFAULT_BASE)).replace(/\/$/, '');
      this.userAgent = opts.userAgent;
      this.poesessid = opts.poesessid || null;
      this.auth = opts.auth; // 'auto' | 'anonymous' | 'session'
      this.useSession = opts.auth === 'session';
      this.log = opts.log;
      this.limiter = new RateLimiter(opts.log, { maxWaitMs: opts.maxWaitMs });
      this.maxRetries = opts.maxRetries;
      this.requests = 0;
    }

    authMode() { return this.useSession ? 'session' : 'anonymous'; }

    async request(endpoint, path, { method = 'GET', form = null, expect = 'json' } = {}) {
      for (let attempt = 0; ; attempt++) {
        await this.limiter.acquire(endpoint);
        const headers = {};
        const init = { method, headers };
        if (form) { init.body = new URLSearchParams(form).toString(); headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'; }
        if (IS_BROWSER) {
          init.credentials = this.useSession ? 'include' : 'omit';
          if (form) headers['X-Requested-With'] = 'XMLHttpRequest';
        } else {
          headers['User-Agent'] = this.userAgent;
          headers.Accept = expect === 'json' ? 'application/json' : 'text/html';
          if (this.useSession && this.poesessid) headers.Cookie = `POESESSID=${this.poesessid}`;
        }
        const sentAt = Date.now();
        let res;
        try {
          res = await fetch(this.base + path, init);
        } catch (e) {
          if (attempt < this.maxRetries) { this.log('warn', `network error on ${endpoint} (${e.message}); retrying`); await sleep(3000 * (attempt + 1)); continue; }
          throw e;
        }
        this.requests++; state.requests = this.requests;
        this.limiter.update(endpoint, res, sentAt);
        if ((res.status === 429 || res.status >= 500) && attempt < this.maxRetries) {
          if (res.status >= 500) await sleep(5000 * (attempt + 1));
          continue;
        }
        const text = await res.text();
        if (expect !== 'json') {
          if (!res.ok) throw httpError(res.status, path, text, null);
          return text;
        }
        let data = null;
        try { data = JSON.parse(text); } catch (_) { /* non-JSON (e.g. Cloudflare page) */ }
        if (!res.ok || data === null || (data && !Array.isArray(data) && data.error)) {
          const canSession = IS_BROWSER || !!this.poesessid;
          if ((res.status === 401 || res.status === 403) && this.auth === 'auto' && !this.useSession && canSession) {
            this.useSession = true;
            this.log('warn', `HTTP ${res.status} anonymously on ${endpoint}; switching to logged-in session`);
            continue;
          }
          throw httpError(res.status, path, text, data);
        }
        return data;
      }
    }
  }

  function httpError(status, path, text, data) {
    const apiMsg = data && data.error ? `${data.error.message || ''} (code ${data.error.code})` : '';
    let hint = '';
    if (status === 403 || status === 401) hint = data ? 'profile or characters tab is private: make it public, run in a logged-in browser, or pass POESESSID' : 'blocked (non-JSON response, likely Cloudflare): run from a residential IP or the browser';
    else if (status === 404) hint = 'not found: check account name (Name#1234), realm, or character name';
    else if (status === 429) hint = 'rate limited';
    else if (data === null && status === 200) hint = 'non-JSON response';
    const e = new Error(`HTTP ${status} ${path.split('?')[0]} ${apiMsg} ${hint ? '— ' + hint : ''}`.replace(/\s+/g, ' ').trim());
    e.status = status; e.body = String(text || '').slice(0, 300);
    e.fatal = status === 401 || status === 403;
    return e;
  }

  // ---------------------------------------------------------------------------------------------
  // Endpoints
  // ---------------------------------------------------------------------------------------------
  const q = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const api = {
    characters: (c, account, realm) => c.request('get-characters', `/character-window/get-characters?${q({ accountName: account, realm })}`),
    items: (c, account, realm, character) => c.request('get-items', '/character-window/get-items', { method: 'POST', form: { accountName: account, character, realm } }),
    passives: (c, account, realm, character) => c.request('get-passive-skills', `/character-window/get-passive-skills?${q({ accountName: account, realm, character })}`),
    leagues: (c, realm) => c.request('leagues', `/api/leagues?${q({ type: 'main', realm })}`),
    treeHtml: (c, variant) => c.request(`tree-${variant}`, variant === 'alternate' ? '/passive-skill-tree/alternate' : '/passive-skill-tree', { expect: 'html' }),
  };

  // ---------------------------------------------------------------------------------------------
  // Passive tree data
  // ---------------------------------------------------------------------------------------------
  function extractTreeJson(html) {
    const i0 = html.indexOf('passiveSkillTreeData');
    if (i0 < 0) return null;
    const start = html.indexOf('{', i0);
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) return JSON.parse(html.slice(start, i + 1));
    }
    return null;
  }

  function indexTree(data, variant) {
    const nodes = new Map();
    for (const [hash, n] of Object.entries(data.nodes || {})) { const h = Number(hash); if (Number.isFinite(h)) nodes.set(h, n); }
    const classes = (data.classes || []).map((c, i) => ({ id: i, name: c.name, ascendancies: (c.ascendancies || []).map((a, j) => ({ index: j + 1, id: a.id, name: a.name })) }));
    const ascByName = new Map();
    const ascNameById = new Map();
    for (const c of classes) for (const a of c.ascendancies) {
      const v = { classId: c.id, className: c.name, index: a.index, id: a.id, name: a.name };
      ascByName.set(a.name.toLowerCase(), v);
      ascNameById.set(a.id, a.name);
    }
    const bloodlines = (data.alternate_ascendancies || []).map((a, j) => ({ index: j + 1, id: a.id, name: a.name }));
    const bloodlineNameById = new Map(bloodlines.map((b) => [b.id, b.name]));
    return { variant, tree: data.tree || null, nodes, classes, ascByName, ascNameById, bloodlines, bloodlineNameById, jewelSlots: data.jewelSlots || [], points: data.points || null };
  }

  // Keep only what normalization needs (6.6 MB page -> ~0.7 MB JSON).
  function compactTree(d) {
    const keep = ['name', 'stats', 'isKeystone', 'isNotable', 'isMastery', 'masteryEffects', 'isJewelSocket', 'ascendancyName', 'isAscendancyStart', 'isBloodline', 'classStartIndex'];
    const nodes = {};
    for (const [h, n] of Object.entries(d.nodes || {})) { const o = {}; for (const k of keep) if (n[k] !== undefined) o[k] = n[k]; nodes[h] = o; }
    return { tree: d.tree, classes: d.classes, alternate_ascendancies: d.alternate_ascendancies, jewelSlots: d.jewelSlots, points: d.points, nodes };
  }

  async function loadTree(client, variant, source, log, cacheDir, cacheTtlMs) {
    const fs = !IS_BROWSER && cacheDir ? require('fs') : null;
    const cacheFile = fs ? require('path').join(cacheDir, `tree-${variant}.json`) : null;
    try {
      if (cacheFile && !source && fs.existsSync(cacheFile) && Date.now() - fs.statSync(cacheFile).mtimeMs < cacheTtlMs) {
        const t = indexTree(JSON.parse(fs.readFileSync(cacheFile, 'utf8')), variant);
        log('info', `loaded ${variant} passive tree from cache (${t.nodes.size} nodes)`);
        return t;
      }
    } catch (e) { log('warn', `tree cache unreadable (${e.message}); refetching`); }
    try {
      let data;
      if (source && typeof source === 'object') data = source;
      else if (typeof source === 'string' && !IS_BROWSER && !/^https?:/.test(source)) data = JSON.parse(require('fs').readFileSync(source, 'utf8'));
      else if (typeof source === 'string') { const r = await fetch(source); data = await r.json(); }
      else data = extractTreeJson(await api.treeHtml(client, variant));
      if (!data || !data.nodes) throw new Error('no passiveSkillTreeData found');
      data = compactTree(data);
      if (cacheFile) { try { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(data)); } catch (e) { log('warn', `could not write tree cache: ${e.message}`); } }
      const t = indexTree(data, variant);
      log('info', `loaded ${variant} passive tree (${t.nodes.size} nodes)`);
      return t;
    } catch (e) {
      log('warn', `could not load ${variant} passive tree: ${e.message} — passives exported without names`);
      return null;
    }
  }

  function nodeKind(n) {
    if (n.classStartIndex !== undefined) return 'class_start';
    if (n.isAscendancyStart) return 'ascendancy_start';
    if (n.isBloodline) return n.isNotable ? 'bloodline_notable' : 'bloodline';
    if (n.ascendancyName) return n.isNotable ? 'ascendancy_notable' : 'ascendancy';
    if (n.isKeystone) return 'keystone';
    if (n.isMastery) return 'mastery';
    if (n.isJewelSocket) return 'jewel_socket';
    if (n.isNotable) return 'notable';
    return 'small';
  }

  // ---------------------------------------------------------------------------------------------
  // Items
  // ---------------------------------------------------------------------------------------------
  const modText = (m) => stripMarkup(typeof m === 'string' ? m : (m && (m.description ?? m.text)) ?? JSON.stringify(m));
  // Newer payloads fold crafted/fractured/mutated mods into explicitMods as {description, flags:{crafted:true}}.
  function collectMods(it) {
    const mods = {};
    const add = (bucket, text) => { (mods[bucket] = mods[bucket] || []).push(text); };
    for (const [k, v] of Object.entries(it)) {
      if (!/Mods$/.test(k) || !Array.isArray(v)) continue;
      const bucket = k.replace(/Mods$/, '');
      for (const m of v) {
        const flag = m && typeof m === 'object' && m.flags ? Object.keys(m.flags).find((f) => m.flags[f]) : null;
        add(flag || bucket, modText(m));
      }
    }
    return mods;
  }

  function flattenProps(list) {
    const out = {};
    for (const p of list || []) {
      const vals = (p.values || []).map((v) => stripMarkup(String(v[0])));
      const name = stripMarkup(String(p.name || ''));
      if (/\{\d+\}/.test(name)) out[name.replace(/\{(\d+)\}/g, (_, i) => vals[Number(i)] ?? '')] = true;
      else out[name] = vals.length ? vals.join(', ') : true;
    }
    return out;
  }

  function slotLabel(it) {
    const id = it.inventoryId;
    if (id === 'Flask') return `Flask ${Number(it.x) + 1}`;
    if (id === 'Weapon2') return 'Weapon (swap)';
    if (id === 'Offhand2') return 'Offhand (swap)';
    return id;
  }

  function normalizeItem(it) {
    const mods = collectMods(it);
    const flags = {};
    for (const f of ITEM_FLAGS) if (it[f] !== undefined && it[f] !== false) flags[f] = it[f];
    const sockets = it.sockets || [];
    const groups = new Map();
    sockets.forEach((s, i) => { if (!groups.has(s.group)) groups.set(s.group, []); groups.get(s.group).push({ i, colour: s.sColour || s.attr }); });
    const socketed = (it.socketedItems || []).map((g) => ({
      name: stripMarkup(g.typeLine || g.baseType || g.name),
      tags: (() => { const p0 = (g.properties || [])[0]; return p0 && !(p0.values || []).length && p0.name ? stripMarkup(p0.name).split(',').map((x) => x.trim()).filter(Boolean) : []; })(),
      kind: g.abyssJewel ? 'abyss_jewel' : (g.frameType === 4 || g.support !== undefined ? 'gem' : 'item'),
      support: g.support === true,
      level: int((g.properties || []).find((p) => p.name === 'Level')?.values?.[0]?.[0]),
      quality: int((g.properties || []).find((p) => p.name === 'Quality')?.values?.[0]?.[0]),
      corrupted: !!g.corrupted,
      colour: g.colour || null,
      socket: g.socket ?? null,
      group: sockets[g.socket]?.group ?? null,
      links: sockets[g.socket] ? (groups.get(sockets[g.socket].group) || []).length : null,
      icon: g.icon || null,
    }));
    return {
      slot: slotLabel(it),
      inventory_id: it.inventoryId,
      x: it.x, y: it.y, w: it.w, h: it.h,
      swap: it.inventoryId === 'Weapon2' || it.inventoryId === 'Offhand2',
      id: it.id || null,
      name: stripMarkup(it.name || '') || null,
      type_line: stripMarkup(it.typeLine || ''),
      base_type: stripMarkup(it.baseType || it.typeLine || ''),
      rarity: it.rarity || RARITY_BY_FRAME[it.frameType] || null,
      frame_type: it.frameType ?? null,
      ilvl: it.ilvl ?? null,
      identified: it.identified !== false,
      league: it.league || null,
      icon: it.icon || null,
      influences: Object.keys(it.influences || {}),
      flags,
      properties: flattenProps(it.properties),
      requirements: flattenProps(it.requirements),
      mods,
      sockets: [...groups.values()].map((g) => g.map((s) => s.colour).join('-')).join(' ') || null,
      links: groups.size ? Math.max(...[...groups.values()].map((g) => g.length)) : 0,
      socketed,
    };
  }

  // Heuristic: the active gem with the most linked supports, penalising utility tags (auras, guards, warcries,
  // movement, curses, triggers). Ties: body armour > weapon > helm > gloves > boots.
  const UTILITY_TAGS = new Set(['Aura', 'Guard', 'Warcry', 'Movement', 'Travel', 'Blink', 'Curse', 'Hex', 'Mark', 'Link', 'Herald', 'Stance', 'Banner', 'Trigger', 'Blessing']);
  const SLOT_RANK = { BodyArmour: 5, Weapon: 4, Offhand: 3, Helm: 3, Gloves: 2, Boots: 1 };
  function mainSkill(equipment) {
    let best = null;
    for (const it of equipment) {
      if (it.swap) continue;
      const byGroup = new Map();
      for (const g of it.socketed) if (g.kind === 'gem' && g.group !== null) { if (!byGroup.has(g.group)) byGroup.set(g.group, []); byGroup.get(g.group).push(g); }
      for (const gems of byGroup.values()) {
        const supports = gems.filter((g) => g.support);
        const links = gems[0].links ?? gems.length;
        for (const g of gems.filter((x) => !x.support)) {
          const utility = g.tags.some((t) => UTILITY_TAGS.has(t));
          const score = supports.length * 100 + links * 10 + (SLOT_RANK[it.inventory_id] || 0) - (utility ? 450 : 0);
          if (!best || score > best.score) best = { score, skill: g.name, utility, slot: it.slot, links, supports: supports.map((x) => x.name), linked_actives: gems.filter((x) => !x.support).map((x) => x.name) };
        }
      }
    }
    if (best) delete best.score;
    return best;
  }

  // ---------------------------------------------------------------------------------------------
  // League helpers + origin inference
  // ---------------------------------------------------------------------------------------------
  function parseLeague(name) {
    const tokens = String(name || '').trim().split(/\s+/).filter(Boolean);
    let ssf = false, hardcore = false, ruthless = false;
    const rest = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i].toLowerCase();
      if (t === 'ssf') ssf = true;
      else if (t === 'solo' && (tokens[i + 1] || '').toLowerCase() === 'self-found') { ssf = true; i++; }
      else if (t === 'hc' || t === 'hardcore') hardcore = true;
      else if (t === 'ruthless' || (t === 'r' && (ssf || hardcore))) ruthless = true;
      else rest.push(tokens[i]);
    }
    const base = rest.join(' ');
    const permanent = !base || /^standard$/i.test(base);
    return { base: permanent ? 'Standard' : base, ssf, hardcore, ruthless, permanent };
  }

  // Origin league is not exposed by the API. A non-permanent current league is the origin (certain). For characters
  // in permanent leagues the best proxy is the challenge league running at lastLoginTime — right for characters
  // retired when their league ended, wrong for characters played in Standard afterwards. A character in a permanent
  // league whose last login falls inside a league that is still live cannot have come from that league.
  function inferOrigin(league, lastLoginUnix, calendar, active, nowMs) {
    const lf = parseLeague(league);
    const now = nowMs ?? Date.now();
    const meta = (row) => (row ? { league_full: row[1], version: row[2] } : {});
    const out = (row, basis, confidence, candidates) => ({ league: row ? row[0] : null, ...meta(row), basis, confidence, candidates: candidates.map((r) => r[0]) });
    if (!lf.permanent) {
      const row = calendar.find((r) => r[0] === lf.base);
      return { league: lf.base, ...meta(row), basis: 'current_league', confidence: 'certain', candidates: [lf.base] };
    }
    const t = Number(lastLoginUnix) * 1000;
    if (!(t > 0)) return out(null, 'no_last_login', 'none', []);
    const challenges = calendar.filter((r) => r[3] === 'challenge').sort((a, b) => Date.parse(a[4]) - Date.parse(b[4]));
    let idx = -1;
    challenges.forEach((r, i) => { if (t >= Date.parse(r[4])) idx = i; });
    const events = calendar.filter((r) => r[3] === 'event' && r[5] && t >= Date.parse(r[4]) && t < Date.parse(r[5]));
    if (idx < 0) return events.length ? out(events[0], 'last_login_window', 'weak', events) : out(null, 'last_login_before_calendar', 'none', []);
    const L = challenges[idx];
    const end = L[5] ? Date.parse(L[5]) : null;
    const live = active ? active.has(L[0]) : (!end && !challenges[idx + 1]);
    if (live && (end === null || t < end)) {
      const endedEvents = events.filter((r) => Date.parse(r[5]) <= now);
      return endedEvents.length ? out(endedEvents[0], 'last_login_window', 'weak', endedEvents) : { ...out(null, 'played_in_permanent_league_while_league_live', 'none', []), excluded: L[0] };
    }
    if (end === null || t < end) return out(L, 'last_login_window', events.length ? 'ambiguous' : 'likely', [L, ...events]);
    return out(L, 'last_login_after_league_end', 'weak', [L, ...events]);
  }

  // Many permanent-league characters last logged in within a short span (e.g. an account-wide stash/gear pass) means
  // those timestamps reflect maintenance, not the league they were played in: downgrade to 'weak'.
  function flagLoginBatches(characters, windowHours = 36, minBatch = 5) {
    const perm = characters.filter((c) => c.league_flags?.permanent && c.last_login_unix);
    for (const c of perm) {
      if (!c.origin_league || !['likely', 'ambiguous'].includes(c.origin_league.confidence)) continue;
      const n = perm.filter((o) => Math.abs(o.last_login_unix - c.last_login_unix) <= windowHours * 3600).length;
      if (n >= minBatch) c.origin_league = { ...c.origin_league, confidence: 'weak', batch_logins: n };
    }
    return characters;
  }

  // Live leagues from /api/leagues → active challenge-league names and calendar rows missing from LEAGUE_CALENDAR.
  function leaguesFromApi(list, calendar, nowMs) {
    const rows = new Map();
    for (const l of Array.isArray(list) ? list : []) {
      const cat = l.category?.id || l.id;
      const isEvent = !!l.event;
      if (!isEvent && (cat === 'Standard' || parseLeague(l.id).permanent)) continue;
      const key = isEvent && cat === 'Standard' ? l.id : cat;
      const r = rows.get(key) || { key, type: isEvent ? 'event' : 'challenge', start: null, end: undefined };
      if (l.startAt && (!r.start || l.startAt < r.start)) r.start = l.startAt;
      r.end = r.end === null || !l.endAt ? null : (r.end === undefined || l.endAt > r.end ? l.endAt : r.end);
      rows.set(key, r);
    }
    const known = new Set(calendar.map((r) => r[0]));
    const active = [...rows.values()].filter((r) => r.type === 'challenge' && r.start && Date.parse(r.start) <= nowMs && (!r.end || Date.parse(r.end) > nowMs)).map((r) => r.key);
    const additions = [...rows.values()].filter((r) => r.start && !known.has(r.key) && (r.type === 'challenge' || r.end)).map((r) => [r.key, r.key, null, r.type, r.start, r.end || null]);
    return { active, additions };
  }

  // ---------------------------------------------------------------------------------------------
  // Passives
  // ---------------------------------------------------------------------------------------------
  function b64url(bytes) {
    const b64 = typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : btoa(String.fromCharCode(...bytes));
    return b64.replace(/\+/g, '-').replace(/\//g, '_');
  }

  // Official v6 tree code: version(4) class(1) ascendancy|bloodline<<2 (1) n(1) nodes(2n) clusterN(1) cluster(2) masteryN(1) [effect,node](4)
  function treeUrl({ classId, ascIndex, bloodlineIndex, hashes, hashesEx, masteryEffects, variant, account, character }) {
    if (!Number.isInteger(classId)) return null;
    const nodes = [...new Set(hashes)].filter((h) => h > 0 && h < 65536).sort((a, b) => a - b);
    const cluster = [...new Set(hashesEx)].filter((h) => h >= 0 && h < 65536);
    const mast = Object.entries(masteryEffects || {}).map(([node, eff]) => [Number(eff), Number(node)]).filter(([e, n]) => e >= 0 && e < 65536 && n > 0 && n < 65536);
    if (nodes.length > 255 || cluster.length > 255 || mast.length > 255) return null;
    const bytes = [0, 0, 0, 6, classId & 255, (((ascIndex || 0) & 3) | ((bloodlineIndex || 0) << 2)) & 255, nodes.length];
    for (const h of nodes) bytes.push(h >> 8, h & 255);
    bytes.push(cluster.length);
    for (const h of cluster) bytes.push(h >> 8, h & 255);
    bytes.push(mast.length);
    for (const [e, n] of mast) bytes.push(e >> 8, e & 255, n >> 8, n & 255);
    return `${DEFAULT_BASE}/fullscreen-passive-skill-tree/${variant === 'alternate' ? 'alternate/' : ''}${b64url(bytes)}?${q({ accountName: account, characterName: character })}`;
  }

  function resolveClass(listEntry, passives, trees) {
    const name = String(listEntry.class || '');
    const lower = name.toLowerCase();
    const classId = Number.isInteger(passives?.character) ? passives.character : (BASE_CLASSES.includes(name) ? BASE_CLASSES.indexOf(name) : null);
    const ascIndex = Number.isInteger(passives?.ascendancy) ? passives.ascendancy : 0;
    const bloodIndex = Number.isInteger(passives?.alternate_ascendancy) ? passives.alternate_ascendancy : 0;
    let variant = 'default';
    if (BASE_CLASSES.includes(name) || trees.default?.ascByName.has(lower)) variant = 'default';
    else if (trees.alternate?.ascByName.has(lower) || KNOWN_ALT_ASCENDANCIES.has(name)) variant = 'alternate';
    const tree = trees[variant] || null;
    const bloodline = bloodIndex > 0 ? (trees.default?.bloodlines[bloodIndex - 1]?.name || tree?.bloodlines[bloodIndex - 1]?.name || `#${bloodIndex}`) : null;
    return {
      base_class: classId !== null ? BASE_CLASSES[classId] ?? null : null,
      ascendancy: BASE_CLASSES.includes(name) || !name ? null : name,
      bloodline,
      tree_variant: variant,
      class_id: classId, ascendancy_id: ascIndex, bloodline_id: bloodIndex,
      tree,
    };
  }

  function normalizePassives(p, cls, tree, account, character) {
    if (!p) return null;
    const hashes = [...(p.hashes || [])].map(Number).sort((a, b) => a - b);
    const hashesEx = [...(p.hashes_ex || [])].map(Number);
    const mastery = p.mastery_effects && !Array.isArray(p.mastery_effects) ? p.mastery_effects : {};
    const overrides = p.skill_overrides && !Array.isArray(p.skill_overrides) ? p.skill_overrides : {};
    const jewelData = p.jewel_data && !Array.isArray(p.jewel_data) ? p.jewel_data : {};
    const clusterNodes = new Map();
    for (const jd of Object.values(jewelData)) for (const [h, n] of Object.entries(jd?.subgraph?.nodes || {})) clusterNodes.set(Number(h), n);

    const counts = { allocated: hashes.length + hashesEx.length };
    const bump = (k) => { counts[k] = (counts[k] || 0) + 1; };
    const nodes = [];
    for (const h of hashes) {
      const n = tree?.nodes.get(h);
      const ov = overrides[String(h)];
      const e = { hash: h, name: null, kind: tree ? 'unknown' : null, stats: [] };
      if (n) {
        e.name = n.name; e.kind = nodeKind(n); e.stats = n.stats || [];
        if (n.ascendancyName) e.ascendancy = tree.ascNameById.get(n.ascendancyName) || tree.bloodlineNameById.get(n.ascendancyName) || n.ascendancyName;
        if (n.isMastery) {
          const eff = mastery[String(h)];
          const me = (n.masteryEffects || []).find((m) => m.effect === eff);
          e.mastery_effect = eff ?? null; e.stats = me ? me.stats : [];
        }
      }
      if (ov) { e.tattoo = true; e.name = stripMarkup(ov.name) || e.name; if (ov.stats) e.stats = ov.stats; if (ov.isKeystone) e.kind = 'keystone'; }
      e.stats = (e.stats || []).map(stripMarkup);
      bump(e.kind || 'unresolved');
      nodes.push(e);
    }
    for (const h of hashesEx) {
      const n = clusterNodes.get(h);
      const kind = n ? (n.isKeystone ? 'cluster_keystone' : n.isNotable ? 'cluster_notable' : n.isJewelSocket ? 'cluster_jewel_socket' : 'cluster_small') : 'cluster_small';
      nodes.push({ hash: h, name: n?.name ?? (n?.isJewelSocket ? 'Jewel Socket' : null), kind, stats: (n?.stats || []).map(stripMarkup) });
      bump(kind);
    }
    const names = (kinds) => nodes.filter((n) => kinds.includes(n.kind) && n.name).map((n) => n.name);
    const jewels = (p.items || []).map((it) => ({ ...normalizeItem(it), socket_index: it.x, socket_hash: tree?.jewelSlots?.[it.x] ?? null }));
    return {
      tree_variant: cls.tree_variant,
      tree_url: treeUrl({ classId: cls.class_id, ascIndex: cls.ascendancy_id, bloodlineIndex: cls.bloodline_id, hashes, hashesEx, masteryEffects: mastery, variant: cls.tree_variant, account, character }),
      counts,
      keystones: names(['keystone', 'cluster_keystone']),
      notables: names(['notable', 'cluster_notable']),
      ascendancy_notables: names(['ascendancy_notable']),
      bloodline_nodes: names(['bloodline', 'bloodline_notable']),
      masteries: nodes.filter((n) => n.kind === 'mastery').map((n) => ({ name: n.name, effect_id: n.mastery_effect ?? null, stats: n.stats })),
      tattoos: nodes.filter((n) => n.tattoo).map((n) => ({ hash: n.hash, name: n.name, stats: n.stats })),
      jewels,
      nodes,
      hashes, hashes_ex: hashesEx, mastery_effects: mastery,
    };
  }

  function normalizeCharacter(entry, raw, trees, ctx) {
    const items = raw.items?.items || [];
    const cls = resolveClass(entry, raw.passives, trees);
    const equipment = items.filter((it) => !/Inventory$/.test(it.inventoryId)).map(normalizeItem);
    const lf = parseLeague(entry.league);
    return {
      name: entry.name,
      realm: entry.realm || ctx.realm,
      league: entry.league,
      level: entry.level,
      class: entry.class,
      base_class: cls.base_class,
      ascendancy: cls.ascendancy,
      bloodline: cls.bloodline,
      last_login: toIso(entry.lastLoginTime),
      last_login_unix: entry.lastLoginTime ?? null,
      league_flags: { permanent: lf.permanent, hardcore: lf.hardcore, ssf: lf.ssf, ruthless: lf.ruthless },
      origin_league: { ...inferOrigin(entry.league, entry.lastLoginTime, ctx.calendar, ctx.activeLeagues), ssf: lf.ssf, hardcore: lf.hardcore, ruthless: lf.ruthless },
      gold: raw.items?.inventory?.gold ?? null,
      main_skill: mainSkill(equipment),
      uniques: equipment.filter((i) => i.rarity === 'Unique').map((i) => i.name),
      equipment,
      passives: normalizePassives(raw.passives, cls, cls.tree, ctx.account, entry.name),
      fetched_at: raw.fetched_at || null,
      ...(raw.stale ? { stale: true } : {}),
      ...(raw.failed ? { failed: true } : {}),
      ...(ctx.includeRaw ? { raw: { character: raw.character, items: raw.items, passives: raw.passives, fetched_at: raw.fetched_at } } : {}),
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Orchestration
  // ---------------------------------------------------------------------------------------------
  function resolveOptions(o = {}) {
    const account = normalizeAccount(o.account) || (IS_BROWSER ? detectAccountFromUrl(location.href) : null);
    if (!account) throw new Error('account is required, e.g. { account: "Name#1234" }');
    if (IS_BROWSER && !o.baseUrl && !/(^|\.)pathofexile\.com$/.test(location.hostname)) throw new Error('run this on a https://www.pathofexile.com page (same-origin requests)');
    return {
      account,
      realm: o.realm || 'pc',
      previous: o.previous || null,
      full: !!o.full,
      includeRaw: o.raw !== false,
      tree: o.tree !== false,
      treeDefault: o.treeDefault || null,
      treeAlternate: o.treeAlternate || null,
      only: o.only ? new Set([].concat(o.only)) : null,
      leagues: o.leagues ? new Set([].concat(o.leagues)) : null,
      auth: o.auth || 'auto',
      poesessid: o.poesessid || null,
      userAgent: o.userAgent || `poe-char-export/${VERSION} (+personal dashboard)`,
      baseUrl: o.baseUrl || null,
      maxWaitMs: o.maxWaitMs ?? 20 * 60 * 1000,
      maxRetries: o.maxRetries ?? 3,
      calendar: o.calendar || LEAGUE_CALENDAR,
      leaguesApi: o.leaguesApi !== false,
      refreshRecentHours: o.refreshRecentHours ?? 12,
      treeCacheDir: o.treeCacheDir || null,
      treeCacheTtlMs: o.treeCacheTtlMs ?? 24 * 3600 * 1000,
      log: makeLogger(o.logSink === undefined ? (IS_BROWSER ? (lvl, line) => console[lvl === 'warn' ? 'warn' : 'log'](line) : null) : o.logSink),
    };
  }

  async function run(options) {
    const t0 = Date.now();
    const o = resolveOptions(options);
    const client = new Client(o);
    Object.assign(state, { phase: 'list', done: 0, total: 0, current: null, requests: 0, log: [] });
    const { account, realm, log } = o;
    log('info', `account ${account} realm ${realm}`);

    const list = await api.characters(client, account, realm);
    if (!Array.isArray(list)) throw new Error('unexpected get-characters response');
    const prevAdditions = (o.previous?.leagues?.calendar_additions || []).filter((r) => Array.isArray(r) && r.length === 6);
    let calendar = [...o.calendar, ...prevAdditions.filter((r) => !o.calendar.some((c) => c[0] === r[0]))];
    let activeLeagues = null;
    if (o.leaguesApi) {
      try {
        const live = leaguesFromApi(await api.leagues(client, realm), calendar, Date.now());
        activeLeagues = new Set(live.active);
        calendar = [...calendar, ...live.additions];
        log('info', `live challenge leagues: ${live.active.join(', ') || 'none'}${live.additions.length ? `; added to calendar: ${live.additions.map((r) => r[0]).join(', ')}` : ''}`);
      } catch (e) { log('warn', `league list unavailable (${e.message}); assuming newest calendar league is live`); }
    }
    const targets = list.filter((c) => (!o.only || o.only.has(c.name)) && (!o.leagues || o.leagues.has(c.league)));
    const prev = o.previous && o.previous.schema_version === SCHEMA_VERSION && o.previous.account === account && o.previous.realm === realm ? o.previous : null;
    const prevByName = new Map((prev?.characters || []).map((c) => [c.name, c]));
    log('info', `${list.length} characters listed, ${targets.length} selected${prev ? ', incremental against previous export' : ''}`);

    state.phase = 'characters'; state.total = targets.length;
    const rows = [];
    const errors = [];
    let fetched = 0, reused = 0, abort = null;
    for (const c of targets) {
      state.current = c.name;
      const p = prevByName.get(c.name);
      const same = p && !p.stale && !p.failed && !p.normalize_error && p.last_login_unix === c.lastLoginTime && p.level === c.level && p.league === c.league && p.class === c.class;
      // lastLoginTime only moves on login, so gear/passive changes during a session are invisible: always refetch recently played characters
      const recent = o.refreshRecentHours > 0 && c.lastLoginTime && Date.now() / 1000 - c.lastLoginTime < o.refreshRecentHours * 3600;
      const reusable = same && !recent && ((p.raw && p.raw.items && p.raw.passives) || (prev.exporter?.version === VERSION && p.passives !== undefined));
      if (!o.full && reusable) {
        rows.push({ entry: c, raw: { ...p.raw, character: c }, prevNormalized: p, reused: true });
        reused++; state.done++; continue;
      }
      if (abort) {
        rows.push(p?.raw ? { entry: c, raw: { ...p.raw, character: c, stale: true } } : { entry: c, raw: { character: c, items: null, passives: null, failed: true } });
        errors.push({ character: c.name, error: `skipped: ${abort}` });
        state.done++; continue;
      }
      try {
        const items = await api.items(client, account, realm, c.name);
        const passives = await api.passives(client, account, realm, c.name);
        rows.push({ entry: c, raw: { character: c, items, passives, fetched_at: new Date().toISOString() } });
        fetched++;
        log('info', `${state.done + 1}/${targets.length} ${c.name}: ${(items.items || []).length} items, ${(passives.hashes || []).length} passives`);
      } catch (e) {
        errors.push({ character: c.name, status: e.status ?? null, error: e.message });
        log('warn', `${c.name}: ${e.message}`);
        rows.push(p?.raw ? { entry: c, raw: { ...p.raw, character: c, stale: true } } : { entry: c, raw: { character: c, items: null, passives: null, failed: true } });
        if (e.fatal || e.code === 'RATE_LIMIT_WAIT') abort = e.message;
      }
      state.done++;
    }

    // Normalize (reuse previous normalized output when the character and exporter version are unchanged)
    state.phase = 'normalize';
    const needNormalize = rows.filter((r) => (r.raw.items || r.raw.passives || r.raw.failed) && !(r.reused && prev.exporter?.version === VERSION && (!o.tree || prev.tree_data?.default)));
    const trees = { default: null, alternate: null };
    if (o.tree && needNormalize.length) {
      trees.default = await loadTree(client, 'default', o.treeDefault, log, o.treeCacheDir, o.treeCacheTtlMs);
      const needsAlt = needNormalize.some((r) => { const n = String(r.entry.class || ''); return !BASE_CLASSES.includes(n) && !(trees.default?.ascByName.has(n.toLowerCase())); });
      if (needsAlt) trees.alternate = await loadTree(client, 'alternate', o.treeAlternate, log, o.treeCacheDir, o.treeCacheTtlMs);
    }
    const ctx = { account, realm, calendar, activeLeagues, includeRaw: o.includeRaw };
    const characters = rows.map((r) => {
      if (needNormalize.includes(r)) {
        try { return normalizeCharacter(r.entry, r.raw, trees, ctx); } catch (e) {
          log('warn', `${r.entry.name}: normalization failed: ${e.message}`);
          errors.push({ character: r.entry.name, error: `normalize: ${e.message}` });
          return { name: r.entry.name, realm: r.entry.realm || realm, league: r.entry.league, level: r.entry.level, class: r.entry.class, last_login_unix: r.entry.lastLoginTime ?? null, normalize_error: e.message, raw: r.raw };
        }
      }
      const c = { ...r.prevNormalized, origin_league: { ...inferOrigin(r.entry.league, r.entry.lastLoginTime, calendar, activeLeagues), ssf: r.prevNormalized.league_flags?.ssf, hardcore: r.prevNormalized.league_flags?.hardcore, ruthless: r.prevNormalized.league_flags?.ruthless } };
      if (!o.includeRaw) delete c.raw;
      return c;
    });
    characters.sort((a, b) => (b.last_login_unix || 0) - (a.last_login_unix || 0));
    flagLoginBatches(characters);

    const listed = new Set(list.map((c) => c.name));
    const result = {
      schema_version: SCHEMA_VERSION,
      exporter: { name: 'poe-char-export', version: VERSION },
      generated_at: new Date().toISOString(),
      account, realm,
      source: 'pathofexile.com/character-window (get-characters, get-items, get-passive-skills)',
      auth: client.authMode(),
      tree_data: {
        default: trees.default ? { tree: trees.default.tree, nodes: trees.default.nodes.size } : (prev && !needNormalize.length ? prev.tree_data?.default ?? null : null),
        alternate: trees.alternate ? { tree: trees.alternate.tree, nodes: trees.alternate.nodes.size } : (prev && !needNormalize.length ? prev.tree_data?.alternate ?? null : null),
      },
      stats: { listed: list.length, exported: characters.length, fetched, reused, failed: errors.length, requests: client.requests, rate_limit_wait_s: Math.round(client.limiter.waitedMs / 1000), elapsed_s: Math.round((Date.now() - t0) / 1000) },
      rate_limits: client.limiter.snapshot(),
      leagues: { live: activeLeagues ? [...activeLeagues] : null, calendar_additions: calendar.filter((r) => !o.calendar.some((c) => c[0] === r[0])) },
      removed_since_previous: prev ? prev.characters.map((c) => c.name).filter((n) => !listed.has(n)) : [],
      errors,
      characters,
    };
    state.phase = 'done'; state.current = null;
    log('info', `done: ${fetched} fetched, ${reused} reused, ${errors.length} errors, ${client.requests} requests, ${result.stats.elapsed_s}s`);
    return result;
  }

  // ---------------------------------------------------------------------------------------------
  // Outputs
  // ---------------------------------------------------------------------------------------------
  function toCsv(result) {
    const cols = ['name', 'league', 'origin_league', 'origin_basis', 'origin_confidence', 'hardcore', 'ssf', 'ruthless', 'base_class', 'ascendancy', 'bloodline', 'level', 'last_login', 'main_skill', 'main_links', 'keystones', 'uniques', 'tree_url'];
    const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = result.characters.map((c) => [c.name, c.league, c.origin_league?.league, c.origin_league?.basis, c.origin_league?.confidence, c.league_flags?.hardcore, c.league_flags?.ssf, c.league_flags?.ruthless,
      c.base_class, c.ascendancy, c.bloodline, c.level, c.last_login, c.main_skill?.skill, c.main_skill?.links, (c.passives?.keystones || []).join('; '), (c.uniques || []).join('; '), c.passives?.tree_url].map(esc).join(','));
    return [cols.join(','), ...rows].join('\n') + '\n';
  }

  function download(result, filename, pretty = false) {
    const name = filename || `poe-characters-${String(result.account).replace(/[^\w-]+/g, '_')}-${result.generated_at.slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify(result, null, pretty ? 2 : 0)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 10000);
    return name;
  }

  async function exportToFile(options = {}) {
    const result = await run(options);
    download(result, options.filename, options.pretty);
    return result;
  }

  // ---------------------------------------------------------------------------------------------
  // CLI
  // ---------------------------------------------------------------------------------------------
  const USAGE = `poe-char-export ${VERSION}
Usage: node poe-char-export.js --account "Name#1234" [options]

  --account NAME#1234     account (profile URL form Name-1234 also accepted)
  --realm pc|xbox|sony    default pc
  --out FILE              JSON output (default poe-characters.json); existing file enables incremental sync
  --csv FILE              also write a one-row-per-character CSV summary
  --full                  ignore previous output, refetch every character
  --refresh-recent-hours N  refetch characters logged into within N hours even if unchanged (default 12; 0 = off)
  --only "A,B"            only these character names
  --leagues "Standard,X"  only characters currently in these leagues
  --no-raw                omit raw API payloads (smaller file; disables re-normalization without refetch)
  --no-tree               skip passive tree download (no node names, keystones, masteries)
  --no-leagues-api        don't read /api/leagues (live-league detection for origin inference)
  --tree-default FILE|URL  passive tree JSON instead of scraping /passive-skill-tree
  --tree-alternate FILE|URL
  --tree-cache DIR        passive tree cache (default: .poe-tree-cache next to --out); --no-tree-cache disables
  --tree-cache-hours N    cache lifetime (default 24)
  --auth auto|anonymous|session   default auto (anonymous, falls back to POESESSID on 401/403)
  --poesessid ID          session cookie for private profiles (or env POESESSID)
  --user-agent STRING     identify your tool/contact to GGG
  --max-wait SECONDS      abort instead of waiting longer than this on rate limits (default 1200)
  --pretty                indented JSON (default minified)
  --quiet                 only warnings/errors
  --base-url URL          override https://www.pathofexile.com (testing)
Exit codes: 0 ok, 2 finished with per-character errors, 1 fatal.`;

  function parseArgs(argv) {
    const a = {};
    for (let i = 0; i < argv.length; i++) {
      const t = argv[i];
      if (!t.startsWith('--')) continue;
      const eq = t.indexOf('=');
      let key = t.slice(2, eq > 0 ? eq : undefined), val;
      if (eq > 0) val = t.slice(eq + 1);
      else if (key.startsWith('no-')) { key = key.slice(3); val = false; }
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) val = argv[++i];
      else val = true;
      a[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = val;
    }
    return a;
  }

  async function cli(argv) {
    const fs = require('fs');
    const path = require('path');
    const a = parseArgs(argv);
    if (a.help || !a.account) { console.log(USAGE); return a.help ? 0 : 1; }
    const out = a.out || 'poe-characters.json';
    let previous = null;
    if (!a.full && fs.existsSync(out)) {
      try { previous = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) { console.error(`warning: ignoring unreadable ${out}: ${e.message}`); }
    }
    const split = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : null);
    const result = await run({
      account: a.account, realm: a.realm, previous, full: !!a.full, raw: a.raw !== false, tree: a.tree !== false,
      treeDefault: a.treeDefault, treeAlternate: a.treeAlternate,
      treeCacheDir: a.treeCache === false ? null : (typeof a.treeCache === 'string' ? a.treeCache : path.join(path.dirname(path.resolve(out)), '.poe-tree-cache')),
      treeCacheTtlMs: a.treeCacheHours ? Number(a.treeCacheHours) * 3600 * 1000 : undefined, only: split(a.only), leagues: split(a.leagues),
      leaguesApi: a.leaguesApi !== false, refreshRecentHours: a.refreshRecentHours !== undefined ? Number(a.refreshRecentHours) : undefined, auth: a.auth, poesessid: a.poesessid || process.env.POESESSID, userAgent: a.userAgent, baseUrl: a.baseUrl,
      maxWaitMs: a.maxWait ? Number(a.maxWait) * 1000 : undefined,
      logSink: (lvl, line) => { if (!a.quiet || lvl !== 'info') console.error(line); },
    });
    const write = (file, text) => { const tmp = `${file}.tmp-${process.pid}`; fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); };
    write(out, JSON.stringify(result, null, a.pretty ? 2 : 0));
    if (a.csv) write(a.csv, toCsv(result));
    console.error(`wrote ${out}${a.csv ? ` and ${a.csv}` : ''}: ${result.stats.exported} characters (${result.stats.fetched} fetched, ${result.stats.reused} reused, ${result.stats.failed} errors)`);
    return result.errors.length ? 2 : 0;
  }

  const PoeExport = { VERSION, SCHEMA_VERSION, LEAGUE_CALENDAR, state, run, exportToFile, download, toCsv, cli,
    _internal: { flagLoginBatches, compactTree, leaguesFromApi, normalizeItem, normalizePassives, normalizeCharacter, resolveClass, treeUrl, extractTreeJson, indexTree, parseLeague, inferOrigin, RateLimiter, normalizeAccount, stripMarkup, mainSkill } };

  if (typeof module === 'object' && module.exports) {
    module.exports = PoeExport;
    if (typeof require === 'function' && require.main === module) {
      PoeExport.cli(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error(`fatal: ${e.message}`); process.exitCode = 1; });
    }
  }
  if (typeof globalThis !== 'undefined') globalThis.PoeExport = PoeExport;
})();
