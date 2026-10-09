import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../public/', import.meta.url);
const entry = fs.readFileSync(new URL('news-globe-run-20260920-v52-r1.html', root), 'utf8');
const loader = entry.match(/<script>([\s\S]*?)<\/script>/)[1];
const shell = fs.readFileSync(new URL('news-globe-v34.html', root), 'utf8');
const data = fs.readFileSync(new URL('news-globe-data-20260920-v52-r1.js', root), 'utf8');
const dataPath = '/news-globe-data-20260920-v52-r1.js';

async function assemble(source = data, failure) {
  const requests = [], errors = [];
  let html, message;
  await vm.runInNewContext(loader, {
    fetch: async (url, options) => {
      requests.push({url, options});
      const isData = url === dataPath;
      const ok = failure !== (isData ? 'data' : 'shell');
      return {ok, status: ok ? 200 : 503, text: async () => isData ? source : shell};
    },
    document: {
      open() {}, write(value) {html = value;}, close() {},
      body: {set innerHTML(value) {message = value;}},
    },
    console: {error(error) {errors.push(error.message);}},
  });
  return {html, message, requests, errors};
}

test('R6 entry uses the current daily edition and cache key', async () => {
  const context = {window: {}};
  vm.runInNewContext(data, context);
  const G = context.window.NG14;
  const {html, requests, errors} = await assemble();
  assert.equal(errors.length, 0);
  assert.equal(G.demo.length, 13);
  assert.ok(html.includes(`<title>全球新闻地球仪 · V52·A1 R6 · ${G.meta.date}</title>`));
  assert.ok(html.includes(`V52·A1 R6 · ${G.meta.date} 实际13条新闻`));
  assert.ok(html.includes(`${dataPath}?v=${encodeURIComponent(G.DATA_KEY)}`));
  assert.equal(requests.length, 2);
  for (const request of requests) assert.equal(request.options.cache, 'no-store');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  assert.equal(scripts.length, 34);
  assert.equal(new Set(scripts).size, scripts.length);
  assert.ok(!scripts.some(s => /scene-controller|releases\/y1/.test(s)));
  const names = scripts.map(s => s.split('?')[0]);
  assert.ok(names.indexOf('/news-globe-v14-v52-camera-breathing-room.js') < names.indexOf(dataPath));
  assert.ok(names.indexOf(dataPath) < names.indexOf('/news-globe-v14-main.js'));
  assert.ok(names.indexOf('/news-globe-v52-china-border-ownership.js') < names.indexOf('/news-globe-v14-main.js'));
  for (const name of ['news-globe-v52-china-border-ownership.js']) assert.ok(scripts.includes(`/${name}?v=20261007-r6-china-border-ownership`));
  assert.ok(names.indexOf('/news-globe-v14-main.js') < names.indexOf('/news-globe-v52-hard-rules.js'));
  for (const name of ['news-globe-v52-geographic-features.js', 'news-globe-v14-v51-scene-engine.js', 'news-globe-v52-r6-performance.js']) assert.ok(scripts.includes(`/${name}?v=20261010-r6-full-quality-r4`));
  assert.ok(names.indexOf('/news-globe-v52-locationless-marker-guard.js') < names.indexOf('/news-globe-v52-geographic-features.js'));
  assert.ok(names.indexOf('/news-globe-v52-geographic-features.js') < names.indexOf('/news-globe-v14-main.js'));
  assert.ok(names.indexOf('/news-globe-v52-geographic-features.js') < names.indexOf('/news-globe-v52-r6-performance.js'));
  assert.ok(names.indexOf('/news-globe-v52-r6-performance.js') < names.indexOf('/news-globe-v14-main.js'));
  for (const name of ['news-globe-v52-screen-collision-hotfix.js', 'news-globe-v52-flags-overview-clean.js']) {
    assert.ok(scripts.includes(`/${name}?v=20261007-r6-overlay-lifecycle`),'Updated overlay must bypass its old cache key');
  }
});

test('a future edition updates the entry without a loader edit', async () => {
  const future = data.replace(/G\.DATA_KEY='[^']+'/, "G.DATA_KEY='ng-future-r6-lock-b'")
    .replace(/G\.meta=\{date:'[^']+'/, "G.meta={date:'2030-01-02'");
  const {html, errors} = await assemble(future);
  assert.equal(errors.length, 0);
  assert.ok(html.includes('V52·A1 R6 · 2030-01-02'));
  assert.ok(html.includes(`${dataPath}?v=ng-future-r6-lock-b`));
});

test('two locks on the same day get different script URLs', async () => {
  const alternate = data.replace(/G\.DATA_KEY='[^']+'/, "G.DATA_KEY='ng-same-day-r6-lock-c'");
  const first = await assemble();
  const second = await assemble(alternate);
  const url = html => html.match(/src="([^\"]*news-globe-data-20260920-v52-r1\.js[^\"]*)"/)[1];
  assert.notEqual(url(first.html), url(second.html));
});

for (const resource of ['data', 'shell']) {
  test(`a failed ${resource} request does not launch a mixed edition`, async () => {
    const result = await assemble(data, resource);
    assert.equal(result.html, undefined);
    assert.match(result.message, /V52 加载失败/);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /503/);
  });
}

test('missing edition metadata fails visibly instead of using an old date', async () => {
  const result = await assemble('(function(G){G.demo=[];})(window.NG14);');
  assert.equal(result.html, undefined);
  assert.match(result.message, /V52 加载失败/);
  assert.match(result.errors[0], /metadata missing/);
});
