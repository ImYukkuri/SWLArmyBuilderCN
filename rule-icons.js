/* Inline rule symbols use the MIT-licensed Legion font and local SVG symbols. */
window.RuleIcons = (() => {
  const ACTION_LABEL = {action:'行动','double-action':'双行动','free-action':'免费行动','free-exhaust':'免费行动：横置'};
  const CATALOG = Object.fromEntries([
    ['ranks', [[1,'rank-commander'],[6,'rank-operative'],[2,'rank-corps'],[3,'rank-special-forces','rank-special'],[4,'rank-support'],[5,'rank-heavy','heavy'],[7,'rank-flier']]],
    ['factions', [[1,'faction-rebel'],[2,'faction-empire'],[3,'faction-mercenary'],[4,'faction-gar','faction-republic'],[5,'faction-cis','faction-separatist']]],
    ['affiliations', [['965','clan-covert'],['1081','clan-kryze'],['1082','clan-wren'],['1083','clan-saxon'],['1084','faction-creedless'],['1','faction-pyke'],['2','faction-blacksun'],['3','faction-raiders'],['5','faction-maul'],['7','faction-ewoks']]],
    ['upgradeSlots', [[1,'slot-personnel'],[2,'slot-gear'],[3,'slot-grenade','slot-grenades'],[4,'slot-heavy','slot-heavy-weapon'],[5,'slot-force'],[6,'slot-comms'],[7,'slot-pilot'],[8,'slot-hardpoint'],[9,'slot-command'],[10,'slot-training'],[11,'slot-generator'],[12,'slot-armament'],[13,'slot-crew'],[14,'slot-ordnance'],[15,'slot-counterpart'],[18,'slot-programming','slot-protocol'],[19,'slot-squad-leader'],[24,'slot-doctrine'],[25,'slot-helmet']]],
  ].flatMap(([table,rows])=>rows.flatMap(([id,...aliases])=>aliases.map(key=>[key,{table,id}]))));
  const LABELS = {...ACTION_LABEL,hit:'命中',critical:'暴击',block:'格挡',surge:'攻击激增','surge-block':'防御激增',
    exhaust:'横置',expend:'消耗',courage:'勇气',resilience:'韧性','defense-die-white':'白色防御骰','defense-die-inverted':'红色防御骰','rank-flier':'飞机',
    'range-half':'距离 ½','range-infinite':'距离 ∞',rangeInfinite:'射程',melee:'近战',overrun:'碾压'};
  const GLYPHS = {hit:'h',critical:'c',block:'s',surge:'a','surge-block':'d',
    'rank-commander':'5','rank-operative':'b','rank-corps':'6','rank-special-forces':'7','rank-special':'7','rank-support':'8','rank-heavy':'9',heavy:'9',
    'slot-personnel':'U','slot-gear':'G','slot-grenade':'N','slot-grenades':'N','slot-heavy':'W','slot-heavy-weapon':'W','slot-force':'F',
    'slot-comms':'O','slot-pilot':'P','slot-hardpoint':'H','slot-command':'C','slot-training':'M','slot-generator':'I','slot-armament':'B','slot-crew':'A',
    'defense-die-white':'D','defense-die-inverted':'E'};
  const FALLBACK = {'rank-commander':'指挥官','rank-operative':'特工','rank-corps':'核心','rank-special-forces':'特种部队','rank-special':'特种部队','rank-support':'支援','rank-heavy':'重型',heavy:'重型',
    'slot-personnel':'人员','slot-gear':'装备','slot-grenade':'手雷','slot-grenades':'手雷','slot-heavy':'重武器','slot-heavy-weapon':'重武器','slot-force':'原力',
    'slot-comms':'通讯','slot-pilot':'驾驶员','slot-hardpoint':'挂载点','slot-command':'指挥','slot-training':'训练','slot-generator':'发生器','slot-armament':'武装','slot-crew':'乘员',
    'slot-ordnance':'弹药','slot-programming':'程序','slot-squad-leader':'小队队长','slot-doctrine':'学说','slot-helmet':'头盔','slot-counterpart':'伙伴'};
  // Canonical tokens for authoring; aliases stay supported by the renderer.
  const REFERENCE_GROUPS = [
    ['骰面', ['hit','critical','block','surge','surge-block']],
    ['距离', ['range-0','range-half',...Array.from({length:6},(_,i)=>'range-'+(i+1)),'range-infinite']],
    ['军阶', ['rank-commander','rank-operative','rank-corps','rank-special-forces','rank-support','rank-heavy','rank-flier']],
    ['升级槽', ['slot-personnel','slot-gear','slot-grenade','slot-heavy','slot-force','slot-comms','slot-pilot','slot-hardpoint',
      'slot-command','slot-training','slot-generator','slot-armament','slot-crew','slot-ordnance','slot-counterpart',
      'slot-programming','slot-squad-leader','slot-doctrine','slot-helmet']],
    ['属性', ['defense-die-white','defense-die-inverted','courage','resilience']],
    ['行动与状态', ['action','double-action','free-action','free-exhaust','exhaust','expend']],
  ];
  const SHAPES = {courage:'m12 2 8 3v6c0 5-8 10-8 10S4 16 4 11V5Zm0 5v7m-3-3 3-4 3 4',resilience:'m12 2 9 10-9 10-9-10Zm-5 10h10'};
  const ns='http://www.w3.org/2000/svg'; let serial=0;
  const svgNode=(tag,attrs={})=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
  function label(key,defs={}) {
    const ref=CATALOG[key],record=ref && defs?.[ref.table]?.find(r=>String(r.id)===String(ref.id));
    return record?.name?.zh || record?.name?.en || LABELS[key] || FALLBACK[key] || (/^range-\d+$/.test(key)?'距离 '+key.slice(6):key);
  }
  function icon(key,title=label(key)) {
    const range=/^range-(\d+|half|infinite)$/.exec(key),value=range?.[1];
    const glyph=GLYPHS[key] || (range && /^[0-4]$/.test(value)?value:null);
    let result;
    if(glyph){
      result=document.createElement('span');result.className='rule-symbol rule-font-symbol';result.textContent=glyph;
      if(key==='defense-die-inverted')result.classList.add('rule-red-defense');
    } else if(range) {
      result=svgNode('svg',{viewBox:'0 0 100 100'});result.classList.add('rule-symbol');
      const id='rule-distance-value-'+(++serial),defs=svgNode('defs'),mask=svgNode('mask',{id,maskUnits:'userSpaceOnUse',x:0,y:0,width:100,height:100});
      const text=svgNode('text',{x:50,y:52,'text-anchor':'middle','dominant-baseline':'middle',fill:'black','font-family':'system-ui,sans-serif','font-weight':900,'font-size':value.length>1 && value!=='half' && value!=='infinite'?40:56});
      text.textContent=value==='half'?'½':value==='infinite'?'∞':value;
      mask.append(svgNode('rect',{width:100,height:100,fill:'white'}),text);defs.append(mask);result.append(defs);
      const frame=svgNode('g',{mask:'url(#'+id+')'});
      frame.append(svgNode('path',{transform:'translate(-5.734767025089606 85.56588299617277) scale(0.12149930137901707 -0.12149930137901707)',
        d:'M861 244Q865 244 867.5 241.0Q870 238 870 234Q860 165 829.5 105.5Q799 46 752.5 -1.0Q706 -48 646 -78Q586 -108 517 -118Q513 -119 510.0 -116.5Q507 -114 507 -110V-38Q495 -40 482.5 -41.0Q470 -42 458 -42Q446 -42 434.0 -41.0Q422 -40 410 -38V-110Q410 -114 407.0 -117.0Q404 -120 400 -118Q331 -108 271.5 -78.0Q212 -48 165.0 -1.0Q118 46 88 106Q58 166 48 234Q47 238 49.5 241.0Q52 244 56 244H128Q126 256 125.5 268.0Q125 280 125.0 292.0Q125 304 125.5 316.5Q126 329 128 341H56Q52 341 49 344Q46 346 48 350Q58 418 88.0 478.5Q118 539 165.0 585.5Q212 632 272.0 663.0Q332 694 400 704Q404 705 407.0 702.0Q410 699 410 695V622Q422 624 434.0 625.0Q446 626 458 626Q470 626 482.5 625.0Q495 624 507 622V695Q507 699 510.0 701.5Q513 704 517 704Q585 694 645.5 663.0Q706 632 752.5 585.5Q799 539 830 479Q860 418 870 350Q871 346 868.0 343.5Q865 341 861 341H788Q790 329 791.0 316.5Q792 304 792 292Q792 279 791.0 267.5Q790 256 788 244Z'}));
      result.append(frame);
    } else if(key==='rank-flier') {
      // Heavy glyph 9 from the MIT-licensed font, with its lower wings mirrored
      // around y=280. Preserve the original center, gaps and font-unit scale.
      result=svgNode('svg',{viewBox:'0 0 1302 1024'});result.classList.add('rule-symbol','rule-symbol-flier');
      const shape=svgNode('g',{transform:'translate(0 792) scale(1 -1)'});
      const wings='M48 185H278L404 -26H260ZM1020 185H1249L1038 -26H894Z';
      shape.append(svgNode('path',{d:'M850 236H976L826 -26H474L322 236H449V324H322L474 586H826L976 324H850Z'}),
        svgNode('path',{d:wings}),svgNode('path',{d:wings,transform:'translate(0 560) scale(1 -1)'}));
      result.append(shape);
    } else if(SHAPES[key]) {
      result=svgNode('svg',{viewBox:'0 0 24 24'});result.classList.add('rule-symbol');
      result.append(svgNode('path',{d:SHAPES[key],fill:'none',stroke:'currentColor','stroke-width':1.7,'stroke-linecap':'round','stroke-linejoin':'round'}));
    } else return null;
    result.setAttribute('role','img');result.setAttribute('aria-label',title);result.setAttribute('title',title);result.dataset.ruleIcon=key;
    return result;
  }
  function prose(raw, defs, renderText = text => document.createTextNode(text)) {
    const box = document.createElement("span");
    const text = (Array.isArray(raw) ? raw : [raw]).filter(Boolean).join("\n")
      .replace(/\{@icon\.action\}\s*\{@icon\.action\}/g, "{@icon.double-action}");
    let cursor = 0;
    for (const match of text.matchAll(/\{@icon\.([\w-]+)\}/g)) {
      box.append(renderText(text.slice(cursor, match.index)));
      const token = document.createElement("span");
      token.className = "inline-token";
      const name = label(match[1], defs);
      token.append(icon(match[1], name) || renderText(name));
      box.append(token);
      cursor = match.index + match[0].length;
    }
    box.append(renderText(text.slice(cursor)));
    return box;
  }
  return {ACTION_LABEL,REFERENCE_GROUPS,label,icon,prose};
})();
