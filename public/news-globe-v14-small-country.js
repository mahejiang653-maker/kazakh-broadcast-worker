(function(G){
const C=Cesium;
const originalCountryStage=G.countryStage;
const originalFlyCountry=G.flyCountry;

G.smallCountryFrame=iso=>{
  const c=G.countries.get(String(iso||'').toUpperCase());
  if(!c?.feature?.geometry)return null;
  const pts=G.collect(c.feature.geometry,[]);
  if(!pts.length)return null;
  let west=Infinity,south=Infinity,east=-Infinity,north=-Infinity;
  for(const p of pts){
    const lon=+p[0],lat=+p[1];
    if(!Number.isFinite(lon)||!Number.isFinite(lat))continue;
    west=Math.min(west,lon); south=Math.min(south,lat);
    east=Math.max(east,lon); north=Math.max(north,lat);
  }
  if(![west,south,east,north].every(Number.isFinite))return null;
  const width=east-west,height=north-south;
  if(width<=0||height<=0||width>18||height>14)return null;
  const padLon=Math.max(.45,width*.22);
  const padLat=Math.max(.40,height*.22);
  const rect=C.Rectangle.fromDegrees(west-padLon,Math.max(-85,south-padLat),east+padLon,Math.min(85,north+padLat));
  const verySmall=width<4.5&&height<4.5;
  return {rect,width,height,verySmall};
};

G.tuneSmallCountryLabel=frame=>{
  const e=G.countryLabelEntity;
  if(!e?.label||!frame)return;
  try{
    e.label.font=frame.verySmall?'13px "PingFang SC","Microsoft YaHei",sans-serif':'14px "PingFang SC","Microsoft YaHei",sans-serif';
    e.label.pixelOffset=new C.Cartesian2(0,frame.verySmall?-12:-7);
    e.label.backgroundColor=C.Color.fromCssColorString('#04101b').withAlpha(frame.verySmall?.16:.20);
    e.label.padding=new C.Cartesian2(frame.verySmall?7:9,frame.verySmall?4:5);
  }catch{}
};

G.countryStage=async(n,iso,serial)=>{
  const frame=G.smallCountryFrame(iso);
  if(!frame)return originalCountryStage(n,iso,serial);
  const c=G.countries.get(iso);
  if(!c)return true;
  G.flashCountry(iso,n);
  G.tuneSmallCountryLabel(frame);
  G.blinkCountryBorder?.(iso,4,220);
  await new Promise(r=>G.viewer.camera.flyTo({
    destination:frame.rect,
    orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},
    duration:1.25,
    complete:r,
    cancel:r
  }));
  if(serial!==G.navSerial)return false;
  G.updateOcclusion();
  return G.wait(1700,serial);
};

G.flyCountry=(n,iso,serial)=>{
  const frame=G.smallCountryFrame(iso);
  if(!frame)return originalFlyCountry(n,iso,serial);
  G.flashCountry(iso,n);
  G.tuneSmallCountryLabel(frame);
  G.blinkCountryBorder?.(iso,4,220);
  G.viewer.camera.flyTo({
    destination:frame.rect,
    orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},
    duration:1.25,
    complete:()=>{
      if(serial!==G.navSerial)return;
      G.highlightTimer=setTimeout(()=>{
        if(serial!==G.navSerial)return;
        if(G.countryOnly(n,iso)){G.updateOcclusion();return}
        G.flyPoint(n,serial,()=>{G.clearCountry();G.flashArea(n,iso,serial)});
      },950);
    }
  });
};
})(window.NG14);
