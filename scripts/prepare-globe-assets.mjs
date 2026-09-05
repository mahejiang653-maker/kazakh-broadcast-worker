import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { gzipSync, gunzipSync } from 'node:zlib';

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

function buildV18Loader() {
  const input = path.join(publicDir, 'news-globe-v17-loader.js');
  const output = path.join(publicDir, 'news-globe-v18-loader.js');
  if (!fs.existsSync(input)) throw new Error('Missing public/news-globe-v17-loader.js');
  const loader = fs.readFileSync(input, 'utf8');
  const match = loader.match(/const b='([^']+)'/);
  if (!match) throw new Error('Could not decode V17 globe loader');
  let source = gunzipSync(Buffer.from(match[1], 'base64')).toString('utf8');

  source = source.replace(
    / const WORLD_URLS=\[[\s\S]*?\];\n const CHINA_LINES_URLS=\[[\s\S]*?\];\n const CHINA_LEVEL1_URLS=\[[\s\S]*?\];/,
    " const WORLD_URLS=['/map-data/ne_110m_admin_0_countries.geojson'];\n const CHINA_LINES_URLS=['/map-data/china_boundary_lines.geojson'];\n const CHINA_LEVEL1_URLS=['/map-data/chn-level-1.json'];",
  );

  const satelliteOld = " function addSatelliteFast(){try{const p=new Cesium.UrlTemplateImageryProvider({url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',tilingScheme:new Cesium.WebMercatorTilingScheme(),maximumLevel:19,credit:new Cesium.Credit('Esri World Imagery'),enablePickFeatures:false});return viewer.imageryLayers.addImageryProvider(p)}catch(e){console.warn('快速卫星底图初始化失败',e);return null}}";
  const satelliteNew = " async function addLocalBase(){try{const p=await Cesium.TileMapServiceImageryProvider.fromUrl('/cesium/Assets/Textures/NaturalEarthII',{credit:new Cesium.Credit('Cesium Natural Earth II')});const l=viewer.imageryLayers.addImageryProvider(p);l.alpha=1;return l}catch(e){console.error('站内 NaturalEarthII 底图加载失败',e);return null}}\n function addSatelliteFast(){try{const p=new Cesium.UrlTemplateImageryProvider({url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',tilingScheme:new Cesium.WebMercatorTilingScheme(),maximumLevel:19,credit:new Cesium.Credit('Esri World Imagery'),enablePickFeatures:false});const l=viewer.imageryLayers.addImageryProvider(p);l.alpha=1;return l}catch(e){console.warn('Esri 高清底图初始化失败，本地底图继续工作',e);return null}}";
  source = source.replace(satelliteOld, satelliteNew);

  const initOld = " async function initViewer(){viewer=new Cesium.Viewer('globe',{baseLayer:false,animation:false,timeline:false,baseLayerPicker:false,geocoder:false,homeButton:false,sceneModePicker:false,navigationHelpButton:false,fullscreenButton:false,infoBox:false,selectionIndicator:false,shouldAnimate:true});viewer.imageryLayers.removeAll();viewer.scene.backgroundColor=Cesium.Color.fromCssColorString('#02060d');viewer.scene.globe.baseColor=Cesium.Color.fromCssColorString('#07111e');viewer.scene.globe.enableLighting=false;viewer.scene.globe.showGroundAtmosphere=false;viewer.scene.globe.depthTestAgainstTerrain=true;viewer.scene.skyAtmosphere.show=true;viewer.scene.fog.enabled=false;viewer.scene.screenSpaceCameraController.minimumZoomDistance=450000;viewer.scene.screenSpaceCameraController.maximumZoomDistance=35000000;const mobile=window.matchMedia&&window.matchMedia('(max-width:760px)').matches;viewer.resolutionScale=Math.min(window.devicePixelRatio||1,mobile?1.45:2.0);viewer.scene.globe.maximumScreenSpaceError=mobile?1.25:.85;viewer.scene.globe.preloadAncestors=true;viewer.scene.globe.preloadSiblings=!mobile;try{viewer.scene.msaaSamples=mobile?1:2}catch{}viewer.camera.setView({destination:Cesium.Cartesian3.fromDegrees(95,22,16000000),orientation:{heading:0,pitch:Cesium.Math.toRadians(-90),roll:0}});addSatelliteFast();$('mapStatus').textContent='地球已就绪 · 地图数据后台加载';setTimeout(()=>upgradeMapLayersInBackground(),0)}";
  const initNew = " async function initViewer(){viewer=new Cesium.Viewer('globe',{baseLayer:false,animation:false,timeline:false,baseLayerPicker:false,geocoder:false,homeButton:false,sceneModePicker:false,navigationHelpButton:false,fullscreenButton:false,infoBox:false,selectionIndicator:false,shouldAnimate:true,skyBox:false});viewer.imageryLayers.removeAll();viewer.scene.backgroundColor=Cesium.Color.fromCssColorString('#02060d');viewer.scene.globe.baseColor=Cesium.Color.fromCssColorString('#07111e');viewer.scene.globe.enableLighting=false;viewer.scene.globe.showGroundAtmosphere=false;viewer.scene.globe.depthTestAgainstTerrain=true;viewer.scene.skyAtmosphere.show=true;viewer.scene.fog.enabled=false;viewer.scene.screenSpaceCameraController.minimumZoomDistance=450000;viewer.scene.screenSpaceCameraController.maximumZoomDistance=35000000;const mobile=window.matchMedia&&window.matchMedia('(max-width:760px)').matches;viewer.resolutionScale=Math.min(window.devicePixelRatio||1,mobile?1.3:1.85);viewer.scene.globe.maximumScreenSpaceError=mobile?1.45:.95;viewer.scene.globe.preloadAncestors=true;viewer.scene.globe.preloadSiblings=false;try{viewer.scene.msaaSamples=1}catch{}viewer.camera.setView({destination:Cesium.Cartesian3.fromDegrees(95,22,16000000),orientation:{heading:0,pitch:Cesium.Math.toRadians(-90),roll:0}});$('mapStatus').textContent='正在打开站内地球…';await addLocalBase();$('mapStatus').textContent='站内地球已就绪 · 高清图层后台加载';requestAnimationFrame(()=>viewer.scene.requestRender());setTimeout(()=>{try{addSatelliteFast()}catch{}},350);setTimeout(()=>upgradeMapLayersInBackground(),650)}";
  source = source.replace(initOld, initNew);
  source = source.replace("$('mapStatus').textContent=tdtToken?'高清卫星 + 天地图境界':'高清卫星 + 中国标准国界';", "$('mapStatus').textContent=tdtToken?'站内底图 + 天地图高清境界':'站内底图 + 站内国界数据';");
  source = source.replace("$('mapStatus').textContent='高清卫星 · 国界加载失败'", "$('mapStatus').textContent='站内地球可用 · 国界数据加载失败'");

  if (!source.includes("WORLD_URLS=['/map-data/") || !source.includes('async function addLocalBase') || !source.includes("await addLocalBase()")) {
    throw new Error('V18 runtime patch did not apply cleanly');
  }

  const b64 = gzipSync(Buffer.from(source), { level: 9 }).toString('base64');
  const out = `(async()=>{const b='${b64}',u=Uint8Array.from(atob(b),c=>c.charCodeAt(0)),ds=new DecompressionStream('gzip'),t=await new Response(new Blob([u]).stream().pipeThrough(ds)).text();(0,eval)(t)})();\n`;
  fs.writeFileSync(output, out);
  console.log('[globe-assets] V18 self-hosted globe loader generated');
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

buildV18Loader();

fs.writeFileSync(path.join(publicDir, 'globe-assets-version.json'), JSON.stringify({
  cesium: CESIUM_VERSION,
  generatedAt: new Date().toISOString(),
  mapData: files.map(([, name]) => name),
}, null, 2));

console.log('[globe-assets] all local globe assets are ready');
