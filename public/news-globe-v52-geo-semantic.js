/* V52 universal geographic semantic director: deterministic, data-lock/v1 compatible.
 * No title, date, rank or location coordinate is hard-coded to a particular story.
 * This module never manufactures ISO codes, incident coordinates or routes.
 */
(function(root){
'use strict';
const NAMES={
CHN:['中国','我国','中华人民共和国','China'],MNG:['蒙古国','蒙古','Mongolia'],KAZ:['哈萨克斯坦','Kazakhstan'],KGZ:['吉尔吉斯斯坦','Kyrgyzstan'],
USA:['美国','美方','United States','USA'],RUS:['俄罗斯','俄方','Russia'],UKR:['乌克兰','Ukraine'],
ARE:['阿联酋','阿拉伯联合酋长国','United Arab Emirates'],IRN:['伊朗','Iran'],ISR:['以色列','Israel'],PSE:['巴勒斯坦','Palestine'],KOR:['韩国','South Korea'],PRK:['朝鲜','North Korea'],
JPN:['日本','Japan'],IND:['印度','India'],PAK:['巴基斯坦','Pakistan'],TUR:['土耳其','Turkey'],SAU:['沙特阿拉伯','Saudi Arabia'],OMN:['阿曼','Oman'],
DEU:['德国','Germany'],FRA:['法国','France'],GBR:['英国','United Kingdom'],ITA:['意大利','Italy'],ESP:['西班牙','Spain'],
BEL:['比利时','Belgium'],POL:['波兰','Poland'],NLD:['荷兰','Netherlands'],CHE:['瑞士','Switzerland'],
SWE:['瑞典','Sweden'],FIN:['芬兰','Finland'],DNK:['丹麦','Denmark'],NOR:['挪威','Norway'],
GRC:['希腊','Greece'],AUT:['奥地利','Austria'],PRT:['葡萄牙','Portugal'],IRL:['爱尔兰','Ireland'],
ROU:['罗马尼亚','Romania'],BGR:['保加利亚','Bulgaria'],HRV:['克罗地亚','Croatia'],
HUN:['匈牙利','Hungary'],SVK:['斯洛伐克','Slovakia'],SVN:['斯洛文尼亚','Slovenia'],
CZE:['捷克','Czech Republic'],EST:['爱沙尼亚','Estonia'],LVA:['拉脱维亚','Latvia'],LTU:['立陶宛','Lithuania'],
LUX:['卢森堡','Luxembourg'],MLT:['马耳他','Malta'],CYP:['塞浦路斯','Cyprus'],
CAN:['加拿大','Canada'],AUS:['澳大利亚','Australia'],BRA:['巴西','Brazil'],SGP:['新加坡','Singapore'],AFG:['阿富汗','Afghanistan'],
JOR:['约旦','Jordan'],EGY:['埃及','Egypt'],SYR:['叙利亚','Syria'],LBN:['黎巴嫩','Lebanon']
};
const EU=['AUT','BEL','BGR','HRV','CYP','CZE','DNK','EST','FIN','FRA','DEU','GRC','HUN','IRL','ITA','LVA','LTU','LUX','MLT','NLD','POL','PRT','ROU','SVK','SVN','ESP','SWE'];
// These names define *sets of existing administrative features*, never invented polygons.
const REGIONS=[
{key:'china-northwest',test:/中国西北地区|我国西北地区|西北地区|西北五省|西北五省区/i,iso:'CHN',label:'西北地区',provinces:['新疆','甘肃','青海','宁夏','陕西'],approximate:true},
{key:'china-northeast',test:/中国东北地区|我国东北地区|东北三省/i,iso:'CHN',label:'东北地区',provinces:['辽宁','吉林','黑龙江'],approximate:true},
{key:'china-southwest',test:/中国西南地区|我国西南地区|西南地区/i,iso:'CHN',label:'西南地区',provinces:['四川','云南','贵州','重庆','西藏'],approximate:true},
{key:'china-north',test:/华北地区/i,iso:'CHN',label:'华北地区',provinces:['北京','天津','河北','山西','内蒙古'],approximate:true},
{key:'china-east',test:/华东地区/i,iso:'CHN',label:'华东地区',provinces:['上海','江苏','浙江','安徽','福建','江西','山东'],approximate:true},
{key:'china-central',test:/华中地区/i,iso:'CHN',label:'华中地区',provinces:['河南','湖北','湖南'],approximate:true},
{key:'china-south',test:/华南地区/i,iso:'CHN',label:'华南地区',provinces:['广东','广西','海南'],approximate:true}
];
const TYPES=['country-highlight','region-highlight','point-focus','country-sequence','country-to-region','region-to-point','cross-border-route','directional-relation','multi-country-overview','waterbody-focus'];
const ISO=/^[A-Z]{3}$/;
const coords=(x,y)=>x!==null&&x!==undefined&&y!==null&&y!==undefined&&Number.isFinite(Number(x))&&Number.isFinite(Number(y))&&Math.abs(Number(x))<=180&&Math.abs(Number(y))<=90;
const iso=(s)=>typeof s==='string'&&ISO.test(s.toUpperCase())?s.toUpperCase():null;
const unique=a=>[...new Set(a.filter(Boolean))];
const text=n=>[n?.title,n?.summary,n?.body,n?.content,n?.description,n?.location,n?.focusLabel].filter(v=>typeof v==='string').join(' ');
function namedCountries(t){
 const items=[];
 for(const [id,aliases] of Object.entries(NAMES))for(const name of aliases){
   const at=t.indexOf(name);
   if(at>=0){items.push({id,at});break;}
 }
 return items.sort((a,b)=>a.at-b.at).map(x=>x.id);
}
function referencedCountries(n,t){
 const p=n?.scenePlan||{};
 const fields=[n?.countryIso3,n?.countryISO3,p.primaryIso3,n?.sourceCountryIso3,n?.targetCountryIso3,p.attackerIso3,p.victimIso3,
 ...(Array.isArray(n?.relatedCountryIso3s)?n.relatedCountryIso3s:[]),
 ...(Array.isArray(n?.countriesIso3)?n.countriesIso3:[]),
 ...(Array.isArray(n?.globeCountries)?n.globeCountries:[]),
 ...(Array.isArray(p.contextCountries)?p.contextCountries:[])
 ];
 return unique([...namedCountries(t),...fields.map(iso)]);
}
function routeDirection(n,t,mentioned){
 const p=n.scenePlan||{};
 let from=iso(n.route?.fromCountryIso3||n.originCountryIso3||p.fromIso3||p.originIso3);
 let to=iso(n.route?.toCountryIso3||n.destinationCountryIso3||p.toIso3||p.destinationIso3);
 if(!from||!to){
   const aliases=Object.entries(NAMES).flatMap(([id,names])=>names.map(name=>({id,name})));
   for(const a of aliases)for(const b of aliases){
     if(a.id===b.id)continue;
     if(t.includes('从'+a.name+'前往'+b.name)||t.includes('由'+a.name+'前往'+b.name)||t.includes('从'+a.name+'到'+b.name)){
       from=from||a.id;to=to||b.id;break;
     }
     if(from&&to)break;
   }
 }
 if(!from||!to){from=from||mentioned[0]||null;to=to||mentioned.find(x=>x!==from)||null;}
 return {from,to};
}
function precision(n){
 const s=String(n.coordinatePrecision||n.locationPrecision||n.eventLocation?.precision||'').toLowerCase();
 if(/exact|gps|verified-point|精确/.test(s)&&!/not exact|non.exact|approx|reference|representative/.test(s))return 'verified-point';
 if(/city|城市/.test(s))return 'city-reference';
 return 'reference';
}
function classify(n, t, countries){
 const mode=String(n.sceneMode||'').toUpperCase();
 const context=String(n.location||n.focusLabel||n.region||'');
 const region=REGIONS.find(r=>r.test.test(context));
 if(region)return {kind:'region',region};
 if(/欧盟|European Union|\bEU\b/i.test(t)&&/预算|政策|法案|法规|条例|经济|决议|budget|policy|regulation/i.test(t))return {kind:'eu'};
 if(/海峡|海域|海湾|海洋|湖泊|河流|山脉|山系|山地|流域|山岭|strait|gulf|sea|river|mountain|range/i.test(context))return {kind:'water'};
 if(/旅行|徒步|骑行|步行|横穿|跨国行程|travel|journey|hike|road trip/i.test(t)&&countries.length>=2)return {kind:'travel'};
 if(/袭击|轰炸|空袭|打击|发射导弹|军事行动|进攻|无人机攻击|strike|attack|bombing/i.test(t)&&
   (countries.length>=2||/ATTACK/.test(mode)))return {kind:'military'};
 if(/会议|会谈|峰会|谈判|磋商|外交|summit|negotiat|conference/i.test(t)&&countries.length>=3)return {kind:'diplomacy'};
 if(/口岸|通关|跨境贸易|进出口|双边贸易|边贸|货运|铁路运输|运输通道|border crossing|trade/i.test(t)&&countries.length>=2)return {kind:'trade'};
 if(mode==='COUNTRY'||/全国|全境|全国性|全国范围|national policy/i.test(context)||/全国推行|全国实施/.test(t))return {kind:'country'};
 if(coords(n.lon,n.lat)||coords(n.eventLocation?.lon,n.eventLocation?.lat))return {kind:'point'};
 return {kind:'country'};
}
function analyze(n){
 if(!n||typeof n!=='object')throw Error('invalid story');
 const t=text(n), p=n.scenePlan||{}, countries=referencedCountries(n,t);
 const s=classify(n,t,countries);
 let kind=s.kind;
 const principal=iso(n.countryIso3||n.countryISO3||p.primaryIso3)||countries[0]||null;
 const label=String(n.focusLabel||n.location||'').replace(/^(?:中国|美国|蒙古国|俄罗斯)(?=.{2,})/,'').trim()||'新闻地点';
 const hasPoint=coords(n.eventLocation?.lon??n.lon,n.eventLocation?.lat??n.lat);
 const lon=hasPoint?Number(n.eventLocation?.lon??n.lon):null,lat=hasPoint?Number(n.eventLocation?.lat??n.lat):null;
 const point={lon,lat,label,precision:precision(n),verified:precision(n)==='verified-point'};
 let sequence=[],scenario='country',relations=[],feature=null;
 const country=(code)=>({type:'country-highlight',iso3:code,role:'country',color:'#38a7f6',hold:1500});
 const region=(r)=>({type:'region-highlight',iso3:r.iso,regionKey:r.key,label:r.label,provinces:r.provinces,approximate:r.approximate,color:'#38a7f6',hold:1800});
 const focus=()=>({type:'point-focus',point,color:'#ff4545',hold:1700,precision:point.precision});
 if(kind==='region'){
   scenario='region';sequence=[country(s.region.iso),region(s.region)];
 }else if(kind==='eu'){
   scenario='policy-area';sequence=[{type:'multi-country-overview',countries:EU,role:'eu-members',color:'#38a7f6',hold:1800}];
   if(hasPoint)sequence.push(focus());
 }else if(kind==='water'){
   scenario=/山脉|山系|山地|山岭|mountain|range/i.test(String(n.location||n.focusLabel||''))?'terrain-feature':'waterbody';
   sequence=principal?[country(principal)]:[];
   sequence.push({type:'waterbody-focus',iso3:principal,label,geometry:n.focusGeometry||n.focusLine||n.focusPolygon||null,center:hasPoint?point:null,hold:2000});
 }else if(kind==='military'){
   scenario='military';const att=iso(p.attackerIso3||n.sourceCountryIso3),vic=iso(p.victimIso3||n.targetCountryIso3)||principal;
   let source=att||countries.find(x=>x!==vic)||null,target=vic||countries.find(x=>x!==source)||null;
   if(source&&target&&source!==target){
     relations.push({from:source,to:target,type:'military-action',routeEvidence:'abstract-relation'});
     sequence=[country(source),country(target),{type:'directional-relation',from:source,to:target,evidence:'abstract-relation',hold:1500}];
   }else sequence=principal?[country(principal)]:[];
   if(hasPoint&&point.verified)sequence.push(focus());
 }else if(kind==='travel'||kind==='trade'){
   scenario=kind==='trade'?'bilateral-trade':'cross-border-travel';
   const direction=routeDirection(n,t,countries);
   let ordered=[];
   if(kind==='trade'&&direction.from&&direction.to&&
     (n.route?.directionVerified===true||n.transportDirectionVerified===true))ordered=[direction.from,direction.to];
   else if(kind==='trade'&&countries.includes('CHN'))ordered=[...countries.filter(x=>x!=='CHN'),'CHN'];
   else ordered=[direction.from,direction.to,...countries];
   ordered=unique(ordered).filter(x=>countries.includes(x));
   sequence=ordered.slice(0,4).map(country);
   if(kind==='travel'&&direction.from&&direction.to&&direction.from!==direction.to){
     const evidence=n.route?.evidence==='verified'?'verified':n.route?.evidence==='planned'?'planned':'illustrative';
     relations.push({from:direction.from,to:direction.to,type:'journey',routeEvidence:evidence});
     sequence.push({type:'cross-border-route',from:direction.from,to:direction.to,evidence,verifiedCoordinates:evidence==='verified'?n.route?.coordinates:null,hold:1500});
   }
   if(hasPoint)sequence.push(focus());
 }else if(kind==='diplomacy'){
   scenario='diplomacy';const host=principal;
   const participants=unique(countries.filter(x=>x!==host));
   if(participants.length>4)sequence=[{type:'multi-country-overview',countries:participants,hold:1800,color:'#38a7f6'}];
   else sequence=participants.map(country);
   if(host)sequence.push(country(host));
   if(hasPoint)sequence.push(focus());
 }else if(kind==='point'){
   scenario='single-place';if(principal)sequence.push(country(principal));
   if(hasPoint)sequence.push(focus());
 }else{
   scenario='country-policy';if(principal)sequence.push(country(principal));
 }
 if(!sequence.length&&principal)sequence=[country(principal)];
 const result={version:'v52-geo-director/1',scenario,entities:unique(countries.map(x=>x)),relations,
   precision:kind==='region'?'regional-approximation':point.precision,location:label,steps:sequence,
   fallback:principal?{type:'country-highlight',iso3:principal}:null,
   evidence:{hasVerifiedPoint:point.verified,geometrySource:n.geometrySource||null,source:'data-lock-and-semantic-rules'}};
 return validate(result);
}
function validate(plan, available){
 if(!plan||!Array.isArray(plan.steps)||plan.steps.length>24)throw Error('invalid steps');
 const allowed=available?new Set(available):null;
 const ok=id=>!!iso(id)&&(!allowed||allowed.has(id));
 const steps=[];
 for(const s of plan.steps){
   if(!TYPES.includes(s.type))throw Error('unapproved scene type');
   const ids=[s.iso3,s.from,s.to,...(s.countries||[])].filter(Boolean);
   if(ids.some(id=>!ok(id)))continue; // missing world boundary = safe skip
   if(s.point&&!coords(s.point.lon,s.point.lat))continue;
   if(s.verifiedCoordinates&&!Array.isArray(s.verifiedCoordinates))continue;
   if(s.type==='region-highlight'&&(!REGIONS.some(r=>r.key===s.regionKey)||!Array.isArray(s.provinces)))continue;
   steps.push(s);
 }
 return {...plan,steps,validated:true};
}
const api=Object.freeze({version:'20261112-r1',analyze,validate,namedCountries,referencedCountries,precision,regions:REGIONS,eu:EU,types:TYPES});
root.V52GeoSemantic=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
