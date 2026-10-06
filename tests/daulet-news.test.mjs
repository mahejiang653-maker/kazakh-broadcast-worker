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
  assert.equal((ssml.match(/<p>/g)||[]).length,1);
  assert.equal((ssml.match(/<s>/g)||[]).length,1);
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

test("long dense news retains native punctuation phrasing and a slightly calmer rate",()=>{
  const sentence=[
    "Қазақстан өкілдері халықаралық мәжілісте жаңа бастамаларды таныстырып",
    "экономикалық байланыс пен көлік дәліздерінің жағдайын егжей-тегжейлі түсіндірді",
    "сонымен бірге тараптар аймақтық қауіпсіздік пен сауда көрсеткіштерін жан-жақты талқылап",
    "энергия тасымалы мен шекаралық ынтымақтастық жөніндегі деректерді жеке қарастырды",
    "сарапшылар алдағы кезеңдегі тәуекелдер мен мүмкіндіктер туралы қосымша бағалау ұсынды",
    "келесі кезеңдегі бірлескен жұмыстың негізгі бағыттарын нақтылап белгіледі"
  ].join(", ") + ".";
  const chunks=planDauletNewsChunks(sentence,1,true,true);
  assert.equal(chunks.length,1);
  assert.ok(chunks[0].rate<1);
  const ssml=dauletNewsSsml(chunks[0],0.82,0);
  assert.doesNotMatch(ssml,/<break time="(?:45|75)ms"\/>/);
  assert.equal((ssml.match(/,/g)||[]).length,5);
  assert.equal((ssml.match(/<s>/g)||[]).length,1);
  assert.equal((ssml.match(/<break time="140ms"\/>/g)||[]).length,1);
});

test("a compact four/five-sentence item remains one request without absorbing the next numbered item",()=>{
  const sentences=["Бірінші. Қазақстан өкілдері жаңа мәлімет ұсынды.","Мамандар деректерді салыстырды.","Тараптар ұсыныстарды талқылады.","Келесі мәжіліс Алматыда өтеді.","Қосымша мәлімет кейін беріледі."];
  for(const count of [4,5]) {
    const item=sentences.slice(0,count).join(" ");
    const chunks=planDauletNewsChunks(item);
    assert.equal(chunks.length,1);
    assert.equal(chunks[0].text,item);
    const ssml=dauletNewsSsml(chunks[0],0.82,0);
    assert.equal((ssml.match(/<s>/g)||[]).length,count);
    assert.equal((ssml.match(/<prosody/g)||[]).length,1);
    assert.equal((ssml.match(/320ms/g)||[]).length,1);
    const withNext=planDauletNewsChunks(item+" Екінші. Келесі жаңалық берілді.");
    assert.ok(withNext.length>=2);
    assert.ok(withNext.at(-1).text.startsWith("Екінші."));
    assert.equal(withNext.map(c=>c.text).join(" "),item+" Екінші. Келесі жаңалық берілді.");
  }
});

test("news emotion choices retain the native renderer, ordinal pauses and bounded item-level shading",()=>{
  const text="Бірінші. Қазақстан өкілдері жаңа мәлімет ұсынды. Мамандар деректерді салыстырды.";
  const chunk=planDauletNewsChunks(text)[0];
  const base=dauletNewsSsml(chunk,0.82,0);
  const parse=s=>[...s.match(/rate="([+-]?[\d.]+)%" pitch="([+-]?[\d.]+)%" volume="([+-]?[\d.]+)%"/).slice(1)].map(Number);
  for(const emotion of ["happy","angry","sad","afraid","disgusted","melancholic","surprised","calm"]) {
    const directed=dauletNewsSsml(chunk,0.82,0,[{text:"Қазақстан өкілдері жаңа мәлімет ұсынды.",emotion,intensity:1}]);
    assert.equal((directed.match(/<prosody/g)||[]).length,1);
    assert.equal((directed.match(/320ms/g)||[]).length,1);
    assert.equal((directed.match(/<s>/g)||[]).length,2);
    assert.doesNotMatch(directed,/<emphasis|contour=|range=|<mstts:/);
    const a=parse(base),b=parse(directed);
    assert.ok(Math.abs(a[0]-b[0])<=0.51);
    assert.ok(Math.abs(a[1]-b[1])<=0.15);
    assert.ok(Math.abs(a[2]-b[2])<=0.07);
  }
  assert.equal(dauletNewsSsml(chunk,0.82,0,[{text:"Бірінші.",emotion:"angry",intensity:1}]),base);
  assert.equal(dauletNewsSsml(chunk,0.82,0,[{text:"Осы мәтін жоқ.",emotion:"sad",intensity:1}]),base);
});

test("a numbered item's six-sentence continuation merges without swallowing another item or paragraph",()=>{
  const item=["Бірінші. Қазақстан өкілдері жаңа мәлімет ұсынды.","Мамандар деректерді салыстырды.","Тараптар ұсыныстарды талқылады.","Келесі мәжіліс Алматыда өтеді.","Қосымша мәлімет кейін беріледі.","Бұл жұмыс алдағы уақытта да жалғасады."].join(" ");
  const next="Екінші. Келесі жаңалық берілді.";
  const chunks=planDauletNewsChunks(item+" "+next,1,true,true);
  assert.equal(chunks.length,2);
  assert.equal(chunks[0].text,item);
  assert.equal(chunks[1].text,next);
  assert.equal(chunks[0].boundary,"paragraph");
  const ssml=dauletNewsSsml(chunks[0],.82,0);
  assert.equal((ssml.match(/<prosody/g)||[]).length,1);
  assert.equal((ssml.match(/320ms/g)||[]).length,1);
  const paragraph="Қорытынды мәлімет кейін беріледі.";
  const separated=planDauletNewsChunks(item+"\n\n"+paragraph,1,true,true);
  assert.equal(separated.length,2);
  assert.equal(separated[1].text,paragraph);
});

test("semantic presenter direction is small, deterministic and single-span",()=>{
  const text=[
    "Бірінші. Қазақстан өкілдері жаңа мәлімет ұсынды.",
    "Көрсеткіш он бес пайыз деңгейінде қалыптасты.",
    "Алайда тараптар келіссөзді жалғастыратынын айтты.",
    "Нәтижесінде мәжіліс аяқталды."
  ].join("\n\n");
  const chunks=planDauletNewsChunks(text,1,true,true);
  assert.equal(chunks.length,4);
  assert.equal(chunks[0].delivery,"lead");
  assert.equal(chunks[0].pitchDelta,0);
  assert.ok(chunks[0].volumeDelta>0);
  assert.equal(chunks[1].delivery,"data");
  assert.equal(chunks[1].pitchDelta,0);
  assert.equal(chunks[2].delivery,"transition");
  assert.equal(chunks[2].pitchDelta,0);
  assert.equal(chunks[3].delivery,"settle");
  assert.equal(chunks[3].pitchDelta,0);
  assert.ok(chunks[3].volumeDelta<0);

  const leadSsml=dauletNewsSsml(chunks[0],0.82,0);
  assert.equal((leadSsml.match(/<prosody/g)||[]).length,1);
  assert.match(leadSsml,/pitch="\+0\.82%" volume="\+0\.10%"/);

  const plain=planDauletNewsChunks(text,1,true,false);
  assert.ok(plain.every(chunk=>chunk.pitchDelta===0 && chunk.volumeDelta===0));
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
test("low-pulse control rejects normal male periods and only attenuates slower voiced pulses",()=>{
  for (const frequency of [100,110,121,133,147,160]) {
    const normal=new DauletNewsProcessor();normal.addPcm(mixedTone([frequency,frequency*2,frequency*3]),"end");
    const out=normal.finish();
    assert.equal(out.metrics.lowPulseFrames,0);
    assert.equal(out.metrics.maxLowPulseCutDb,0);
    assert.equal(out.metrics.maxPulseHarmonicCutDb,0);
    assert.equal(out.metrics.confirmedPulseFrames,0);
    assert.ok(out.metrics.maxResonanceCutDb<=3.001);
  }
  const slow=new DauletNewsProcessor();slow.addPcm(tone(68,2,0.25),"end");
  const out=slow.finish();
  assert.ok(out.metrics.lowPulseFrames>50);
  assert.ok(out.metrics.maxLowPulseCutDb>1.5);
  assert.ok(out.metrics.maxDynamicCutDb<=13.001);
  assert.equal(out.metrics.durationSeconds,2);
  assert.ok(out.pieces.every(piece=>piece.every(Number.isFinite)));
  // Quiet ending-like energy must still engage the probe below the resonance gate.
  const quiet=new DauletNewsProcessor();quiet.addPcm(tone(68,1,0.015),"end");
  assert.ok(quiet.finish().metrics.maxLowPulseCutDb>0.5);
  const overlapping=new DauletNewsProcessor();overlapping.addPcm(mixedTone([68,136,204],2),"end");
  const overlappingOut=overlapping.finish();
  assert.ok(overlappingOut.metrics.maxDynamicCutDb<=13.001);
  assert.ok(overlappingOut.metrics.maxResonanceCutDb<=3.001);
  assert.ok(overlappingOut.metrics.maxPulseHarmonicCutDb>0.2);
  assert.ok(overlappingOut.metrics.maxPulseHarmonicCutDb<=1.501);
  assert.ok(overlappingOut.metrics.confirmedPulseFrames>50);
});
test("pulse and overtone branches preserve unvoiced noise and low-level tails",()=>{
  let seed=93437;
  const noise=new Int16Array(48000);
  for(let i=0;i<noise.length;i++) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    noise[i]=Math.round((seed/2**32*2-1)*0.1*32767);
  }
  const unvoiced=new DauletNewsProcessor();unvoiced.addPcm(noise.buffer,"end");
  const noiseOut=unvoiced.finish();
  assert.equal(noiseOut.metrics.maxLowPulseCutDb,0);
  assert.equal(noiseOut.metrics.maxPulseHarmonicCutDb,0);
  assert.equal(noiseOut.metrics.confirmedPulseFrames,0);
  const tail=new DauletNewsProcessor();tail.addPcm(mixedTone([68,136,204],1,0.015),"end");
  const tailOut=tail.finish();
  assert.ok(tailOut.metrics.confirmedPulseFrames>10);
  assert.ok(tailOut.metrics.maxPulseHarmonicCutDb>0.1);
  assert.equal(tailOut.metrics.durationSeconds,1);
  assert.ok(tailOut.pieces.every(piece=>piece.every(Number.isFinite)));
});
test("tracked bells reduce distinct slow fundamentals without removing clear upper speech energy",()=>{
  const amplitudeAt=(data,frequency)=>{
    let sine=0,cosine=0;
    for(let i=24000;i<48000;i++) {
      const phase=2*Math.PI*frequency*i/24000;
      sine+=data[i]*Math.sin(phase);cosine+=data[i]*Math.cos(phase);
    }
    return 2*Math.hypot(sine,cosine)/24000;
  };
  for(const frequency of [52,68,82]) {
    const dsp=new DauletNewsProcessor();dsp.addPcm(mixedTone([frequency,1000],2,0.2),"end");
    const out=dsp.finish(),data=out.pieces[0],range=out.metrics.lowPulseFrequencyRangeHz;
    assert.ok(range && range[0]<=frequency+2 && range[1]>=frequency-2);
    assert.ok(20*Math.log10(amplitudeAt(data,frequency)/0.1)<-2);
    assert.ok(Math.abs(20*Math.log10(amplitudeAt(data,1000)/0.1))<0.5);
    assert.ok(out.metrics.maxDynamicCutDb<=13.001);
    assert.ok(data.every(Number.isFinite));
  }
});
test("half-frequency evidence distinguishes alternating pulses from quantised normal male periods",()=>{
  for (const frequency of [101,121,133,147,165]) {
    for (const alternating of [false,true]) {
      const data=new Int16Array(48000);
      for (let i=0;i<data.length;i++) {
        const phase=2*Math.PI*frequency*i/24000;
        const sample=0.13*Math.sin(phase)+0.06*Math.sin(phase*2)
          +(alternating ? 0.03*Math.sin(phase/2)+0.015*Math.sin(phase*1.5) : 0);
        data[i]=Math.round(sample*32767);
      }
      const dsp=new DauletNewsProcessor();dsp.addPcm(data.buffer,"end");
      const out=dsp.finish();
      if (alternating) {
        assert.ok(out.metrics.subharmonicFrames>50,`missed half-frequency at ${frequency}`);
        assert.ok(out.metrics.maxLowPulseCutDb>0.5);
      } else {
        assert.equal(out.metrics.subharmonicFrames,0,`misclassified regular ${frequency} Hz`);
        assert.equal(out.metrics.maxLowPulseCutDb,0);
        assert.equal(out.metrics.maxAdjacentPulseMix,0);
      }
      assert.equal(out.metrics.durationSeconds,2);
      assert.ok(out.pieces.every(piece=>piece.every(Number.isFinite)));
    }
  }
});
test("adjacent-pulse smoothing reduces odd overtones while retaining body and upper speech",()=>{
  const data=new Int16Array(48000),amplitudes=[.03,.13,.02,.06,.015];
  for(let i=0;i<data.length;i++) {
    const phase=2*Math.PI*65*i/24000;
    const voice=amplitudes.reduce((sum,amplitude,h)=>sum+amplitude*Math.sin(phase*(h+1)),0);
    data[i]=Math.round((voice+.025*Math.sin(2*Math.PI*4000*i/24000))*32767);
  }
  const processor=new DauletNewsProcessor();processor.addPcm(data.buffer,"end");
  const out=processor.finish(),samples=out.pieces[0];
  const amplitudeAt=frequency=>{
    let real=0,imaginary=0;
    for(let i=24000;i<48000;i++) {
      const phase=2*Math.PI*frequency*i/24000;
      real+=samples[i]*Math.cos(phase);imaginary+=samples[i]*Math.sin(phase);
    }
    return 2*Math.hypot(real,imaginary)/24000;
  };
  assert.ok(out.metrics.confirmedAlternatingFrames>50);
  assert.ok(out.metrics.maxAdjacentPulseMix>.19 && out.metrics.maxAdjacentPulseMix<=.200001);
  assert.ok(20*Math.log10(amplitudeAt(325)/.015)<-1.0,"odd fifth harmonic remains too strong");
  assert.ok(20*Math.log10(amplitudeAt(130)/.13)>-4,"body harmonic is over-attenuated");
  assert.ok(Math.abs(20*Math.log10(amplitudeAt(4000)/.025))<.5,"upper speech changes too much");
  assert.ok(out.metrics.maxDynamicCutDb<=13.001);
  assert.equal(out.metrics.durationSeconds,2);
  assert.ok(samples.every(Number.isFinite));
});
test("ordinary low pitch and absent half-frequency energy never enable adjacent-pulse mixing",()=>{
  for(const frequency of [52,65,75,85,100,130,165]) {
    const data=new Int16Array(48000);
    for(let i=0;i<data.length;i++) {
      const phase=2*Math.PI*frequency*i/24000;
      data[i]=Math.round((.14*Math.sin(phase)+.035*Math.sin(phase*2)+.01*Math.sin(phase*3))*32767);
    }
    const processor=new DauletNewsProcessor();processor.addPcm(data.buffer,"end");
    const out=processor.finish();
    assert.equal(out.metrics.maxAdjacentPulseMix,0,`regular ${frequency} Hz was averaged`);
    assert.equal(out.metrics.confirmedAlternatingFrames,0);
  }
});
test("normal moving male pitch stays outside adjacent-pulse processing",()=>{
  const data=new Int16Array(96000);let phase=0;
  for(let i=0;i<data.length;i++) {
    const frequency=130+30*Math.sin(2*Math.PI*.7*i/24000);
    phase+=2*Math.PI*frequency/24000;
    data[i]=Math.round((.13*Math.sin(phase)+.06*Math.sin(phase*2))*32767);
  }
  const processor=new DauletNewsProcessor();processor.addPcm(data.buffer,"end");
  const out=processor.finish();
  assert.equal(out.metrics.maxAdjacentPulseMix,0);
  assert.equal(out.metrics.durationSeconds,4);
});
test("a constant male body stays stable when intermittent low pulses toggle the correction",()=>{
  const data=new Int16Array(24000*6);
  for(let i=0;i<data.length;i++){
    const phase=2*Math.PI*130*i/24000,active=Math.floor(i/24000)%2===1;
    const x=.13*Math.sin(phase)+.06*Math.sin(phase*2)+.025*Math.sin(2*Math.PI*4000*i/24000)
      +(active ? .03*Math.sin(phase/2)+.02*Math.sin(phase*1.5)+.015*Math.sin(phase*2.5) : 0);
    data[i]=Math.round(x*32767);
  }
  const processor=new DauletNewsProcessor();processor.addPcm(data.buffer,"end");
  const out=processor.finish(),x=out.pieces[0],body=[];
  for(let second=1;second<6;second++){
    const start=second*24000+12000,end=second*24000+21600;let real=0,imaginary=0;
    for(let i=start;i<end;i++){
      real+=x[i]*Math.cos(2*Math.PI*130*i/24000);
      imaginary+=x[i]*Math.sin(2*Math.PI*130*i/24000);
    }
    body.push(2*Math.hypot(real,imaginary)/(end-start));
  }
  assert.ok(20*Math.log10(Math.max(...body)/Math.min(...body))<.25,"constant body changes with the pulse control");
  assert.ok(out.metrics.confirmedPulseFrames>50,"test did not engage the correction");
  assert.ok(out.metrics.maxLowPulseCutDb>5,"low-pulse treatment was weakened instead of isolated");
  assert.equal(out.metrics.durationSeconds,6);
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
