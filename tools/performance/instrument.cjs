/* Test-server-only instrumentation. No hooks or timers are shipped to the site. */
const bootstrap = `(() => {
  const p = window.__rulePerf = {metrics:{}, candidateDepth:0};
  p.count = (name, n=1) => { const m=p.metrics[name] ||= {count:0,ms:0}; m.count+=n; };
  p.measure = (name, fn) => { const start=performance.now();p.count(name);
    try {return fn();} finally {p.metrics[name].ms+=performance.now()-start;} };
  p.reset = () => {p.metrics={};};
})();`;

function instrument(file, text) {
  const replaceRequired=(marker,replacement)=>{
    if(!text.includes(marker))throw Error(`Performance marker missing in ${file}: ${marker}`);
    text=text.replace(marker,replacement);
  };
  const names = {
    'builder-view.js':['filterCandidates','renderBrowser'],
    'builder.js':['computeItemState','prepareUpgrade'],
    'builder-model.js':['equip','newErrors'],
    'rules-core.js':['validateArmy','buildNameIndex'],
    'battleforce-runtime.js':['resolve','compileRules','resolveInstances'],
  }[file] || [];
  for (const name of names) {
    const marker = `function ${name}(`;
    if (!text.includes(marker)) continue;
    let before='',after='';
    if (name==='filterCandidates') {
      before='p.count("candidateCount",currentCandidates.length);p.candidateDepth++;';
      after='p.candidateDepth--;';
    }
    if (name==='equip') before='if(!p.candidateDepth)p.count("officialEquip");';
    text=text.replace(marker, `function ${name}(...args) {const p=globalThis.__rulePerf;${before}
      try{return p.measure('${file}:${name}',()=>profile_${name}(...args));}finally{${after}}}
      function profile_${name}(`);
  }
  if(file==='battleforce-runtime.js') {
    // Covers both the 0.18.0 resolver and the split resolver. Fail visibly when
    // a measured marker changes, rather than reporting invented cache metrics.
    replaceRequired(
      'if (previous?.has(key)) return previous.get(key);',
      'if (previous?.has(key)) {globalThis.__rulePerf.count("dynamicHit");return previous.get(key);}globalThis.__rulePerf.count("dynamicMiss");');
    if(text.includes('compiledCache')) replaceRequired(
      'if (compiled) return compiled;',
      'if (compiled) {globalThis.__rulePerf.count("staticHit");return compiled;}globalThis.__rulePerf.count("staticMiss");');
    else replaceRequired('const scopes = [bf.v2.common,',
      'globalThis.__rulePerf.count("staticMiss");const scopes = [bf.v2.common,');
    replaceRequired('for (const [id, raw] of Object.entries(source.upgrades)) {',
      'globalThis.__rulePerf.count("upgradeCatalogBuild");globalThis.__rulePerf.count("upgradesVisited",Object.keys(source.upgrades).length);for (const [id, raw] of Object.entries(source.upgrades)) {');
    replaceRequired('for (const [id, raw] of Object.entries(source.units))',
      'globalThis.__rulePerf.count("unitCatalogBuild");globalThis.__rulePerf.count("unitsVisited",Object.keys(source.units).length);for (const [id, raw] of Object.entries(source.units))');
  }
  return text;
}
module.exports={bootstrap,instrument};
