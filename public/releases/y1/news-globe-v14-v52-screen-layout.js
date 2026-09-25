(function(G){
  'use strict';
  // All inputs and outputs are CSS pixels, never drawing-buffer/DPR pixels.
  const rect=(x,y,w,h)=>({left:x,top:y,right:x+w,bottom:y+h,width:w,height:h});
  const overlaps=(a,b,gap=0)=>a.left<b.right+gap&&a.right>b.left-gap&&a.top<b.bottom+gap&&a.bottom>b.top-gap;
  const contains=(a,b)=>b.left>=a.left&&b.top>=a.top&&b.right<=a.right&&b.bottom<=a.bottom;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function safeBounds(frame,viewport,insets={},gap=8){
    const left=Math.max(gap,viewport.left+(insets.left||0)-frame.left);
    const top=Math.max(gap,viewport.top+(insets.top||0)-frame.top);
    const right=Math.min(frame.width-gap,viewport.right-(insets.right||0)-frame.left);
    const bottom=Math.min(frame.height-gap,viewport.bottom-(insets.bottom||0)-frame.top);
    return rect(left,top,Math.max(0,right-left),Math.max(0,bottom-top));
  }
  function directions(anchor,bounds){
    const side=anchor.x<(bounds.left+bounds.right)/2?['right','left']:['left','right'];
    const vertical=anchor.y<(bounds.top+bounds.bottom)/2?['bottom','top']:['top','bottom'];
    const edge=Math.min(anchor.y-bounds.top,bounds.bottom-anchor.y)<bounds.height*.22;
    return edge?[vertical[0],...side,vertical[1]]:[...side,...vertical];
  }
  function candidates(item,bounds,obstacles){
    const {anchor:a,width:w,height:h}=item,gap=(a.radius||0)+8,all=[];
    if(w>bounds.width||h>bounds.height)return all;
    const ys=[a.y-h/2,a.y-h,a.y,bounds.top,bounds.bottom-h];
    const xs=[a.x-w/2,a.x-w,a.x,bounds.left,bounds.right-w];
    for(const o of obstacles){ys.push(o.top-h-6,o.bottom+6);xs.push(o.left-w-6,o.right+6)}
    for(const direction of directions(a,bounds)){
      const horizontal=direction==='left'||direction==='right';
      for(const offset of horizontal?ys:xs){
        const x=horizontal?(direction==='right'?a.x+gap:a.x-gap-w):clamp(offset,bounds.left,bounds.right-w);
        const y=horizontal?clamp(offset,bounds.top,bounds.bottom-h):(direction==='bottom'?a.y+gap:a.y-gap-h);
        const box=rect(x,y,w,h);
        if(!contains(bounds,box))continue;
        const dx=Math.max(box.left-a.x,0,a.x-box.right),dy=Math.max(box.top-a.y,0,a.y-box.bottom);
        if(Math.hypot(dx,dy)>Math.min(160,bounds.width*.65))continue;
        all.push({box,direction,distance:Math.hypot(dx,dy)});
      }
    }
    return all;
  }
  function solve(items,bounds,obstacles=[]){
    const placed=[],occupied=obstacles.slice();
    for(const item of [...items].sort((a,b)=>(b.priority||0)-(a.priority||0)||String(a.id).localeCompare(String(b.id)))){
      const order=directions(item.anchor,bounds);
      const options=candidates(item,bounds,occupied).filter(c=>!occupied.some(o=>overlaps(c.box,o,4)));
      for(const c of options)c.score=c.distance+order.indexOf(c.direction)*12-(item.previousDirection===c.direction?18:0);
      options.sort((a,b)=>a.score-b.score);
      const pick=options[0];
      if(!pick){placed.push({id:item.id,hidden:true});continue}
      occupied.push(pick.box);
      placed.push({id:item.id,hidden:false,box:pick.box,direction:pick.direction});
    }
    return placed;
  }
  G.ScreenLayout=Object.freeze({rect,overlaps,contains,safeBounds,directions,solve});
})(window.NG14=window.NG14||{});
