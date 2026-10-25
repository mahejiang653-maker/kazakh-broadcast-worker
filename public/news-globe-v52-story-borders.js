(function (G) {
  'use strict';
  if (!G || G.v52StoryBorders) return;
  const VERSION = '20261025-r6-gaza-two-territories-r1';
  const shortNames = {中:'CHN',美:'USA',俄:'RUS',乌:'UKR',英:'GBR',法:'FRA',德:'DEU',日:'JPN',
    印:'IND',韩:'KOR',朝:'PRK',伊:'IRN',以:'ISR',沙:'SAU'};
  const aliases = {CHN:['中华人民共和国','中国'],USA:['美国'],RUS:['俄罗斯'],UKR:['乌克兰'],
    GBR:['英国'],FRA:['法国'],DEU:['德国'],JPN:['日本'],IRN:['伊朗'],SAU:['沙特阿拉伯','沙特']};
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  let enabled = false, selected = new Set(), selectedEntities = new Set(), visible = new Set();

  // The legacy country-chip helper infers neighbors from place names and writes
  // them into the news object. Preserve its returned display info, but keep those
  // guesses out of the story: otherwise a second visit to Gulf of Mexico adds MEX.
  const dualInfo = G.dualInfo;
  if (typeof dualInfo === 'function') G.dualInfo = function (n,...args) {
    return dualInfo.call(this,n ? {...n} : n,...args);
  };

  function countriesForStory(n) {
    const result = new Set(), p = n?.scenePlan || {};
    const place=[n?.title,n?.location,n?.focusLabel,n?.region].filter(Boolean).join(' ');
    const newMexicoUS=/新墨西哥(?:州)?|New\\s+Mexico(?:\\s+State)?/i.test(place)
      && (String(n?.countryIso3||p.primaryIso3||'').toUpperCase()==='USA'||/美国|\\bUSA\\b|United States/i.test(place))
      && !p.allowContextCountryBorders;
    const add = value => {
      const iso = String(value?.countryIso3 || value?.iso3 || value || '').trim().toUpperCase();
      if (newMexicoUS && iso==='MEX') return;
      if (/^[A-Z]{3}$/.test(iso) && G.countries?.has(iso)) result.add(iso);
    };
    if (!n) return result;
    add(n.countryIso3 || G.resolveIso?.(n));
    add(p.primaryIso3);
    const attack=G.v52AttackModel?.resolve(n);
    if(attack){add(attack.att);add(attack.vic);return result;}
    // A POINT story describes one actual location. Countries mentioned in the
    // headline, summary, or metadata remain context, not extra white borders.
    // Explicit multi-country scene modes continue through the existing logic.
    if (String(n.sceneMode || '').toUpperCase() === 'POINT') return result;
    for (const value of p.participants || []) add(value);
    const singleLocation = ['CITY','REGION','LOCATION_FOCUS','POINT'].includes(String(n.sceneMode || '').toUpperCase())
      || ['city','region'].includes(String(n.placeType || '').toLowerCase());
    if (!p.registryOnly) {
      // Secondary country metadata on a locality is not proof of a second
      // sovereign border; explicit participants remain authoritative above.
      if (!singleLocation || p.allowContextCountryBorders) add(n.secondaryCountryIso3);
      if (!p.sourceUnconfirmed && !p.nonStateActor) {
        for (const value of [p.attackerIso3,p.victimIso3,n.sourceCountryIso3,n.targetCountryIso3]) add(value);
      }
    }
    // Imported daily-10 single-location stories may mention foreign partners or
    // contain geographic names such as "New Mexico". Do not turn that context
    // into an additional country-wide border. Explicit participants above still win.
    if (singleLocation && !p.allowContextCountryBorders) return result;
    // Country chips and contextCountries can include geographic neighbors or a
    // ship's registry. Read the actual story, never a place label such as Gulf of Mexico.
    const text = [n.title,n.summary].filter(Boolean).join(' ');
    const namesToMatch = [];
    for (const [iso,country] of G.countries || []) {
      const names = new Set([...(aliases[iso] || []),G.countryNameZh?.(iso),country.name]);
      for (const name of names) {
        if (!name || name === iso || name === '未知国家' || name.length < 2) continue;
        const chinese = /[\u3400-\u9fff]/.test(name);
        const pattern = chinese ? escape(name) + '(?!湾|海峡|海|洋|山脉|公路|运河)' :
          '\\b' + escape(name) + '\\b(?!\\s+(?:Gulf|Bay|Sea|Ocean|Strait|Road|Canal)\\b)';
        namesToMatch.push({iso,name,pattern});
      }
    }
    // Match long names first: 印度尼西亚 must not also select 印度.
    let remaining = text;
    for (const {iso,pattern} of namesToMatch.sort((a,b) => b.name.length - a.name.length)) {
      const matcher = new RegExp(pattern,'gi');
      if (matcher.test(remaining)) { add(iso); remaining = remaining.replace(matcher,' '); }
    }
    // Common headline abbreviations, e.g. 中法战略对话、俄炼油厂、美军.
    for (const match of text.matchAll(/([中美俄乌英法德日印韩朝伊以沙])([中美俄乌英法德日印韩朝伊以沙])(?=双方|两国|关系|举行|战略|对话|会晤|峰会|会谈|谈判|冲突|战争|签署|合作)/g)) {
      if (match[1] !== match[2]) { add(shortNames[match[1]]); add(shortNames[match[2]]); }
    }
    for (const match of text.matchAll(/([中美俄乌英法德日印韩朝伊以沙])(?=军|方|政府|总统|总理|外长|能源设施|炼油厂|停止|同意|宣布|封锁)/g)) add(shortNames[match[1]]);
    for (const match of text.matchAll(/(?:对|赴|访)([美俄乌英法德日印韩朝伊以沙])(?=封锁|访问|制裁|施压|援助)/g)) add(shortNames[match[1]]);
    return result;
  }
  function collectSelected() {
    selectedEntities = new Set();
    for (const iso of selected) for (const e of G.countries?.get(iso)?.entities || []) selectedEntities.add(e);
  }
  G.isStoryBorder = e => enabled && !G.overviewMode && selectedEntities.has(e);
  G.applyStoryBorders = function (show = enabled) {
    enabled = !!show;
    const next = enabled && !G.overviewMode ? selectedEntities : new Set();
    const entities = G.viewer?.entities;
    entities?.suspendEvents?.();
    try {
      for (const e of visible) if (!next.has(e)) e.show = false;
      for (const e of next) if (e.show !== true) e.show = true;
      visible = new Set(next);
    } finally { entities?.resumeEvents?.(); }
    G.viewer?.scene?.requestRender?.();
  };
  // The diplomatic sequence needs one country's full outline at a time.
  // Never derive this selection from the original story's locality metadata.
  G.selectCountryOverviewBorders = function (iso) {
    const code = String(iso || '').trim().toUpperCase();
    if (!G.countries?.has(code)) return false;
    selected = new Set([code]);
    collectSelected();
    G.applyStoryBorders(true);
    return [...selectedEntities].some(e => e.show === true);
  };
  G.selectStoryBorders = function (n) {
    selected = countriesForStory(n);
    collectSelected();
    G.applyStoryBorders();
  };
  // Natural Earth 110m PSE geometry in this app has only the West Bank;
  // add the Gaza Strip from an independently sourced real polygon rather
  // than drawing a guessed rectangle or treating Gaza as an event dot.
  // This line represents a geographic outline, not a changing front line.
  let gazaBorder=null,gazaStatus='not-loaded',gazaVertices=0;
  async function ensureGazaBoundary() {
    const C=window.Cesium,viewer=G.viewer,ps=G.countries?.get('PSE');
    if(!C||!viewer?.entities||!ps){gazaStatus='country-unavailable';return;}
    if(gazaBorder && (viewer.entities.contains?.(gazaBorder)||viewer.entities.values?.includes(gazaBorder))){
      if(!ps.entities.includes(gazaBorder))ps.entities.push(gazaBorder);
      if(!G.borderEntities.includes(gazaBorder))G.borderEntities.push(gazaBorder);
      return;
    }
    if(typeof fetch!=='function'){gazaStatus='fetch-unavailable';return;}
    try {
      const response=await fetch('/news-globe-gaza-strip-outline-v1.geojson?v=20261025-r1',{cache:'force-cache'});
      if(!response.ok)throw Error('HTTP '+response.status);
      const f=await response.json(),rings=f?.geometry?.type==='Polygon'?f.geometry.coordinates:[];
      const ring=rings[0];
      const valid=Array.isArray(ring)&&ring.length>=12&&ring.every(p=>
        Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1])&&
        +p[0]>=34.1&&+p[0]<=34.8&&+p[1]>=31.1&&+p[1]<=31.8);
      if(!valid)throw Error('Invalid Gaza GeoJSON ring');
      const positions=G.positions?.(ring,24000)||[];
      if(positions.length<12)throw Error('Gaza boundary coordinates failed');
      gazaBorder=viewer.entities.add({show:false,
        polyline:{positions,width:1.65,arcType:C.ArcType.GEODESIC,
          material:C.Color.fromCssColorString('#e5f6ff').withAlpha(.9)}});
      gazaBorder.__v52GazaOutline=true;
      gazaBorder._countryIsos=new Set(['PSE']);
      ps.entities.push(gazaBorder);G.borderEntities.push(gazaBorder);
      // The country camera and red polygon fill must also know that PSE
      // has two geographically separate areas. The low-resolution world
      // source only supplies the West Bank, so extend the country geometry
      // using the same vetted Gaza ring (without inventing a rectangle).
      const base=ps.feature?.geometry,polys=base?.type==='Polygon'?[base.coordinates]:
        base?.type==='MultiPolygon'?base.coordinates:[];
      if(polys.length && !polys.some(p=>p?.[0]?.some(q=>+q[0]<34.65&&+q[0]>34.1&&+q[1]<31.8&&+q[1]>31.1))){
        const feature={...ps.feature,geometry:{type:'MultiPolygon',coordinates:[...polys,[ring]]}};
        ps.feature=feature;
        const all=G.collect?.(feature.geometry)||[];
        if(all.length>3){
          ps.sphere=C.BoundingSphere.fromPoints(all.map(q=>C.Cartesian3.fromDegrees(+q[0],+q[1],0)));
          const xs=all.map(q=>+q[0]),ys=all.map(q=>+q[1]);
          ps.bbox=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
        }
        if(Array.isArray(G.worldGeo?.features))G.worldGeo.features=G.worldGeo.features.map(x=>
          G.featureIso?.(x)==='PSE'?feature:x);
      }
      gazaVertices=ring.length;gazaStatus='ready';
    }catch(error){gazaStatus='unavailable:'+String(error?.message||error);console.warn('[V52 Gaza boundary]',error);}
  }
  const loadBorders = G.loadBorders;
  G.loadBorders = async function (...args) {
    const result = await loadBorders.apply(this,args);
    await ensureGazaBoundary();
    for (const e of G.borderEntities || []) e.show = false;
    visible.clear();
    selected = G.started ? countriesForStory(G.news?.[G.current]) : new Set();
    collectSelected();
    G.applyStoryBorders();
    return result;
  };
  G.v52StoryBorders = {version:VERSION,countriesForStory,
    getDiagnostics:() => ({version:VERSION,enabled,countries:[...selected].sort(),
      visibleBorders:[...visible].filter(e => e.show).length,totalBorders:G.borderEntities?.length || 0,gazaStatus,gazaVertices,gazaVisible:!!gazaBorder?.show})};
})(window.NG14);
