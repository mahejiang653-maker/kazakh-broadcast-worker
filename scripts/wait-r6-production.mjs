import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const commit=process.env.GITHUB_SHA||'manual';
const output=path.resolve(process.env.GLOBE_OUTPUT||'globe-production-r6-attacks');
const origin='https://kazakh-broadcast-worker.mahejiang653.workers.dev/';
const files=['news-globe-v52-flag-images.js','news-globe-v52-attack-model.js','news-globe-v14-v51-scene-engine.js','news-globe-v52-hard-rules.js','news-globe-v52-story-borders.js','news-globe-v52-flags-overview-clean.js','news-globe-v52-daily10.js','news-globe-v52-director.js','news-globe-run-20260920-v52-r1.html'];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const expected=new Map(files.map(file=>[file,hash(fs.readFileSync(path.join('public',file)))]));
const end=Date.now()+600000;
while(Date.now()<end){
 try{
  const resources=await Promise.all(files.map(async file=>{
   const response=await fetch(origin+file+'?verify='+commit.slice(0,12),{signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error(file+': '+response.status);
   const actual=hash(Buffer.from(await response.arrayBuffer()));
   return {path:file,expectedSHA256:expected.get(file),productionSHA256:actual,matches:actual===expected.get(file)};
  }));
  if(resources.every(file=>file.matches)){
   fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'resource-hashes.json'),JSON.stringify({commit,checkedAt:new Date().toISOString(),resources},null,2));
   console.log('PRODUCTION_RESOURCES_MATCH',commit);process.exit(0);
  }
  console.log('Waiting for deployed resources:',resources.filter(file=>!file.matches).map(file=>file.path).join(', '));
 }catch(error){console.log('Waiting for production:',error.message);}
 await new Promise(resolve=>setTimeout(resolve,10000));
}
throw Error('Production resources did not match this commit within 10 minutes');
