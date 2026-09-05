(function(G){
if(!G||!window.Cesium)return;
const C=Cesium;
if(G.__kzArabicRTLFixV41)return;G.__kzArabicRTLFixV41=true;

// Cesium has built-in bidi handling. Turn it on and feed it logical-order Arabic text.
try{C.Label.enableRightToLeftDetection=true}catch{}

const stripControls=s=>String(s||'').replace(/[\u202A-\u202E\u2066-\u2069]/g,'');
const hasArabic=s=>/[\u0600-\u06ff]/.test(String(s||''));

function normalizeEntity(e){
  try{
    if(!e?.label)return;
    let t='';
    const p=e.label.text;
    if(typeof p==='string')t=p;
    else if(p?.getValue)t=String(p.getValue(G.viewer.clock.currentTime)||'');
    else t=String(p||'');
    if(!t)return;
    const clean=stripControls(t);
    if(hasArabic(clean)&&clean!==t)e.label.text=clean;
  }catch{}
}

function normalizeAll(){
  try{
    for(const e of G.viewer?.entities?.values||[])normalizeEntity(e);
  }catch{}
}

function install(){
  if(!G.viewer||typeof G.label!=='function'){setTimeout(install,100);return}
  try{C.Label.enableRightToLeftDetection=true}catch{}

  const previous=G.label;
  G.label=(text,lon,lat,mode)=>{
    const e=previous(text,lon,lat,mode);
    // Previous V40 translator has already translated the text. Remove its
    // manual bidi-isolate wrappers so Cesium can perform RTL layout itself.
    normalizeEntity(e);
    return e;
  };

  try{
    G.viewer.entities.collectionChanged.addEventListener((collection,added)=>{
      for(const e of added||[])normalizeEntity(e);
    });
  }catch{}

  // V40 may update labels asynchronously after geocoding. Sweep briefly and
  // on scene ticks so late-arriving text is corrected too.
  let ticks=0;
  const timer=setInterval(()=>{
    try{C.Label.enableRightToLeftDetection=true}catch{}
    normalizeAll();
    if(++ticks>40)clearInterval(timer);
  },250);

  try{
    G.viewer.scene.preRender.addEventListener(()=>{
      if((G.__rtlFrame=(G.__rtlFrame||0)+1)%30===0)normalizeAll();
    });
  }catch{}

  console.info('[News Globe] V41 RTL fix active: Cesium bidi detection enabled');
}
install();
})(window.NG14);
