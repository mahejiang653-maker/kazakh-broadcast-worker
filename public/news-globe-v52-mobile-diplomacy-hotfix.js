(function attach(){
  const G=window.NG14=window.NG14||{};
  if(G.__v52MobileDiplomacyHotfix)return;
  const baseRun=G.runSequence;
  if(typeof baseRun!=='function')return setTimeout(attach,50);
  G.__v52MobileDiplomacyHotfix=true;
  const CN={CHN:'中华人民共和国',USA:'美国',RUS:'俄罗斯',UKR:'乌克兰',IRN:'伊朗',ISR:'以色列',LBN:'黎巴嫩',SAU:'沙特阿拉伯',YEM:'也门',ARE:'阿联酋',KOR:'韩国',KAZ:'哈萨克斯坦',GBR:'英国',FRA:'法国',CAN:'加拿大',HUN:'匈牙利',DEU:'德国',SGP:'新加坡',OMN:'阿曼',KWT:'科威特',BHR:'巴林',LTU:'立陶宛',BLR:'白俄罗斯',QAT:'卡塔尔',IRQ:'伊拉克'};
  const wait=(ms,s)=>G.wait?G.wait(ms,s):new Promise(r=>setTimeout(()=>r(s===G.navSerial),ms));
  function removeOverlay(){const el=document.getElementById('v52DiplomacyOverlay');if(el)el.remove();}
  function countryScene(n,iso){const name=CN[iso]||G.countryNameZh?.(iso)||G.countryName?.(iso)||'相关国家';return {...n,sceneMode:'COUNTRY',scenePlan:{...(n.scenePlan||{}),primaryIso3:iso,participants:[],contextCountries:[],adminChain:[],finalLocation:false,regionalContext:false},countryIso3:iso,secondaryCountryIso3:null,secondaryCountry:null,country:name,location:name,region:name+'全境',placeType:'国家',countryOnly:true,noPoint:true,focusLabel:name};}
  G.runSequence=async function(n,iso,s){
    removeOverlay();const mode=String(n?.sceneMode||'').toUpperCase(),p=n?.scenePlan||{};
    const participants=Array.isArray(p.participants)?[...new Set(p.participants.map(x=>String(x).toUpperCase()).filter(Boolean))]:[];
    const isRemoteDiplomacy=mode==='DIPLOMACY_2'&&p.finalLocation===false&&participants.length>=2;
    if(isRemoteDiplomacy){
      for(const x of participants){
        if(s!==G.navSerial)return false;
        G.v52SceneTrace?.push({type:'diplomacy-country',iso:x,label:CN[x]||G.countryNameZh?.(x)||'',serial:s,index:(G.current??0)+1,at:Date.now()});
        await baseRun(countryScene(n,x),x,s);if(s!==G.navSerial)return false;await wait(950,s);
      }
      return true;
    }
    return baseRun(n,iso,s);
  };
})();