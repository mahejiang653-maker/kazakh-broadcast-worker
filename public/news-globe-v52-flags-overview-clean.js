(function attach(){
  const G=window.NG14=window.NG14||{};
  if(G.__v52FlagsOverviewClean)return;
  if(!G.viewer||!window.Cesium||typeof G.focus!=='function'||typeof G.overview!=='function')return setTimeout(attach,60);
  G.__v52FlagsOverviewClean=true;
  const C=Cesium;
  const ISO2={CHN:'cn',USA:'us',RUS:'ru',UKR:'ua',IRN:'ir',ISR:'il',PSE:'ps',LBN:'lb',DEU:'de',FRA:'fr',GBR:'gb',POL:'pl',ROU:'ro',TUR:'tr',SYR:'sy',JOR:'jo',EGY:'eg',IND:'in',PAK:'pk',AFG:'af',JPN:'jp',PRK:'kp',AUS:'au',CAN:'ca',BRA:'br',THA:'th',SGP:'sg',SAU:'sa',ARE:'ae',QAT:'qa',IRQ:'iq',KWT:'kw',VEN:'ve',KAZ:'kz',OMN:'om',DZA:'dz',LBY:'ly',NGA:'ng',MEX:'mx',MYS:'my',IDN:'id',PHL:'ph',VNM:'vn',MMR:'mm',BHR:'bh',BRN:'bn',AZE:'az',SDN:'sd',SSD:'ss',COG:'cg',GNQ:'gq',GAB:'ga',LTU:'lt',BLR:'by',YEM:'ye',DNK:'dk',KOR:'kr',CHE:'ch'};
  const flags=[];
  function removeFlags(){for(const e of flags.splice(0))try{G.viewer.entities.remove(e)}catch{}}
  function center(iso){return G.countries?.get?.(String(iso||'').toUpperCase())?.center||null}
  function addFlag(iso,lon,lat,dx=0){iso=String(iso||'').toUpperCase();const cc=ISO2[iso];if(!cc||!Number.isFinite(+lon)||!Number.isFinite(+lat))return;flags.push(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+lon,+lat,90000),billboard:{image:`https://flagcdn.com/w80/${cc}.png`,width:28,height:18,pixelOffset:new C.Cartesian2(dx,-24),disableDepthTestDistance:Number.POSITIVE_INFINITY}}))}
  function storyIsos(n,iso){const p=n?.scenePlan||{},out=[iso,n?.countryIso3,n?.secondaryCountryIso3,n?.sourceCountryIso3,n?.targetCountryIso3,p.primaryIso3,p.attackerIso3,p.victimIso3,...(Array.isArray(p.contextCountries)?p.contextCountries:[]),...(Array.isArray(p.participants)?p.participants:[])];return [...new Set(out.map(x=>String(x||'').toUpperCase()).filter(x=>ISO2[x]))]}
  function showStoryFlags(n,iso){removeFlags();const isos=storyIsos(n,iso);for(let i=0;i<isos.length;i++){const x=isos[i],c=center(x);if(c)addFlag(x,c[0],c[1],i?18:0)}}
  function purgeScene(){removeFlags();try{G.clearCountry?.()}catch{}try{G.clearLocal?.()}catch{}try{G.clearArc?.()}catch{}try{G.clearInteractionEffects?.()}catch{}try{G.clearSecondaryCountry?.()}catch{}for(const k of ['v51SceneEntities','v50Entities','v49Entities','v48Entities','v47Entities','v45bEntities','v44Entities','v38Entities','v37Entities','v36Entities']){const a=G[k];if(Array.isArray(a))for(const e of a.splice(0))try{G.viewer.entities.remove(e)}catch{}}for(const id of ['v52DiplomacyOverlay','scenePlanHud'])document.getElementById(id)?.remove();try{if(G.markers)for(const e of G.markers)e.show=false;if(G.pulses)for(const e of G.pulses)e.show=false}catch{}}
  const baseFocus=G.focus;
  G.focus=function(i,countryFirst=true){const r=baseFocus.call(this,i,countryFirst);setTimeout(()=>{if(!G.overviewMode){const n=G.news?.[G.current],iso=G.resolveIso?.(n)||n?.countryIso3;showStoryFlags(n,iso)}},120);return r};
  const baseOverview=G.overview;
  function cleanOverview(){try{G.navSerial=(G.navSerial||0)+1}catch{}try{G.overviewMode=true}catch{}purgeScene();const ov=document.getElementById('overview');if(ov){ov.classList.remove('show');ov.style.display='none'}try{G.viewer.camera.cancelFlight?.()}catch{}try{G.viewer.camera.flyHome?.(1.1)}catch{try{baseOverview.call(G)}catch{}}setTimeout(()=>{purgeScene();const x=document.getElementById('overview');if(x){x.classList.remove('show');x.style.display='none'}},100);setTimeout(()=>{purgeScene();const x=document.getElementById('overview');if(x){x.classList.remove('show');x.style.display='none'}},550)}
  G.overview=cleanOverview;
  function rebindOverview(){const b=document.getElementById('all');if(!b)return false;b.onclick=null;b.onclick=cleanOverview;return true}
  rebindOverview();setTimeout(rebindOverview,0);setTimeout(rebindOverview,250);setTimeout(rebindOverview,1000);
  console.info('[News Globe] V52 r13: overview button rebound; clean globe overview; story flags restored');
})();