(function(){
  const C=window.Cesium;
  if(!C||!C.EntityCollection)return;
  const proto=C.EntityCollection.prototype;
  if(proto.__v35EllipseSafe)return;
  proto.__v35EllipseSafe=true;

  const numberValue=(p,time)=>{
    try{
      const v=p&&typeof p.getValue==='function'?p.getValue(time):p;
      const n=Number(v);
      return Number.isFinite(n)?n:NaN;
    }catch{return NaN}
  };

  const protect=e=>{
    const el=e&&e.ellipse;
    if(!el||el.__v35AxisSafe||!el.semiMajorAxis||!el.semiMinorAxis)return e;
    el.__v35AxisSafe=true;
    const major=el.semiMajorAxis;
    const minor=el.semiMinorAxis;
    el.semiMajorAxis=new C.CallbackProperty(time=>{
      const a=numberValue(major,time),b=numberValue(minor,time);
      if(Number.isFinite(a)&&Number.isFinite(b))return Math.max(1,a,b);
      if(Number.isFinite(a))return Math.max(1,a);
      if(Number.isFinite(b))return Math.max(1,b);
      return 1;
    },false);
    el.semiMinorAxis=new C.CallbackProperty(time=>{
      const a=numberValue(major,time),b=numberValue(minor,time);
      if(Number.isFinite(a)&&Number.isFinite(b))return Math.max(1,Math.min(a,b));
      if(Number.isFinite(a))return Math.max(1,a);
      if(Number.isFinite(b))return Math.max(1,b);
      return 1;
    },false);
    return e;
  };

  const oldAdd=proto.add;
  proto.add=function(entity){
    const out=oldAdd.call(this,entity);
    protect(out);
    return out;
  };

  try{
    const vals=window.NG14?.viewer?.entities?.values||[];
    for(const e of vals)protect(e);
  }catch{}

  console.info('[News Globe] V35 ellipse axis safety hotfix loaded');
})();
