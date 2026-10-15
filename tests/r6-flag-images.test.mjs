import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({window:{NG14:{}}});
vm.runInContext(fs.readFileSync(new URL('../public/news-globe-v52-flag-images.js',import.meta.url),'utf8'),context);
const images=context.window.NG14.v52FlagImages;
function chunks(png){const out=[];for(let pos=8;pos+12<=png.length;){const length=png.readUInt32BE(pos);out.push({type:png.toString('ascii',pos+4,pos+8),data:png.subarray(pos+8,pos+8+length)});pos+=length+12;}return out;}
test('local flag resources cover arbitrary country pairs and contain actual multi-colour PNGs',()=>{
 assert.ok(Object.keys(images).length>=240);
 for(const cc of ['ru','ua','il','ir','in','pk','us','jp','cn','cd','af','mx']){
  assert.match(images[cc],/^data:image\/png;base64,/);
  const png=Buffer.from(images[cc].split(',')[1],'base64');
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),40);assert.equal(png.readUInt32BE(20),26);
  const palette=chunks(png).find(x=>x.type==='PLTE')?.data;
  assert.ok(palette&&palette.length>=6,cc+' must not be a white placeholder');
  assert.ok(palette.some(x=>x<180),cc+' must contain real flag colours');
  assert.ok(chunks(png).some(x=>x.type==='IDAT'&&x.data.length>5));
 }
 assert.match(fs.readFileSync(new URL('../public/news-globe-v52-flag-images.LICENSE.txt',import.meta.url),'utf8'),/MIT/);
});
