(function(G){
  if(G.__v52RuntimeDiagnostic)return;
  G.__v52RuntimeDiagnostic=true;
  let last='boot';
  let lastErr='';
  const history=[];
  const stamp=(s)=>{
    last=String(s||'unknown');
    history.push(last);
    if(history.length>12)history.shift();
    render();
  };
  const render=()=>{
    let el=document.getElementById('v52RuntimeDiag');
    const frame=document.querySelector('.map-frame');
    if(!frame)return;
    if(!el){
      el=document.createElement('div');
      el.id='v52RuntimeDiag';
      el.style.cssText='position:absolute;left:8px;top:8px;z-index:99999;max-width:86%;padding:7px 9px;border-radius:8px;background:rgba(0,0,0,.78);border:1px solid rgba(255,205,80,.75);color:#ffe082;font:600 10px/1.35 monospace;pointer-events:none;white-space:pre-wrap;word-break:break-all';
      frame.appendChild(el);
    }
    el.textContent='V52 r9-DIAG\nLAST: '+last+(lastErr?'\nERR: '+lastErr:'')+'\nTRACE: '+history.slice(-6).join(' > ');
  };
  G.__v52Trace=stamp;
  window.addEventListener('error',e=>{
    lastErr=(e?.error?.stack||e?.message||String(e)).split('\n').slice(0,3).join(' | ').slice(0,700);
    stamp('window.error');
  },true);
  window.addEventListener('unhandledrejection',e=>{
    const r=e?.reason; lastErr=(r?.stack||r?.message||String(r)).split('\n').slice(0,3).join(' | ').slice(0,700);
    stamp('unhandledrejection');
  });
  const wrap=(name)=>{
    const fn=G[name]; if(typeof fn!=='function'||fn.__v52DiagWrapped)return;
    const w=function(...args){
      stamp(name+':enter');
      try{
        const r=fn.apply(this,args);
        if(r&&typeof r.then==='function')return r.then(v=>{stamp(name+':ok');return v},err=>{lastErr=(err?.stack||err?.message||String(err)).split('\n').slice(0,3).join(' | ').slice(0,700);stamp(name+':reject');throw err});
        stamp(name+':ok'); return r;
      }catch(err){lastErr=(err?.stack||err?.message||String(err)).split('\n').slice(0,3).join(' | ').slice(0,700);stamp(name+':throw');throw err;}
    };
    w.__v52DiagWrapped=true; G[name]=w;
  };
  const names=['buildScene','storyUI','restyle','updateOcclusion','navigate','focus','showArc','clearArc','clearCountry','clearLocal','runSequence','countryStage','flashCountry','flashAdmin','flashArea'];
  const install=()=>{for(const n of names)wrap(n);render();};
  install();
  let tries=0;const t=setInterval(()=>{tries++;install();const v=G.viewer;if(v?.scene?.renderError&&!G.__v52RenderErrHook){G.__v52RenderErrHook=true;v.scene.renderError.addEventListener((scene,err)=>{lastErr=(err?.stack||err?.message||String(err)).split('\n').slice(0,4).join(' | ').slice(0,900);stamp('Cesium.scene.renderError');});}if(tries>240)clearInterval(t);},250);
})(window.NG14=window.NG14||{});