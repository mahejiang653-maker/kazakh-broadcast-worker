(function(G){
  if(!G||G.__v52MobileDiplomacyHotfix)return;
  G.__v52MobileDiplomacyHotfix=true;
  const baseRun=G.runSequence;
  if(typeof baseRun!=='function')return;
  const wait=(ms,s)=>G.wait?G.wait(ms,s):new Promise(r=>setTimeout(()=>r(s===G.navSerial),ms));
  G.runSequence=async function(n,iso,s){
    const mode=String(n?.sceneMode||'').toUpperCase();
    const p=n?.scenePlan||{};
    const participants=Array.isArray(p.participants)?p.participants.map(x=>String(x).toUpperCase()):[];
    const isRemoteDiplomacy=mode==='DIPLOMACY_2' && p.finalLocation===false && participants.length>=2;
    if(!isRemoteDiplomacy)return baseRun(n,iso,s);

    // Mobile-safe remote diplomacy: never build two giant country polygon sets at once.
    // Render each participant country sequentially, with no fake midpoint/event pin.
    const originalMode=n.sceneMode;
    const originalPlan=n.scenePlan;
    const originalIso=n.countryIso3;
    try{
      for(let i=0;i<participants.length;i++){
        if(s!==G.navSerial)return;
        const k=participants[i];
        n.sceneMode='COUNTRY';
        n.scenePlan={...originalPlan,primaryIso3:k,contextCountries:[k],finalLocation:false};
        n.countryIso3=k;
        await baseRun(n,k,s);
        if(s!==G.navSerial)return;
        await wait(i===participants.length-1?950:350,s);
      }
    } finally {
      n.sceneMode=originalMode;
      n.scenePlan=originalPlan;
      n.countryIso3=originalIso;
    }
  };
})(window.NG14=window.NG14||{});