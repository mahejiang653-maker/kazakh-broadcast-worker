(function (G) {
  'use strict';
  if (!G || G.v52StoryBorders) return;
  const VERSION = '20261011-r6-story-borders-r10';
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
    const add = value => {
      const iso = String(value?.countryIso3 || value?.iso3 || value || '').trim().toUpperCase();
      if (/^[A-Z]{3}$/.test(iso) && G.countries?.has(iso)) result.add(iso);
    };
    if (!n) return result;
    add(n.countryIso3 || G.resolveIso?.(n));
    add(p.primaryIso3);
    // A POINT story describes one actual location. Countries mentioned in the
    // headline, summary, or metadata remain context, not extra white borders.
    // Explicit multi-country scene modes continue through the existing logic.
    if (String(n.sceneMode || '').toUpperCase() === 'POINT') return result;
    for (const value of p.participants || []) add(value);
    if (!p.registryOnly) {
      add(n.secondaryCountryIso3);
      if (!p.sourceUnconfirmed && !p.nonStateActor) {
        for (const value of [p.attackerIso3,p.victimIso3,n.sourceCountryIso3,n.targetCountryIso3]) add(value);
      }
    }
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
  G.selectStoryBorders = function (n) {
    selected = countriesForStory(n);
    collectSelected();
    G.applyStoryBorders();
  };
  const loadBorders = G.loadBorders;
  G.loadBorders = async function (...args) {
    const result = await loadBorders.apply(this,args);
    for (const e of G.borderEntities || []) e.show = false;
    visible.clear();
    selected = G.started ? countriesForStory(G.news?.[G.current]) : new Set();
    collectSelected();
    G.applyStoryBorders();
    return result;
  };
  G.v52StoryBorders = {version:VERSION,countriesForStory,
    getDiagnostics:() => ({version:VERSION,enabled,countries:[...selected].sort(),
      visibleBorders:[...visible].filter(e => e.show).length,totalBorders:G.borderEntities?.length || 0})};
})(window.NG14);
