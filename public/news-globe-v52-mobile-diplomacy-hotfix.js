(function attach(){
  const G=window.NG14=window.NG14||{};
  if(G.__v52MobileDiplomacyHotfix)return;
  const baseRun=G.runSequence;
  if(typeof baseRun!=='function')return setTimeout(attach,50);
  G.__v52MobileDiplomacyHotfix=true;

  function ensureOverlay(){
    let el=document.getElementById('v52DiplomacyOverlay');
    if(el)return el;
    const frame=document.querySelector('.map-frame');
    if(!frame)return null;
    el=document.createElement('div');
    el.id='v52DiplomacyOverlay';
    el.style.cssText='position:absolute;inset:0;z-index:9;display:none;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 48%,rgba(14,43,67,.90),rgba(2,7,17,.97));pointer-events:none;padding:24px;text-align:center;color:#eef7ff;font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif';
    el.innerHTML='<div style="width:min(560px,92%);border:1px solid rgba(97,220,255,.28);background:rgba(5,15,28,.82);border-radius:20px;padding:24px 18px;box-shadow:0 18px 70px rgba(0,0,0,.45)"><div style="font-size:12px;letter-spacing:.16em;color:#61dcff;margin-bottom:18px">跨国远程外交 · 无单一事件地点</div><div style="display:flex;align-items:center;justify-content:center;gap:15px;flex-wrap:wrap;font-weight:800;font-size:clamp(22px,6vw,34px)"><span style="color:#ff6b75">美国</span><span style="color:#9edcff;font-size:.8em">↔</span><span style="color:#5dbbff">俄罗斯</span></div><div style="margin-top:16px;font-size:15px;color:#d7e8f4">特朗普与普京远程通话</div><div style="margin-top:7px;font-size:12px;color:#8ea7bb">此新闻没有真实的单一地理落点，因此不制造虚假红点或海上位置。</div></div>';
    frame.appendChild(el);
    return el;
  }
  function hideOverlay(){const el=document.getElementById('v52DiplomacyOverlay');if(el)el.style.display='none';}
  function showOverlay(){const el=ensureOverlay();if(el)el.style.display='flex';}

  G.runSequence=async function(n,iso,s){
    const mode=String(n?.sceneMode||'').toUpperCase();
    const p=n?.scenePlan||{};
    const participants=Array.isArray(p.participants)?p.participants.map(x=>String(x).toUpperCase()):[];
    const isRemoteDiplomacy=mode==='DIPLOMACY_2' && p.finalLocation===false && participants.length>=2;

    if(isRemoteDiplomacy){
      // Absolute isolation: do not touch Cesium entities, primitives, labels, polygons,
      // camera or render loop at all. This preserves the last known-good Cesium state
      // and prevents Android WebGL/Cesium collection corruption from propagating to
      // stories 9-13. The visual for this no-location story is pure DOM.
      showOverlay();
      return;
    }

    hideOverlay();
    return baseRun(n,iso,s);
  };
})();