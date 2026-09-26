// poe2-char-export.js — every Path of Exile 2 character on the logged-in account, to one JSON file.
//
// Run it in the DevTools console (or as a saved Snippet) on
//   https://pathofexile2.com/my-account/characters
// while logged in. Opening that page first matters: it upgrades the session token to the
// internal:poe2:character scope the character endpoints need.
//
// Then upload the file on the archive's /players/<you>/import page.
//
// What it reads (observed 2026-09-25, see README.md):
//   GET /internal-api/my-account/characters?realm=poe2       the character list
//   GET /internal-api/my-account/character/<id>?realm=poe2   one character's equipped items
// Both need the session cookie AND `Authorization: DPoP <localStorage.__POESESSION>`; either
// alone is a 401. There is no passive-tree or skill-gem endpoint on this site, so the file has
// neither; a Path of Building 2 share code supplies those.
//
// The endpoints sent no rate-limit headers in 34 calls, so the real limit is unknown. This paces
// at 8 s a request (7.5 a minute) and still honours Retry-After / X-Rate-Limit-* if they appear.
// Thirteen characters take about two minutes.
//
// Nothing is renamed or dropped: each response is stored exactly as it arrived, under `raw`.
(async () => {
  const BASE = 'https://pathofexile2.com';
  const MIN_GAP_MS = 8000;
  const REQUESTS = [];
  const ERRORS = [];
  let last = 0;

  const token = localStorage.getItem('__POESESSION');
  if (!token) throw new Error('No __POESESSION in localStorage. Log in and open /my-account/characters first.');
  let claims = {};
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    claims = JSON.parse(atob(b64 + '==='.slice((b64.length + 3) % 4)));
  } catch {
    console.warn('Could not decode the session token; carrying on.');
  }
  if (claims.scope && !String(claims.scope).split(' ').includes('internal:poe2:character'))
    throw new Error('The token lacks the internal:poe2:character scope. Open /my-account/characters once, then rerun.');
  if (claims.exp && claims.exp * 1000 < Date.now() + 5 * 60_000)
    throw new Error('The session token expires within five minutes. Reload the page, then rerun.');

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // "hits:period:penalty" rule/state pairs; the wait needed if any window is 60% used or penalised.
  function rateLimitWait(headers) {
    let wait = 0;
    const retry = headers.get('retry-after');
    if (retry) wait = Math.max(wait, (Number(retry) || 60) * 1000);
    for (const rule of (headers.get('x-rate-limit-rules') || '').split(',').filter(Boolean)) {
      const limits = (headers.get(`x-rate-limit-${rule.toLowerCase()}`) || '').split(',');
      const states = (headers.get(`x-rate-limit-${rule.toLowerCase()}-state`) || '').split(',');
      limits.forEach((limit, index) => {
        const [max, period] = limit.split(':').map(Number);
        const [used, , penalty] = (states[index] || '').split(':').map(Number);
        if (penalty > 0) wait = Math.max(wait, penalty * 1000);
        else if (max && used / max >= 0.6) wait = Math.max(wait, period * 1000);
      });
    }
    return wait;
  }

  async function get(path, { paced = true } = {}) {
    if (paced) {
      const gap = last + MIN_GAP_MS - Date.now();
      if (gap > 0) await sleep(gap);
      last = Date.now();
    }
    const response = await fetch(BASE + path, {
      headers: { Authorization: 'DPoP ' + localStorage.getItem('__POESESSION') },
      credentials: 'include',
    });
    const limits = {};
    response.headers.forEach((value, key) => {
      if (/^x-rate-limit|^retry-after/i.test(key)) limits[key] = value;
    });
    REQUESTS.push({ at: new Date().toISOString(), path, status: response.status, rate_limit_headers: limits });
    const text = await response.text();
    const wait = rateLimitWait(response.headers);
    if (wait) {
      console.warn(`rate limit: waiting ${wait / 1000}s`);
      await sleep(wait);
    }
    if (response.status === 429) throw Object.assign(new Error('429 Too Many Requests'), { fatal: true });
    if (response.status === 401) throw Object.assign(new Error('401: session expired. Reload the page and rerun.'), { fatal: true });
    if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 200)}`);
    return JSON.parse(text);
  }

  // The account the archive files these characters under. The site's own account call is read
  // for it; its exact shape was not recorded when this was written, so any "Name#1234" field
  // found there is taken, and the fallback above is used otherwise.
  async function accountName() {
    try {
      const account = await get('/internal-api/my-account', { paced: false });
      const found = JSON.stringify(account).match(/"([^"]{2,}#\d{4})"/);
      if (found) return found[1];
    } catch (error) {
      console.warn('Could not read the account name:', error.message);
    }
    // No built-in fallback: an export names the account it came from, and the
    // archive files it under whichever player holds that account. A default
    // would file anyone else's characters under that player.
    const typed = (window.prompt('Could not read your account name from the site. Type it, as Name#1234:') || '').trim();
    if (!/^.{2,}#\d{4}$/.test(typed)) {
      throw new Error('No account name, so nothing was exported: every export has to name the account it came from.');
    }
    return typed;
  }

  const account = await accountName();
  const list = await get('/internal-api/my-account/characters?realm=poe2&meta=latestCharacterId');
  const characters = [];
  for (const [index, character] of list.data.entries()) {
    const entry = { id: character.id, name: character.name, league: character.league, raw: { character, items: null, passives: null } };
    try {
      console.log(`[${index + 1}/${list.data.length}] ${character.name}`);
      entry.raw.items = await get(`/internal-api/my-account/character/${encodeURIComponent(character.id)}?realm=poe2`);
    } catch (error) {
      ERRORS.push({ id: character.id, name: character.name, error: String(error.message || error) });
      characters.push(entry);
      if (error.fatal) break;
      continue;
    }
    characters.push(entry);
  }

  const output = {
    game: 'poe2',
    schema_version: 1,
    exporter: 'poe2-char-export.js 1',
    account,
    exported_at: new Date().toISOString(),
    source: {
      list: 'GET /internal-api/my-account/characters?realm=poe2&meta=latestCharacterId',
      items: 'GET /internal-api/my-account/character/{id}?realm=poe2',
      passives: null,
      passives_note: 'pathofexile2.com has no passive-tree or skill-gem endpoint for characters; raw.passives is always null.',
    },
    raw_list: list,
    characters,
    stats: { characters: characters.length, errors: ERRORS.length, requests: REQUESTS.length },
    errors: ERRORS,
    requests: REQUESTS,
  };

  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const fileName = `poe2-characters-${account.replace('#', '_')}-${day}.json`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' }));
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  console.log(`Saved ${fileName}`, output.stats);
  if (ERRORS.length) console.warn('Characters whose gear could not be read (the archive will name them):', ERRORS);
  window.__poe2Export = output;
  return output.stats;
})();
