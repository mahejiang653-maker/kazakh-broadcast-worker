(function(G){
const CN={CHN:'中华人民共和国',USA:'美国',RUS:'俄罗斯',UKR:'乌克兰',IRN:'伊朗',ISR:'以色列',LBN:'黎巴嫩',SAU:'沙特阿拉伯',YEM:'也门',ARE:'阿联酋',KOR:'韩国',GBR:'英国',FRA:'法国',CAN:'加拿大',HUN:'匈牙利',DEU:'德国',SGP:'新加坡',OMN:'阿曼',KWT:'科威特',BHR:'巴林'};
function clean(){
  for(const k of ['v51SceneEntities','v50Entities','v49Entities','v48Entities','v47Entities','v45bEntities','v44Entities','v38Entities','v37Entities','v36Entities']){
    const a=G[k]; if(!Array.isArray(a)) continue;
    for(const e of a.splice(0)) try{G.viewer?.entities?.remove(e)}catch{}
  }
  try{G.clearInteractionEffects?.()}catch{}
  try{G.clearSecondaryCountry?.()}catch{}
  try{G.clearLocal?.()}catch{}
  try{G.clearCountry?.()}catch{}
  try{G.clearArc?.()}catch{}
}
function install(){
  if(G.__dailySemanticHotfix20260909||!G.viewer?.entities||typeof G.runSequence!=='function')return !!G.__dailySemanticHotfix20260909;
  G.__dailySemanticHotfix20260909=true;
  const entities=G.viewer.entities, originalAdd=entities.add.bind(entities);
  entities.add=function(o){
    try{
      if(o&&o.label&&typeof o.label.text==='string'&&CN[o.label.text]) o={...o,label:{...o.label,text:CN[o.label.text]}};
    }catch{}
    return originalAdd(o);
  };
  const oldRun=G.runSequence;
  G.runSequence=async function(n,iso,s){
    if(n?.sceneMode==='ADMIN_REGION'){
      clean();
      try{if(G.markers?.[G.current])G.markers[G.current].show=false;if(G.pulses?.[G.current])G.pulses[G.current].show=false}catch{}
      const countryIso=String(n.countryIso3||iso||'CHN').toUpperCase();
      // Required hierarchy: country first, then province/state/autonomous region.
      if(typeof G.countryStage==='function'){
        const ok=await G.countryStage(n,countryIso,s);
        if(!ok||s!==G.navSerial)return;
      }
      try{G.clearCountry?.()}catch{}
      const steps=G.adminSteps?.(n)||[];
      if(steps.length&&typeof G.flashAdmin==='function'){
        for(const st of steps){
          if(s!==G.navSerial)return;
          await G.flashAdmin(st,countryIso,s,4200);
          if(s!==G.navSerial)return;
        }
        return;
      }
      return oldRun({...n,sceneMode:'POINT'},countryIso,s);
    }
    if(n?.scenePlan?.sourcePrecision==='regional'&&Number.isFinite(+n.sourceLon)&&Number.isFinite(+n.sourceLat)){
      const x={...n,scenePlan:{...n.scenePlan,sourcePrecision:'platform'}};
      return oldRun(x,iso,s);
    }
    return oldRun(n,iso,s);
  };
  return true;
}
if(!install()){
  let tries=0; const t=setInterval(()=>{tries++;if(install()||tries>80)clearInterval(t)},50);
}
})(window.NG14=window.NG14||{});