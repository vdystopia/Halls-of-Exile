const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { createServer } = require('./mock-server');
const F = require('./fixtures');
const PE = require('../poe-char-export.js');
const SCRIPT = path.join(__dirname, '..', 'poe-char-export.js');
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'poe-export-test-'));

function listen(srv) { return new Promise((r) => srv.server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${srv.server.address().port}`))); }
function cli(args, env = {}) {
  return new Promise((resolve) => execFile('node', [SCRIPT, ...args], { env: { ...process.env, ...env, HTTPS_PROXY: '', HTTP_PROXY: '' }, timeout: 120000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));
}
function decodeTree(url) {
  const code = url.split('/').pop().split('?')[0];
  const b = Buffer.from(code.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  let i = 0; const u16 = () => { const v = b.readUInt16BE(i); i += 2; return v; };
  const ver = b.readUInt32BE(0); i = 4;
  const cls = b[i++], asc = b[i++]; const n = b[i++]; const nodes = []; for (let k = 0; k < n; k++) nodes.push(u16());
  const cn = b[i++]; const cluster = []; for (let k = 0; k < cn; k++) cluster.push(u16());
  const mn = b[i++]; const mast = []; for (let k = 0; k < mn; k++) mast.push([u16(), u16()]);
  return { ver, cls, asc, nodes, cluster, mast, trailing: b.length - i };
}
const results = [];
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push(`PASS ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (e) { results.push(`FAIL ${name}: ${(e.message || '').slice(0, 900)}`); process.exitCode = 1; }
}

(async () => {
  await test('tree URL encoder matches site format (real BEVSTCHEESE URL)', async () => {
    const site = 'https://www.pathofexile.com/fullscreen-passive-skill-tree/alternate/AAAABgMCdQQHBjkGugicC2ENzREtFJkWbxo4GmwbNxzOHNwdFB4IHwIfGCI0JKolIScvK1AvXTYmNuk6WDrGOuk8LT0PRZ1G_kqfTLNNz1B6UT1RYFH7U1JVxlYuWfNakWD4YvRjv2WFZlRmnmdxaFho8mo7aqxxsnKpfIN98YNfg9uFe4b4iGWJ2Itli8-Mdo6-jxqPRpBVksGYCZrgnHqg5qIApqynCKcoqH2qqayqr2yvp7UEtzG7vr5JxPbFisaKxq7NFtAf0a3T-9ZB15bZv9rd30XfsONq6jbr7uw47-vwH_MG9S_2ovrS-6r-VAAIuhovXd9bhvgRlJgJ_Ws2JpyJ1kGFwn3xd5RjvxDfpyg=';
    const d = decodeTree(site);
    const mastery = Object.fromEntries(d.mast.map(([e, n]) => [String(n), e]));
    const mine = PE._internal.treeUrl({ classId: 3, ascIndex: 2, hashes: [...d.nodes].reverse(), hashesEx: [], masteryEffects: mastery, variant: 'alternate', account: 'zxBlasphemy#5164', character: 'BEVSTCHEESE' });
    const m = decodeTree(mine);
    assert.strictEqual(m.ver, 6); assert.strictEqual(m.cls, 3); assert.strictEqual(m.asc, 2); assert.strictEqual(m.trailing, 0);
    assert.deepStrictEqual(m.nodes, d.nodes);
    assert.deepStrictEqual(new Set(m.mast.map(String)), new Set(d.mast.map(String)));
    assert.ok(mine.startsWith('https://www.pathofexile.com/fullscreen-passive-skill-tree/alternate/AAAABgMCdQ'));
    assert.ok(mine.endsWith('?accountName=zxBlasphemy%235164&characterName=BEVSTCHEESE'));
  });

  await test('tree URL: bloodline bits and cluster ids match real site URLs (DenniDemoni, FinalityOfTheVoid)', async () => {
    const cases = [
      { url: 'https://www.pathofexile.com/fullscreen-passive-skill-tree/AAAABgEbgQHnA3UGwwn2CwwNzRArEFESaRQgFE0U-BYLFm8XmxhlGJEZLho4HM4dFCAGI1wm8ycvJ-0n_iqNK1At0i6UL10w-DNsNPc22DpYOtg8BT0PPfxJG0qfVcZXDVhjWfNfBF8qXz9hs2VyZYVmVGaeZ3FoZWoecXlxhXRVeWh65ny7ffF_4oIHgpuFe4Z3ibyMz49GkFWRzpTnlmyboZ1jna6ezZ8-n9-g5qHHogCnCKcopzCrfqyYrY2u_69nr6e79ryLvJ-9YL15vyHAZsEExBXEpMT2xtjPfs_E0iHUfNgk2WHaueNq6n_sOOxV7w7vfO-r8WzyQfOb9kj31_rS_Ev-VAAL2Ay8ixGUFPj9a8_EhcKhx_t9L126Gn3xfE69eVPcYbME4wsMljYQKyNypyg=', classId: 1, ascIndex: 3, bloodlineIndex: 6, hashesEx: [] },
      { url: 'https://www.pathofexile.com/fullscreen-passive-skill-tree/AAAABgEBbQHnA3UEswbGCKsLDBJpFHEWbxa7FxwXLxo4G0Ub-h0UHxgl3ycvKo0s8S3SLpQvXTD4M2w09zbYNug6WDrYPAU-3UZESRtR-1XGVdZZ818EZOdlcmZUZp5oZWjycXlxhXKpdl52rHloeuaApIIHgpuFe4Z3hymOv49GkFWRzpuhnWOdrp7Nn9-hI6HHogCkGacIpzCsmKyqrQqu_7hdu-279r62wAHBBMbYyx7NFs9-0iHSONRE2CTZfNq52t3jauoY7DjsVe988B_xbPJB8933Mve599f46_rSBwAAAAEAAwAFAAcACQALB4XCoccYSCzxXEW4Xeog1EQE4wsMRhatCroaL10=', classId: 1, ascIndex: 1, bloodlineIndex: 0, hashesEx: [0, 1, 3, 5, 7, 9, 11] },
    ];
    for (const c of cases) {
      const d = decodeTree(c.url);
      const mine = decodeTree(PE._internal.treeUrl({ classId: c.classId, ascIndex: c.ascIndex, bloodlineIndex: c.bloodlineIndex, hashes: d.nodes, hashesEx: c.hashesEx, masteryEffects: Object.fromEntries(d.mast.map(([e, n]) => [String(n), e])), variant: 'default', account: 'a#1', character: 'x' }));
      assert.deepStrictEqual([mine.cls, mine.asc, mine.nodes, mine.cluster, new Set(mine.mast.map(String)), mine.trailing], [d.cls, d.asc, d.nodes, d.cluster, new Set(d.mast.map(String)), 0]);
    }
  });

  await test('league parsing + origin inference', async () => {
    const p = PE._internal.parseLeague;
    assert.deepStrictEqual(p('Solo Self-Found'), { base: 'Standard', ssf: true, hardcore: false, ruthless: false, permanent: true });
    assert.deepStrictEqual(p('SSF Ruthless'), { base: 'Standard', ssf: true, hardcore: false, ruthless: true, permanent: true });
    assert.deepStrictEqual(p('HC SSF R Allflame'), { base: 'Allflame', ssf: true, hardcore: true, ruthless: true, permanent: false });
    assert.deepStrictEqual(p('Hardcore SSF Ruthless'), { base: 'Standard', ssf: true, hardcore: true, ruthless: true, permanent: true });
    assert.strictEqual(p('Phrecia 2.0').base, 'Phrecia 2.0');
    const cal = PE.LEAGUE_CALENDAR, io = PE._internal.inferOrigin, at = (iso) => Date.parse(iso) / 1000;
    const now = Date.parse('2026-09-16T15:00:00Z'), live = new Set(['Allflame']);
    const f = (league, iso, a = live, c = cal, n = now) => { const r = io(league, at(iso), c, a, n); return [r.league, r.confidence, r.basis, r.candidates.join('|')]; };
    assert.deepStrictEqual(f('SSF R Allflame', '2026-09-01T00:00:00Z'), ['Allflame', 'certain', 'current_league', 'Allflame']);
    assert.deepStrictEqual(f('Standard', '2026-09-02T00:00:00Z'), [null, 'none', 'played_in_permanent_league_while_league_live', '']);
    assert.deepStrictEqual(f('Standard', '2026-09-02T00:00:00Z', null), [null, 'none', 'played_in_permanent_league_while_league_live', ''], 'fallback: newest calendar league is live');
    assert.deepStrictEqual(f('Standard', '2026-07-21T00:00:00Z'), ['Mirage', 'weak', 'last_login_after_league_end', 'Mirage']);
    assert.deepStrictEqual(f('Standard', '2026-05-01T00:00:00Z'), ['Mirage', 'likely', 'last_login_window', 'Mirage']);
    assert.deepStrictEqual(f('Standard', '2026-01-31T00:00:00Z'), ['Keepers', 'ambiguous', 'last_login_window', 'Keepers|Phrecia 2.0']);
    assert.deepStrictEqual(f('Standard', '2025-01-19T16:20:32Z'), ['Settlers', 'likely', 'last_login_window', 'Settlers']);
    assert.deepStrictEqual(f('Standard', '2025-03-01T00:00:00Z'), ['Settlers', 'ambiguous', 'last_login_window', 'Settlers|Phrecia']);
    assert.deepStrictEqual(f('Solo Self-Found', '2025-10-30T00:00:00Z'), ['Mercenaries', 'weak', 'last_login_after_league_end', 'Mercenaries']);
    assert.deepStrictEqual(f('Standard', '2016-01-01T00:00:00Z'), [null, 'none', 'last_login_before_calendar', '']);
    // a future league the static calendar doesn't know yet, learned from /api/leagues
    const later = Date.parse('2026-12-20T00:00:00Z');
    const lv = PE._internal.leaguesFromApi([{ id: 'Standard', category: { id: 'Standard' }, startAt: '2013-01-23T21:00:00Z' }, { id: 'Nova', category: { id: 'Nova' }, startAt: '2026-12-11T20:00:00Z', endAt: null }, { id: 'SSF Nova', category: { id: 'Nova' }, startAt: '2026-12-11T20:00:00Z', endAt: null }, { id: 'Qualifier', category: { id: 'Standard' }, event: true, startAt: '2026-12-12T21:00:00Z', endAt: '2026-12-13T01:00:00Z' }], cal, later);
    assert.deepStrictEqual(lv.active, ['Nova']);
    assert.deepStrictEqual(lv.additions, [['Nova', 'Nova', null, 'challenge', '2026-12-11T20:00:00Z', null], ['Qualifier', 'Qualifier', null, 'event', '2026-12-12T21:00:00Z', '2026-12-13T01:00:00Z']]);
    const cal2 = [...cal, ...lv.additions], live2 = new Set(lv.active);
    assert.deepStrictEqual(f('Standard', '2026-12-19T00:00:00Z', live2, cal2, later), [null, 'none', 'played_in_permanent_league_while_league_live', '']);
    assert.deepStrictEqual(f('Standard', '2026-09-02T00:00:00Z', live2, cal2, later), ['Allflame', 'likely', 'last_login_window', 'Allflame']);
    assert.deepStrictEqual(f('Standard', '2026-12-12T22:00:00Z', live2, cal2, later), ['Qualifier', 'weak', 'last_login_window', 'Qualifier']);
    for (let i = 1; i < cal.length; i++) assert.ok(Date.parse(cal[i][4]) > Date.parse(cal[i - 1][4]), 'calendar sorted');
    for (const r of cal) assert.strictEqual(r.length, 6);
    const mk = (name, iso, league = 'Standard', conf = 'likely') => ({ name, league_flags: { permanent: league === 'Standard' }, last_login_unix: at(iso), origin_league: { league: 'Settlers', confidence: conf } });
    const chars = [mk('a', '2025-01-18T16:09:55Z'), mk('b', '2025-01-18T17:04:52Z'), mk('c', '2025-01-19T16:20:32Z'), mk('d', '2025-01-19T17:16:55Z'), mk('e', '2025-01-18T16:31:41Z'), mk('solo', '2025-03-15T00:00:00Z'), mk('live', '2025-01-18T16:00:00Z', 'SSF Settlers', 'certain')];
    PE._internal.flagLoginBatches(chars);
    assert.deepStrictEqual(chars.map((c) => c.origin_league.confidence), ['weak', 'weak', 'weak', 'weak', 'weak', 'likely', 'certain']);
    assert.strictEqual(chars[0].origin_league.batch_logins, 5);
  });

  await test('full export via CLI (429 retry, pacing, normalization, CSV)', async () => {
    const srv = createServer({ force429: true }); const base = await listen(srv);
    const out = path.join(TMP, 'full.json'), csv = path.join(TMP, 'full.csv');
    const r = await cli(['--account', 'Tester-1234', '--out', out, '--csv', csv, '--base-url', base, '--user-agent', 'test-agent/1']);
    srv.server.close();
    assert.strictEqual(r.code, 0, r.stderr);
    const j = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.strictEqual(j.account, 'Tester#1234');
    assert.strictEqual(j.characters.length, 4);
    assert.deepStrictEqual(srv.violations, []);
    assert.ok(srv.log.every((l) => l.ua === 'test-agent/1'));
    assert.strictEqual(j.stats.fetched, 4); assert.strictEqual(j.errors.length, 0);
    assert.strictEqual(srv.log.filter((l) => l.path === '/character-window/get-items').length, 5, 'one 429 retry');
    const by = Object.fromEntries(j.characters.map((c) => [c.name, c]));
    const rf = by.RFChief;
    assert.strictEqual(rf.base_class, 'Witch'); assert.strictEqual(rf.ascendancy, 'Elementalist'); assert.strictEqual(rf.passives.tree_variant, 'default');
    assert.deepStrictEqual(rf.passives.keystones, ['Chaos Inoculation']);
    assert.deepStrictEqual(rf.passives.notables.sort(), ['Heart of Oak', 'Unwise']);
    assert.deepStrictEqual(rf.passives.ascendancy_notables, ['Shaper of Flames']);
    assert.deepStrictEqual(rf.passives.masteries, [{ name: 'Life Mastery', effect_id: 4002, stats: ['Regenerate 1% of Life per second'] }]);
    assert.deepStrictEqual(rf.passives.nodes.find((n) => n.name === 'Unwise').stats, ['8% increased Critical Strike Chance']);
    assert.strictEqual(rf.main_skill.skill, 'Righteous Fire'); assert.strictEqual(rf.main_skill.links, 5); assert.strictEqual(rf.main_skill.slot, 'BodyArmour');
    assert.deepStrictEqual(rf.uniques, ['Foulborn The Baron']);
    assert.strictEqual(rf.gold, 29086); assert.ok(!rf.equipment.some((e) => e.inventory_id === 'MainInventory'));
    const body = rf.equipment.find((e) => e.slot === 'BodyArmour');
    assert.strictEqual(body.name, 'Doom Shell'); assert.strictEqual(body.identified, true); assert.ok(!('identified' in body.flags)); assert.strictEqual(body.sockets, 'R-R-R-R-R G'); assert.strictEqual(body.links, 5);
    assert.deepStrictEqual(body.mods.explicit, ['+100 to maximum Life', '30% increased Armour']);
    assert.deepStrictEqual(body.mods.fractured, ['+40 to Strength']); assert.deepStrictEqual(body.mods.crafted, ['+1 to Level of Socketed Gems']);
    assert.strictEqual(rf.main_skill.utility, false); assert.deepStrictEqual(body.socketed[0].tags, ['Spell', 'AoE', 'Fire', 'Duration']); assert.strictEqual(body.flags.fractured, true); assert.deepStrictEqual(body.influences, ['shaper']);
    assert.strictEqual(body.properties.Armour, '1200'); assert.strictEqual(body.requirements.Level, '62');
    assert.strictEqual(body.socketed[0].level, 21); assert.strictEqual(body.socketed[0].quality, 20);
    assert.ok(rf.equipment.find((e) => e.slot === 'Flask 3'));
    assert.strictEqual(rf.equipment.find((e) => e.inventory_id === 'Weapon2').swap, true);
    assert.ok(rf.equipment.find((e) => e.slot === 'Helm').mods.mutated);
    const d = decodeTree(rf.passives.tree_url);
    assert.deepStrictEqual([d.cls, d.asc, d.nodes, d.mast], [3, 2, [100, 200, 300, 400, 500, 600, 800, 900], [[4002, 400]]]);
    assert.ok(rf.raw && rf.raw.items && rf.raw.passives);
    const bev = by.BEVSTCHEESE;
    assert.strictEqual(bev.passives.tree_variant, 'alternate'); assert.ok(bev.passives.tree_url.includes('/alternate/'));
    assert.strictEqual(rf.origin_league.league, 'Settlers'); assert.strictEqual(by.ClusterWarden.origin_league.league, 'Mirage', '2026-07-20 17:08 is inside Mirage (ends 20:00)');
    assert.deepStrictEqual(j.leagues.live, ['Allflame']); assert.deepStrictEqual(j.leagues.calendar_additions.map((r) => r[0]), ['Exilecon 2026 PoE1 Qualifier #3']);
    assert.deepStrictEqual(bev.passives.ascendancy_notables, ['Storm Herald Alt']);
    assert.deepStrictEqual([bev.origin_league.league, bev.origin_league.basis, bev.origin_league.confidence], ['Phrecia 2.0', 'current_league', 'certain']);
    const cw = by.ClusterWarden;
    assert.strictEqual(cw.base_class, 'Ranger'); assert.strictEqual(cw.ascendancy, 'Warden'); assert.strictEqual(cw.bloodline, 'Warden of the Maji');
    assert.ok(cw.passives.notables.includes('Prismatic Heart'));
    assert.deepStrictEqual(cw.passives.tattoos.map((t) => t.name), ['Loyalty Tattoo of Hinekora']);
    assert.deepStrictEqual(cw.passives.jewels.map((x) => x.socket_hash), [500, 61666]);
    assert.deepStrictEqual(decodeTree(cw.passives.tree_url).cluster, [157, 158, 159]);
    assert.strictEqual(decodeTree(cw.passives.tree_url).asc, 1 | (1 << 2));
    assert.ok(cw.passives.nodes.find((n) => n.hash === 159 && n.name === 'Jewel Socket'));
    assert.deepStrictEqual(cw.league_flags, { permanent: true, hardcore: false, ssf: true, ruthless: true });
    assert.strictEqual(by.freshscion.ascendancy, null); assert.strictEqual(by.freshscion.base_class, 'Scion');
    assert.strictEqual(j.characters[0].name, 'ClusterWarden', 'sorted by last login desc');
    const csvLines = fs.readFileSync(csv, 'utf8').trim().split('\n');
    assert.strictEqual(csvLines.length, 5); assert.ok(csvLines[0].startsWith('name,league,origin_league'));
    fs.copyFileSync(out, path.join(TMP, 'sample-output.json'));
  });

  await test('incremental: unchanged -> list+leagues only, changed -> refetch only that character', async () => {
    const srv = createServer(); const base = await listen(srv);
    const out = path.join(TMP, 'inc.json');
    let r = await cli(['--account', 'Tester#1234', '--out', out, '--base-url', base, '--quiet']);
    assert.strictEqual(r.code, 0, r.stderr);
    const n0 = srv.log.length;
    r = await cli(['--account', 'Tester#1234', '--out', out, '--base-url', base, '--quiet']);
    assert.strictEqual(r.code, 0, r.stderr);
    assert.deepStrictEqual(srv.log.slice(n0).map((l) => l.path), ['/character-window/get-characters', '/api/leagues']);
    let j = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.strictEqual(j.stats.reused, 4); assert.strictEqual(j.stats.fetched, 0); assert.ok(j.tree_data.default);
    assert.ok(fs.existsSync(path.join(TMP, '.poe-tree-cache', 'tree-default.json')), 'tree cache written');
    srv.chars[0].lastLoginTime += 3600; srv.chars[0].level = 96;
    srv.chars.pop();
    const n1 = srv.log.length;
    r = await cli(['--account', 'Tester#1234', '--out', out, '--base-url', base, '--quiet']);
    assert.strictEqual(r.code, 0, r.stderr);
    const paths = srv.log.slice(n1).map((l) => l.path);
    assert.deepStrictEqual(paths.filter((p) => p.startsWith('/character-window')), ['/character-window/get-characters', '/character-window/get-items', '/character-window/get-passive-skills']);
    assert.ok(!paths.includes('/passive-skill-tree'), 'tree served from cache');
    j = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.strictEqual(j.stats.fetched, 1); assert.strictEqual(j.stats.reused, 2);
    assert.deepStrictEqual(j.removed_since_previous, ['freshscion']);
    assert.strictEqual(j.characters.find((c) => c.name === 'RFChief').level, 96);
    // recently played character is refetched even when list fields are unchanged
    srv.chars[1].lastLoginTime = Math.floor(Date.now() / 1000) - 3600;
    await cli(['--account', 'Tester#1234', '--out', out, '--base-url', base, '--quiet']);
    const n2 = srv.log.length;
    r = await cli(['--account', 'Tester#1234', '--out', out, '--base-url', base, '--quiet']);
    assert.strictEqual(srv.log.slice(n2).filter((l) => l.path === '/character-window/get-items').length, 1, 'recent character refetched');
    const n3 = srv.log.length;
    r = await cli(['--account', 'Tester#1234', '--out', out, '--base-url', base, '--quiet', '--refresh-recent-hours', '0']);
    assert.strictEqual(srv.log.slice(n3).filter((l) => l.path === '/character-window/get-items').length, 0, 'disabled with 0');
    srv.server.close();
  });

  await test('stale rows are refetched; --no-raw output still reuses unchanged characters', async () => {
    const srv = createServer(); const base = await listen(srv);
    const out = path.join(TMP, 'stale.json');
    let r = await cli(['--account', 'Tester#1234', '--out', out, '--base-url', base, '--quiet', '--no-tree']);
    assert.strictEqual(r.code, 0, r.stderr);
    srv.chars[1].lastLoginTime += 60; srv.failItems.add(srv.chars[1].name);
    r = await cli(['--account', 'Tester#1234', '--out', out, '--base-url', base, '--quiet', '--no-tree']);
    assert.strictEqual(r.code, 2, 'partial failure exit code');
    let j = JSON.parse(fs.readFileSync(out, 'utf8'));
    const staleName = srv.chars[1].name;
    assert.strictEqual(j.characters.find((c) => c.name === staleName).stale, true);
    srv.failItems.clear();
    const n0 = srv.log.length;
    r = await cli(['--account', 'Tester#1234', '--out', out, '--base-url', base, '--quiet', '--no-tree']);
    assert.strictEqual(r.code, 0, r.stderr);
    const fetchedItems = srv.log.slice(n0).filter((l) => l.path === '/character-window/get-items').length;
    assert.strictEqual(fetchedItems, 1, 'stale character refetched once');
    j = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.ok(!j.characters.find((c) => c.name === staleName).stale);
    // --no-raw: unchanged characters reused from normalized output
    const out2 = path.join(TMP, 'noraw.json');
    r = await cli(['--account', 'Tester#1234', '--out', out2, '--base-url', base, '--quiet', '--no-tree', '--no-raw']);
    assert.strictEqual(r.code, 0, r.stderr);
    const n1 = srv.log.length;
    r = await cli(['--account', 'Tester#1234', '--out', out2, '--base-url', base, '--quiet', '--no-tree', '--no-raw']);
    srv.server.close();
    assert.strictEqual(r.code, 0, r.stderr);
    assert.deepStrictEqual(srv.log.slice(n1).map((l) => l.path), ['/character-window/get-characters', '/api/leagues']);
    j = JSON.parse(fs.readFileSync(out2, 'utf8'));
    assert.strictEqual(j.stats.reused, 4); assert.ok(j.characters.every((c) => !c.raw && c.equipment));
  });

  await test('pacing under tight limits (13 char-policy + 12 item-policy requests)', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `Char${i}`, realm: 'pc', class: 'Chieftain', league: 'Standard', level: 90, lastLoginTime: 1700000000 + i }));
    const srv = createServer({ characters: many }); const base = await listen(srv);
    const out = path.join(TMP, 'pace.json');
    const t0 = Date.now();
    const r = await cli(['--account', 'Tester#1234', '--out', out, '--base-url', base, '--no-tree', '--quiet']);
    srv.server.close();
    assert.strictEqual(r.code, 0, r.stderr);
    assert.deepStrictEqual(srv.violations, []);
    const j = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.strictEqual(j.characters.length, 12); assert.ok(j.stats.rate_limit_wait_s > 0);
    assert.strictEqual(j.characters[0].passives.nodes[0].name, null);
    results.push(`     pacing took ${((Date.now() - t0) / 1000).toFixed(1)}s, waited ${j.stats.rate_limit_wait_s}s`);
  });

  await test('private profile: anonymous 403 fatal; POESESSID fallback works', async () => {
    const srv = createServer({ private: true }); const base = await listen(srv);
    let r = await cli(['--account', 'Tester#1234', '--out', path.join(TMP, 'priv.json'), '--base-url', base, '--no-tree']);
    assert.strictEqual(r.code, 1); assert.ok(/private/.test(r.stderr), r.stderr);
    r = await cli(['--account', 'Tester#1234', '--out', path.join(TMP, 'priv.json'), '--base-url', base, '--no-tree', '--quiet'], { POESESSID: 'good' });
    srv.server.close();
    assert.strictEqual(r.code, 0, r.stderr);
    const j = JSON.parse(fs.readFileSync(path.join(TMP, 'priv.json'), 'utf8'));
    assert.strictEqual(j.auth, 'session'); assert.strictEqual(j.characters.length, 4);
  });

  await test('bad account -> 404 fatal with hint', async () => {
    const srv = createServer(); const base = await listen(srv);
    const r = await cli(['--account', 'Nobody#0000', '--out', path.join(TMP, 'x.json'), '--base-url', base]);
    srv.server.close();
    assert.strictEqual(r.code, 1); assert.ok(/not found/.test(r.stderr), r.stderr);
  });

  console.log(results.join('\n'));
  console.log('tmp:', TMP);
  process.exit(process.exitCode || 0);
})();
