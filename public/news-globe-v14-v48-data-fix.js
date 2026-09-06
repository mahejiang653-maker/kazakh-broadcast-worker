(function(G){
if(!G||!Array.isArray(G.news))return;
for(const n of G.news){
  if(Number(n.id)===7||String(n.sceneMode||'').toUpperCase()==='ORGANIZATION'&&String(n.alliance||n.scenePlan?.organization||'').toUpperCase()==='OPEC+'){
    n.sceneMode='ORGANIZATION';
    n.scenePlan={...(n.scenePlan||{}),organization:'OPEC+',finalLocationRelevant:false};
    n.countryIso3='';
    n.country='OPEC+';
    n.location='OPEC+';
    n.region='OPEC+成员国';
    n.lon=0;
    n.lat=0;
    n.focusLabel='OPEC+';
    delete n.secondaryCountryIso3;
    delete n.secondaryCountry;
    delete n.secondaryLon;
    delete n.secondaryLat;
    n.displayCountriesLabel='OPEC+';
  }
}
if(G.payload&&Array.isArray(G.payload.news))G.payload.news=G.news;
})(window.NG14);
