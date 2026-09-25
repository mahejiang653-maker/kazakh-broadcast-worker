import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const context=vm.createContext({window:{NG14:{},addEventListener(){}}});
for(const name of ['screen-layout','screen-space'])vm.runInContext(fs.readFileSync(new URL(`../public/releases/y1/news-globe-v14-v52-${name}.js`,import.meta.url),'utf8'),context);
const {ScreenLayout:L,ScreenVisibilityGate:Gate}=context.window.NG14;
const bounds=L.rect(8,8,304,164);
const label=(id,x,y,priority=50)=>({id,anchor:{x,y,radius:7},width:94,height:29,priority});
function safe(result,area,obstacles=[]){
  const visible=result.filter(x=>!x.hidden);
  for(const [i,item] of visible.entries()){
    assert.ok(L.contains(area,item.box),`${item.id} within safe area`);
    for(const obstacle of [...obstacles,...visible.slice(0,i).map(x=>x.box)])assert.equal(L.overlaps(item.box,obstacle,3.99),false,`${item.id} does not collide`);
  }
}

test('four screen corners flip labels inward without moving the anchors',()=>{
  const items=[label('nw',22,22),label('ne',298,22),label('sw',22,158),label('se',298,158)];
  const original=JSON.stringify(items),markers=items.map(x=>L.rect(x.anchor.x-8,x.anchor.y-8,16,16));
  const result=L.solve(items,bounds,markers);safe(result,bounds,markers);
  assert.equal(result.filter(x=>!x.hidden).length,4);assert.equal(JSON.stringify(items),original);
  assert.ok(['bottom','right'].includes(result.find(x=>x.id==='nw').direction));
  assert.ok(['top','left'].includes(result.find(x=>x.id==='se').direction));
});

test('left and right points prefer opening toward the visual interior',()=>{
  assert.equal(L.solve([label('left',45,90)],bounds)[0].direction,'right');
  assert.equal(L.solve([label('right',275,90)],bounds)[0].direction,'left');
});

test('all four candidate directions are usable when the other sides are blocked',()=>{
  const a=label('center',300,300);
  for(const direction of ['left','right','top','bottom']){
    const horizontal=['left','right'].includes(direction),area=horizontal?L.rect(0,270,600,60):L.rect(240,0,120,600);
    const obstacles=[direction==='left'?L.rect(310,0,290,600):direction==='right'?L.rect(0,0,290,600):direction==='top'?L.rect(0,310,600,290):L.rect(0,0,600,290)];
    const [result]=L.solve([a],area,obstacles);assert.equal(result.hidden,false,direction);assert.equal(result.direction,direction);safe([result],area,obstacles);
  }
});

test('nearby red, blue and yellow markers all reserve space',()=>{
  const items=[label('red',145,80,100),label('blue',172,80,90),label('yellow',160,115,120)];
  const markers=items.map(x=>L.rect(x.anchor.x-9,x.anchor.y-9,18,18)),result=L.solve(items,bounds,markers);
  safe(result,bounds,markers);assert.equal(result.filter(x=>!x.hidden).length,3);
});

test('news body and top/bottom controls are treated as measured obstacles',()=>{
  const area=L.rect(8,8,784,434),obstacles=[L.rect(0,0,800,70),L.rect(0,350,800,100),L.rect(500,180,280,130)];
  const result=L.solve([label('news',480,225,100),label('north',200,90),label('south',200,330)],area,obstacles);
  safe(result,area,obstacles);assert.equal(result.filter(x=>!x.hidden).length,3);
});

test('crowded labels yield by priority instead of overlapping markers or text',()=>{
  const items=Array.from({length:30},(_,i)=>label(`item-${i}`,160+i%3,88+i%4,i===29?200:10));
  const result=L.solve(items,bounds,[L.rect(150,78,28,28)]);safe(result,bounds,[L.rect(150,78,28,28)]);
  assert.equal(result.find(x=>x.id==='item-29').hidden,false);assert.ok(result.some(x=>x.hidden));
});

test('a previously valid direction remains stable during small marker movement',()=>{
  const area=L.rect(0,0,800,450),a={...label('a',400,225),previousDirection:'right'};
  assert.equal(L.solve([a],area)[0].direction,'right');a.anchor.x++;
  assert.equal(L.solve([a],area)[0].direction,'right');
});

test('safe area combines visual viewport, scroll position and all device insets',()=>{
  const frame=L.rect(0,10,360,202.5),viewport=L.rect(0,30,360,170);
  const result=L.safeBounds(frame,viewport,{top:20,right:12,bottom:24,left:12});
  assert.equal(result.left,12);assert.equal(result.top,40);assert.equal(result.right,348);assert.equal(result.bottom,166);
});

test('portrait, landscape and address-bar height changes keep labels within visible space',()=>{
  for(const [width,height,bar] of [[320,640,0],[360,780,44],[740,360,0],[740,320,32],[1280,900,0]]){
    const frame=L.rect(8,70,width-16,(width-16)*9/16),viewport=L.rect(0,bar,width,height-bar),area=L.safeBounds(frame,viewport,{left:12,right:12,bottom:20});
    const result=L.solve([label('current',area.left+area.width/2,area.top+area.height/2)],area);safe(result,area);assert.equal(result[0].hidden,false);
  }
});

test('oversized labels and invisible viewports never overflow as a fallback',()=>{
  const big={...label('long',160,90),width:1000,height:90};
  assert.equal(L.solve([big],bounds)[0].hidden,true);
  assert.equal(L.solve([label('offscreen',0,0)],L.rect(0,0,0,0))[0].hidden,true);
});

test('forty successive layouts contain only the current label IDs',()=>{
  for(let i=0;i<40;i++){
    const [current]=L.solve([label(`story-${i}`,40+i*4,80)],bounds);assert.equal(current.id,`story-${i}`);safe([current],bounds);
  }
});

const cesiumPath=process.env.CESIUM_TEST_BUNDLE;
test('visibility ownership preserves callbacks, external replacements and restores cleanly',{skip:!cesiumPath},()=>{
  const C=createRequire(import.meta.url)(cesiumPath),time=C.JulianDate.now();let shown=true;
  const original=new C.CallbackProperty(()=>shown,false),graphics=new C.LabelGraphics({text:'test',show:original});
  const before=graphics.definitionChanged.numberOfListeners,gate=new Gate(C,graphics,false);
  assert.equal(graphics.show.getValue(time),false);assert.equal(gate.sourceVisible(time),true);
  shown=false;assert.equal(gate.sourceVisible(time),false);gate.enabled=true;assert.equal(graphics.show.getValue(time),false);
  const replacement=new C.ConstantProperty(true);graphics.show=replacement;
  assert.equal(graphics.show,gate.property);assert.equal(graphics.show.getValue(time),true);
  gate.destroy();assert.equal(graphics.show,replacement);assert.equal(graphics.definitionChanged.numberOfListeners,before);
});
