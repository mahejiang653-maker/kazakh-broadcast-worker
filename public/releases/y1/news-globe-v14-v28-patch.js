(function(G){
const C=Cesium;

// Keep map labels visibly separated from red and blue location dots on mobile.
const oldLabel=G.label;
G.label=(text,lon,lat,mode)=>{
  const e=oldLabel(text,lon,lat,mode);
  if(!e?.label)return e;
  try{
    if(mode==='local'||mode==='conflict'){
      e.label.verticalOrigin=C.VerticalOrigin.BOTTOM;
      e.label.pixelOffset=new C.Cartesian2(0,-38);
      e.label.backgroundColor=C.Color.fromCssColorString('#04101b').withAlpha(.52);
      e.label.padding=new C.Cartesian2(11,7);
    }
    if(mode==='secondary-country'){
      e.label.verticalOrigin=C.VerticalOrigin.BOTTOM;
      e.label.pixelOffset=new C.Cartesian2(0,-30);
      e.label.backgroundColor=C.Color.fromCssColorString('#05213a').withAlpha(.48);
      e.label.padding=new C.Cartesian2(10,6);
    }
  }catch{}
  return e;
};

const COMMON={
  CHN:['中国','中华人民共和国'],USA:['美国'],RUS:['俄罗斯'],UKR:['乌克兰'],ISR:['以色列'],IRN:['伊朗'],LBN:['黎巴嫩'],
  IND:['印度'],PAK:['巴基斯坦'],JPN:['日本'],KOR:['韩国'],PRK:['朝鲜'],SGP:['新加坡'],AUS:['澳大利亚'],NZL:['新西兰'],
  GBR:['英国'],FRA:['法国'],DEU:['德国'],CAN:['加拿大'],YEM:['也门'],OMN:['阿曼'],SAU:['沙特阿拉伯','沙特'],TUR:['土耳其'],
  SYR:['叙利亚'],IRQ:['伊拉克'],ARE:['阿联酋'],QAT:['卡塔尔'],EGY:['埃及'],JOR:['约旦'],AFG:['阿富汗'],KAZ:['哈萨克斯坦'],
  VNM:['越南'],PHL:['菲律宾'],IDN:['印度尼西亚','印尼'],MYS:['马来西亚'],THA:['泰国'],MMR:['缅甸'],POL:['波兰'],ITA:['意大利'],ESP:['西班牙'],BRA:['巴西']
};
const aliases=iso=>{
  const s=new Set(COMMON[iso]||[]);
  try{const a=G.countryName?.(iso);if(a)s.add(a)}catch{}
  return [...s].filter(x=>x&&x.length>=2);
};
const center=iso=>{
  const c=G.countries.get(iso),p=c?.center||G.centerOf?.(c?.feature?.geometry)||[NaN,NaN];
  return [+p[0],+p[1]];
};
const oldDualInfo=G.dualInfo;
G.dualInfo=n=>{
  if(!n)return null;
  if(String(n.secondaryCountryIso3||n.targetCountryIso3||n.country2Iso3||'').trim())return oldDualInfo(n);
  const main=String(G.resolveIso?.(n)||'').toUpperCase();
  const text=[n.title||'',n.summary||'',n.country||'',n.region||''].join(' ');
  const found=[];
  for(const [iso] of G.countries){
    if(aliases(iso).some(a=>text.includes(a)))found.push(iso);
  }
  const unique=[...new Set(found)];
  if(unique.length<2)return null;
  const primary=main&&unique.includes(main)?main:unique[0];
  const second=unique.find(x=>x!==primary);
  if(!second)return null;
  const p=center(second);if(!p.every(Number.isFinite))return null;
  n.secondaryCountryIso3=second;
  n.secondaryCountry=G.countryName?.(second)||second;
  n.secondaryLon=p[0];n.secondaryLat=p[1];
  return oldDualInfo(n);
};

const oldStoryUI=G.storyUI;
G.storyUI=(n,iso)=>{
  oldStoryUI(n,iso);
  try{
    const s=G.dualInfo(n);if(!s)return;
    const pIso=String(n.sourceCountryIso3||iso||'').toUpperCase();
    const p=pIso==='CHN'?'中华人民共和国':(G.countryName?.(pIso)||n.country||pIso);
    const q=s.country||G.countryName?.(s.iso)||s.iso;
    const el=G.$('country');if(el)el.textContent=p+' · '+q;
  }catch{}
};
})(window.NG14);
