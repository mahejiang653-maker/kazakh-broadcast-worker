(function attach(){
  const G=window.NG14=window.NG14||{};
  if(G.__v52NavigationGuard)return;
  if(typeof G.showArc!=='function')return setTimeout(attach,50);
  G.__v52NavigationGuard=true;
  const baseShowArc=G.showArc;
  G.showArc=function(a,b){
    const A=G.news?.[a],B=G.news?.[b];
    const finite=n=>Number.isFinite(+n?.lon)&&Number.isFinite(+n?.lat);
    if(!finite(A)||!finite(B)){
      try{G.clearArc?.()}catch{}
      return;
    }
    return baseShowArc(a,b);
  };
})();
