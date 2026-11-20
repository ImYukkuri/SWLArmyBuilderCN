/* Shared definition and roster-selection validation for browser and Node. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BattleForceV2 = api;
})(globalThis, () => {
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const record = value => value != null && typeof value === 'object' && !Array.isArray(value);
  const validId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,150}$/.test(value) &&
    !['constructor', 'prototype', '__proto__'].includes(value);
  const label = item => item.name?.zh || item.name?.en || item.id;

  function validateDefinition(bf) {
    const issues = [];
    const fail = (path, message) => issues.push({code: 'battle_force_config', path, message});
    const object = (value, path, fields) => {
      if (!record(value)) { fail(path, '必须为对象'); return false; }
      for (const key of Object.keys(value)) if (!fields.includes(key)) fail(path + '.' + key, '尚不支持此字段');
      return true;
    };
    const array = (value, path) => {
      if (!Array.isArray(value)) {fail(path, '必须为数组'); return [];}
      return value;
    };
    const name = (value, path) => {
      if (!object(value, path, ['en', 'zh'])) return;
      for (const language of ['en', 'zh'])
        if (typeof value[language] !== 'string' || !value[language].trim()) fail(path + '.' + language, '名称不能为空');
    };
    const id = (value, path, seen) => {
      if (!validId(value)) fail(path, '需要稳定的字母／数字 ID');
      else if (seen.has(value)) fail(path, 'ID 重复：' + value);
      else seen.add(value);
    };
    const texts = (value, path) => {
      for (const field of ['textRules', 'textRulesZh']) if (own(value, field)) {
        const rows = array(value[field], path + '.' + field);
        if (rows.some(row => typeof row !== 'string')) fail(path + '.' + field, '规则正文必须为文本数组');
      }
    };
    if (!record(bf) || bf.engineVersion !== 2) {
      fail('engineVersion', 'V2 部队需要 engineVersion: 2'); return issues;
    }
    if (!['draft','preview','active'].includes(bf.status)) fail('status', '无效的 V2 部队状态');
    if (!object(bf.v2, 'v2', ['parentFactionId', 'common', 'ruleGroups', 'selectionSchemes'])) return issues;
    const config = bf.v2;
    if (bf.status !== 'draft' && !Number.isSafeInteger(config.parentFactionId)) fail('v2.parentFactionId','需要所属势力 ID');
    const scopeFields = ['textRules','textRulesZh','unitGrants','upgradeGrants','uniqueUpgradeIds','modifiers','entries','rankModifiers','unitLimits'];
    const condition = (node,path) => {
      if (!record(node)) {fail(path,'条件必须为对象');return;}
      if (node.all || node.any) {array(node.all || node.any,path).forEach((v,i)=>condition(v,path+'.'+i));return;}
      if(node.not){condition(node.not,path+'.not');return;}
      if (!['unit.id','unit.rankId','unit.factionId','unit.unitCategoryId','unit.unitSubtypeId','unit.nameIdentityId',
        'unit.affiliationIds','unit.keywords'].includes(node.field) || !['eq','in','contains','gte','lte'].includes(node.op))
        fail(path,'不支持的匹配条件');
      if(node.field==='unit.id' && (node.op==='in' ? !Array.isArray(node.value) || node.value.some(v=>!validId(v)) : !validId(node.value)))
        fail(path,'请使用本地单位 ID');
    };
    const effectIds = new Set();
    const scope = (group,path) => {
      texts(group,path);
      if(own(group,'uniqueUpgradeIds') && array(group.uniqueUpgradeIds,path+'.uniqueUpgradeIds').some(v=>!validId(v)))
        fail(path+'.uniqueUpgradeIds','请使用本地升级卡 ID');
      for (const [field,key] of [['unitGrants','unitId'],['upgradeGrants','upgradeId']]) if(own(group,field))
        array(group[field],path+'.'+field).forEach((r,i)=>{if(!record(r)||!validId(r[key])||Object.keys(r).some(k=>k!==key))fail(path+'.'+field+'.'+i,'必须关联本地卡牌 ID');});
      if(own(group,'unitLimits')) array(group.unitLimits,path+'.unitLimits').forEach((r,i)=>{
        if(!record(r)||!validId(r.unitId)||!Number.isSafeInteger(r.min ?? 0)||!Number.isSafeInteger(r.max)||
          (r.min ?? 0)<0||r.max<(r.min ?? 0))fail(path+'.unitLimits.'+i,'单位数量范围无效');
      });
      if(own(group,'rankModifiers')) array(group.rankModifiers,path+'.rankModifiers').forEach((r,i)=>{
        if(!record(r)||!Number.isSafeInteger(r.rankId)||!['set','add'].includes(r.op)||
          !['min','max'].some(k=>own(r,k))||['min','max'].some(k=>own(r,k)&&!Number.isSafeInteger(r[k])))fail(path+'.rankModifiers.'+i,'军阶配额修改无效');
      });
      if(own(group,'entries')) array(group.entries,path+'.entries').forEach((r,i)=>{
        const at=path+'.entries.'+i;
        if(!object(r,at,['id','name','summary','full','fullEn','timing','target']))return;
        id(r.id,at+'.id',effectIds);name(r.name,at+'.name');
        if(typeof r.summary!=='string'||typeof r.full!=='string'||!Array.isArray(r.timing)||r.timing.some(t=>typeof t!=='string'))fail(at,'局部词条需要简写、全文及时机');
        if(r.target)condition(r.target,at+'.target');
      });
      if(own(group,'modifiers')) array(group.modifiers,path+'.modifiers').forEach((r,i)=>{
        const at=path+'.modifiers.'+i;
        if(!object(r,at,['id','card','target','upgradeId','field','op','value','count','when','weaponFilter']))return;
        id(r.id,at+'.id',effectIds);
        if(!['unit','upgrade'].includes(r.card)||!['set','add','remove'].includes(r.op))fail(at,'修改对象或操作无效');
        if(r.card==='upgrade'&&!validId(r.upgradeId))fail(at,'升级修改需要本地升级 ID');
        if(r.card==='upgrade'&&r.target&&r.field!=='points')fail(at,'按宿主匹配的升级修改目前仅支持费用');
        if(r.card==='upgrade'&&r.when)fail(at,'升级修改暂不支持装备触发条件');
        if(r.target)condition(r.target,at+'.target');
        if(r.when && (!record(r.when)||Object.keys(r.when).length!==1||!validId(r.when.equippedSlot)))fail(at,'条件只支持已装备指定槽位类别');
        const numeric=['points','rankId','factionId','rules.limit'];
        if(numeric.includes(r.field)) {
          if(r.op==='remove'||(r.value!==null&&!Number.isSafeInteger(r.value))||
            (r.value===null&&!(r.field==='rules.limit'&&r.op==='set')))fail(at,'数值修改无效');
          if(r.field==='factionId'&&r.op!=='set')fail(at,'势力只能设为指定 ID');
        } else if(['keywords','weapons.keywords'].includes(r.field)) {
          const keywordId = value => typeof value === 'string' &&
            (/^bf:\d+:[a-z0-9][a-z0-9_-]{0,150}$/.test(value) || validId(value));
          if(!record(r.value)||!keywordId(r.value.id)|| (r.value.value!=null&&!Number.isSafeInteger(r.value.value)))fail(at,'词条需要 ID 和有效数值');
        } else if(r.field==='upgradeSlots') {
          if(!['add','remove'].includes(r.op)||!Number.isSafeInteger(r.value)||!Number.isSafeInteger(r.count??1)||(r.count??1)<1)fail(at,'槽位修改无效');
        } else if(r.field==='rules.unique') {if(r.op!=='set'||typeof r.value!=='boolean')fail(at,'独特性需要布尔值');}
        else if(['affiliationIds','rules.unavailableWith','rules.unavailableWithIds'].includes(r.field)) {
          if(r.op!=='set'||!Array.isArray(r.value))fail(at,'此字段只支持设为数组');
        } else fail(at,'不支持修改此属性');
        if(r.weaponFilter && (!record(r.weaponFilter)||Object.keys(r.weaponFilter).some(k=>!['range','hasKeyword','notKeyword'].includes(k))||
          (r.weaponFilter.range && !['melee','ranged'].includes(r.weaponFilter.range))))fail(at,'武器筛选无效');
      });
    };
    if (object(config.common, 'v2.common', scopeFields)) scope(config.common, 'v2.common');
    const ruleIds = new Set();
    array(config.ruleGroups, 'v2.ruleGroups').forEach((group, i) => {
      const path = 'v2.ruleGroups.' + i;
      if (!object(group, path, ['id', 'name', ...scopeFields])) return;
      id(group.id, path + '.id', ruleIds); name(group.name, path + '.name'); scope(group, path);
    });
    const schemeIds = new Set();
    array(config.selectionSchemes, 'v2.selectionSchemes').forEach((scheme, i) => {
      const path = 'v2.selectionSchemes.' + i;
      if (!object(scheme, path, ['id', 'name', 'groups'])) return;
      id(scheme.id, path + '.id', schemeIds); name(scheme.name, path + '.name');
      const groupIds = new Set(), usedRules = new Set();
      array(scheme.groups, path + '.groups').forEach((group, j) => {
        const at = path + '.groups.' + j;
        if (!object(group, at, ['id', 'name', 'ruleGroupIds', 'min', 'max'])) return;
        id(group.id, at + '.id', groupIds); name(group.name, at + '.name');
        const candidates = array(group.ruleGroupIds, at + '.ruleGroupIds');
        for (const ref of candidates) {
          if (!ruleIds.has(ref)) fail(at + '.ruleGroupIds', '规则组不存在：' + String(ref));
          if (usedRules.has(ref)) fail(at + '.ruleGroupIds', '同一方案不能重复引用规则组：' + String(ref));
          usedRules.add(ref);
        }
        if (!Number.isSafeInteger(group.min) || !Number.isSafeInteger(group.max) ||
            group.min < 0 || group.max < group.min || group.max > candidates.length)
          fail(at, '选择数量需要满足 0 ≤ min ≤ max ≤ 候选数');
      });
    });
    return issues;
  }

  function validatePackage(pkg) {
    if (!record(pkg?.battleForces)) return [{code: 'battle_force_config', path: 'battleForces', message: '必须为对象'}];
    const issues = [];
    for (const [id, bf] of Object.entries(pkg.battleForces)) {
      if (!record(bf)) {issues.push({code: 'battle_force_config', path: id, message: '战斗部队必须为对象'}); continue;}
      const version = own(bf, 'engineVersion') ? bf.engineVersion : 1;
      if (version !== 1 && version !== 2) issues.push({code: 'battle_force_version', path: id + '.engineVersion', message: '不支持的战斗部队规则版本'});
      else if (version === 2) issues.push(...validateDefinition(bf).map(issue => ({...issue, path: id + '.' + issue.path})));
      else if (own(bf, 'v2')) issues.push({code: 'battle_force_version', path: id + '.engineVersion', message: 'V2 配置必须明确标记 engineVersion: 2'});
    }
    return issues;
  }

  // Structural checks preserve unresolved references for a later readable diagnostic.
  function normalizeSelection(value) {
    if (!record(value) || !Number.isSafeInteger(value.battleForceId) || value.battleForceId <= 0 ||
        !validId(value.schemeId) || !record(value.groups)) throw Error('战斗部队规则选择格式不正确。');
    if (Object.keys(value).some(key => !['battleForceId', 'schemeId', 'groups'].includes(key)))
      throw Error('战斗部队规则选择包含不支持的字段。');
    for (const [id, choices] of Object.entries(value.groups)) {
      if (!validId(id) || !Array.isArray(choices) || choices.some(choice => !validId(choice)))
        throw Error('规则组选择必须使用稳定 ID 数组。');
      if (new Set(choices).size !== choices.length) throw Error('同一规则组不能重复选择。');
    }
    return structuredClone(value);
  }

  function selectionState(army, bf) {
    const issues = [], activeRuleGroupIds = [];
    const fail = (code, message) => issues.push({status: 'invalid', code, message, instanceId: null});
    const configIssues = validateDefinition(bf);
    if (configIssues.length) return {activeRuleGroupIds, issues: configIssues.map(i => ({...i, status: 'invalid', instanceId: null}))};
    const schemes = bf.v2.selectionSchemes;
    let value;
    try {value = army.battleForceSelection == null ? null : normalizeSelection(army.battleForceSelection);}
    catch (e) {fail('battle_force_selection', e.message); return {activeRuleGroupIds, issues};}
    if (value && value.battleForceId !== Number(army.armyId)) {
      fail('battle_force_selection', '规则选择属于其他战斗部队。'); return {activeRuleGroupIds, issues};
    }
    const scheme = value ? schemes.find(s => s.id === value.schemeId) : schemes.length === 1 ? schemes[0] : null;
    if (!scheme) {
      if (value || schemes.length) fail('battle_force_selection', '请选择有效的战斗部队规则方案。');
      return {activeRuleGroupIds, issues};
    }
    for (const key of Object.keys(value?.groups || {})) if (!scheme.groups.some(g => g.id === key))
      fail('battle_force_selection', '选择组已不存在：' + key);
    for (const group of scheme.groups) {
      const choices = value?.groups[group.id] || [];
      const unknown = choices.filter(id => !group.ruleGroupIds.includes(id));
      if (unknown.length) fail('battle_force_selection', label(group) + '包含无效规则组：' + unknown.join('、'));
      if (choices.length > group.max) fail('battle_force_selection_max', label(group) + '最多选择 ' + group.max + ' 项。');
      if (choices.length < group.min) fail('battle_force_selection_min', label(group) + '至少选择 ' + group.min + ' 项。');
      if (!unknown.length && choices.length <= group.max) activeRuleGroupIds.push(...choices);
    }
    return {activeRuleGroupIds, issues};
  }

  // Minimums are reported, not enforced while editing an unfinished roster.
  function choose(army, bf, schemeId, groupId, ruleGroupIds) {
    if (!validId(groupId) || !Array.isArray(ruleGroupIds)) throw Error('规则组选择格式不正确。');
    const draft = structuredClone(army);
    const previous = draft.battleForceSelection;
    if (!previous || previous.battleForceId !== Number(army.armyId) || previous.schemeId !== schemeId)
      draft.battleForceSelection = {battleForceId: Number(army.armyId), schemeId, groups: {}};
    draft.battleForceSelection.groups[groupId] = [...ruleGroupIds];
    draft.battleForceSelection = normalizeSelection(draft.battleForceSelection);
    const state = selectionState(draft, bf);
    const errors = state.issues.filter(i => i.code !== 'battle_force_selection_min');
    if (errors.length) throw Error(errors.map(i => i.message).join('；'));
    return draft;
  }

  function pendingReport(army, data) {
    const bf = data.pkg.battleForces?.[army.armyId];
    const issues = selectionState(army, bf).issues;
    issues.push({status: 'unknown', code: 'battle_force_draft', instanceId: null,
      message: '此战斗部队尚未启用，当前仅显示原始费用，不能据此确认军表合法性。'});
    let basePoints = 0;
    for (const inst of army.units || []) {
      const unit = data.units[inst.unitId];
      if (!unit) issues.push({status: 'invalid', code: 'missing_unit', message: '单位引用不存在', instanceId: inst.instanceId});
      basePoints += unit?.points || 0;
      for (const choice of inst.upgrades || []) {
        const card = data.upgrades[choice.upgradeId];
        if (!card) issues.push({status: 'invalid', code: 'missing_upgrade', message: '升级引用不存在', instanceId: choice.instanceId});
        basePoints += card?.points || 0;
      }
    }
    return {status: issues.some(i => i.status === 'invalid') ? 'invalid' : 'unknown', basePoints,
      effectivePoints: basePoints, rankCounts: {}, issues};
  }
  return {validateDefinition, validatePackage, normalizeSelection, selectionState, choose, pendingReport};
});
