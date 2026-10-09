import assert from 'node:assert/strict';

export function isSatelliteTile(url){
  try {
    const u=new URL(url);
    return u.protocol==='https:'&&['services.arcgisonline.com','server.arcgisonline.com'].includes(u.hostname)&&
      /^\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile\/\d+\/\d+\/\d+$/.test(u.pathname);
  }catch{return false;}
}
export function trackConsoleHealth(page,report){
  report.consoleDetails=[];report.networkFailures=[];
  page.on('console',m=>{
    if(m.type()!=='error')return;
    report.consoleErrors.push(m.text());
    report.consoleDetails.push({text:m.text(),url:m.location().url||''});
  });
  page.on('requestfailed',r=>{
    const error=r.failure()?.errorText||'';
    if(error!=='net::ERR_ABORTED')report.networkFailures.push({url:r.url(),error});
  });
}
function corsURL(text){
  const match=text.match(/^Access to XMLHttpRequest at '([^']+)' from origin .* has been blocked by CORS policy:/);
  return match&&isSatelliteTile(match[1])?match[1]:null;
}
export async function assertConsoleHealth(page,report){
  const urls=[...new Set([
    ...report.networkFailures.filter(f=>isSatelliteTile(f.url)).map(f=>f.url),
    ...report.consoleDetails.map(e=>corsURL(e.text)).filter(Boolean),
  ])];
  report.imageryRecovery=[];
  for(const url of urls){
    let result;
    for(let attempt=1;attempt<=3;attempt++){
      result=await page.evaluate(async url=>{
        try{
          const r=await fetch(url,{mode:'cors',cache:'reload',signal:AbortSignal.timeout(8000)});
          const type=r.headers.get('content-type')||'',blob=await r.blob(),bitmap=await createImageBitmap(blob);
          const width=bitmap.width,height=bitmap.height;bitmap.close();
          return {ok:r.ok&&type.startsWith('image/')&&width>=128&&height>=128,status:r.status,type,bytes:blob.size,width,height};
        }catch(e){return {ok:false,error:e.message};}
      },url);
      result.attempts=attempt;if(result.ok)break;
    }
    report.imageryRecovery.push({url,...result});
    assert.ok(result.ok,'Satellite tile remains unavailable in the browser: '+url);
  }
  const recovered=new Set(report.imageryRecovery.filter(r=>r.ok).map(r=>r.url));
  const otherFailures=report.networkFailures.filter(f=>!isSatelliteTile(f.url));
  report.unresolvedConsoleErrors=report.consoleDetails.filter((entry,i,entries)=>{
    const cors=corsURL(entry.text);
    if(cors&&recovered.has(cors))return false;
    if(/^Failed to load resource: net::ERR_FAILED$/.test(entry.text)){
      if(recovered.has(entry.url))return false;
      // Chromium can omit the location of this companion network message.
      // Accept only an adjacent, independently recovered satellite CORS error,
      // and only if no other non-cancelled request failed in this run.
      const preceding=i>0&&corsURL(entries[i-1].text);
      if(preceding&&recovered.has(preceding)&&!otherFailures.length)return false;
    }
    return true;
  });
  assert.deepEqual(otherFailures,[],'Application console errors or unrelated resource failures');
  assert.deepEqual(report.unresolvedConsoleErrors,[],'Application console errors or unrecovered resource failures');
}
