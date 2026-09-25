(function(G){
  'use strict';
  if(!G||G.EventGeometry)return;
  const C=window.Cesium, R=6371008.8, clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const number=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
  function point(value){
    if(!value)return null;
    const lon=Array.isArray(value)?value[0]:(value.lon??value.lng??value.longitude);
    const lat=Array.isArray(value)?value[1]:(value.lat??value.latitude);
    if(!number(lon)||!number(lat)||Math.abs(+lon)>180||Math.abs(+lat)>90)return null;
    return {lon:+lon,lat:+lat};
  }
  const vec=p=>{const lon=C.Math.toRadians(p.lon),lat=C.Math.toRadians(p.lat);return new C.Cartesian3(Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat))};
  const dot=C.Cartesian3.dot;
  const cross=(a,b)=>C.Cartesian3.cross(a,b,new C.Cartesian3());
  const unit=a=>C.Cartesian3.normalize(a,new C.Cartesian3());
  const mul=(a,s)=>C.Cartesian3.multiplyByScalar(a,s,new C.Cartesian3());
  const plus=(a,b)=>C.Cartesian3.add(a,b,new C.Cartesian3());
  const angle=(a,b)=>Math.atan2(C.Cartesian3.magnitude(cross(a,b)),clamp(dot(a,b),-1,1));
  function greatCircle(a,b){
    const u=vec(a),v=vec(b),theta=angle(u,v);
    let normal=cross(u,v);
    if(C.Cartesian3.magnitude(normal)<1e-12){
      // Exact antipodes have no unique shortest route. Pick a stable plane.
      normal=cross(u,C.Cartesian3.mostOrthogonalAxis(u,new C.Cartesian3()));
    }
    normal=unit(normal);
    const tangent=cross(normal,u);
    return {angle:theta,distance:theta*R,at(t){
      t=clamp(t,0,1);if(t===0)return {...a};if(t===1)return {...b};
      const q=theta<1e-12?u:plus(mul(u,Math.cos(theta*t)),mul(tangent,Math.sin(theta*t)));
      return {lon:C.Math.toDegrees(Math.atan2(q.y,q.x)),lat:C.Math.toDegrees(Math.atan2(q.z,Math.hypot(q.x,q.y)))};
    }};
  }
  function route(a,b,kind='missile'){
    a=point(a);b=point(b);if(!a||!b)return null;
    const arc=greatCircle(a,b),drone=kind==='drone';
    const peak=drone?clamp(arc.distance*.025,16000,75000):clamp(arc.distance*.13,45000,1100000);
    const duration=drone?clamp(3700+arc.distance/2000,3700,7400):clamp(1200+arc.distance/7000,1200,3100);
    const steps=clamp(Math.ceil(arc.angle/C.Math.toRadians(1)),64,240);
    function at(t){const p=arc.at(t);const lift=drone?Math.sin(Math.PI*clamp(t,0,1))**.7:Math.sin(Math.PI*clamp(t,0,1));return C.Cartesian3.fromDegrees(p.lon,p.lat,30000+peak*lift)}
    return {arc,peak,duration,steps,kind,at,positions:Array.from({length:steps+1},(_,i)=>at(i/steps))};
  }
  function destination(center,meters,bearing){
    const a=meters/R,phi=C.Math.toRadians(center.lat),lambda=C.Math.toRadians(center.lon);
    const lat=Math.asin(clamp(Math.sin(phi)*Math.cos(a)+Math.cos(phi)*Math.sin(a)*Math.cos(bearing),-1,1));
    const lon=lambda+Math.atan2(Math.sin(bearing)*Math.sin(a)*Math.cos(phi),Math.cos(a)-Math.sin(phi)*Math.sin(lat));
    return {lon:((C.Math.toDegrees(lon)+540)%360)-180,lat:C.Math.toDegrees(lat)};
  }
  function coordinates(value,out=[]){
    if(Array.isArray(value)){if(point(value)&&!Array.isArray(value[0]))out.push(point(value));else for(const v of value)coordinates(v,out)}
    else if(value)coordinates(value.coordinates||value.geometry||value.features,out);
    return out;
  }
  function directionalOrigin(iso,target){
    const country=G.countries?.get?.(iso),ps=coordinates(country?.feature);
    if(!ps.length)return null;
    const tv=vec(target);let nearest=ps[0],best=Infinity;
    for(const p of ps){const d=angle(vec(p),tv);if(d<best){best=d;nearest=p}}
    const center=point(country?.center);
    // Approximate direction only; never label this as a verified launch site.
    return center?greatCircle(nearest,center).at(.08):nearest;
  }
  function borderSegments(line,center,radius){
    if(!Array.isArray(line))return [];
    const segments=[];let count=0;
    for(let i=1;i<line.length&&count<8192;i++){
      const a=point(line[i-1]),b=point(line[i]);if(!a||!b)continue;
      const arc=greatCircle(a,b),steps=Math.min(128,Math.max(1,Math.ceil(arc.distance/(radius/4))));let run=[];
      for(let j=0;j<=steps;j++){
        count++;const p=arc.at(j/steps);
        if(greatCircle(center,p).distance<=radius)run.push(p);
        else{if(run.length>1)segments.push(run);run=[]}
      }
      if(run.length>1)segments.push(run);
    }
    return segments;
  }
  G.EventGeometry=Object.freeze({point,greatCircle,route,destination,coordinates,directionalOrigin,borderSegments,R});
})(window.NG14);
