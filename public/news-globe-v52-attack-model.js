(function(G){
  'use strict';
  if(!G || G.v52AttackModel) return;
  const modes=new Set(['ATTACK','MISSILE_ATTACK','DRONE_ATTACK','POTENTIAL_ATTACK']);
  const iso=value=>{
    const text=String(value?.countryIso3 || value?.iso3 || value || '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(text)?text:'';
  };
  const coordinate=(lon,lat)=>lon!==null && lon!==undefined && lon!=='' &&
    lat!==null && lat!==undefined && lat!=='' && Number.isFinite(Number(lon)) &&
    Number.isFinite(Number(lat)) && Math.abs(Number(lon))<=180 && Math.abs(Number(lat))<=90 ?
    {lon:Number(lon),lat:Number(lat)} : null;
  const point=value=>coordinate(value?.lon ?? value?.longitude,value?.lat ?? value?.latitude);
  function resolve(n){
    if(!n || typeof n!=='object') return null;
    const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    const p=object(n.scenePlan),e=object(p.attackEffect || n.attackEffect);
    const mode=String(n.sceneMode || '').toUpperCase();
    const type=[n.attackType,n.eventType,e.type,mode].filter(Boolean).join(' ').toLowerCase();
    const attackSignal=[n.eventType,e.type].some(x=>/^(?:(?:missile|drone|uav)[_ -](?:attack|strike)|导弹袭击|无人机袭击)$/i.test(String(x||'')));
    const weaponSignal=/^(?:missile|drone|uav)$/i.test(String(n.attackType||'')) ||
      (e.enabled===true&&/^(?:missile|drone|uav)$/i.test(String(e.type||'')));
    if(!modes.has(mode)&&!attackSignal&&!weaponSignal)return null;
    const attackType=/drone|uav|无人机/.test(type)?'drone':'missile';
    const potential=mode==='POTENTIAL_ATTACK' || !!n.potentialStrike || e.confirmed===false;
    const vic=iso(p.victimIso3 || n.targetCountryIso3 || n.victimIso3 || e.victimIso3 ||
      e.target?.countryIso3 || n.target?.countryIso3 || n.countryIso3 || p.primaryIso3);
    let att=iso(p.attackerIso3 || n.sourceCountryIso3 || n.attackerIso3 || e.attackerIso3 ||
      e.sourceCountryIso3 || e.origin?.countryIso3 || n.source?.countryIso3);
    // Older DATA LOCKs identify a group in the headline but omit nonStateActor.
    // A related country is context, not evidence that it launched the attack.
    const nonStateActor=!!(p.nonStateActor || n.nonStateActor || e.nonStateActor) ||
      /^(non[-_ ]?state|armed[-_ ]?group)$/i.test(String(p.attackerType || n.attackerType || '')) ||
      /^(?:也门)?胡塞(?:武装|组织)?[^，。；]{0,12}(?:袭击|攻击|发射)|^(?:Yemen.s?\s+)?(?:Houthis?|Ansar Allah)\b.{0,20}\b(?:attack(?:ed|s)?|strik\w*|struck|launch\w*)\b/i.test(String(n.title || '').trim());
    let identitySource=att?'explicit':'';
    // The second member of an explicitly supplied TWO-country attack pair is
    // unambiguous once the victim is known. Larger context lists are not roles.
    const related=[...new Set((Array.isArray(n.relatedCountryIso3s)?n.relatedCountryIso3s:[]).map(iso).filter(Boolean))];
    if(!att && !nonStateActor && !p.registryOnly && related.length===2 && related.includes(vic)){
      att=related.find(x=>x!==vic) || '';identitySource='related-pair';
    }
    if(nonStateActor){att='';identitySource='non-state-actor';}
    const target=point(e.target) || point(n.target) || coordinate(n.targetLon,n.targetLat) || coordinate(n.lon,n.lat);
    const precision=String(p.sourcePrecision || n.sourcePrecision || e.origin?.precision || '').toLowerCase();
    const originExplicitlyUnknown=('origin' in e && e.origin===null) ||
      p.sourceUnconfirmed===true || n.sourceUnconfirmed===true || e.sourceUnconfirmed===true ||
      ['unknown','unconfirmed','direction','directional','approximate'].includes(precision);
    // A country centroid/border is a display anchor, NEVER a launch coordinate.
    const source=originExplicitlyUnknown?null:
      point(e.origin) || point(n.source) || coordinate(n.sourceLon,n.sourceLat);
    return {att,vic,target,source,attackType,potential,identitySource,
      sourceUnconfirmed:!source,enabled:e.enabled!==false,
      impactEnabled:e.impact?.enabled!==false,
      mode:potential?'POTENTIAL_ATTACK':attackType==='drone'?'DRONE_ATTACK':'MISSILE_ATTACK',
      sourceLabel:String(p.sourceLabel || e.origin?.location || n.source?.location || '已知发射位置'),
      targetLabel:String(p.targetLabel || e.target?.location || n.focusLabel || n.location || '目标地点'),
      sourceType:String(p.sourceType || n.sourceType || '')};
  }
  function normalize(n){
    const a=resolve(n);if(!a)return n;
    const p=n.scenePlan && typeof n.scenePlan==='object'&&!Array.isArray(n.scenePlan)?n.scenePlan:(n.scenePlan={});
    n.sceneMode=a.mode;n.attackType=a.attackType;
    if(a.att){p.attackerIso3=a.att;n.sourceCountryIso3=a.att;}
    else if(a.identitySource==='non-state-actor'){
      delete p.attackerIso3;delete n.sourceCountryIso3;delete n.attackerIso3;
    }
    if(a.vic){p.victimIso3=a.vic;n.targetCountryIso3=a.vic;}
    p.sourceUnconfirmed=a.sourceUnconfirmed;
    if(a.source){n.sourceLon=a.source.lon;n.sourceLat=a.source.lat;}
    else{delete n.sourceLon;delete n.sourceLat;p.sourcePrecision='unknown';}
    if(a.target){n.targetLon=a.target.lon;n.targetLat=a.target.lat;}
    return n;
  }
  G.v52AttackModel={version:'20261017-attack-v2',resolve,normalize,coordinate};
})(window.NG14);
