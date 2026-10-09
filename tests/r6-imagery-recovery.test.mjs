import assert from 'node:assert/strict';
import test from 'node:test';
import {assertConsoleHealth,isSatelliteTile} from '../.github/scripts/r6-imagery-recovery.mjs';

const url='https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/7/69/73';
const cors=`Access to XMLHttpRequest at '${url}' from origin 'https://example.com' has been blocked by CORS policy: No header`;
function report(extra=[]){return {consoleErrors:[],consoleDetails:[{text:cors,url:''},{text:'Failed to load resource: net::ERR_FAILED',url:''},...extra],networkFailures:[{url,error:'net::ERR_FAILED'}]};}
test('a transient satellite failure passes only after the browser retrieves a real image',async()=>{
  let calls=0;const r=report();
  await assertConsoleHealth({evaluate:async()=>++calls===1?{ok:false}:{ok:true,type:'image/jpeg',bytes:1000}},r);
  assert.equal(calls,2);assert.equal(r.imageryRecovery[0].attempts,2);assert.deepEqual(r.unresolvedConsoleErrors,[]);
});
test('permanent satellite failures are bounded and still fail the gate',async()=>{
  let calls=0;
  await assert.rejects(assertConsoleHealth({evaluate:async()=>{calls++;return {ok:false};}},report()),/remains unavailable/);
  assert.equal(calls,3);
});
test('recovered imagery cannot conceal application errors or a different failing resource',async()=>{
  const page={evaluate:async()=>({ok:true,type:'image/jpeg',bytes:1000})};
  await assert.rejects(assertConsoleHealth(page,report([{text:'TypeError: broken scene',url:''}])),/Application console/);
  const r=report();r.networkFailures.push({url:'https://example.com/api/geography',error:'net::ERR_FAILED'});
  await assert.rejects(assertConsoleHealth(page,r),/Application console/);
  const withoutConsole=report();withoutConsole.consoleDetails=[];
  withoutConsole.networkFailures.push({url:'https://example.com/api/geography',error:'net::ERR_FAILED'});
  await assert.rejects(assertConsoleHealth(page,withoutConsole),/unrelated resource/);
  assert.equal(isSatelliteTile(url.replace('services.arcgisonline.com','malicious.example')),false);
});
