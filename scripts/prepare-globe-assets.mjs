import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const publicDir = path.join(root, 'public');
const cesiumDir = path.join(publicDir, 'cesium');
const mapDir = path.join(publicDir, 'map-data');
const CESIUM_VERSION = '1.145.0';

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(mapDir, { recursive: true });

async function fetchBuffer(url, tries = 3) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      last = err;
      if (i < tries) await new Promise(r => setTimeout(r, 1200 * i));
    }
  }
  throw last;
}

async function ensureFile(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 256) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  console.log(`[globe-assets] downloading ${url}`);
  const buf = await fetchBuffer(url);
  fs.writeFileSync(dest, buf);
}

async function ensureCesium() {
  const marker = path.join(cesiumDir, 'Cesium.js');
  const localEarth = path.join(cesiumDir, 'Assets', 'Textures', 'NaturalEarthII', 'tilemapresource.xml');
  if (fs.existsSync(marker) && fs.existsSync(localEarth)) return;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cesium-build-'));
  const tgz = path.join(tmp, `cesium-${CESIUM_VERSION}.tgz`);
  const url = `https://registry.npmjs.org/cesium/-/cesium-${CESIUM_VERSION}.tgz`;
  fs.writeFileSync(tgz, await fetchBuffer(url));
  execFileSync('tar', ['-xzf', tgz, '-C', tmp], { stdio: 'inherit' });
  const src = path.join(tmp, 'package', 'Build', 'Cesium');
  if (!fs.existsSync(path.join(src, 'Cesium.js'))) throw new Error('Cesium build payload missing Cesium.js');
  fs.rmSync(cesiumDir, { recursive: true, force: true });
  fs.cpSync(src, cesiumDir, { recursive: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('[globe-assets] Cesium runtime copied to public/cesium');
}

await ensureCesium();

const files = [
  ['https://raw.githubusercontent.com/GIStudio/SpatialHarness/main/demo/data/ne_110m_admin_0_countries.geojson', 'ne_110m_admin_0_countries.geojson'],
  ['https://raw.githubusercontent.com/GIStudio/SpatialHarness/main/demo/data/china_boundary_lines.geojson', 'china_boundary_lines.geojson'],
  ['https://raw.githubusercontent.com/JayMuShui/chinese-global-compliant-geodata/main/src/geojson/countries/as/chn/global/chn-level-1.json', 'chn-level-1.json'],
  ['https://raw.githubusercontent.com/JayMuShui/chinese-global-compliant-geodata/main/src/geojson/countries/as/chn/global/chn-level-2.json', 'chn-level-2.json'],
  ['https://raw.githubusercontent.com/JayMuShui/chinese-global-compliant-geodata/main/src/geojson/countries/as/chn/global/chn-level-3.json', 'chn-level-3.json'],
];
for (const [url, name] of files) await ensureFile(url, path.join(mapDir, name));

fs.writeFileSync(path.join(publicDir, 'globe-assets-version.json'), JSON.stringify({
  cesium: CESIUM_VERSION,
  generatedAt: new Date().toISOString(),
  mapData: files.map(([, name]) => name),
}, null, 2));

console.log('[globe-assets] all local globe assets are ready');
