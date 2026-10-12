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
    return errors;
  };

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
