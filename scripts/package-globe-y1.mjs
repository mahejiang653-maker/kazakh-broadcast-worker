// Freeze the reviewed V52 checkpoint without replacing scripts used by A1/daily pages.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const source = path.resolve(process.argv[2] || '../news-globe-stability');
const project = path.resolve(import.meta.dirname, '..');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: source, encoding: 'utf8'}).trim();
if (!sourceCommit.startsWith('6798999')) throw new Error('Y1 must be packaged from the reviewed 6798999 checkpoint');
const read = name => execFileSync('git', ['show', `${sourceCommit}:public/${name}`], {cwd: source, maxBuffer: 8 * 1024 * 1024});
const entry = read('news-globe-v52.html').toString();
const shell = read('news-globe-v34.html').toString();
let html;
// Evaluate only the existing loader; document.write captures the exact assembled HTML.
await vm.runInNewContext(entry.match(/<script>([\s\S]*?)<\/script>/)[1], {
  fetch: async url => {
    if (url !== '/news-globe-v34.html?v=52') throw new Error(`Unexpected shell: ${url}`);
    return {text: async () => shell};
  },
  document: {open() {}, write(value) {html = value;}, close() {}},
  console: {error(error) {throw error;}},
});
if (!html?.includes('news-globe-v14-v52-screen-space.js')) throw new Error('Incomplete V52 loader output');
const paths = [...new Set([...html.matchAll(/(?:src|href)="\/(news-globe[^"?]+)(?:\?[^" ]*)?"/g)].map(match => match[1]))];
const release = path.join(project, 'public/releases/y1');
fs.mkdirSync(release, {recursive: true});
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const assets = [];
for (const name of paths) {
  const bytes = read(name);
  fs.writeFileSync(path.join(release, name), bytes);
  assets.push({path: `/releases/y1/${name}`, sha256: digest(bytes), bytes: bytes.length});
}
html = html.replace(/((?:src|href)=")\/(news-globe[^"?]+)(?:\?[^" ]*)?"/g, '$1/releases/y1/$2?v=Y1"');
html = html.replace(/<title>[^<]*<\/title>/, '<title>全球新闻地球仪 Y1</title>')
  .replace('<strong>全球新闻 · 十三地定位</strong>', '<strong>全球新闻地球仪 · Y1</strong>')
  .replace('V52 · 精确落点 · 攻击特效 · 航母靠港 · 自适应镜头留白', 'Y1 · V52 稳定化 · 精确落点 · 特效清理 · 标签避让')
  .replace(/V34/g, 'Y1');
html = html.replace('</head>', `<meta name="globe-release" content="Y1"><meta name="globe-checkpoint" content="${sourceCommit}"></head>`);
fs.writeFileSync(path.join(project, 'public/news-globe-y1.html'), html);
fs.writeFileSync(path.join(release, 'manifest.json'), JSON.stringify({
  release: 'Y1', baseline: 'V52', sourceCommit,
  entry: {path: '/news-globe-y1.html', sha256: digest(html)},
  assets,
}, null, 2) + '\n');
console.log(`Y1: ${assets.length} byte-identical V52 assets, ${assets.reduce((sum, asset) => sum + asset.bytes, 0)} bytes`);
