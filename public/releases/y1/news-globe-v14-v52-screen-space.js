(function(G){
  'use strict';
  const L=G.ScreenLayout;
  if(!L)return;
  const value=(property,time,fallback)=>typeof property?.getValue==='function'?(property.getValue(time)??fallback):(property??fallback);

  // Only the presentation of an entity is owned here; its position/data is not.
  class VisibilityGate {
    constructor(C,graphics,enabled=true){
      this.graphics=graphics;this.original=graphics.show;this.enabled=enabled;this.writing=false;
      this.property=new C.CallbackProperty(time=>this.enabled&&this.sourceVisible(time),false);
      this.removeListener=graphics.definitionChanged.addEventListener((_g,name)=>{
        if(name==='show'&&!this.writing&&graphics.show!==this.property){this.original=graphics.show;this.install()}
      });
      this.install();
    }
    install(){this.writing=true;this.graphics.show=this.property;this.writing=false}
    sourceVisible(time){return value(this.original,time,true)!==false}
    destroy(){this.removeListener();if(this.graphics.show===this.property)this.graphics.show=this.original}
  }

  class ScreenLabelLayer {
    constructor(frame){
      this.frame=frame;this.doc=frame.ownerDocument;this.win=this.doc.defaultView;this.nodes=new Map();this.dirty=true;this.disposed=false;
      this.root=this.doc.createElement('div');this.root.className='ng-screen-layer';this.root.setAttribute('aria-hidden','true');frame.appendChild(this.root);
      this.probe=this.doc.createElement('div');this.probe.className='ng-safe-probe';this.doc.body.appendChild(this.probe);
      this.invalidate=()=>{this.dirty=true};
      this.resize=new this.win.ResizeObserver(this.invalidate);this.resize.observe(frame);
      this.chrome=[...this.doc.querySelectorAll('.toolbar,.info-row,.credit-dock,.dock,.note-row,.overview,.drawer-backdrop,[data-globe-obstacle],#scenePlanHud')];
      this.mutations=new this.win.MutationObserver(this.invalidate);
      for(const node of this.chrome){this.resize.observe(node);this.mutations.observe(node,{subtree:true,childList:true,characterData:true,attributes:true})}
      this.mutations.observe(this.doc.documentElement,{attributes:true,attributeFilter:['style','class']});
      this.win.addEventListener('resize',this.invalidate);this.win.addEventListener('scroll',this.invalidate,true);
      this.win.visualViewport?.addEventListener('resize',this.invalidate);this.win.visualViewport?.addEventListener('scroll',this.invalidate);
      this.doc.fonts?.addEventListener('loadingdone',this.invalidate);
      this.state={labels:[],hidden:0};
    }
    metrics(){
      if(!this.dirty)return this.geometry;
      const frame=this.frame.getBoundingClientRect(),vv=this.win.visualViewport;
      const viewport=L.rect(vv?.offsetLeft||0,vv?.offsetTop||0,vv?.width||this.win.innerWidth,vv?.height||this.win.innerHeight);
      const css=this.win.getComputedStyle(this.probe),insets={};
      for(const side of ['top','right','bottom','left'])insets[side]=parseFloat(css.getPropertyValue('padding-'+side))||0;
      const bounds=L.safeBounds(frame,viewport,insets),obstacles=[];
      for(const node of this.chrome){
        const style=this.win.getComputedStyle(node);
        if(style.display==='none'||style.visibility==='hidden'||+style.opacity===0)continue;
        const r=node.getBoundingClientRect();if(!r.width||!r.height||!L.overlaps(r,frame))continue;
        obstacles.push(L.rect(r.left-frame.left,r.top-frame.top,r.width,r.height));
      }
      const canvas=this.frame.querySelector('canvas'),canvasRect=canvas?.getBoundingClientRect();
      this.geometry={frame,bounds,obstacles,canvasRect,canvasWidth:canvas?.clientWidth,canvasHeight:canvas?.clientHeight};
      for(const node of this.nodes.values())node.size=null;
      this.dirty=false;return this.geometry;
    }
    remove(id){const node=this.nodes.get(id);if(!node)return;node.element.remove();node.line.remove();this.nodes.delete(id)}
    clear(){for(const id of this.nodes.keys())this.remove(id);this.state={labels:[],hidden:0}}
    update(labels,markers=[]){
      if(this.disposed)return;
      const {bounds,obstacles}=this.metrics(),live=new Set(labels.map(x=>x.id));
      for(const id of this.nodes.keys())if(!live.has(id))this.remove(id);
      const items=[],maxWidth=Math.max(0,Math.min(bounds.width,260,Math.max(96,bounds.width*.58)));
      for(const label of labels){
        let node=this.nodes.get(label.id);
        if(!node){
          const element=this.doc.createElement('div'),line=this.doc.createElement('div'),text=this.doc.createElement('span');
          element.className='ng-screen-label';line.className='ng-label-leader';element.dataset.labelId=label.id;
          text.className='ng-label-text';element.appendChild(text);
          this.root.append(line,element);node={element,line,text,key:'',direction:null};this.nodes.set(label.id,node);
        }
        const fontPixels=Number(/([\d.]+)px/.exec(label.font||'14px')?.[1]||14),paddingY=parseFloat(label.padding)||4;
        const lines=Math.max(1,Math.min(3,Math.floor((bounds.height*.4-paddingY*2)/(fontPixels*1.3))));
        const key=[label.text,label.font,label.color,label.background,label.padding,maxWidth,lines].join('|');
        if(node.key!==key||this.dirty){
          node.text.textContent=label.text;node.element.title=label.text;
          node.element.style.font=label.font||'600 14px "Microsoft YaHei",system-ui,sans-serif';node.element.style.lineHeight='1.3';
          node.element.style.color=label.color||'#f5f9ff';node.element.style.background=label.background||'rgba(3,10,18,.65)';
          node.element.style.padding=label.padding||'4px 7px';node.element.style.maxWidth=maxWidth+'px';node.key=key;node.size=null;
          node.element.style.setProperty('--ng-label-lines',lines);
        }
        if(!node.size){node.element.hidden=false;node.element.style.visibility='hidden'}
      }
      // Batch DOM writes above and measurements below; stable frames reuse sizes.
      for(const label of labels){
        const node=this.nodes.get(label.id);
        if(!node.size){const r=node.element.getBoundingClientRect();node.size={width:r.width,height:r.height}}
        items.push({...label,...node.size,previousDirection:node.direction});
      }
      const result=L.solve(items,bounds,[...obstacles,...markers]);
      for(const item of result){
        const node=this.nodes.get(item.id);node.element.hidden=item.hidden;node.line.hidden=item.hidden;
        if(item.hidden)continue;
        const label=items.find(x=>x.id===item.id),box=item.box,a=label.anchor;
        node.direction=item.direction;node.element.dataset.direction=item.direction;node.element.style.visibility='visible';
        node.element.style.transform=`translate(${box.left.toFixed(2)}px,${box.top.toFixed(2)}px)`;
        const x=Math.max(box.left,Math.min(box.right,a.x)),y=Math.max(box.top,Math.min(box.bottom,a.y));
        const dx=x-a.x,dy=y-a.y,length=Math.hypot(dx,dy),radius=(a.radius||0)+3;
        node.line.hidden=length<radius+10;
        node.line.style.width=Math.max(0,length-radius)+'px';
        node.line.style.transform=`translate(${a.x+dx*radius/(length||1)}px,${a.y+dy*radius/(length||1)}px) rotate(${Math.atan2(dy,dx)}rad)`;
      }
      this.state={bounds,labels:result,hidden:result.filter(x=>x.hidden).length};
      return this.state;
    }
    destroy(){
      if(this.disposed)return;this.disposed=true;this.clear();this.resize.disconnect();this.mutations.disconnect();this.root.remove();this.probe.remove();
      this.win.removeEventListener('resize',this.invalidate);this.win.removeEventListener('scroll',this.invalidate,true);
      this.win.visualViewport?.removeEventListener('resize',this.invalidate);this.win.visualViewport?.removeEventListener('scroll',this.invalidate);
      this.doc.fonts?.removeEventListener('loadingdone',this.invalidate);
    }
  }

  class ScreenSpaceController {
    constructor(viewer){
      this.C=Cesium;this.viewer=viewer;this.entries=new Map();this.disposed=false;
      this.layer=new ScreenLabelLayer(viewer.scene.canvas.closest('.map-frame'));
      this.removals=[viewer.entities.collectionChanged.addEventListener((_c,added,removed,changed)=>{
        if(this.changing)return;
        for(const e of removed)this.remove(e);for(const e of [...added,...changed])this.track(e);
      }),viewer.scene.postRender.addEventListener(()=>this.update())];
      for(const e of viewer.entities.values)this.track(e);
    }
    track(entity){
      const old=this.entries.get(entity.id);
      if(old&&old.label===entity.label&&old.point===entity.point&&old.billboard===entity.billboard)return;
      this.changing=true;
      try{
        if(old)this.remove(entity);
        if(!entity.position||(!entity.label&&!entity.point&&!entity.billboard))return;
        const entry={entity,label:entity.label,point:entity.point,billboard:entity.billboard};
        this.entries.set(entity.id,entry);
        if(entry.label)entry.labelGate=new VisibilityGate(this.C,entry.label,false);
        if(entry.point)entry.pointGate=new VisibilityGate(this.C,entry.point,true);
      }finally{this.changing=false}
    }
    remove(entity){
      const entry=this.entries.get(entity.id);if(!entry)return;
      const changing=this.changing;this.changing=true;
      try{this.entries.delete(entity.id);entry.labelGate?.destroy();entry.pointGate?.destroy();this.layer.remove(entity.id)}finally{this.changing=changing}
    }
    project(entity,time,geometry,occluder){
      const C=this.C;
      if(!entity.isShowing||!entity.isAvailable(time))return null;
      const world=entity.position?.getValue(time);if(!world||!occluder.isPointVisible(world))return null;
      const p=C.SceneTransforms.worldToWindowCoordinates(this.viewer.scene,world);
      if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return null;
      const r=geometry.canvasRect||geometry.frame;
      return {x:p.x*r.width/(geometry.canvasWidth||r.width)+r.left-geometry.frame.left,y:p.y*r.height/(geometry.canvasHeight||r.height)+r.top-geometry.frame.top};
    }
    update(){
      if(this.disposed||this.viewer.isDestroyed?.())return;
      const C=this.C,time=this.viewer.clock.currentTime,geometry=this.layer.metrics(),labels=[],markers=[];
      const occluder=new C.EllipsoidalOccluder(C.Ellipsoid.WGS84,this.viewer.camera.positionWC);
      for(const entry of this.entries.values()){
        const {entity,point,label,billboard}=entry,a=this.project(entity,time,geometry,occluder);
        const radius=point?value(point.pixelSize,time,6)/2+value(point.outlineWidth,time,0)+3:0;
        const pointBox=a&&L.rect(a.x-radius,a.y-radius,radius*2,radius*2);
        if(entry.pointGate)entry.pointGate.enabled=!!a&&L.contains(geometry.bounds,pointBox)&&!geometry.obstacles.some(o=>L.overlaps(pointBox,o));
        if(!a)continue;
        if(point&&entry.pointGate.sourceVisible(time)&&entry.pointGate.enabled){
          markers.push(pointBox);
        }
        if(billboard&&value(billboard.show,time,true)){
          const scale=value(billboard.scale,time,1),w=value(billboard.width,time,24)*scale,h=value(billboard.height,time,20)*scale;
          const angle=value(billboard.rotation,time,0),bw=Math.abs(w*Math.cos(angle))+Math.abs(h*Math.sin(angle)),bh=Math.abs(w*Math.sin(angle))+Math.abs(h*Math.cos(angle));
          const offset=value(billboard.pixelOffset,time,{x:0,y:0}),x=a.x+offset.x,y=a.y+offset.y;
          // Existing flags/sprites use centered origins; reserve extra space for non-centered ones.
          const centered=value(billboard.horizontalOrigin,time,C.HorizontalOrigin.CENTER)===C.HorizontalOrigin.CENTER&&value(billboard.verticalOrigin,time,C.VerticalOrigin.CENTER)===C.VerticalOrigin.CENTER;
          markers.push(L.rect(x-bw/(centered?2:1)-2,y-bh/(centered?2:1)-2,bw*(centered?1:2)+4,bh*(centered?1:2)+4));
        }
        if(label&&entry.labelGate.sourceVisible(time)&&L.contains(geometry.bounds,L.rect(a.x,a.y,0,0))){
          const distance=C.Cartesian3.distance(entity.position.getValue(time),this.viewer.camera.positionWC),condition=value(label.distanceDisplayCondition,time,null);
          if(condition&&(distance<condition.near||distance>condition.far))continue;
          const text=String(value(label.text,time,''));if(!text)continue;
          const padding=value(label.backgroundPadding,time,{x:7,y:5});
          labels.push({id:entity.id,text,anchor:{...a,radius:7},font:value(label.font,time,null),color:value(label.fillColor,time,C.Color.WHITE).toCssColorString(),
            background:value(label.showBackground,time,false)?value(label.backgroundColor,time,C.Color.BLACK.withAlpha(.65)).toCssColorString():'transparent',
            padding:`${padding.y}px ${padding.x}px`,priority:entity.ngEvent?.kind==='target-label'?120:60});
        }
      }
      this.layer.update(labels,markers);
    }
    snapshot(){return {tracked:this.entries.size,...this.layer.state}}
    destroy(){if(this.disposed)return;this.disposed=true;for(const remove of this.removals)remove();for(const entry of [...this.entries.values()])this.remove(entry.entity);this.layer.destroy()}
  }

  G.ScreenVisibilityGate=VisibilityGate;G.ScreenLabelLayer=ScreenLabelLayer;G.ScreenSpaceController=ScreenSpaceController;
  G.attachScreenSpace=viewer=>{G.screenSpace?.destroy();G.screenSpace=new ScreenSpaceController(viewer);return G.screenSpace};
  const init=G.initViewer;
  if(init)G.initViewer=async function(...args){const result=await init.apply(this,args);G.attachScreenSpace(G.viewer);return result};
  window.addEventListener('pagehide',()=>G.screenSpace?.destroy());
  window.addEventListener('pageshow',event=>{if(event.persisted&&G.viewer&&!G.viewer.isDestroyed?.())G.attachScreenSpace(G.viewer)});
})(window.NG14=window.NG14||{});
