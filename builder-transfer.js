/* TTS is a names-only interchange. Local IDs and runtime rules remain authoritative. */
window.BuilderTransfer = (() => {
  const factionCodes = {1:'rebel',2:'empire',4:'republic',5:'separatist',8:'mandalorian',9:'mercenary'};
  const factionIds = {rebel:1,rebels:1,empire:2,imperial:2,republic:4,separatist:5,separatists:5,
    mandalorian:8,mandalorians:8,mercenary:9,'shadow-collective':9};
  const deckKeys = {conditions:'advantage',deployment:'primary',objective:'secondary'};
  const normalizeName = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]/g,'');
  const english = c => c?.name?.en || '';
  const fullName = c => [english(c),c?.title?.en].filter(Boolean).join(' ');
  function catalogs(data) {
    return {units:Object.values(data.units).filter(u=>!u.isCounterpart&&u.usage!=='counterpart'),
      upgrades:Object.values(data.upgrades),commands:data.defs.commands,
      battleForce:data.defs.armies.filter(a=>data.pkg.battleForces?.[String(a.id)]),
      battle:[...new Map(Object.values(data.deckData).filter(Array.isArray).flat().map(c=>[c.id,c])).values()]};
  }
  function reference(kind, card, data, host = null) {
    if (!card) return null;
    if (kind === 'upgrades' && card.usage === 'counterpart') {
      const counterpart = BuilderModel.upgradePresentation(card,data,host)?.counterpart;
      const ref = data.ttsNames?.units?.[counterpart?.id];
      if (ref) return ref;
    }
    return data.ttsNames?.[kind]?.[card.runtimeVariant?.sourceId || card.id] || null;
  }
  function aliases(kind, c, data) {
    const names=[english(c),fullName(c),reference(kind,c,data)?.name];
    if (c.dualSided) names.push(c.back.name.en);
    if (kind === 'upgrades' && c.usage === 'counterpart')
      for(const u of Object.values(data.units).filter(u=>u.isCounterpart)) {
        if (BuilderModel.upgradePresentation(c,data,u)?.counterpart?.id === u.id)
          names.push(reference('units',u,data)?.name,fullName(u));
      }
    return names.filter(Boolean);
  }
  function resolve(kind, name, data, context = {}) {
    const key = normalizeName(name), all = catalogs(data)[kind];
    const exact = all.filter(c=>normalizeName(reference(kind,c,data,context.host)?.name)===key);
    let hits = exact.length ? exact : all.filter(c=>aliases(kind,c,data).some(n=>normalizeName(n)===key));
    const narrow = predicate => {const filtered=hits.filter(predicate);if(filtered.length)hits=filtered;};
    if(kind==='units' && context.army) {
      narrow(c=>RulesCore.armyRank(c,context.army.armyId,data.pkg,data.defs,data.units)!=null);
      narrow(c=>RulesCore.runtimeAvailable(c,context.army,data.pkg));
    }
    if(kind==='battle') {
      const collection = context.deckKind === 'advantage' ? data.deckData.conditions
        : context.deckKind === 'primary' ? data.deckData.deployments : data.deckData.objectives;
      const ids=new Set((collection||[]).map(c=>c.id));narrow(c=>ids.has(c.id));
      narrow(c=>!c.modes?.length||c.modes.includes(context.army.mode));
    }
    if(kind==='upgrades' && context.host) {
      const equipped=(context.inst?.upgrades||[]).map(ch=>data.upgrades[ch.upgradeId]).filter(Boolean);
      narrow(c=>RulesCore.upgradeEligibility(c,context.host,context.army,data,equipped).ok);
      const slots=RulesCore.slotListFor(data.pkg,context.host,context.inst||{upgrades:[]},data.upgrades,context.army.armyId);
      narrow(c=>RulesCore.accessKeys(c,data.pkg,data.pkg.upgradeRules?.[String(c.upstream?.id)]||{}).some(k=>slots.some(s=>s.key===k)));
      // Names-only TTS cannot distinguish a paid copy from a granted copy.
      // Keep the ordinary card unless the file explicitly resolves its local ID.
      narrow(c=>!c.runtimeVariant);
    }
    return hits;
  }
  function resolveBattleForce(name, data) {
    const key=normalizeName(name);
    if(!key)return [];
    return catalogs(data).battleForce.filter(a=>{
      const ref=data.ttsNames?.battleForces?.[a.id],local=data.pkg.battleForces[a.id];
      return [ref?.name,...(ref?.aliases||[]),a.name.en,local.name,...(local.nameAliases||[])]
        .some(n=>n&&normalizeName(n)===key);
    });
  }
  function parse(text) {
    const raw=String(text).replace(/^\uFEFF/,'').trim();
    try{return JSON.parse(raw);}catch(first) {
      // Accept the rich-text escaping used when copying a JSON example from chat.
      const decoded=raw.replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
        .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&quot;/g,'"').replace(/&amp;/g,'&')
        .replace(/\\\r?\n/g,'\n').replace(/\\:/g,':');
      if(decoded===raw)throw Error('不是有效 JSON：'+first.message);
      try{return JSON.parse(decoded);}catch{throw Error('不是有效 JSON，请粘贴完整的 JSON 内容。');}
    }
  }
  const detect = obj => obj && typeof obj.armyFaction==='string' && Array.isArray(obj.units) ? 'tts' : 'native';
  function readNative(obj,data,makeId,now) {
    if (!obj || typeof obj!=='object') throw Error('军表格式不正确。');
    const army=BuilderLibrary.normalize(obj.army || obj);
    if(!data.defs.armies.some(a=>a.id===army.armyId))throw Error('军队 ID 不存在。');
    const instances=new Set();
    for(const u of army.units) {
      if(!u||typeof u.unitId!=='string'||!Array.isArray(u.upgrades))throw Error('单位缺少有效 ID 或升级数组。');
      if(!u.instanceId||instances.has(u.instanceId))u.instanceId=makeId();instances.add(u.instanceId);
      for(const c of u.upgrades) {
        if(!c||typeof c.upgradeId!=='string'||!Number.isInteger(c.slotIndex)||c.slotIndex<0)throw Error('升级缺少有效 ID 或槽位。');
        if(!c.instanceId||instances.has(c.instanceId))c.instanceId=makeId();instances.add(c.instanceId);
      }
    }
    if(!Array.isArray(army.commandIds)||!Array.isArray(army.options))throw Error('指挥卡或选项必须为数组。');
    UpgradeFaces.normalizeArmy(army,data);
    BuilderModel.migrateSlots(army,data);
    return {record:{...structuredClone(obj.army?obj:{}),id:makeId(),name:obj.name||'导入军表',
      factionId:BuilderLibrary.factionOf(army.armyId,data),createdAt:now,updatedAt:now,army},issues:[],warnings:[]};
  }
  function exportTTS(record,data) {
    const army=record.army, warnings=[],issues=[];
    function name(kind,c,where,host) {
      if(!c){issues.push(where+'：找不到本地卡牌');return '';}
      const ref=reference(kind,c,data,host),fallback=kind==='units'?fullName(c):english(c);
      if(!ref)warnings.push(where+'：英文引用未校对 — '+fallback);
      if(!fallback&&!ref)issues.push(where+'：缺少英文名称');
      return ref?.name||fallback;
    }
    const faction=BuilderLibrary.factionOf(army.armyId,data),factionCode=factionCodes[faction];
    if(!factionCode)issues.push('该势力没有已知的 TTS 代码。');
    if(faction===9)warnings.push('暗影集会的势力代码需在所用 TTS 模组版本中确认。');
    const out={author:'SWLArmyBuilderCN',listname:record.name||'Untitled',
      points:RulesCore.validateArmy(army,data).effectivePoints,numActivations:army.units.length,
      armyFaction:factionCode||'',commandCards:[],contingencies:[],units:[],
      battlefieldDeck:{conditions:[],deployment:[],objective:[],scenario:army.mode==='recon'?'recon':'standard'},listlink:''};
    if(data.pkg.battleForces?.[army.armyId]) {
      const ref=data.ttsNames?.battleForces?.[army.armyId];
      if (ref?.armyFaction != null) out.armyFaction = ref.armyFaction;
      out.battleForce=ref?.name||data.defs.armies.find(a=>a.id===army.armyId)?.name.en;
      if(!ref)warnings.push('战斗部队英文引用未校对：'+(out.battleForce||army.armyId));
      if(!out.battleForce)issues.push('战斗部队缺少英文名称');
    }
    const command=id=>data.defs.commands.find(c=>String(c.id)===String(id));
    for(const id of army.commandIds.filter(Boolean))out.commandCards.push(name('commands',command(id),'指挥卡 '+id));
    out.commandCards=out.commandCards.filter(n=>n!=='Standing Orders');out.commandCards.push('Standing Orders');
    for(const id of army.contingencyIds||[])out.contingencies.push(name('commands',command(id),'备用指挥卡 '+id));
    for(const [i,inst]of army.units.entries()) {
      const u=data.units[inst.unitId], row={name:name('units',u,'单位 '+(i+1)),upgrades:[]};
      for(const ch of inst.upgrades)row.upgrades.push(name('upgrades',data.upgrades[ch.upgradeId],'单位 '+(i+1)+' 升级 '+ch.upgradeId,u));
      if(inst.ttsLoadout?.length)row.loadout=[...inst.ttsLoadout];
      out.units.push(row);
    }
    for(const [external,internal]of Object.entries(deckKeys))for(const id of BuilderLibrary.normalizeDeck(army.deck)[internal])
      out.battlefieldDeck[external].push(name('battle',catalogs(data).battle.find(c=>c.id===id),'任务卡 '+id));
    if(army.units.some(u=>u.upgrades.some(c=>c.face==='back'||c.face==='both')))
      warnings.push('TTS 仅记录实体卡名称；反面／双面显示状态不会写入，重新导入时默认正面。');
    if(army.pointsLimit!==(army.mode==='recon'?600:1000))warnings.push('TTS 不保存自定义分数上限；请用原生 JSON 保留。');
    if(army.options?.length)warnings.push('TTS 名称格式不包含自定义规则选项，也不能区分免费副本；请同时导出原生 JSON 完整保留这些设置。');
    return {json:out,warnings:[...new Set(warnings)],issues};
  }
  // Slot assignment is independent of unit order and can wait for upgrades that grant slots.
  // Import an unfinished/illegal army faithfully; regular validation reports legality afterwards.
  function assignSlots(inst,cards,army,data) {
    const host=data.units[inst.unitId];let visits=0;
    function search(selected,pending) {
      if(!pending.length)return selected;
      if(++visits>5000)return null;
      const current={...inst,upgrades:selected};
      const slots=RulesCore.slotListFor(data.pkg,host,current,data.upgrades,army.armyId);
      const options=pending.map((card,index)=>({card,index,slots:slots.map((s,i)=>({s,i})).filter(({s,i})=>
        !selected.some(c=>c.slotIndex===i)&&(!s.unlockedBy||selected.some(c=>String(data.upgrades[c.upgradeId]?.upstream?.id)===String(s.unlockedBy)))&&
        RulesCore.accessKeys(card,data.pkg,data.pkg.upgradeRules?.[String(card.upstream?.id)]||{}).includes(s.key))})).filter(x=>x.slots.length)
        .sort((a,b)=>a.slots.length-b.slots.length);
      for(const option of options)for(const {i}of option.slots) {
        const next={...inst,upgrades:[...structuredClone(selected),{upgradeId:option.card.id,slotIndex:i,...(option.card.dualSided?{face:'front'}:{})}]};
        const after=RulesCore.slotListFor(data.pkg,host,next,data.upgrades,army.armyId);
        if(!BuilderModel.rebindSlots(next,slots,after,data).ok)continue;
        const result=search(next.upgrades,pending.filter((_,j)=>j!==option.index));
        if(result)return result;
      }
      return null;
    }
    return search([],cards);
  }
  function importTTS(obj,data,makeId,now,{pointsLimit,resolutions={},factionId}={}) {
    if(detect(obj)!=='tts')throw Error('所选文件不是 TTS JSON格式。');
    if(obj.units.length>150)throw Error('单位数量超过 150。');
    if(obj.battleForce!=null&&typeof obj.battleForce!=='string')throw Error('battleForce 必须为英文名称字符串。');
    const forces=obj.battleForce?resolveBattleForce(obj.battleForce,data):[];
    const resolvedForce=resolutions.battleForce
      ? catalogs(data).battleForce.find(a=>String(a.id)===String(resolutions.battleForce))
      : forces.length===1?forces[0]:null;
    let faction=factionIds[obj.armyFaction.toLowerCase()]||Number(factionId);
    if(!faction&&resolvedForce)faction=BuilderLibrary.factionOf(resolvedForce.id,data);
    if(!factionCodes[faction])throw Error('无法识别势力“'+obj.armyFaction+'”，请在导入选项中指定势力。');
    const scenario=obj.battlefieldDeck?.scenario||'standard',warnings=[],issues=[];
    if(!['standard','recon'].includes(scenario))throw Error('暂不支持场景：'+scenario);
    const cap=pointsLimit==null?(scenario==='recon'?600:1000):Number(pointsLimit);
    const record=BuilderLibrary.create(faction,typeof obj.listname==='string'?obj.listname:'导入军表',data,makeId,now);
    const army=record.army;army.pointsLimit=cap;army.mode=BuilderLibrary.modeForPoints(cap);
    if(obj.battleForce) {
      const matchesFaction=resolvedForce&&BuilderLibrary.factionOf(resolvedForce.id,data)===faction;
      if(matchesFaction)army.armyId=resolvedForce.id;
      else issues.push({key:'battleForce',kind:'battleForce',name:obj.battleForce,
        factionId:faction,candidates:forces.filter(a=>BuilderLibrary.factionOf(a.id,data)===faction).map(a=>a.id),
        message:resolvedForce?'战斗部队与所选势力不匹配':forces.length>1?'战斗部队名称存在多个匹配':'找不到战斗部队，请指定对应项'});
    }
    function get(kind,n,key,context={}) {
      if(typeof n!=='string'||!n.trim())throw Error(key+' 必须为非空英文名称。');
      const override=resolutions[key], pool=catalogs(data)[kind];
      const hits=override?pool.filter(c=>String(c.id)===String(override)):resolve(kind,n,data,{army,...context});
      if(hits.length!==1){issues.push({key,kind,name:n,message:hits.length?'存在多个匹配':'没有精确匹配',candidates:hits.map(c=>c.id)});return null;}
      if(!reference(kind,hits[0],data,context.host))warnings.push(n+' 使用本地英文名匹配，尚未与 Legion HQ 校对。');
      return hits[0];
    }
    function strings(value,key,max=100) {
      if(value==null)return [];
      if(!Array.isArray(value)||value.length>max||value.some(n=>typeof n!=='string'))throw Error(key+' 必须为英文名称数组。');
      return value;
    }
    for(const [i,row]of obj.units.entries()) {
      if(!row||typeof row!=='object')throw Error('单位 '+(i+1)+' 格式错误。');
      const unit=get('units',row.name,'units.'+i);if(!unit)continue;
      const inst={unitId:unit.id,instanceId:makeId(),upgrades:[]};army.units.push(inst);
      const requested=strings(row.upgrades,'units.'+i+'.upgrades',40),cards=[];
      for(const [j,n]of requested.entries()) {const c=get('upgrades',n,`units.${i}.upgrades.${j}`,{host:unit,inst});if(c)cards.push(c);}
      if(cards.length===requested.length) {
        const assigned=assignSlots(inst,cards,army,data);
        if(!assigned)issues.push({key:`units.${i}.slots`,kind:'slots',name:row.name,message:'升级无法完整分配到现有槽位，请检查卡名或本地槽位数据'});
        else inst.upgrades=assigned.map(c=>({...c,instanceId:makeId()}));
      }
      if(row.loadout?.length){inst.ttsLoadout=strings(row.loadout,'loadout');warnings.push(row.name+' 的备用装备已保留，当前不模拟备用装备切换。');}
    }
    const hand=BuilderLibrary.configuration(army,data).rules.commandHand||[];
    const pips=hand.flatMap(h=>Array(h.min||0).fill(h.pips));army.commandIds=pips.map(()=>null);
    for(const [i,n]of strings(obj.commandCards,'commandCards').entries()) {
      const card=get('commands',n,'commands.'+i);if(!card)continue;
      const index=pips.findIndex((p,j)=>p===card.pips&&army.commandIds[j]==null);
      if(index>=0)army.commandIds[index]=String(card.id);else army.commandIds.push(String(card.id));
    }
    const standing=data.defs.commands.find(c=>c.name.en==='Standing Orders');
    if(standing&&!army.commandIds.includes(String(standing.id))) {
      const i=pips.findIndex((p,j)=>p===4&&army.commandIds[j]==null);
      if(i>=0)army.commandIds[i]=String(standing.id);else army.commandIds.push(String(standing.id));
    }
    army.contingencyIds=[];
    for(const [i,n]of strings(obj.contingencies,'contingencies').entries()) {
      const c=get('commands',n,'contingencies.'+i);if(c)army.contingencyIds.push(String(c.id));
    }
    if(army.contingencyIds.length)warnings.push('备用指挥卡已保留并可再次导出；当前不提供备用手牌编辑。');
    for(const [external,internal]of Object.entries(deckKeys)) {
      army.deck[internal]=[];
      for(const [i,n]of strings(obj.battlefieldDeck?.[external],external,30).entries()) {
        const c=get('battle',n,`${external}.${i}`,{deckKind:internal});if(c)army.deck[internal].push(c.id);
      }
    }
    const total=RulesCore.validateArmy(army,data).effectivePoints;
    if(!issues.length && obj.points!=null && obj.points!==total)warnings.push(`原文件 ${obj.points} 分，本地当前资料计算为 ${total} 分；导出采用当前资料。`);
    if(obj.numActivations!=null&&obj.numActivations!==obj.units.length)warnings.push('原文件激活数与单位条目数量不同；本地按实际单位数量计算。');
    return {record,issues,warnings:[...new Set(warnings)]};
  }
  return {normalizeName,catalogs,reference,resolve,resolveBattleForce,parse,detect,readNative,exportTTS,importTTS,assignSlots};
})();
