import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';

const publicRoot = new URL('../public/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('releases/y1/manifest.json', publicRoot)));
const read = name => fs.readFileSync(new URL(name.replace(/^\//, ''), publicRoot));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

test('Y1 serves the complete reviewed V52 snapshot with isolated URLs', () => {
  assert.equal(manifest.release, 'Y1');
  assert.equal(manifest.sourceCommit, '67989993c80fe2484af66d6e271c5c7481194451');
  const html = read(manifest.entry.path).toString();
  assert.equal(hash(html), manifest.entry.sha256);
  assert.match(html, /<title>全球新闻地球仪 Y1<\/title>/);
  assert.match(html, /<strong>全球新闻地球仪 · Y1<\/strong>/);
  const sources = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map(match => match[1].split('?')[0]);
  assert.deepEqual(sources, manifest.assets.map(asset => asset.path));
  assert.equal(sources.length, 35);
  assert.equal(new Set(sources).size, sources.length);
  for (const asset of manifest.assets) {
    assert.ok(asset.path.startsWith('/releases/y1/'));
    const bytes = read(asset.path);
    assert.equal(bytes.length, asset.bytes);
    assert.equal(hash(bytes), asset.sha256, asset.path);
    if (asset.path.endsWith('.js')) new vm.Script(bytes.toString(), {filename: asset.path});
  }
  const index = suffix => sources.findIndex(source => source.endsWith(suffix));
  assert.ok(index('v52-camera-breathing-room.js') < index('v52-event-effects.js'));
  assert.ok(index('v52-event-effects.js') < index('v52-screen-space.js'));
  assert.ok(index('v52-screen-space.js') < index('v14-main.js'));
});

test('/globe routes to Y1 in the production build', async () => {
  const workerUrl = new URL('../dist/server/index.js', import.meta.url);
  workerUrl.searchParams.set('test', `${process.pid}-${Date.now()}`);
  const {default: worker} = await import(workerUrl.href);
  const response = await worker.fetch(new Request('http://localhost/globe?v=Y1', {headers: {accept: 'text/html'}}), {
    ASSETS: {fetch: async () => new Response('Not found', {status: 404})},
  }, {waitUntil() {}, passThroughOnException() {}});
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>全球新闻地球仪 Y1<\/title>/);
  assert.match(html, /src="\/news-globe-y1.html\?v=Y1"/);
});
