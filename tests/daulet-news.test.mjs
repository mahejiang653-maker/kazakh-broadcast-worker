import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "rolldown";

const dir = await mkdtemp(join(tmpdir(),"daulet-test-"));
for (const name of ["news","dsp","stream"]) await build({input:`app/lib/daulet-${name}.ts`,platform:"node",output:{file:join(dir,`${name}.mjs`),format:"esm"}});
const {prepareDauletNewsText,planDauletNewsChunks,splitNewsSentences,dauletNewsSsml} = await import(pathToFileURL(join(dir,"news.mjs")));
const {DauletNewsProcessor,pcm16Blocks} = await import(pathToFileURL(join(dir,"dsp.mjs")));
const {streamDauletChunks,readDauletStream,encodeDauletFrame} = await import(pathToFileURL(join(dir,"stream.mjs")));
test.after(()=>rm(dir,{recursive:true,force:true}));

test("Kazakh letters, compound names, soft wraps and source wording survive",()=>{
  const source="Ә ғ қ ң ө ұ ү һ і.\n\nҚасым-Жомарт\nТоқаев пен А. Байтұрсынұлы атындағы\nұйым туралы айтылды.";
  const spoken=prepareDauletNewsText(source);
  assert.match(spoken,/Ә ғ қ ң ө ұ ү һ і\./u);
  assert.match(spoken,/Қасым-Жомарт Тоқаев/u);
  assert.match(spoken,/атындағы ұйым/u);
  assert.equal(splitNewsSentences("А. Байтұрсынұлы келді. Келесі мәжіліс өтті.").length,2);
  assert.equal(splitNewsSentences("А. Б. Есімов келді. Ол т.б. мәселелерді атады.").length,2);
});
test("years, dates, ordinals, thousands, percentages and model numbers",()=>{
  const spoken=prepareDauletNewsText("2026 жылғы 26 қыркүйекте 1 500 км. 26.09.2026. 3-інші. 3,5%. AIM-9X және С-300. НАТО.");
  assert.match(spoken,/екі мың жиырма алтыншы жылғы қыркүйектің жиырма алтыншы күні/u);
  assert.match(spoken,/мың бес жүз километр/u);
  assert.match(spoken,/үшінші/u);
  assert.match(spoken,/үш бүтін оннан бес пайыз/u);
  assert.match(spoken,/эй ай эм тоғыз экс және эс үш жүз/u);
  assert.doesNotMatch(spoken,/\d/u);
  assert.match(prepareDauletNewsText("Нұсқа 1.2.3. https://example.com/v2"),/1\.2\.3.*https:\/\/example\.com\/v2/u);
  assert.match(prepareDauletNewsText("Сағат 14:30-да мәжіліс басталды."),/он төрт отызда/u);
});
test("number labels stay with the next sentence; new item starts a new chunk",()=>{
  const spoken=prepareDauletNewsText("1. Бірінші ел туралы айтылды. Мәжіліс өтті. Хабар аяқталды. Екінші. Жаңа ақпарат келді. Ол расталды.");
  const chunks=planDauletNewsChunks(spoken);
  assert.equal(chunks.length,2);
  assert.match(chunks[0].text,/^Бірінші\. Бірінші ел/u);
  assert.match(chunks[1].text,/^Екінші\. Жаңа/u);
  assert.equal(chunks[0].boundary,"paragraph");
  assert.equal(chunks.map(x=>x.text).join(" "),spoken);
});
test("15000-character manuscript keeps every sentence and has bounded natural groups",()=>{
  const sentence="Қазақстан мен Өзбекстан өкілдері Бірлескен мемлекеттер ұйымының мәжілісіне қатысты.";
  const source=Array.from({length:140},()=>sentence).join(" ");
  const prepared=prepareDauletNewsText(source), chunks=planDauletNewsChunks(prepared);
  assert.ok(chunks.length>20);
  assert.equal(chunks.map(x=>x.text).join(" "),prepared);
  assert.ok(chunks.length<=42);
  for(const c of chunks)assert.ok(splitNewsSentences(c.text).length<=6);
  assert.throws(()=>planDauletNewsChunks("Қазақша ".repeat(1500)),/sentence-too-long/);
});
test("one escaped prosody span; short text gets only a boundary release",()=>{
  const ssml=dauletNewsSsml({text:'А & Б <тест>.',rate:1.01303,boundary:"end"},0.82,0);
  assert.equal((ssml.match(/<prosody/g)||[]).length,1);
  assert.match(ssml,/rate="\+1.30%" pitch="\+0.82%" volume="\+0.00%"/);
  assert.match(ssml,/А &amp; Б &lt;тест&gt;/u);
  assert.equal((ssml.match(/<break/g)||[]).length,1);
  assert.match(ssml,/<break time="140ms"\/>/);
  assert.doesNotMatch(ssml,/<break time="(?:45|75)ms"\/>|range=/);
});
test("all thirteen news labels pause inside their original request, including merged paragraphs",()=>{
  const labels=["Бірінші","Екінші","Үшінші","Төртінші","Бесінші","Алтыншы","Жетінші","Сегізінші","Тоғызыншы","Оныншы","Он бірінші","Он екінші","Он үшінші"];
  for(const label of labels){
    const text=`${label}. Қазақстан өкілдері мәжіліске қатысты.`;
    const chunks=planDauletNewsChunks(prepareDauletNewsText(text));
    assert.equal(chunks.length,1);
    assert.equal(chunks[0].text,text);
    const ssml=dauletNewsSsml(chunks[0],0.82,0);
    assert.ok(ssml.includes(`${label}<break time="320ms"/> Қазақстан`));
    assert.equal((ssml.match(/<break/g)||[]).length,2);
    assert.match(ssml,/<break time="140ms"\/>/);
    assert.equal((ssml.match(/<prosody/g)||[]).length,1);
  }
  const spoken=prepareDauletNewsText("1. Алғашқы хабар.\n\n2. Келесі хабар. Он үшінші: Соңғы хабар.");
  const ssml=dauletNewsSsml({text:spoken,rate:1,boundary:"end"},0.82,0);
  assert.equal((ssml.match(/<break time="320ms"\/>/g)||[]).length,3);
  assert.equal((ssml.match(/<break time="140ms"\/>/g)||[]).length,1);
  const ordinary=dauletNewsSsml({text:'Бірінші кезекте мәселе қаралды. Екінші тарап келісті. <break time="900ms"/>',rate:1,boundary:"end"},0.82,0);
  assert.equal((ordinary.match(/<break/g)||[]).length,1);
  assert.match(ordinary,/<break time="140ms"\/>/);
  assert.match(ordinary,/&lt;break time=&quot;900ms&quot;\/&gt;/);
});

test("long dense news gets sparse punctuation breaths and a slightly calmer rate",()=>{
  const sentence=[
    "Қазақстан өкілдері халықаралық мәжілісте жаңа бастамаларды таныстырып",
    "экономикалық байланыс пен көлік дәліздерінің жағдайын егжей-тегжейлі түсіндірді",
    "сонымен бірге тараптар аймақтық қауіпсіздік пен сауда көрсеткіштерін талқылап",
    "келесі кезеңдегі бірлескен жұмыстың негізгі бағыттарын белгіледі"
  ].join(", ") + ".";
  const chunks=planDauletNewsChunks(sentence,1,true,true);
  assert.equal(chunks.length,1);
  assert.ok(chunks[0].rate<1);
  const ssml=dauletNewsSsml(chunks[0],0.82,0);
  assert.ok((ssml.match(/<break time="45ms"\/>/g)||[]).length>=1);
  assert.equal((ssml.match(/<break time="140ms"\/>/g)||[]).length,1);
});

function tone(freq=180,seconds=1,amplitude=0.25) {
  const out=new Int16Array(24000*seconds);
  for(let i=0;i<out.length;i++)out[i]=Math.round(Math.sin(2*Math.PI*freq*i/24000)*amplitude*32767);
  return out.buffer;
}
function mixedTone(frequencies=[180,410],seconds=1,amplitude=0.18) {
  const out=new Int16Array(24000*seconds);
  for(let i=0;i<out.length;i++) {
    const sample=frequencies.reduce((sum,f)=>sum+Math.sin(2*Math.PI*f*i/24000),0)/frequencies.length;
    out[i]=Math.round(sample*amplitude*32767);
  }
  return out.buffer;
}
test("DSP stays finite, caps de-gurgle correction and retains full voiced samples",()=>{
  const dsp=new DauletNewsProcessor();dsp.addPcm(tone(),"sentence");dsp.addPcm(tone(1000),"end");
  const out=dsp.finish(), data=[...pcm16Blocks(out.pieces,out.gain)].flatMap(x=>[...x]);
  assert.ok(out.metrics.maxDynamicCutDb<=3.001);
  assert.ok(out.metrics.samplePeakDb<=-2+1e-6);
  assert.ok(data.every(Number.isFinite));
  assert.equal(out.metrics.seams[0].silenceMs,280);
  assert.equal(Math.round(out.metrics.durationSeconds*24000),54720);
  assert.throws(()=>dsp.addPcm(tone(),"end"));
  const silent=new DauletNewsProcessor();assert.throws(()=>silent.addPcm(new ArrayBuffer(48000),"end"),/空白/u);
});
test("de-gurgle reacts to low resonance and leaves clear midrange essentially alone",()=>{
  const resonant=new DauletNewsProcessor();resonant.addPcm(tone(180,1,0.25),"end");
  const layered=new DauletNewsProcessor();layered.addPcm(mixedTone(),"end");
  const clean=new DauletNewsProcessor();clean.addPcm(tone(1000,1,0.25),"end");
  const resonantOut=resonant.finish(), layeredOut=layered.finish(), cleanOut=clean.finish();
  assert.ok(resonantOut.metrics.maxDynamicCutDb>1.0);
  assert.ok(layeredOut.metrics.maxDynamicCutDb>0.5);
  assert.ok(resonantOut.metrics.maxDynamicCutDb<=3.001);
  assert.ok(layeredOut.metrics.maxDynamicCutDb<=3.001);
  assert.ok(cleanOut.metrics.maxDynamicCutDb<0.5);
});
test("bounded synthesis concurrency preserves source order, even out-of-order replies",async()=>{
  const chunks=[0,1,2,3,4].map(n=>({text:String(n),boundary:n===4?"end":"sentence",rate:1}));
  let active=0,max=0;
  const stream=streamDauletChunks(chunks,async c=>{
    active++;max=Math.max(active,max);
    await new Promise(r=>setTimeout(r,c.text==="0"?15:1));active--;
    return new Uint16Array([Number(c.text)]).buffer;
  });
  const out=[];await readDauletStream(new Response(stream),async pcm=>{out.push(new Uint16Array(pcm)[0]);});
  assert.deepEqual(out,[0,1,2,3,4]);assert.equal(max,2);
});
test("partial synthesis or truncated transport never becomes a successful download",async()=>{
  const chunks=[{text:"fail",boundary:"end",rate:1}];
  const stream=streamDauletChunks(chunks,async()=>{throw new Error("upstream failed");});
  await assert.rejects(readDauletStream(new Response(stream),async()=>{}),/未完整/u);
  const packet=Buffer.concat([Buffer.from("DNV1"),...encodeDauletFrame({boundary:"end",sampleRate:24000},tone()).map(x=>Buffer.from(x))]);
  await assert.rejects(readDauletStream(new Response(packet),async()=>{}),/传输中断/u);
});
test("cancelling a pending chunk aborts upstream without writing to a closed stream",async()=>{
  let complete,signal;
  const stream=streamDauletChunks([{text:"pending",boundary:"end",rate:1}],(_chunk,s)=>{
    signal=s;return new Promise(resolve=>{complete=resolve;});
  });
  const reader=stream.getReader();await reader.read();
  const pending=reader.read();await reader.cancel();complete(tone());
  assert.equal(signal.aborted,true);
  assert.equal((await pending).done,true);
});
