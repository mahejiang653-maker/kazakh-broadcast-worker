(function(G){
  'use strict';
  if(!G||G.EventModel)return;
  const geo=G.EventGeometry;
  const TYPES=new Set(['domestic','interstate','border_conflict','missile_attack','drone_attack','diplomatic','economic','other']);
  const ALIASES={missile:'missile_attack',drone:'drone_attack',uav:'drone_attack',border:'border_conflict','border-conflict':'border_conflict'};
  const iso=value=>{const s=String(value?.iso3??value?.countryIso3??value??'').toUpperCase();return /^[A-Z]{3}$/.test(s)?s:''};
  const type=value=>{const s=String(value||'').toLowerCase();return TYPES.has(s)?s:ALIASES[s]||''};
  const precision=value=>['exact','city','region','country'].includes(value)?value:'region';
  function normalize(n,fallbackIso=''){
    const p=n.scenePlan||{},mode=String(n.sceneMode||'').toUpperCase();
    const target=geo.point(n.target)||geo.point([n.targetLon,n.targetLat])||geo.point(n.eventLocation)||geo.point([n.lon,n.lat]);
    const location=geo.point(n.eventLocation)||geo.point([n.lon,n.lat])||target;
    let sourceCountry=iso(n.origin?.country||n.origin?.countryIso3||p.attackerIso3||n.sourceCountryIso3);
    let targetCountry=iso(n.target?.country||n.target?.countryIso3||p.victimIso3||n.targetCountryIso3||n.countryIso3);
    const primary=iso(n.primaryCountry||p.primaryIso3||n.countryIso3||targetCountry||fallbackIso);
    const participants=[...new Set([...(p.contextCountries||p.participants||[]),sourceCountry,targetCountry].map(iso).filter(Boolean))];
    const explicitSecond=iso(n.secondaryCountry||p.secondaryIso3||n.secondaryCountryIso3);
    const secondary=(explicitSecond&&explicitSecond!==primary?explicitSecond:'')||participants.find(x=>x!==primary)||'';
    let eventType=type(n.eventType)||type(n.type);
    if(!eventType&&n.borderConflict===true)eventType='border_conflict';
    if(!eventType)eventType=type(n.interactionType)||type(n.attackType);
    if(!eventType&&['ATTACK','POTENTIAL_ATTACK'].includes(mode))eventType='missile_attack';
    // Text inference is a legacy fallback only, never overrides an explicit type.
    if(!eventType&&!mode)eventType=type(G.interactionType?.(n));
    if(!eventType)eventType=mode.startsWith('DIPLOMACY')?'diplomatic':secondary?'interstate':'domestic';
    if(/^(missile|drone)_attack$/.test(eventType)){sourceCountry ||= primary;targetCountry ||= secondary||primary}
    let origin=geo.point(n.origin)||geo.point(n.source);
    let originPrecision=n.origin?.locationPrecision||p.sourcePrecision||n.sourcePrecision;
    if(!origin&&originPrecision!=='directional')origin=geo.point([n.sourceLon,n.sourceLat]);
    if(!origin&&target&&sourceCountry&&/attack$/.test(eventType)){
      origin=geo.directionalOrigin(sourceCountry,target);originPrecision='directional';
    }
    const potential=mode==='POTENTIAL_ATTACK'||n.potentialStrike===true||n.potential===true;
    const sourceLabel=String(n.origin?.label||p.sourceLabel||p.sourceDirectionLabel||n.sourceLocation||'');
    const event={id:n.id,title:n.title||'',type:eventType,primaryCountry:primary,secondaryCountry:secondary,
      origin:origin?{...origin,country:sourceCountry,locationPrecision:originPrecision||'region',label:originPrecision==='directional'?(sourceLabel||`${G.countryName?.(sourceCountry)||sourceCountry}方向`)+'（示意）':sourceLabel}:null,
      target:target?{...target,country:targetCountry}:null,eventLocation:location,locationPrecision:precision(n.locationPrecision),potential,
      sourceType:String(p.sourceType||n.sourceType||''),targetLabel:String(p.targetLabel||n.focusLabel||n.location||'新闻发生地'),
      borderCenter:geo.point(n.borderZoneCenter)||location,borderRadius:Math.max(2000,Math.min(25000,Number(n.effects?.borderRadiusKm??n.borderRadiusKm??12)*1000||12000)),
      borderLine:Array.isArray(n.borderLine)?n.borderLine:null,effects:n.effects||{},mode,
      managed:!['CARRIER_PORT','ORGANIZATION','DIPLOMACY_MULTI'].includes(mode)&&!p.carrierDocking&&new Set([primary,secondary,...participants].filter(Boolean)).size<=2,
      source:n};
    if(secondary){
      event.secondaryLocation=geo.point(n.secondaryLocation)||geo.point([n.secondaryLon,n.secondaryLat]);
      if(!event.secondaryLocation&&secondary===sourceCountry)event.secondaryLocation=origin;
      if(!event.secondaryLocation&&secondary===targetCountry)event.secondaryLocation=target;
      event.secondaryLocation ||= geo.point(G.countries?.get?.(secondary)?.center);
    }
    return Object.freeze(event);
  }
  function adapt(event){
    const n=event.source;if(!event.managed)return n;
    const scenePlan={...(n.scenePlan||{}),primaryIso3:event.primaryCountry};
    if(event.secondaryCountry)scenePlan.contextCountries=[event.primaryCountry,event.secondaryCountry];
    const out={...n,scenePlan};
    if(event.eventLocation){out.lon=event.eventLocation.lon;out.lat=event.eventLocation.lat}
    if(/^(missile|drone)_attack$/.test(event.type)){
      out.sceneMode=event.potential?'POTENTIAL_ATTACK':'ATTACK';out.attackType=event.type==='drone_attack'?'drone':'missile';
    }else if(!out.sceneMode||['ATTACK','POTENTIAL_ATTACK'].includes(out.sceneMode))out.sceneMode='POINT';
    if(out.sceneMode==='DIPLOMACY_2'&&event.secondaryCountry)scenePlan.participants=[event.secondaryCountry,event.primaryCountry];
    return out;
  }
  G.EventModel=Object.freeze({normalize,adapt,iso});
})(window.NG14);
