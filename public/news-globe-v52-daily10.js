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
  G.validate = function(p){
    if (!p || typeof p !== 'object' || Array.isArray(p)) return ['JSON根对象无效'];
    if (!Array.isArray(p.news)) return ['缺少 news 数组'];
    const errors = [];
    if (p.news.length !== COUNT) errors.push('DATA LOCK 必须正好10条，当前' + p.news.length + '条');
    const meta = p.meta || {};
    if (!validDay(String(meta.date || ''))) errors.push('meta.date 必须是有效的北京时间日期 YYYY-MM-DD');
    if (meta.edition && meta.edition !== 'daily-10') errors.push('meta.edition 必须为 daily-10');
    if (invalidLock(lockOf(p))) errors.push('必须提供真实的 meta.dataLock（当日统一 DATA LOCK 编号）');
    if (validDay(String(meta.date || ''))) {
      const win = windowFor(meta.date);
      if (meta.windowStart !== win.start || meta.windowEnd !== win.end) {
        errors.push('统计窗口必须是昨天北京时间13:00至当天北京时间13:00');
      }
    }
    p.news.forEach((n,i)=>{
      const at = 'Top' + (i + 1);
      if (!n || typeof n !== 'object') {errors.push(at + ' 无效');return;}
      if (Number(n.id) !== i + 1 || !Number.isInteger(Number(n.id))) {
        errors.push(at + ' id必须严格等于' + (i + 1));
      }
      if (!String(n.title || '').trim()) errors.push(at + ' 缺少标题');
      if (!String(n.location || '').trim()) errors.push(at + ' 缺少实际发生地');
      const lon = Number(n.lon),lat = Number(n.lat);
      if (n.lon == null || !Number.isFinite(lon) || lon < -180 || lon > 180) errors.push(at + ' 经度无效');
      if (n.lat == null || !Number.isFinite(lat) || lat < -90 || lat > 90) errors.push(at + ' 纬度无效');
    });
    // New canonical JSON augments the existing V52 data model; legacy ten-item
    // imports continue to work, but v1 imports undergo the full offline contract.
    if (meta.schemaVersion === 'news-data-lock/v1') {
      if (meta.timeZone !== 'Asia/Shanghai') errors.push('时区必须为 Asia/Shanghai');
      if (meta.edition !== 'daily-10') errors.push('统一格式必须是 daily-10');
      if (meta.newsCount != null && meta.newsCount !== COUNT) errors.push('newsCount 必须为10');
      if (meta.imagesPerNews != null && meta.imagesPerNews !== 3) errors.push('每条应有3张合格图片');
      const modes = new Set(['POINT','COUNTRY','ADMIN_REGION','REGION','DUAL_COUNTRY','DIPLOMACY_2','DIPLOMACY_MULTI','ORGANIZATION','ATTACK','POTENTIAL_ATTACK','MISSILE_ATTACK','DRONE_ATTACK','BORDER_CONFLICT']);
      const countryNames = {CHN:'中国', USA:'美国', RUS:'俄罗斯', PAN:'巴拿马', PSE:'巴勒斯坦'};
      const windows = validDay(String(meta.date || '')) ? windowFor(meta.date) : null;
      p.news.forEach((n,i)=>{
        const label = 'Top' + (i+1);
        if (!n || typeof n !== 'object') return;
        if (!String(n.summary||'').trim() || String(n.summary).trim().length < 12) errors.push(label+' 缺少事实摘要');
        else {
          const runs = String(n.title||'').match(/[\u3400-\u9fff]{2,}/g)||[];
          const consistent = runs.some(r=>Array.from({length:r.length-1},(_,j)=>r.slice(j,j+2)).some(token=>String(n.summary).includes(token)));
          if (!consistent) errors.push(label+' 标题与事实摘要缺少共同事件关键词');
        }
        if (!String(n.eventType||'').trim()) errors.push(label+' 缺少事件类型eventType');
        if (!String(n.focusLabel||'').trim() || !String(n.placeType||'').trim()) errors.push(label+' 缺少实际地点标签或地点类型');
        if (!/^[A-Z]{3}$/.test(String(n.countryIso3||''))) errors.push(label+' countryIso3无效');
        if (!modes.has(n.sceneMode) || n.scenePlan?.primaryIso3 !== n.countryIso3) errors.push(label+' V52 sceneMode/scenePlan不兼容');
        if (n.placeType === '城市' && n.focusLabel === countryNames[n.countryIso3]) errors.push(label+' 城市被错误标成国家');
        if (!Array.isArray(n.relatedCountryIso3s) || !n.relatedCountryIso3s.includes(n.countryIso3) || n.relatedCountryIso3s.some(x=>!/^[A-Z]{3}$/.test(x))) errors.push(label+' 涉事国家列表无效');
        if (!Array.isArray(n.sources) || !n.sources.length || n.sources.some(x=>!String(x?.name||'').trim())) errors.push(label+' 缺少新闻来源');
        if (!Array.isArray(n.articleUrls) || n.articleUrls.length > 3 || n.articleUrls.some(u=>{try{const x=new URL(u);return x.protocol!=='https:';}catch{return true;}})) errors.push(label+' articleUrls应为新闻报道HTTPS网址数组');
        else if (new Set(n.articleUrls).size!==n.articleUrls.length) errors.push(label+' 报道链接重复');
        const time=String(n.reportedAt||'');
        if (/^\d{4}-\d{2}-\d{2}$/.test(time)) {
          // The previous Beijing calendar day overlaps the 13:00-to-13:00
          // edition window. A date alone cannot establish whether it belongs.
          // Do not mislabel it as out-of-window or invent a 13:00 timestamp.
          if (windows && (time === windows.start.slice(0,10) || time === meta.date)) {
            // Date-only news can be previewed, but remains explicitly unverified.
            // Never infer or fabricate a publication time.
          } else {
            errors.push(label+' 报道日期不在本期涉及的两个自然日内');
          }
        } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?\+08:00$/.test(time)) {
          if (windows && (Date.parse(time)<Date.parse(windows.start) || Date.parse(time)>=Date.parse(windows.end))) errors.push(label+' 报道时间不在北京时间窗口内');
        } else errors.push(label+' 缺少合法reportedAt');
        if(n.publishedAt && n.publishedAt!==n.reportedAt) errors.push(label+' 报道时间字段不一致');
      });
    } else if (meta.schemaVersion) {
      errors.push('不支持的 schemaVersion：' + meta.schemaVersion);
    }
    return errors;
  };
  G.daily10Warnings = p => Array.isArray(p?.news) ? p.news.flatMap((n,i)=>{
    const w=[];
    if(Array.isArray(n.articleUrls) && n.articleUrls.length<3)w.push('Top'+(i+1)+' 新闻报道链接不足3条');
    if(/^\d{4}-\d{2}-\d{2}$/.test(String(n.reportedAt||'')))w.push('Top'+(i+1)+' 仅供预览：只有报道日期，13:00时窗尚未核实');
    return w;
  }) : [];

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
  if (stored && !G.validate(stored).length && stored.meta.date === editionDay()) {
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
  G.focus = function(index, ...rest){return baseFocus.call(this, normalized(index), ...rest);};
  G.navigate = function(target){
    if (!G.started) {G.focus(0, true); return;}
    const from = G.current, to = normalized(target);
    if (from !== to) G.showArc(from, to);
    G.focus(to, true);
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
    G.playTimer = setTimeout(()=>{
      if (!G.playing) return;
      if (G.current >= G.news.length - 1) {G.overview(); return;}
      G.focus(G.current + 1, true);
      G.schedule();
    }, duration);
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
          const errors=G.validate(payload);
          if(errors.length){
            G.$('msg').textContent='已载入所选文件，但尚未应用：'+errors.join('；');
            return;
          }
          G.$('msg').textContent='JSON已读取，请点击保存并应用。'+G.daily10Warnings(payload).join('；');
        }catch(e){G.$('msg').textContent='无法读取JSON：'+e.message;}
      };
      label.appendChild(input);parent.appendChild(label);
    }
    // Keep provisional status visible after Save & Apply; never present
    // date-only news as fully verified.
    const apply=G.$('applyBtn');
    if(apply && !apply.__daily10WarningBound){
      apply.__daily10WarningBound=true;
      const original=apply.onclick;
      apply.onclick=function(...args){
        const result=original?.apply(this,args);
        try{
          const p=JSON.parse(area.value),warnings=G.daily10Warnings(p);
          if(!G.validate(p).length && warnings.length){
            G.$('msg').textContent='已保存并应用（待核验预览，非全部通过）：'+warnings.join('；');
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
