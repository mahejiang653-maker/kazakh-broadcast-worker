(function(G){
if(!G||!window.Cesium)return;
const C=Cesium;
if(G.__kzCanvasRTLV42)return;G.__kzCanvasRTLV42=true;

// Cesium Label has long-standing text-shaping limitations for scripts such as Arabic.
// V42 renders every Arabic map label to a normal browser Canvas first, then shows the
// canvas as a Cesium billboard. The browser therefore performs the Arabic shaping + RTL
// bidi layout, instead of Cesium reversing the glyph order itself.
try{C.Label.enableRightToLeftDetection=false}catch{}

const strip=s=>String(s||'').replace(/[\u202A-\u202E\u2066-\u2069]/g,'').trim();
const hasArabic=s=>/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/.test(String(s||''));
const now=()=>G.viewer?.clock?.currentTime;
function val(p){try{return p?.getValue? p.getValue(now()):p}catch{return p}}

function rounded(ctx,x,y,w,h,r){
 r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
}

function makeCanvas(text){
 const dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));
 let size=18;
 const family='"Noto Naskh Arabic","Noto Sans Arabic","Noto Kufi Arabic","Arial",sans-serif';
 const probe=document.createElement('canvas');const pc=probe.getContext('2d');
 if(!pc)return null;
 try{pc.direction='rtl'}catch{}
 pc.font=`600 ${size*dpr}px ${family}`;
 let width=pc.measureText(text).width/dpr;
 if(width>350){size=Math.max(14,Math.floor(size*350/width));pc.font=`600 ${size*dpr}px ${family}`;width=pc.measureText(text).width/dpr}
 const padX=12,padY=7,cssW=Math.ceil(width+padX*2),cssH=Math.ceil(size*1.85+padY*2);
 const canvas=document.createElement('canvas');canvas.width=Math.ceil(cssW*dpr);canvas.height=Math.ceil(cssH*dpr);
 const ctx=canvas.getContext('2d');if(!ctx)return null;
 ctx.scale(dpr,dpr);try{ctx.direction='rtl'}catch{}
 ctx.textAlign='right';ctx.textBaseline='middle';ctx.font=`600 ${size}px ${family}`;
 ctx.shadowColor='rgba(0,0,0,.38)';ctx.shadowBlur=5;
 rounded(ctx,1,1,cssW-2,cssH-2,7);ctx.fillStyle='rgba(4,16,27,.78)';ctx.fill();
 ctx.shadowBlur=0;ctx.lineWidth=1;ctx.strokeStyle='rgba(128,213,244,.28)';ctx.stroke();
 // Draw from the RIGHT edge. With canvas direction=rtl, the browser shapes and lays
 // out Chinese-Kazakh Arabic in its natural reading order.
 ctx.fillStyle='#fff4dd';ctx.strokeStyle='rgba(2,8,14,.96)';ctx.lineWidth=2.5;
 const x=cssW-padX,y=cssH/2+1;ctx.strokeText(text,x,y);ctx.fillText(text,x,y);
 return{canvas,width:cssW,height:cssH};
}

function convert(e){
 try{
  if(!e?.label)return;
  const raw=strip(String(val(e.label.text)||''));
  if(!raw||!hasArabic(raw))return;
  if(e._kzCanvasText===raw&&e.billboard)return;
  const img=makeCanvas(raw);if(!img)return;
  const po=val(e.label.pixelOffset)||C.Cartesian2.ZERO;
  e.billboard=new C.BillboardGraphics({
   image:img.canvas,width:img.width,height:img.height,
   horizontalOrigin:C.HorizontalOrigin.CENTER,verticalOrigin:C.VerticalOrigin.CENTER,
   pixelOffset:new C.Cartesian2(Number(po?.x)||0,Number(po?.y)||0),
   disableDepthTestDistance:Number.POSITIVE_INFINITY
  });
  e.label.show=false;e._kzCanvasText=raw;
 }catch(err){console.warn('[V42 RTL]',err)}
}
function sweep(){try{for(const e of G.viewer?.entities?.values||[])convert(e)}catch{}}

function install(){
 if(!G.viewer||typeof G.label!=='function'){setTimeout(install,100);return}
 const prior=G.label;
 G.label=(text,lon,lat,mode)=>{const e=prior(text,lon,lat,mode);setTimeout(()=>convert(e),0);return e};
 try{G.viewer.entities.collectionChanged.addEventListener((c,added)=>{for(const e of added||[])setTimeout(()=>convert(e),0)})}catch{}
 let frame=0;try{G.viewer.scene.preRender.addEventListener(()=>{if((++frame%12)===0)sweep()})}catch{}
 setTimeout(sweep,100);setTimeout(sweep,500);setTimeout(sweep,1500);setTimeout(sweep,3500);
 console.info('[News Globe] V42 browser-canvas RTL shaping active');
}
install();
})(window.NG14);
