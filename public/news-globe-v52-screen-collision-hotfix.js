(function attach(){
 const G=window.NG14,C=window.Cesium;if(!G||!C||!G.viewer)return setTimeout(attach,80);if(G.__v52ScreenCollision)return;G.__v52ScreenCollision=true;
 const viewer=G.viewer,collection=viewer.entities,pointEntities=new Set(),labelEntities=new Set();
 let last=0,disposed=false;
 // Index only screen-space participants. Border/polyline entities never need
 // to be scanned again at every postRender; changed also covers graphics added later.
 function index(e){if(e.point)pointEntities.add(e);else pointEntities.delete(e);if(e.label)labelEntities.add(e);else labelEntities.delete(e)}
 for(const e of collection.values||[])index(e);
 const removeCollection=collection.collectionChanged.addEventListener((_,added,removed,changed)=>{
   for(const e of removed){pointEntities.delete(e);labelEntities.delete(e)}
   for(const e of added)index(e);
   for(const e of changed)index(e);
 });
 function visible(e,graphics,t){try{return e.show!==false&&e.isShowing!==false&&offsetOf(graphics?.show,t)!==false}catch{return false}}
 function applyOffset(e,offset,t){try{const current=offsetOf(e.label.pixelOffset,t);if(!current||current.x!==offset.x||current.y!==offset.y)e.label.pixelOffset=offset}catch{}}
 function screenOf(e,t){try{const p=e.position?.getValue?e.position.getValue(t):e.position;if(!p)return null;return C.SceneTransforms.worldToWindowCoordinates(G.viewer.scene,p)}catch{return null}}
 function offsetOf(prop,t){try{return prop?.getValue?prop.getValue(t):prop}catch{return null}}
 function tick(){
   if(disposed||document.hidden||viewer.isDestroyed?.())return;
   const now=performance.now();if(now-last<80)return;last=now;
   const t=viewer.clock.currentTime,pending=[],points=[];
   for(const e of labelEntities){
     if(!visible(e,e.label,t))continue;
     // Story/admin labels own a constant offset from creation. Moving them here
     // would change an already-painted frame and make placement depend on whether
     // the current red marker became visible before or after that first frame.
     if(e.__v52FixedLabelOffset)continue;
     if(e.__v52CollisionLocked){applyOffset(e,e.__v52CollisionLocked,t);continue}
     pending.push(e);
   }
   // Authored offsets stay locked as before, without re-projecting settled
   // labels or any points when there is no new label to place.
   if(!pending.length)return;
   for(const e of pointEntities){if(!visible(e,e.point,t))continue;const p=screenOf(e,t);if(p)points.push(p)}
   for(const e of pending){const p=screenOf(e,t);if(!p)continue;
     const tag=e.__v52CollisionBase||(e.__v52CollisionBase=offsetOf(e.label.pixelOffset,t)||new C.Cartesian2(0,0));
     // A place-name label and its own red/yellow/blue marker share the same world
     // position. That anchor point is not a collision obstacle: the label's authored
     // pixelOffset already separates the text from its marker. Counting the anchor as
     // an obstacle made the first rendered frame appear above the dot, then the next
     // postRender tick selected the opposite (bottom) candidate, producing a visible
     // flash. Ignore only co-located anchor points; still avoid every other marker.
     const obstacles=points.filter(q=>{const dx=p.x-q.x,dy=p.y-q.y;return dx*dx+dy*dy>8*8});
     const baseX=p.x+tag.x,baseY=p.y+tag.y;
     const baseClear=obstacles.every(q=>{const dx=baseX-q.x,dy=baseY-q.y;return dx*dx+dy*dy>=64*64});
     if(baseClear){e.__v52CollisionLocked=new C.Cartesian2(tag.x,tag.y);applyOffset(e,e.__v52CollisionLocked,t);continue}
     let best=null,bestD=-1;
     const candidates=[new C.Cartesian2(tag.x,Math.min(tag.y,-52)),new C.Cartesian2(56,tag.y),new C.Cartesian2(-56,tag.y),new C.Cartesian2(tag.x,52)];
     for(const c of candidates){let d=Infinity;for(const q of obstacles){const dx=p.x+c.x-q.x,dy=p.y+c.y-q.y;d=Math.min(d,dx*dx+dy*dy)}if(d>bestD){bestD=d;best=c}}
     const chosen=best||tag;
     e.__v52CollisionLocked=new C.Cartesian2(chosen.x,chosen.y);
     applyOffset(e,e.__v52CollisionLocked,t);
   }
 }
 const removeRender=viewer.scene.postRender.addEventListener(tick);
 function dispose(){if(disposed)return;disposed=true;removeRender();removeCollection();window.removeEventListener('pagehide',onPageHide);pointEntities.clear();labelEntities.clear()}
 function onPageHide(event){if(!event.persisted)dispose()}
 window.addEventListener('pagehide',onPageHide);
 G.v52ScreenCollision={dispose,getDiagnostics:()=>({indexedPoints:pointEntities.size,indexedLabels:labelEntities.size,disposed})};
})();
