(function attach(){
  const G=window.NG14=window.NG14||{};
  if(G.__v52MobileDiplomacyHotfix)return;
  const baseRun=G.runSequence;
  if(typeof baseRun!=='function')return setTimeout(attach,50);
  G.__v52MobileDiplomacyHotfix=true;

  const CN={CHN:'中华人民共和国',USA:'美国',RUS:'俄罗斯',UKR:'乌克兰',IRN:'伊朗',ISR:'以色列',LBN:'黎巴嫩',SAU:'沙特阿拉伯',YEM:'也门',ARE:'阿联酋',KOR:'韩国',GBR:'英国',FRA:'法国',CAN:'加拿大',HUN:'匈牙利',DEU:'德国',SGP:'新加坡',OMN:'阿曼',KWT:'科威特',BHR:'巴林'};
  function removeOverlay(){
    const el=document.getElementById('v52DiplomacyOverlay');
    if(el)el.remove();
  }

  G.runSequence=async function(n,iso,s){
    removeOverlay();
    const mode=String(n?.sceneMode||'').toUpperCase();
    const p=n?.scenePlan||{};
    const participants=Array.isArray(p.participants)?p.participants.map(x=>String(x).toUpperCase()).filter(Boolean):[];
    const isRemoteDiplomacy=mode==='DIPLOMACY_2' && p.finalLocation===false && participants.length>=2;

    if(isRemoteDiplomacy){
      // Generic rule for locationless two-country stories:
      // render ONLY the second country as a whole-country scene.
      // Do not create a fake point, cross-country arc, or two-country DOM card.
      const secondIso=participants[1];
      const secondName=CN[secondIso]||String(n?.secondaryCountry||secondIso||'第二个国家');
      const safe={
        ...n,
        sceneMode:'COUNTRY',
        scenePlan:{primaryIso3:secondIso,contextCountries:[secondIso],finalLocation:false},
        countryIso3:secondIso,
        country:secondName,
        location:secondName,
        region:secondName+'全境',
        placeType:'国家',
        countryOnly:true,
        focusLabel:secondName
      };
      return baseRun(safe,secondIso,s);
    }

    return baseRun(n,iso,s);
  };
})();