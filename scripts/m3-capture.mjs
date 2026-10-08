/** One authorized QA request. Captures the live endpoint's pre-processing PCM, never keys. No retry/resume. */
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {build} from 'rolldown';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const [mode,model='gemini-3.8-flash-tts',name=`${mode}-${model}`]=process.argv.slice(2);
if(!['short','long'].includes(mode)||!['gemini-3.8-flash-tts','gemini-3.8-flash-lite-tts'].includes(model))throw Error('Usage: node scripts/m3-capture.mjs short|long [model] [unique-run-name]');
const directory=resolve('work/m3/v11');await mkdir(directory,{recursive:true});
const prefix=resolve(directory,name);if(!prefix.startsWith(directory+'/'))throw Error('Invalid run name');
try{await access(prefix+'.request.json');throw Error('This run was already requested; choose an explicit new experiment name.');}catch(e){if(e.code!=='ENOENT')throw e;}
const text=mode==='short'?'Бірінші. Бүгін ауа райы ашық. Екінші. Балалар мектепке барды. Осымен хабар аяқталды.':(await readFile('tests/fixtures/m3-real-13-news.txt','utf8')).trim();
const request={text,voice:'Puck',model,speed:1};await writeFile(prefix+'.request.json',JSON.stringify(request));
const started=performance.now(),chunks=[],trace=[],events=[];let pending='',bytes=0,firstAudioMs=null,terminal=null;
const p=spawn('curl',['--silent','--show-error','--no-buffer','--max-time','600','--retry','0','--request','POST','https://kazakh-broadcast-worker.mahejiang653.workers.dev/api/gemini-tts-live','--header','Content-Type: application/json','--data-binary','@'+prefix+'.request.json','--dump-header',prefix+'.headers']);
const consume=block=>{const lines=block.split(/\r?\n/),event=lines.find(l=>l.startsWith('event:'))?.slice(6).trim(),data=lines.filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');if(!data)return;const payload=JSON.parse(data);if(event==='audio'){const b=Buffer.from(payload.data,'base64');firstAudioMs??=performance.now()-started;trace.push({index:chunks.length,offset:bytes,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex'),elapsedMs:Math.round(performance.now()-started)});chunks.push(b);bytes+=b.length;if(chunks.length===1||chunks.length%50===0)console.log(JSON.stringify({event:'raw',chunks:chunks.length,seconds:bytes/48000,elapsedMs:Math.round(performance.now()-started)}));}else{events.push({event,payload,elapsedMs:Math.round(performance.now()-started)});if(event==='done'||event==='error')terminal={event,payload};if(event!=='heartbeat')console.log(JSON.stringify({event,payload}));}};
p.stdout.setEncoding('utf8');p.stdout.on('data',s=>{pending+=s;let m;while((m=/\r?\n\r?\n/.exec(pending))){consume(pending.slice(0,m.index));pending=pending.slice(m.index+m[0].length);}});
let stderr='';p.stderr.on('data',d=>stderr+=d);const exit=await new Promise((r,j)=>{p.on('error',j);p.on('close',r)});if(pending.trim().startsWith('event:'))consume(pending);
const raw=Buffer.concat(chunks),report={mode,model,voice:'Puck',speed:1,characters:text.length,scriptSha256:createHash('sha256').update(text).digest('hex'),firstAudioMs,totalMs:performance.now()-started,requests:1,exit,stderr,rawBytes:raw.length,rawSeconds:raw.length/48000,rawSha256:createHash('sha256').update(raw).digest('hex'),terminal,trace,events};
await build({input:'app/lib/m3-audio.ts',platform:'node',output:{file:prefix+'.audio.mjs',format:'esm'}});const audio=await import(pathToFileURL(prefix+'.audio.mjs'));
if(raw.length){await writeFile(prefix+'.raw.wav',audio.joinM3Wav([raw]));report.signal=audio.assessM3Signal(raw);}
await writeFile(prefix+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify({file:prefix,bytes:raw.length,seconds:raw.length/48000,firstAudioMs,totalMs:report.totalMs,terminal:terminal?.event,signal:report.signal}));
