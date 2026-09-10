const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { plausible, reconcile, parseCsv, getLatestTotal, getGoalDetails, validDate } = require('./sync-goals');
// Deliberately independent of the live data.js snapshot.
const base = { total: 978, appearances: 1330, assists: 291, goalsPerGame: 0.73,
  updatedAt: '2026-09-04', etaNote: '2027', statsUpdatedAt: '2026-09-04',
  breakdown: [{ team: '葡萄牙', goals: 978, years: '2003–至今' }],
  recentGoals: [{ no: 978, date: '2026-08-28', match: '葡萄牙 vs Test', type: '进球' }] };

const goals = n => Array.from({ length: n }, (_, i) => ({ no: i + 1, club: 'Portugal', date: '2026-09-10', opponent: 'Test', goal_type: 'header' }));

test('sync accepts milestone and beyond, rejects invalid totals', () => {
  for (const n of [999, 1000, 1001]) assert.equal(plausible(n), true);
  for (const n of [null, NaN, Infinity, 999.5, 10001]) assert.equal(plausible(n), false);
  assert.equal(reconcile(base, 1000, goals(1000)).total, 1000);
});
test('failed or inconsistent sources do not mutate saved data', () => {
  const before = JSON.stringify(base);
  for (const [n, rows] of [[null, goals(979)], [979, null], [979, goals(978)], [979, goals(980)], [977, goals(977)]]) {
    assert.throws(() => reconcile(base, n, rows));
  }
  const duplicate = goals(979); duplicate[978].no = 978;
  assert.throws(() => reconcile(base, 979, duplicate));
  assert.equal(JSON.stringify(base), before);
});
test('unchanged total repairs stale details, subsequent run is a no-op', () => {
  const result = reconcile(base, 978, goals(978));
  assert.equal(result.breakdown.reduce((sum, b) => sum + b.goals, 0), 978);
  assert.equal(result.recentGoals[0].no, 978);
  assert.equal(reconcile(result, 978, goals(978)), null);
});

function browser({ raw = null, denied = false, data = base, fetch } = {}) {
  const elements = new Map();
  const ids = new Set([...fs.readFileSync("index.html", "utf8").matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  function element() { return { style: {}, classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute(k, v) { this[k] = v; }, appendChild() {}, querySelectorAll() { return []; }, value: '', textContent: '' }; }
  const c = {
    structuredClone, performance, requestAnimationFrame() {},
    window: { matchMedia: () => ({ matches: true }) },
    localStorage: {
      getItem() { if (denied) throw Error('blocked'); return raw; },
      setItem(k, v) { if (denied) throw Error('blocked'); raw = v; },
      removeItem() { if (denied) throw Error('blocked'); raw = null; }
    },
    document: { getElementById(id) { assert.ok(ids.has(id), "Missing HTML element: " + id); if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element },
    fetch, AbortController, setTimeout, clearTimeout
  };
  vm.createContext(c);
  vm.runInContext('const CR7_DATA = ' + JSON.stringify(data) + ';\n' + fs.readFileSync('app.js', 'utf8'), c);
  return { c, elements, run: code => vm.runInContext(code, c) };
}
test('legacy, malformed and outdated caches fall back to repository', () => {
  const cached = { ...base, total: 979 };
  for (const raw of [JSON.stringify(cached), '{', JSON.stringify({ base: JSON.stringify(base), data: { ...base, breakdown: {} } }), JSON.stringify({ base: 'old', data: base })]) {
    assert.equal(browser({ raw }).run('state.total'), base.total);
  }
});
test('local edits survive reload but expire on repository changes', () => {
  const b = browser();
  b.c.document.getElementById('teamSelect').value = 'Portugal';
  b.run('addGoal()');
  const raw = b.c.localStorage.getItem();
  assert.equal(browser({ raw }).run('state.total'), 979);
  assert.equal(browser({ raw, data: { ...base, updatedAt: '2026-09-10' } }).run('state.total'), 978);
});
test('blocked storage permits initialization, edits and reset with warning', () => {
  const b = browser({ denied: true });
  b.c.document.getElementById('teamSelect').value = 'Portugal';
  b.run('addGoal()');
  assert.equal(b.run('state.total'), 979);
  assert.match(b.elements.get('storageStatus').textContent, /无法保存/);
  b.run('resetData()');
  assert.equal(b.run('state.total'), 978);
});
test('1000 displays achieved milestone and caps progress beyond target', () => {
  const b = browser();
  b.run('state.total = 1001; renderAll(false)');
  assert.equal(b.elements.get('milestoneStatus').textContent, '已达成');
  assert.equal(b.elements.get('etaText').hidden, true);
  assert.equal(b.elements.get('progressBar')['aria-valuenow'], 1000);
  assert.equal(b.run('toGo()'), 0);
});
test('source check reports 1000 without changing any displayed dataset', async () => {
  const b = browser({ fetch: async () => ({ ok: true, text: async () => '<div data-goal="total">1000</div>' }) });
  const before = b.run('JSON.stringify(state)');
  await b.run('fetchLatest()');
  assert.equal(b.run('JSON.stringify(state)'), before);
  assert.match(b.elements.get('fetchStatus').textContent, /1000/);
  assert.equal(b.elements.get('fetchBtn').disabled, false);
});

test('fallback skips stale and detail-mismatched primary totals', async () => {
  for (const primary of [977, 980]) {
    const calls = [];
    const total = await getLatestTotal(978, 979, async url => {
      calls.push(url);
      return url.includes('goalnigeria') ? '979 official senior career goals' : `<span data-goal="total">${primary}</span>`;
    });
    assert.equal(total, 979);
    assert.equal(calls.length, 2);
  }
  assert.equal(await getLatestTotal(978, 979, async () => { throw Error('offline'); }), null);
});
test('CSV supports BOM, quoted commas, escaped quotes and embedded newlines', () => {
  const csv = '\uFEFFgoal_number,date,club,opponent,goal_type\r\n1.0,2002-10-07,Sporting CP,"A, ""B""\nC",header\r\n';
  const rows = parseCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].opponent, 'A, "B"\nC');
  for (const invalid of ['goal_number,club\n1,Portugal', 'goal_number,date,club,opponent,goal_type\n1,2002-10-07,Portugal,Test', 'goal_number,date,club,opponent,goal_type\n1,2002-10-07,Portugal,"Test,header']) {
    assert.throws(() => parseCsv(invalid));
  }
});
test('missing or invalid details never overwrite the snapshot', () => {
  for (const [key, value] of [['date', ''], ['date', '2026-02-30'], ['opponent', ''], ['goal_type', ''], ['club', '']]) {
    const rows = goals(978); rows[977][key] = value;
    assert.throws(() => reconcile(base, 978, rows));
  }
  const rows = goals(978); rows[977].goal_type = 'new source type';
  assert.equal(reconcile(base, 978, rows).recentGoals[0].type, 'new source type');
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2025-02-29'), false);
});
test('source decimal goal numbers are supported, malformed rows are not filtered away', async () => {
  const rows = await getGoalDetails(async () => 'goal_number,date,club,opponent,goal_type\n1.0,2002-10-07,Sporting CP,Test,header\n2.0,2002-10-07,,Test,header');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].no, 1);
  assert.equal(rows[1].club, '');
});
test('local date uses calendar fields rather than UTC serialization', () => {
  const b = browser();
  assert.equal(b.run('localDate({getFullYear:()=>2026,getMonth:()=>8,getDate:()=>11,toISOString:()=>"2026-09-10T17:00:00.000Z"})'), '2026-09-11');
});
test('live dataset remains structurally coherent at any goal total', () => {
  const live = vm.runInNewContext(fs.readFileSync('data.js', 'utf8') + '; CR7_DATA');
  const b = browser({ data: live });
  assert.equal(b.run('validState(CR7_DATA)'), true);
  assert.equal(validDate(live.updatedAt), true);
  const numbers = live.recentGoals.map(g => g.no);
  assert.equal(new Set(numbers).size, numbers.length);
  assert.equal(numbers[0], live.total);
  assert.ok(numbers.every((n, i) => i === 0 || n === numbers[i - 1] - 1));
});

test('browser source check tries secondary after a stale primary', async () => {
  const calls = [];
  const b = browser({ fetch: async url => {
    calls.push(url);
    return { ok: true, text: async () => url.includes('goalnigeria') ? '979 official senior career goals' : '<span data-goal="total">977</span>' };
  }});
  await b.run('fetchLatest()');
  assert.equal(calls.length, 2);
  assert.match(b.elements.get('fetchStatus').textContent, /979/);
  assert.equal(b.run('state.total'), 978);
});
