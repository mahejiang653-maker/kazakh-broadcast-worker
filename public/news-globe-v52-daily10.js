/*
 * V52·A1 R6 daily-10 adapter.
 * Only the current V52 daily entry loads this file. The V14 engine, old editions,
 * and immutable Y1 release are deliberately left unchanged.
 */
(function(G){
  'use strict';
  if (!G || G.__v52Daily10) return;
  G.__v52Daily10 = true;
  const COUNT = 10;
  const oldNews = Array.isArray(G.demo) ? G.demo : [];
  if (oldNews.length !== COUNT && oldNews.length !== 13) {
    throw new Error('V52 DAILY LOCK must contain exactly ten stories (or a read-only legacy thirteen-story edition)');
  }

  // The edition changes at 13:00 Beijing time, not at UTC/local midnight.
  const editionDay = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const validDay = day => /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    !Number.isNaN(Date.parse(day + 'T00:00:00Z')) &&
    new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day;
  function windowFor(day){
    const prev = new Date(Date.parse(day + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
    return {start: prev + 'T13:00:00+08:00', end: day + 'T13:00:00+08:00'};
  }
  const lockOf = p => String(p?.meta?.dataLock || p?.dataLock || '').trim();
  const invalidLock = lock => !lock || /^REPLACE_|^请填写|LOCK13/i.test(lock);

  // Only a complete, ordered DATA LOCK may be imported/published as daily-10.
  // Import is a display operation, not an editorial fact-check.
  // Reject only JSON that cannot safely drive the 10-item globe.
  G.validate = function(p){
    if(!p || typeof p!=='object' || Array.isArray(p))return ['JSON根对象无效'];
    if(!Array.isArray(p.news) || p.news.length!==COUNT)return ['news必须正好包含10条新闻'];
    const errors=[];
    p.news.forEach((n,i)=>{
      if(!n || typeof n!=='object'){errors.push('Top'+(i+1)+' 不是有效对象');return;}
      if(!String(n.title||'').trim())errors.push('Top'+(i+1)+' 缺少标题');
      if(!String(n.location||n.focusLabel||'').trim())errors.push('Top'+(i+1)+' 缺少定位名称');
      // Explicit regional/no-precision stories may omit coordinates. Never infer
      // that null means zero or silently turn an arbitrary camera anchor into an impact.
      const scope=String(n.geoScope||n.scenePlan?.geoScope||'').toUpperCase();
      const regional=scope==='REGIONAL'||scope==='NO_EXACT_COORDINATE';
      const hasLon=n.lon!==null&&n.lon!==undefined&&n.lon!=='';
      const hasLat=n.lat!==null&&n.lat!==undefined&&n.lat!=='';
      const lon=Number(n.lon),lat=Number(n.lat);
      if(!regional||hasLon||hasLat){
        if(!hasLon||!Number.isFinite(lon)||lon < -180||lon > 180)errors.push('Top'+(i+1)+' 经度无效');
        if(!hasLat||!Number.isFinite(lat)||lat < -90||lat > 90)errors.push('Top'+(i+1)+' 纬度无效');
      }
      if(regional&&!String(n.scenePlan?.primaryIso3||n.countryIso3||'').trim())errors.push('Top'+(i+1)+' 区域事件缺少国家ISO3');
    });
    return errors;
  };
  // A control-area polygon is evidence, not a location guess. Only accept
  // explicit dated, attributed GeoJSON; direction labels alone never invent
  // occupied territory. No geometry means country overview only.
  const validRing = ring => Array.isArray(ring)&&ring.length>=4&&ring.length<=10000&&
    ring.every(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&
      Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90);
  const validShape = shape => {
    if(!shape||!['Polygon','MultiPolygon'].includes(shape.type))return false;
    const polygons=shape.type==='Polygon'?[shape.coordinates]:shape.coordinates;
    return Array.isArray(polygons)&&polygons.length>0&&polygons.length<=100&&
      polygons.every(poly=>Array.isArray(poly)&&poly.length>0&&poly.length<=50&&poly.every(validRing));
  };
  const areaOf = n => n?.scenePlan?.area || n?.area;
  const baseValidate = G.validate;
  G.validate = function(payload){
    const errors=baseValidate(payload);
    (payload?.news||[]).forEach((n,i)=>{
      const area=areaOf(n);if(!area)return;
      const type=String(area.type||'').toUpperCase();
      if(!['GEOGRAPHIC_REGION','CONFLICT_CONTROL'].includes(type))errors.push('Top'+(i+1)+' 区域类型无效');
      if(!validShape(area.geometry))errors.push('Top'+(i+1)+' 区域GeoJSON无效');
      if(type==='CONFLICT_CONTROL'&&(!String(area.sourceUrl||'').startsWith('https://')||
        !/^\d{4}-\d{2}-\d{2}$/.test(String(area.asOf||''))||
        !String(area.controlledBy||'').trim()))errors.push('Top'+(i+1)+' 冲突控制区缺少来源、日期或控制方');
    });
    return errors;
  };
  let areaEntities=[];
  const clearArea=()=>{const viewer=G.viewer;if(viewer?.entities)for(const e of areaEntities)viewer.entities.remove(e);areaEntities=[];};
  function drawArea(n,serial){
    const area=areaOf(n),viewer=G.viewer,C=window.Cesium;
    if(!area||!viewer||!C||!validShape(area.geometry)||serial!==G.navSerial)return;
    const polygons=area.geometry.type==='Polygon'?[area.geometry.coordinates]:area.geometry.coordinates;
    const conflict=String(area.type).toUpperCase()==='CONFLICT_CONTROL';
    const fill=C.Color.fromCssColorString(conflict?'#ed5353':'#43bce4').withAlpha(conflict?.32:.22);
    const outline=C.Color.fromCssColorString(conflict?'#ff9b9b':'#a8e7ff');
    const pts=[];
    for(const poly of polygons){
      const outer=poly[0].map(p=>C.Cartesian3.fromDegrees(p[0],p[1],0));
      const holes=poly.slice(1).map(ring=>new C.PolygonHierarchy(ring.map(p=>C.Cartesian3.fromDegrees(p[0],p[1],0))));
      areaEntities.push(viewer.entities.add({polygon:{hierarchy:new C.PolygonHierarchy(outer,holes),
        material:fill,height:0,outline:false}}));
      for(const ring of poly){
        const positions=ring.map(p=>C.Cartesian3.fromDegrees(p[0],p[1],2500));
        areaEntities.push(viewer.entities.add({polyline:{positions,width:2,material:outline}}));
      }
      pts.push(...outer);
    }
    if(pts.length&&serial===G.navSerial){
      const sphere=C.BoundingSphere.fromPoints(pts);
      viewer.camera.flyToBoundingSphere(sphere,{duration:1.1,offset:new C.HeadingPitchRange(0,-Math.PI/2,
        Math.max(350000,sphere.radius*2.8))});
    }
  }
  G.v52AreaScenes={clear:clearArea,validate:validShape,getDiagnostics:()=>({entities:areaEntities.length})};
  window.addEventListener?.('pagehide',clearArea);
  G.daily10Warnings = () => [];

  const legacy = oldNews.length === 13;
  if (legacy) {
    // Preserve all 13 source records as an archive. The daily-10 UI presents a
    // clearly marked historical Top1–Top10 preview, NEVER a fabricated new lock.
    G.legacyArchive = {meta: {...(G.meta || {})}, news: oldNews.slice(), dataLock: G.DAILY_LOCK};
    G.demo = oldNews.slice(0, COUNT);
    G.meta = {...(G.meta || {}), edition: 'legacy-13-preview', historical: true};
  } else {
    if (!validDay(String(G.meta?.date || '')) || invalidLock(String(G.DAILY_LOCK || ''))) {
      throw new Error('V52 daily-10 edition must declare a date and real G.DAILY_LOCK');
    }
    const win = windowFor(G.meta.date);
    G.meta = {...G.meta, edition: 'daily-10', dataLock: G.DAILY_LOCK,
      windowStart: win.start, windowEnd: win.end, historical: false};
  }

  // Never use a legacy 13-item localStorage payload for the new daily flow.
  G.DATA_KEY = 'news-globe-v52-daily10-current';
  const stored = G.loadStored?.();
  if (stored && !G.validate(stored).length) {
    G.payload = stored;
    G.news = stored.news;
    G.meta = stored.meta;
  } else {
    G.payload = {meta: G.meta, news: G.demo};
    G.news = G.demo;
  }

  G.DAILY_COUNT = COUNT;
  G.daily10Window = windowFor;
  G.daily10EditionDay = editionDay;
  G.getLegacyArchive = () => G.legacyArchive || null;

  // The legacy UI internally uses %13. Always supply a safe ten-item index.
  const normalized = value => {
    const n = Number(value);
    const i = Number.isFinite(n) ? Math.trunc(n) : 0;
    return ((i % COUNT) + COUNT) % COUNT;
  };
  const baseFocus = G.focus;
  G.focus = function(index, ...rest){
    // Clear immediately, not only after an asynchronous camera transition.
    G.v52AreaScenes?.clear();
    return baseFocus.call(this, normalized(index), ...rest);
  };
  G.navigate = function(target){
    if (!G.started) {G.focus(0, true); return;}
    const from = G.current, to = normalized(target);
    // A navigation arc is NOT an attack trajectory. For threat stories it
    // misleadingly suggests the previous story's location launched an attack.
    const next = G.news?.[to];
    const threat = /^(threat|warning|threatened_attack)$/i.test(String(next?.eventType || ''));
    // Region/control-area stories are not point-to-point movements.
    const regional=/^(REGIONAL|NO_EXACT_COORDINATE)$/i.test(String(next?.geoScope||next?.scenePlan?.geoScope||''));
    if (from !== to && !threat && !regional) G.showArc(from, to);
    else if (threat || regional) G.clearArc?.();
    G.focus(to, true);
  };
  // Threat announcements are NOT confirmed strikes. Force a point-only scene,
  // regardless of legacy title heuristics or attack-related imported fields.
  const baseRunSequence = G.runSequence;
  G.runSequence = function(story, iso, serial){
    clearArea();
    const threat = /^(threat|warning|threatened_attack)$/i.test(String(story?.eventType || ''));
    const scope=String(story?.geoScope||story?.scenePlan?.geoScope||'').toUpperCase();
    if(scope==='REGIONAL'||scope==='NO_EXACT_COORDINATE'){
      // Existing COUNTRY renderer is safe for unknown precise positions: it
      // frames the confirmed country, without drawing a fabricated impact dot.
      // Keep the full regional description in the story text, not a fake point.
      G.clearArc?.();
      G.clearInteractionEffects?.();
      G.clearSecondaryCountry?.();
      const primary=String(story?.scenePlan?.primaryIso3||story?.countryIso3||iso||'').toUpperCase();
      const safe={...story,sceneMode:'COUNTRY',lon:null,lat:null,
        attackType:'',sourceLon:null,sourceLat:null,attackerIso3:'',
        secondaryCountryIso3:'',attackEffect:null,
        scenePlan:{...(story.scenePlan||{}),primaryIso3:primary,
          finalLocation:false,transitionArc:false,attackEffect:null,
          sourcePrecision:'unknown',hierarchyPresented:false}};
      const result=baseRunSequence.call(this,safe,primary,serial);
      return Promise.resolve(result).then(ok=>{if(serial===G.navSerial)drawArea(story,serial);return ok;});
    }
    if (!threat) return baseRunSequence.call(this, story, iso, serial);
    G.clearArc?.();
    G.clearInteractionEffects?.();
    G.clearSecondaryCountry?.();
    const safe = {...story, sceneMode:'POINT', attackType:'', potentialStrike:false,
      sourceLon:null, sourceLat:null, sourceCountryIso3:'', attackerIso3:'',
      secondaryCountryIso3:'', attackEffect:null,
      scenePlan:{...(story.scenePlan||{}), attackerIso3:'', sourceUnconfirmed:true,
        sourcePrecision:'unknown', attackEffect:null, transitionArc:false}};
    return baseRunSequence.call(this, safe, iso, serial);
  };
  const baseStoryUI = G.storyUI;
  G.storyUI = function(story, iso){
    const result = baseStoryUI.call(this, story, iso);
    const total = G.news.length, shown = G.started && !G.overviewMode;
    const history = G.meta?.historical ? ' · 历史预览' : '';
    G.$('eyebrow').textContent = (shown ? 'TOP ' + (G.current + 1) : 'READY') + ' / ' + total + history;
    G.$('count').textContent = (shown ? G.current + 1 : 0) + ' / ' + total;
    return result;
  };
  G.schedule = function(){
    if (!G.playing) return;
    const duration = G.storyDuration(G.news[G.current]);
    const advance=()=>{
      if (!G.playing) return;
      const attack=G.v52Attack?.getDiagnostics();
      if(attack&&attack.serial===G.navSerial&&attack.playbackReady===false){G.playTimer=setTimeout(advance,500);return;}
      if (G.current >= G.news.length - 1) {G.overview(); return;}
      G.focus(G.current + 1, true);
      G.schedule();
    };
    G.playTimer=setTimeout(advance,duration);
  };
  const baseBind = G.bind;
  G.bind = function(...args){
    const result = baseBind.apply(this, args);
    // Import the SAME JSON file used by the news report and image website.
    // The existing Apply button performs the final validation and save.
    const area=G.$('jsonInput'),parent=area?.parentElement;
    if(parent && !document.getElementById('dailyLockFile')){
      const label=document.createElement('label');
      label.textContent='导入统一10条 DATA LOCK JSON：';
      label.style.display='block';
      const input=document.createElement('input');
      input.type='file';input.id='dailyLockFile';input.accept='.json,application/json';
      // Android file pickers may not emit change when the same filename is
      // selected twice. Reset before opening so every selection is processed.
      input.addEventListener('click',()=>{input.value='';});
      input.onchange=async()=>{
        try{
          const file=input.files?.[0];if(!file)return;
          G.$('msg').textContent='正在读取：'+file.name;
          const contents=await file.text();
          const payload=JSON.parse(contents);
          // Always show the selected file in the editor, even when it fails
          // validation. Otherwise the old legacy preview remains visible and
          // users cannot tell which payload was actually checked.
          area.value=JSON.stringify(payload,null,2);
          // Selecting a valid file immediately imports it; no extra save step.
          G.applySettings();
        }catch(e){G.$('msg').textContent='无法读取JSON：'+e.message;}
      };
      label.id='daily10FileImport';label.appendChild(input);const buttons=parent.querySelector('.drawer-buttons');if(buttons)parent.insertBefore(label,buttons);else parent.appendChild(label);
    }
    const apply=G.$('applyBtn');
    if(apply && !apply.__daily10DirectImportBound){
      apply.__daily10DirectImportBound=true;
      const original=apply.onclick;
      apply.onclick=function(...args){
        const result=original?.apply(this,args);
        try{
          const p=JSON.parse(area.value);
          if(!G.validate(p).length){
            document.getElementById('daily10VerificationBanner')?.remove();
            G.$('msg').textContent='已直接导入10条新闻。';
            G.closeSettings?.();
          }
        }catch(_){}
        return result;
      };
    }
    G.$('sampleBtn').onclick = ()=>{
      const day = editionDay(),win = windowFor(day);
      G.$('jsonInput').value = JSON.stringify({
        meta:{date:day, edition:'daily-10',
          dataLock:'REPLACE_WITH_DAILY_LOCK',
          windowStart:win.start,windowEnd:win.end},
        news:G.demo.map((n,i)=>({...n,id:i+1}))
      },null,2);
      G.$('msg').textContent = '请替换为当天真实的10条 DATA LOCK 新闻及编号后再保存。';
    };
    return result;
  };
})(window.NG14);
