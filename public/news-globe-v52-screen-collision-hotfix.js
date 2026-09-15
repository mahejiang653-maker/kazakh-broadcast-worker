(function attach(){
 const G=window.NG14,C=window.Cesium;if(!G||!C||!G.viewer)return setTimeout(attach,80);if(G.__v52ScreenCollision)return;G.__v52ScreenCollision=true;
 let last=0;
 function screenOf(e,t){try{const p=e.position?.getValue?e.position.getValue(t):e.position;if(!p)return null;return C.SceneTransforms.worldToWindowCoordinates(G.viewer.scene,p)}catch{return null}}
 function offsetOf(prop,t){try{return prop?.getValue?prop.getValue(t):prop}catch{return null}}
 function tick(){
   const now=performance.now();if(now-last<120)return;last=now;
   const t=G.viewer.clock.currentTime,vals=G.viewer.entities.values||[],points=[];
   for(const e of vals){if(!e.point)continue;const p=screenOf(e,t);if(p)points.push(p)}
   for(const e of vals){if(!e.label)continue;const p=screenOf(e,t);if(!p)continue;
     let near=false;for(const q of points){const dx=p.x-q.x,dy=p.y-q.y;if(dx*dx+dy*dy<46*46){near=true;break}}
     const tag=e.__v52CollisionBase||(e.__v52CollisionBase=offsetOf(e.label.pixelOffset,t)||new C.Cartesian2(0,0));
     const want=near?new C.Cartesian2(tag.x,Math.min(tag.y,-42)):tag;
     try{e.label.pixelOffset=want}catch{}
   }
 }
 G.viewer.scene.postRender.addEventListener(tick);
})();