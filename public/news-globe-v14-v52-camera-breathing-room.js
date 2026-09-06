(function(){
  if(!window.Cesium||window.__NG52CameraBreathingRoom)return;
  window.__NG52CameraBreathingRoom=true;
  const C=window.Cesium;
  const P=C.Camera&&C.Camera.prototype;
  if(!P)return;

  const oldFlyTo=P.flyTo;
  const oldFlyToBoundingSphere=P.flyToBoundingSphere;

  function heightFactor(h){
    if(!Number.isFinite(h)||h<=0)return 1;
    if(h<400000)return 1.22;
    if(h<1200000)return 1.18;
    if(h<6000000)return 1.14;
    return 1.08;
  }

  function rangeFactor(r){
    if(!Number.isFinite(r)||r<=0)return 1;
    if(r<1000000)return 1.20;
    if(r<5000000)return 1.15;
    return 1.10;
  }

  P.flyTo=function(options){
    try{
      if(options&&options.destination&&options.destination instanceof C.Cartesian3){
        const cart=C.Cartographic.fromCartesian(options.destination);
        if(cart&&Number.isFinite(cart.height)&&cart.height>50000){
          const h=cart.height*heightFactor(cart.height);
          options=Object.assign({},options,{destination:C.Cartesian3.fromRadians(cart.longitude,cart.latitude,h)});
        }
      }
    }catch(e){}
    return oldFlyTo.call(this,options);
  };

  P.flyToBoundingSphere=function(bs,options){
    try{
      if(options&&options.offset&&Number.isFinite(options.offset.range)&&options.offset.range>0){
        const o=options.offset;
        const offset=new C.HeadingPitchRange(o.heading,o.pitch,o.range*rangeFactor(o.range));
        options=Object.assign({},options,{offset});
      }
    }catch(e){}
    return oldFlyToBoundingSphere.call(this,bs,options);
  };

  window.NG52_VIEW_RULES={
    countryBackoff:'8–10%',
    eventBackoff:'18–22%',
    regionalBackoff:'14–18%',
    globeBackoff:'8%'
  };
})(window.NG14);