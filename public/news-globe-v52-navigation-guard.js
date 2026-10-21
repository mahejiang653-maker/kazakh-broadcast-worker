(function attach(){
  const G=window.NG14=window.NG14||{};
  if(G.__v52NavigationGuard)return;
  if(typeof G.showArc!=='function')return setTimeout(attach,50);
  G.__v52NavigationGuard=true;
  const baseShowArc=G.showArc;
  G.showArc=function(a,b){
    const A=G.news?.[a],B=G.news?.[b];
    const finite=n=>!!n && n.noPoint!==true && !['COUNTRY','ADMIN_REGION'].includes(String(n.sceneMode||'').toUpperCase()) &&
      n.lon!=null && n.lat!=null && n.lon!=='' && n.lat!=='' && Number.isFinite(Number(n.lon)) && Number.isFinite(Number(n.lat));
    if(!finite(A)||!finite(B)){
      try{G.clearArc?.()}catch{}
      return;
    }
    return baseShowArc(a,b);
  };
})();
