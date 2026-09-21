(function(){
  const G=window.NG14,C=window.Cesium;
  if(!G||!C||G.__v52PerformanceR39)return;
  G.__v52PerformanceR39=true;

  const baseInit=G.initViewer;
  if(typeof baseInit==='function'){
    G.initViewer=async function(){
      const out=await baseInit.apply(this,arguments);
      const v=G.viewer;
      if(!v?.scene?.globe)return out;

      const scene=v.scene;
      const mobile=()=>window.matchMedia?.('(pointer: coarse)')?.matches||window.innerWidth<=900;
      const profile=()=>{
        const dpr=Math.max(1,Number(window.devicePixelRatio)||1);
        const m=!!mobile();
        return {
          mobile:m,
          staticScale:Math.min(dpr,m?1.35:1.60),
          movingScale:Math.min(dpr,m?1.00:1.22),
          staticSse:m?1.05:.95,
          movingSse:m?1.55:1.30
        };
      };

      let p=profile(),moving=false,restoreTimer=null;
      function applyStatic(){
        p=profile();
        v.resolutionScale=p.staticScale;
        scene.globe.maximumScreenSpaceError=p.staticSse;
        G.__v52PerfState={...(G.__v52PerfState||{}),moving:false,...p,currentScale:v.resolutionScale,currentSse:scene.globe.maximumScreenSpaceError};
      }
      function applyMoving(){
        p=profile();
        v.resolutionScale=p.movingScale;
        scene.globe.maximumScreenSpaceError=p.movingSse;
        G.__v52PerfState={...(G.__v52PerfState||{}),moving:true,...p,currentScale:v.resolutionScale,currentSse:scene.globe.maximumScreenSpaceError};
      }

      try{scene.msaaSamples=Math.min(2,scene.msaaSamples||2)}catch{}
      try{scene.globe.preloadSiblings=false}catch{}
      applyStatic();

      v.camera.moveStart.addEventListener(()=>{
        moving=true;
        if(restoreTimer){clearTimeout(restoreTimer);restoreTimer=null}
        applyMoving();
      });
      v.camera.moveEnd.addEventListener(()=>{
        moving=false;
        if(restoreTimer)clearTimeout(restoreTimer);
        restoreTimer=setTimeout(()=>{if(!moving)applyStatic()},120);
      });

      let resizeTimer=null;
      window.addEventListener('resize',()=>{
        if(resizeTimer)clearTimeout(resizeTimer);
        resizeTimer=setTimeout(()=>{if(moving)applyMoving();else applyStatic()},140);
      },{passive:true});

      return out;
    };
  }

  const baseOcclusion=G.updateOcclusion;
  if(typeof baseOcclusion==='function'){
    let last=0,lastKey='';
    G.updateOcclusion=function(){
      const now=performance.now();
      const key=String(G.current)+'|'+String(G.started)+'|'+String(G.overviewMode);
      const stateChanged=key!==lastKey;
      const moving=!!G.__v52PerfState?.moving;
      const minGap=moving?48:140;
      if(!stateChanged&&now-last<minGap){
        if(G.__v52PerfState)G.__v52PerfState.occlusionSkipped=(G.__v52PerfState.occlusionSkipped||0)+1;
        return;
      }
      last=now;lastKey=key;
      if(G.__v52PerfState)G.__v52PerfState.occlusionChecks=(G.__v52PerfState.occlusionChecks||0)+1;
      return baseOcclusion.apply(this,arguments);
    };
  }

  console.log('[V52 R39] adaptive render performance active');
})();