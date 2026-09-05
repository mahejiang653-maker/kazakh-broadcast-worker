(function(G){
if(!G||!window.Cesium)return;
const C=Cesium;
if(G.__kzArabicV40)return;G.__kzArabicV40=true;

const CY={
'А':'ا','а':'ا','Ә':'ٵ','ә':'ٵ','Б':'ب','б':'ب','В':'ۆ','в':'ۆ','Г':'گ','г':'گ','Ғ':'ع','ғ':'ع','Д':'د','д':'د','Е':'ە','е':'ە','Ё':'يو','ё':'يو','Ж':'ج','ж':'ج','З':'ز','з':'ز','И':'ي','и':'ي','Й':'ي','й':'ي','К':'ك','к':'ك','Қ':'ق','қ':'ق','Л':'ل','л':'ل','М':'م','м':'م','Н':'ن','н':'ن','Ң':'ڭ','ң':'ڭ','О':'و','о':'و','Ө':'ٶ','ө':'ٶ','П':'پ','п':'پ','Р':'ر','р':'ر','С':'س','с':'س','Т':'ت','т':'ت','У':'ۋ','у':'ۋ','Ұ':'ۇ','ұ':'ۇ','Ү':'ٷ','ү':'ٷ','Ф':'ف','ф':'ف','Х':'ح','х':'ح','Һ':'ھ','һ':'ھ','Ц':'تس','ц':'تس','Ч':'چ','ч':'چ','Ш':'ش','ш':'ش','Щ':'شش','щ':'شش','Ы':'ى','ы':'ى','І':'ٸ','і':'ٸ','Э':'يە','э':'يە','Ю':'يۋ','ю':'يۋ','Я':'يا','я':'يا','Ъ':'','ъ':'','Ь':'','ь':''
};
const EXACT=new Map(Object.entries({
'中国':'جۇڭگو','中华人民共和国':'جۇڭگو','我国':'جۇڭگو','全国':'بٷكٸل جۇڭگو',
'美国':'امەريكا','俄罗斯':'رەسەي','乌克兰':'ۋكراينا','伊朗':'يران','比利时':'بەلگيا','以色列':'يزرايىل','巴勒斯坦':'پالەستينا',
'欧盟':'ەۋروپا وداعى','北约':'ناتو','NATO':'ناتو','东盟':'وڭتٷستٸك-شىعىس ازيا مەملەكەتتەرٸ وداعى','海合会':'شىعاناق ىنتىماقتاستىق كەڭەسٸ',
'约旦河西岸':'يوردان ٶزەنٸنٸڭ باتىس جاعالاۋى','约旦河西岸中部':'يوردان ٶزەنٸنٸڭ باتىس جاعالاۋىنىڭ ورتالىعى',
'台湾省':'تايۋان ٶلكەسٸ','新北市':'شىنبەي قالاسى','新北市土城区':'شىنبەي قالاسى تۇچىڭ اۋدانى','台湾省新北市':'تايۋان ٶلكەسٸ، شىنبەي قالاسى',
'北京市':'بىيجيڭ قالاسى','北京市丰台区':'بىيجيڭ قالاسى، فەڭتاي اۋدانى','丰台区':'فەڭتاي اۋدانى','北京市西城区':'بىيجيڭ قالاسى، شىچىڭ اۋدانى','西城区':'شىچىڭ اۋدانى',
'教育部':'بٸلٸم بەرۋ مينيسترلٸگٸ','教育部所在区域':'بٸلٸم بەرۋ مينيسترلٸگٸ',
'新疆':'شىنجاڭ','新疆维吾尔自治区':'شىنجاڭ ۇيعۇر اۆتونوم رايونى','新疆石河子市':'شىنجاڭ، شىحزى قالاسى','石河子市':'شىحزى قالاسى',
'石河子职业技术大学':'شىحزى كەسٸپتٸك تەحنيكا ۋنيۆەرسيتەتٸ','橡胶草天然橡胶中试提取线':'كاۋچۋك شٶبٸنٸڭ تەبيعي كاۋچۋك سىناق ٶندٸرٸس جەلٸسٸ',
'新疆阿克苏地区':'شىنجاڭ، اقسۇ ايماعى','阿克苏地区':'اقسۇ ايماعى','柯柯牙':'كٶكيا','柯柯牙生态治理区':'كٶكيا ەكولوگيالىق تٷزەۋ رايونى',
'纳坦兹附近':'ناتانز ماڭى','纳坦兹附近核设施':'ناتانز ماڭىنداعى يادرو نىسانى','纳坦兹附近 Pickaxe Mountain':'ناتانز ماڭى',
'哈尔克岛附近海域':'حارك ارالى ماڭىنداعى تەڭٸز اۋدانى','波斯湾北部':'پارسى شىعاناعىنىڭ سولتٷستٸگٸ','伊斯法罕省':'يسفاحان ٶلكەسٸ',
'乌克兰国家安全局基辅总部':'ۋكراينا مەملەكەتتٸك قاۋٸپسىزدٸك قىزمەتٸنٸڭ كيەۆ باس كەڭسەسٸ','基辅':'كيەۆ','基辅市中心':'كيەۆ قالا ورتالىعى',
'莫斯科':'مٵسكەۋ','莫斯科市':'مٵسكەۋ قالاسى','华盛顿':'ۋاشينگتون','哥伦比亚特区':'كولۋمبيا اۋدانى',
'布鲁塞尔欧盟机构区':'بريۋسسەل ەۋروپا وداعى مەكەمەلەر اۋدانى','布鲁塞尔首都大区':'بريۋسسەل استانا اۋدانى',
'北京种业大会丰台主会场':'بىيجيڭ تۇقۇم شارۋاشىلىعى قۇرىلتايىنىڭ فەڭتايداعى باس الاڭى','丰台主会场（京丰宾馆）':'فەڭتاي باس الاڭى',
'富士康总部所在区域':'فۋجىكاڭ باس كەڭسەسٸ ورنالاسقان اۋدان',
'波斯湾北部打击区域':'پارسى شىعاناعىنىڭ سولتٷستٸك سوخقى اۋدانى','美军近海打击区—纳坦兹目标区':'امەريكا تەڭٸز سوخقى اۋدانى — ناتانز نىسانى',
'俄乌局部战区—基辅方向':'رەسەي-ۋكراينا جەرگٸلٸكتٸ سوگىس اۋدانى — كيەۆ باعىتى'
}));

const cache=new Map();let countryMap=null;
const han=s=>/[\u3400-\u9fff]/.test(String(s||''));
const arab=s=>/[\u0600-\u06ff]/.test(String(s||''));
const cyr=s=>/[\u0400-\u04ff]/.test(String(s||''));
const cyr2ar=s=>Array.from(String(s||'')).map(ch=>CY[ch]??ch).join('');
function buildCountryMap(){
 if(countryMap)return countryMap;countryMap=new Map();
 try{
  const zh=new Intl.DisplayNames(['zh-CN'],{type:'region'}),kk=new Intl.DisplayNames(['kk'],{type:'region'});
  for(const c of G.countries?.values?.()||[]){const i=String(c?.iso2||'').toUpperCase();if(!i||i==='-99')continue;const z=zh.of(i),k=kk.of(i);if(z&&k)countryMap.set(z,cyr2ar(k));}
 }catch{}
 return countryMap;
}
function translateSync(raw){
 const s=String(raw||'').trim();if(!s)return'';
 if(EXACT.has(s))return EXACT.get(s);
 if(arab(s)&&!han(s))return s;
 if(cyr(s)&&!han(s))return cyr2ar(s);
 const cm=buildCountryMap();if(cm.has(s))return cm.get(s);
 // Common composite map labels: translate each known side without reordering the Arabic text.
 const parts=s.split(/\s*[\/·—]\s*/);if(parts.length>1){const out=parts.map(x=>EXACT.get(x)||cm.get(x)||'').filter(Boolean);if(out.length===parts.length)return out.join(' — ')}
 return han(s)?'':s;
}
function bidi(s){
 const mixed=String(s||'').replace(/[A-Za-z0-9][A-Za-z0-9._%+\- ]*/g,m=>'\u2066'+m+'\u2069');
 return '\u2067'+mixed+'\u2069';
}
function coordsOfEntity(e){try{const p=e?.position?.getValue?.(G.viewer.clock.currentTime);if(!p)return null;const c=C.Cartographic.fromCartesian(p);return[C.Math.toDegrees(c.longitude),C.Math.toDegrees(c.latitude)]}catch{return null}}
async function asyncTranslate(text,lon,lat){
 const key=[text,Number(lon).toFixed(3),Number(lat).toFixed(3)].join('|');if(cache.has(key))return cache.get(key);
 const p=(async()=>{try{const q=new URLSearchParams({text:String(text||''),lon:String(lon),lat:String(lat)});const r=await fetch('/api/kz-map-label?'+q,{cache:'force-cache'});if(!r.ok)return'ٴ…';const j=await r.json();return String(j?.label||'ٴ…')}catch{return'ٴ…'}})();cache.set(key,p);return p;
}
function styleLabel(e){try{if(!e?.label)return;e.label.font='17px "Noto Naskh Arabic","Noto Sans Arabic","Arial",sans-serif';e.label.fillColor=C.Color.fromCssColorString('#fff4dd');e.label.outlineWidth=2.2;e.label.disableDepthTestDistance=Number.POSITIVE_INFINITY}catch{}}
function install(){
 if(typeof G.label!=='function'||!G.viewer){setTimeout(install,120);return}
 const oldLabel=G.label;
 G.label=(text,lon,lat,mode)=>{
  const original=String(text||'').trim();const tr=translateSync(original);const ent=oldLabel(bidi(tr||'ٴ…'),lon,lat,mode);styleLabel(ent);
  if(!tr&&original){asyncTranslate(original,+lon,+lat).then(v=>{try{if(ent?.label)ent.label.text=bidi(v)}catch{}})}
  return ent;
 };
 // Translate any labels created directly by older patches, not only labels made through G.label().
 try{G.viewer.entities.collectionChanged.addEventListener((col,added)=>{for(const e of added||[]){if(!e?.label)continue;styleLabel(e);let t='';try{t=String(e.label.text?.getValue?.(G.viewer.clock.currentTime)||'')}catch{}if(!t||!han(t))continue;const p=coordsOfEntity(e)||[0,0],tr=translateSync(t);e.label.text=bidi(tr||'ٴ…');if(!tr)asyncTranslate(t,p[0],p[1]).then(v=>{try{e.label.text=bidi(v)}catch{}})}})}catch{}
 const hideNative=()=>{try{if(G.tdtLabelLayer)G.tdtLabelLayer.show=false}catch{}};hideNative();setTimeout(hideNative,300);setTimeout(hideNative,1200);setTimeout(hideNative,3500);
 // If the label layer is ever recreated, keep it hidden: map annotations must be Kazakh Arabic only.
 if(typeof G.addTdt==='function'&&!G.__kzOldAddTdt){G.__kzOldAddTdt=G.addTdt;G.addTdt=(code,a)=>{const l=G.__kzOldAddTdt(code,a);if(code==='cia')try{l.show=false}catch{}return l}}
 console.info('[News Globe] V40 China Kazakh Arabic map labels loaded');
}
install();
})(window.NG14);
