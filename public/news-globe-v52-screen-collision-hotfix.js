(function attach(){
 const G=window.NG14,C=window.Cesium;if(!G||!C||!G.viewer)return setTimeout(attach,80);if(G.__v52ScreenCollision)return;G.__v52ScreenCollision=true;
 let last=0;
 function screenOf(e,t){try{const p=e.position?.getValue?e.position.getValue(t):e.position;if(!p)return null;return C.SceneTransforms.worldToWindowCoordinates(G.viewer.scene,p)}catch{return null}}
 function offsetOf(prop,t){try{return prop?.getValue?prop.getValue(t):prop}catch{return null}}
 function tick(){
   const now=performance.now();if(now-last<80)return;last=now;
   const t=G.viewer.clock.currentTime,vals=G.viewer.entities.values||[],points=[];
   for(const e of vals){if(!e.point)continue;const p=screenOf(e,t);if(p)points.push(p)}
   for(const e of vals){if(!e.label)continue;const p=screenOf(e,t);if(!p)continue;
     const tag=e.__v52CollisionBase||(e.__v52CollisionBase=offsetOf(e.label.pixelOffset,t)||new C.Cartesian2(0,0));
     // Once a label has chosen a safe side for this entity, keep it there for the
     // lifetime of the entity. Camera zoom/reprojection must not make a place name
     // jump from above the red point to below it on later postRender ticks.
     if(e.__v52CollisionLocked){try{e.label.pixelOffset=e.__v52CollisionLocked}catch{}continue}
     let best=null,bestD=-1;
     const candidates=[new C.Cartesian2(tag.x,Math.min(tag.y,-52)),new C.Cartesian2(56,tag.y),new C.Cartesian2(-56,tag.y),new C.Cartesian2(tag.x,52)];
     for(const c of candidates){let d=Infinity;for(const q of points){const dx=(p.x+c.x-tag.x)-q.x,dy=(p.y+c.y-tag.y)-q.y;d=Math.min(d,dx*dx+dy*dy)}if(d>bestD){bestD=d;best=c}}
     const near=points.some(q=>{const dx=p.x-q.x,dy=p.y-q.y;return dx*dx+dy*dy<64*64});
     const chosen=near&&best?best:tag;
     e.__v52CollisionLocked=new C.Cartesian2(chosen.x,chosen.y);
     try{e.label.pixelOffset=e.__v52CollisionLocked}catch{}
   }
 }
 G.viewer.scene.postRender.addEventListener(tick);
})();