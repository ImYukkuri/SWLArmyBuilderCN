/* V2 maintenance only. Catalogs and the rule package are shared with the old
 * editor; preview uses the same runtime as the list builder. */
(() => {
  const {el,api}=EditorCommon, $=s=>document.querySelector(s), copy=structuredClone;
  const label=v=>v?.name?.zh || v?.name?.en || v?.id || '';
  const title=u=>[label(u),u?.title?.zh || u?.title?.en].filter(Boolean).join(' · ');
  const timings={global:'全局',army_building:'组军',setup:'设置',deployment:'部署',command:'命令阶段',
    activation_start:'激活开始',activation:'激活',activation_end:'激活结束',action:'行动',movement:'移动',attack:'攻击',defense:'防御',end_round:'回合结束'};
  const targetFields=ConditionEditor.FIELDS.filter(([key])=>['unit.id','unit.rankId','unit.factionId',
    'unit.unitCategoryId','unit.unitSubtypeId','unit.nameIdentityId','unit.affiliationIds','unit.keywords'].includes(key));
  const tabs={base:'基础',common:'共通规则',groups:'规则组',schemes:'选择方案',preview:'预览'};
  const properties={points:'费用',rankId:'军阶',factionId:'势力',affiliationIds:'组织','rules.limit':'数量上限',
    'rules.unique':'独特升级',keywords:'单位／升级词条','weapons.keywords':'武器词条',upgradeSlots:'升级槽位',
    'rules.unavailableWith':'互斥引用（旧格式）','rules.unavailableWithIds':'互斥引用'};
  let pkg,defs,catalog,revision,definitionsRevision,selected,section='base',groupId,dirty=false,busy=false;
  let preview=null,dialogDirty=false;
  const folds=new Map();let renderedKey='';
  const force=()=>pkg?.battleForces[selected];
  const option=(value,label)=>({value,label});
  const table=k=>defs.editorOptions.table(k);
  const rankOptions=()=>[...defs.ranks].sort((a,b)=>a.order-b.order).map(r=>option(r.id,label(r)));
  const localUnits=()=>Object.values(catalog.units).filter(u=>u.usage!=='counterpart'&&!u.isCounterpart);
  const localUpgrades=()=>Object.values(catalog.upgrades);
  const keywordOptions=()=>{
    const current=force(), rows=table('keywords').filter(item=>{
      const id=String(item.value||'');
      return !id.startsWith('bf:') || id.startsWith(`bf:${selected}:`);
    });
    // Include entries created in the current unsaved draft immediately; a
    // catalog refresh is not required before using a new local keyword.
    const dynamic=[current?.v2?.common,...(current?.v2?.ruleGroups||[])].filter(Boolean)
      .flatMap(scope=>scope.entries||[]).filter(entry=>entry?.id&&entry.name)
      .map(entry=>option(`bf:${selected}:${entry.id}`,`临时词条 · ${label(entry)} · ${selected}`));
    const byId=new Map(rows.map(item=>[String(item.value),item]));dynamic.forEach(item=>byId.set(String(item.value),item));
    return [...byId.values()];
  };
  function status(text,error=false){$('#status').textContent=text;$('#status').classList.toggle('error',error);}
  function button(text,click,cls=''){const b=el('button',text);b.type='button';b.className=cls;b.onclick=click;return b;}
  function row(...nodes){const box=el('div');box.className='bfv-actions';box.append(...nodes);return box;}
  function grid(...nodes){const box=el('div');box.className='bfv-grid';box.append(...nodes);return box;}
  function field(name,value,change,type='text') {return EditorCommon.field(name,value,v=>{change(v);mark();},type);}
  function choice(name,value,items,change,{nullable=false}={}) {
    const wrap=el('div');wrap.className='field';wrap.append(el('span',name),EditorOptions.control(value,items,v=>{
      change(v);mark();},{label:name,nullable,preserveType:false}));return wrap;
  }
  function check(name,value,change){const n=el('label');n.className='bfv-check';const c=el('input');c.type='checkbox';
    c.checked=!!value;c.onchange=()=>{change(c.checked);mark();};n.append(c,document.createTextNode(name));return n;}
  function lines(name,value,change){return field(name,(value||[]).join('\n'),v=>change(v.split('\n').filter(s=>s.trim())), 'textarea');}
  function namedFields(obj){return grid(field('中文名称',obj.name?.zh||'',v=>(obj.name||={}).zh=v),
    field('英文名称',obj.name?.en||'',v=>(obj.name||={}).en=v));}
  function stableId(id){const n=el('small','ID '+id);n.className='bfv-id';return n;}
  function fold(name,open=false){const n=el('details');n.className='bfv-fold';n.open=open;n.append(el('summary',name));return n;}
  function changed(draw=true){mark();if(draw)render();}
  function mark(){dirty=true;$('#dirty').textContent='未保存';if(pkg)validate();}
  function uniqueId(prefix){return prefix+'-'+crypto.randomUUID().slice(0,12);}
  function remove(list,index){list.splice(index,1);changed();}
  function valuesPicker(name,items,values,onChange){
    const box=el('div'),chips=el('div');chips.className='bfv-chips';
    const known=new Map(items.map(c=>[String(c.id),c]));
    box.append(row(button('选择'+name,()=>UnitPicker.openMulti(items,values,ids=>{onChange(ids);changed();},
      {title:'选择'+name,hint:'搜索名称、称号或本地 ID。'})),el('span',values.length+' 项')));
    for(const id of values){const c=known.get(String(id));const b=button((c?title(c):'失效引用：'+id)+' ×',()=>{
      onChange(values.filter(v=>v!==id));changed();},'bfv-chip');b.title=id;chips.append(b);}
    box.append(chips);return box;
  }
  function condition(box,object,key='target',name='匹配单位',onChange=mark) {
    const host=el('div');box.append(host);
    const draw=()=>ConditionEditor.render(host,object,defs,onChange,draw,{key,title:name,
      fields:targetFields,allowRefs:false,hint:false,emptyText:'所有单位'});
    draw();
  }
  function keywordForm(k,onChange=mark){
    const box=el('div');box.className='bfv-grid';
    box.append(choice('词条',k.id,keywordOptions(),v=>{k.id=v;delete k.parameterRef;delete k.parameterRefs;onChange();render();}),
      field('词条数值',k.value,v=>{if(v==null)delete k.value;else k.value=v;onChange();},'number'));
    const param=el('div');param.className='field bfv-wide';param.append(el('span','词条参数'),
      EditorOptions.keywordParameterControl(k,defs,onChange));box.append(param);return box;
  }
  function problems(){
    if(!pkg)return [];
    const issues=BattleForceV2.validatePackage(pkg).map(i=>i.path+'：'+i.message);
    for(const [id,bf] of Object.entries(pkg.battleForces).filter(([,b])=>b.engineVersion===2)){
      if(!bf.name?.trim()||!bf.nameZh?.trim())issues.push(id+'：请填写中英文部队名称');
      if(!defs.factions.some(f=>f.id===bf.v2?.parentFactionId))issues.push(id+'：请选择所属势力');
      for(const [mode,m] of Object.entries(bf.modes||{})){
        const seen=new Set();for(const q of m.rankQuotas||[]){
          if(seen.has(q.rankId)||!defs.ranks.some(r=>r.id===q.rankId)||!Number.isSafeInteger(q.min)||!Number.isSafeInteger(q.max)||q.min<0||q.max<q.min)
            issues.push(id+' / '+mode+'：军阶配额重复或数量无效');seen.add(q.rankId);
        }
        for(const c of m.combined||[])if(!c.tiers?.length||new Set(c.tiers).size!==c.tiers.length||!Number.isSafeInteger(c.maximum)||c.maximum<0)
          issues.push(id+' / '+mode+'：组合军阶上限无效');
      }
      for(const scope of [bf.v2?.common,...(bf.v2?.ruleGroups||[])].filter(Boolean)){
        for(const [field,key,source] of [['unitGrants','unitId',catalog.units],['upgradeGrants','upgradeId',catalog.upgrades],['unitLimits','unitId',catalog.units]])
          for(const item of scope[field]||[])if(!source[item[key]])issues.push(id+'：卡牌不存在 '+item[key]);
        for(const key of scope.uniqueUpgradeIds||[])if(!catalog.upgrades[key])issues.push(id+'：独特升级不存在 '+key);
        for(const mod of scope.modifiers||[])if(mod.card==='upgrade'&&!catalog.upgrades[mod.upgradeId])issues.push(id+'：升级不存在 '+mod.upgradeId);
      }
    }
    return [...new Set(issues)];
  }
  function validate(){const issues=problems(),box=$('#config-issues');box.replaceChildren();
    if(issues.length){box.append(el('strong','配置待修正 · '+issues.length));for(const text of issues){const p=el('p',text);p.className='bfv-message bfv-error';box.append(p);}}
    return issues;
  }
  function renderList(){const box=$('#force-list');box.replaceChildren();
    for(const [id,bf] of Object.entries(pkg.battleForces).filter(([,v])=>v.engineVersion===2)){
      const b=button(bf.nameZh||bf.name,()=>{selected=id;groupId=null;preview=null;history.replaceState(null,'','#'+id);render();});
      b.dataset.forceId=id;b.setAttribute('aria-pressed',String(id===selected));b.append(el('small',bf.name));box.append(b);
    }
  }
  function base(box,bf){
    box.append(grid(field('部队中文名称',bf.nameZh,v=>bf.nameZh=v),field('部队英文名称',bf.name,v=>bf.name=v),
      choice('所属势力',bf.v2.parentFactionId,table('factions'),v=>{bf.v2.parentFactionId=v;bf.parentFaction=(defs.armies.find(f=>f.id===v)||defs.factions.find(f=>f.id===v))?.name.en;}),
      choice('开放状态',bf.status,[option('draft','草案 · 写表器不可选'),option('preview','测试开放'),option('active','正式开放')],v=>bf.status=v)),stableId(selected));
    for(const [mode,name] of [['standard','标准'],['recon','侦察']]){
      const fs=fold(name+'军阶配额',true),m=bf.modes?.[mode]||{rankQuotas:[],combined:[]};
      const set=()=>{((bf.modes||={})[mode]=m);};
      const t=el('table');t.className='bfv-table';const head=el('tr');for(const n of ['军阶','最少','最多',''])head.append(el('th',n));t.append(head);
      (m.rankQuotas||[]).forEach((q,i)=>{const tr=el('tr');const name=el('td'),rn=el('span');rn.className='rank-name';
        const rank=defs.ranks.find(r=>r.id===q.rankId);const icon=RuleIcons.icon({1:'rank-commander',6:'rank-operative',2:'rank-corps',3:'rank-special-forces',4:'rank-support',5:'rank-heavy',7:'rank-flier'}[q.rankId]);
        if(icon)rn.append(icon);rn.append(document.createTextNode(label(rank)||String(q.rankId)));name.append(rn);tr.append(name);
        for(const [k,l] of [['min','最少'],['max','最多']]){const cell=el('td');cell.append(field(name.textContent+l,q[k],v=>{q[k]=v;set();},'number'));tr.append(cell);}
        const end=el('td');end.append(button('删除',()=>{set();remove(m.rankQuotas,i);}));tr.append(end);t.append(tr);});
      fs.append(t);const missing=rankOptions().filter(r=>!m.rankQuotas?.some(q=>q.rankId===r.value));
      if(missing.length){let rank=missing[0].value;fs.append(row(choice('新增军阶',rank,missing,v=>rank=v),button('＋ 军阶',()=>{
        set();(m.rankQuotas||=[]).push({rankId:rank,min:0,max:2});changed();})));}
      (m.combined||[]).forEach((c,i)=>{const line=el('div');line.className='bfv-item';line.append(checks('合计军阶',rankOptions(),c.tiers,v=>c.tiers=v),
        row(field('合计上限',c.maximum,v=>{c.maximum=v;set();},'number'),button('删除组合',()=>{set();remove(m.combined,i);})));fs.append(line);});
      fs.append(button('＋ 组合上限',()=>{set();(m.combined||=[]).push({tiers:[1,6],maximum:2});changed();}));box.append(fs);
    }
    const text=fold('数量说明与待补资料');text.append(lines('单位数量说明',bf.unitLimitsText,v=>bf.unitLimitsText=v),lines('待补规则／资料',bf.unparsedRules,v=>bf.unparsedRules=v));box.append(text);
  }
  function checks(name,items,values,update){const box=el('fieldset');box.className='restriction-section';box.append(el('legend',name));
    const rows=[...items];for(const v of values||[])if(!rows.some(o=>o.value===v))rows.push(option(v,'失效引用：'+v));
    const chips=el('div');chips.className='bfv-chips';
    for(const item of rows){const b=button(item.label,()=>{const next=(values||[]).includes(item.value)?values.filter(v=>v!==item.value):[...(values||[]),item.value];update(next);changed();},'bfv-chip');
      b.setAttribute('aria-pressed',String((values||[]).includes(item.value)));chips.append(b);}box.append(chips);return box;
  }
  function textScope(box,scope){
    const fs=fold('规则文本',true),bf=force();
    const set=(key,rows)=>{scope[key]=rows;if(scope===bf.v2.common)bf[key]=[...rows];};
    fs.append(grid(lines('中文规则',scope.textRulesZh ?? (scope===bf.v2.common?bf.textRulesZh:[]),v=>set('textRulesZh',v)),
      lines('英文原文',scope.textRules ?? (scope===bf.v2.common?bf.textRules:[]),v=>set('textRules',v))));box.append(fs);
  }
  function scopeForm(box,scope){
    textScope(box,scope);
    const grants=fold('单位与升级许可',true);
    grants.append(valuesPicker('许可单位',localUnits(),(scope.unitGrants||[]).map(x=>x.unitId),v=>scope.unitGrants=v.map(unitId=>({unitId}))),
      valuesPicker('额外许可升级',localUpgrades(),(scope.upgradeGrants||[]).map(x=>x.upgradeId),v=>scope.upgradeGrants=v.map(upgradeId=>({upgradeId}))),
      check('限制独特升级清单',Object.hasOwn(scope,'uniqueUpgradeIds'),v=>{if(v)scope.uniqueUpgradeIds=[];else delete scope.uniqueUpgradeIds;render();}));
    if(Object.hasOwn(scope,'uniqueUpgradeIds'))grants.append(valuesPicker('许可独特升级',localUpgrades(),scope.uniqueUpgradeIds,v=>scope.uniqueUpgradeIds=v));box.append(grants);
    const limits=fold('数量限制与军阶调整');
    (scope.unitLimits||[]).forEach((q,i)=>{const line=grid(choice('单位',q.unitId,table('units'),v=>q.unitId=v),
      row(field('最低数量',q.min??0,v=>q.min=v,'number'),field('最高数量',q.max,v=>q.max=v,'number'),button('删除',()=>remove(scope.unitLimits,i))));line.classList.add('bfv-item');limits.append(line);});
    limits.append(button('＋ 单位数量限制',()=>{(scope.unitLimits||=[]).push({unitId:scope.unitGrants?.[0]?.unitId || localUnits()[0].id,min:0,max:1});changed();}));
    (scope.rankModifiers||[]).forEach((m,i)=>{const line=grid(choice('军阶',m.rankId,rankOptions(),v=>m.rankId=v),
      choice('操作',m.op,[option('set','设为'),option('add','增加')],v=>m.op=v),
      field('最低数量调整（空为不改）',m.min,v=>{if(v==null)delete m.min;else m.min=v;},'number'),
      field('最高数量调整（空为不改）',m.max,v=>{if(v==null)delete m.max;else m.max=v;},'number'),button('删除调整',()=>remove(scope.rankModifiers,i)));line.classList.add('bfv-item');limits.append(line);});
    limits.append(button('＋ 军阶配额调整',()=>{(scope.rankModifiers||=[]).push({rankId:2,op:'add',max:1});changed();}));box.append(limits);
    const mods=fold('卡牌属性修改 · '+(scope.modifiers||[]).length,true);
    (scope.modifiers||[]).forEach((m,i)=>modifier(mods,scope,m,i));
    mods.append(button('＋ 属性修改',()=>{(scope.modifiers||=[]).push({id:uniqueId('effect'),card:'unit',field:'points',op:'add',value:0});changed();}));box.append(mods);
    const entries=fold('局部词条 · '+(scope.entries||[]).length,true);
    (scope.entries||[]).forEach((entry,i)=>entries.append(row(el('strong',label(entry)),el('span',entry.summary),
      button('编辑词条',()=>entryDialog(scope,entry)),button('删除词条',()=>remove(scope.entries,i)))));
    entries.append(button('＋ 局部词条',()=>entryDialog(scope)));box.append(entries);
  }
  function validProperties(m){return Object.entries(properties).filter(([key])=>key===m.field|| (m.card==='unit'?!['rules.unique','rules.unavailableWith','rules.unavailableWithIds'].includes(key):
    ['points','rules.limit','rules.unique','keywords','weapons.keywords','rules.unavailableWith','rules.unavailableWithIds'].includes(key))).map(([value,label])=>option(value,label));}
  function operations(field){if(['factionId','affiliationIds','rules.unique','rules.unavailableWith','rules.unavailableWithIds'].includes(field))return ['set'];
    if(field==='upgradeSlots')return ['add','remove'];if(field.includes('keywords'))return ['set','add','remove'];return ['set','add'];}
  function resetProperty(m,field){m.field=field;m.op=operations(field)[0];delete m.count;delete m.weaponFilter;
    if(m.card==='upgrade'&&field!=='points')delete m.target;
    m.value=field.includes('keywords')?{id:defs.keywords[0].id}:field==='rules.unique'?false:
      ['affiliationIds','rules.unavailableWith','rules.unavailableWithIds'].includes(field)?[]:
      field==='rankId'?2:field==='factionId'?force().v2.parentFactionId:field==='upgradeSlots'?1:0;}
  function modifier(box,scope,m,index){
    const fs=fold((m.card==='upgrade'?label(catalog.upgrades[m.upgradeId])||'升级卡':'单位')+' · '+(properties[m.field]||m.field)+' · '+({set:'设为',add:'增加',remove:'移除'}[m.op]||m.op));
    fs.dataset.modifierId=m.id;fs.append(stableId(m.id),grid(
      choice('修改对象',m.card,[option('unit','单位'),option('upgrade','升级卡')],v=>{m.card=v;delete m.when;delete m.target;
        if(v==='upgrade')m.upgradeId=localUpgrades()[0].id;else delete m.upgradeId;resetProperty(m,'points');changed();}),
      choice('修改属性',m.field,validProperties(m),v=>{resetProperty(m,v);changed();})));
    if(m.card==='upgrade')fs.append(choice('升级卡',m.upgradeId,table('localUpgrades'),v=>m.upgradeId=v));
    if(m.card==='unit'||m.field==='points')condition(fs,m,'target',m.card==='upgrade'?'宿主条件':'目标单位');
    fs.append(choice('修改方式',m.op,operations(m.field).map(v=>option(v,{set:'设为',add:'增加',remove:'移除'}[v])),v=>{m.op=v;changed();}));
    if(m.field.includes('keywords'))fs.append(keywordForm(m.value));
    else if(m.field==='rankId')fs.append(choice('军阶值',m.value,rankOptions(),v=>m.value=v));
    else if(m.field==='factionId')fs.append(choice('势力值',m.value,table('factions'),v=>m.value=v));
    else if(m.field==='affiliationIds')fs.append(checks('组织值',table('affiliations'),m.value,v=>m.value=v));
    else if(m.field==='upgradeSlots'){
      fs.append(choice('槽位类别',m.value,table('upgradeSlots'),v=>m.value=v));
      if(m.op==='add')fs.append(field('新增数量',m.count??1,v=>m.count=v,'number'));
    }else if(m.field==='rules.unique')fs.append(check('独特',m.value,v=>m.value=v));
    else if(m.field==='rules.unavailableWithIds'&&m.card==='upgrade'){
      // Keep existing typed external references intact. New choices store local
      // IDs; the shared name index resolves them at validation time.
      fs.append(valuesPicker('互斥升级',localUpgrades(),m.value.filter(v=>typeof v==='string'),v=>m.value=[...m.value.filter(x=>typeof x!=='string'),...v]));
      m.value.filter(v=>typeof v!=='string').forEach(v=>fs.append(row(el('span',JSON.stringify(v)),button('移除旧引用',()=>{m.value=m.value.filter(x=>x!==v);changed();}))));
    }else if(m.field.startsWith('rules.unavailableWith')){
      fs.append(el('p',m.value.length?JSON.stringify(m.value):'无互斥引用'),button('清空旧互斥引用',()=>{m.value=[];changed();}));
    }else fs.append(field(m.field==='rules.limit'&&m.op==='set'?'数值（空为不限）':'数值',m.value,v=>m.value=v,'number'));
    if(m.card==='unit')fs.append(choice('装备触发',m.when?.equippedSlot??null,table('semanticSlots'),v=>{if(v)m.when={equippedSlot:v};else delete m.when;},{nullable:true}));
    if(m.field==='weapons.keywords'){
      fs.append(choice('武器范围',m.weaponFilter?.range||null,[option('melee','近战可用武器'),option('ranged','远程武器')],v=>{
        m.weaponFilter||={};if(v)m.weaponFilter.range=v;else delete m.weaponFilter.range;},{nullable:true}));
      for(const [key,name] of [['hasKeyword','必须带有词条'],['notKeyword','不能带有词条']]){
        fs.append(check(name,!!m.weaponFilter?.[key],v=>{m.weaponFilter||={};if(v)m.weaponFilter[key]={id:defs.keywords[0].id};else delete m.weaponFilter[key];changed();}));
        if(m.weaponFilter?.[key])fs.append(keywordForm(m.weaponFilter[key]));
      }
    }
    fs.append(row(button('复制修改',()=>{const c=copy(m);c.id=uniqueId('effect');scope.modifiers.splice(index+1,0,c);changed();}),button('删除修改',()=>remove(scope.modifiers,index))));box.append(fs);
  }
  function entryAssignment(box,entry,onChange){
    const emptyGroup=(target,key)=>target && Object.keys(target).length===1 && Array.isArray(target[key]) && target[key].length===0;
    const draw=()=>{
      box.replaceChildren();
      // Keep the existing expression format: empty OR matches nothing; empty
      // AND explicitly matches everyone. Absent targets retain legacy behavior.
      const mode=emptyGroup(entry.target,'any')?'manual':!entry.target||emptyGroup(entry.target,'all')?'all':'condition';
      const field=el('div');field.className='field';field.append(el('span','分配给单位'),EditorOptions.control(mode,
        [option('manual','不自动分配'),option('all','所有单位'),option('condition','按条件分配')],value=>{
          entry.target=value==='manual'?{any:[]}:value==='all'?{all:[]}:
            {all:[{field:'unit.unitCategoryId',op:'eq',value:'trooper'}]};
          onChange();draw();
        },{label:'分配给单位',nullable:false,preserveType:false}));box.append(field);
      if(mode==='condition'){
        const host=el('div');box.append(host);
        ConditionEditor.render(host,entry,defs,()=>{
          // Deleting the condition must not silently broaden it to all units.
          if(!entry.target||emptyGroup(entry.target,'all'))entry.target={any:[]};
          onChange();
        },draw,{key:'target',title:'分配条件',fields:targetFields,allowRefs:false,hint:false});
      }
    };
    draw();
  }
  function entryDialog(scope,current){
    const entry=current?copy(current):{id:uniqueId('entry'),name:{zh:'新词条',en:'New Entry'},summary:'',full:'',fullEn:'',timing:['global'],target:{any:[]}};
    const dialog=el('dialog');dialog.className='bfv-dialog';dialog.setAttribute('aria-label','局部词条编辑');
    const markDialog=()=>{dialogDirty=true;};
    const fieldLocal=(name,val,set,type='text')=>EditorCommon.field(name,val,v=>{set(v);markDialog();},type);
    dialog.append(el('h2','局部词条'),stableId(entry.id),grid(fieldLocal('词条中文名称',entry.name.zh,v=>entry.name.zh=v),fieldLocal('词条英文名称',entry.name.en,v=>entry.name.en=v)),
      fieldLocal('简写规则',entry.summary,v=>entry.summary=v,'textarea'),fieldLocal('完整规则',entry.full,v=>entry.full=v,'textarea'),fieldLocal('英文规则',entry.fullEn||'',v=>entry.fullEn=v,'textarea'));
    const timing=el('div');timing.className='bfv-chips';
    for(const [id,name] of Object.entries({...Object.fromEntries((entry.timing||[]).map(t=>[t,t])),...timings})){
      const b=button(name,()=>{entry.timing=entry.timing.includes(id)?entry.timing.filter(t=>t!==id):[...entry.timing,id];b.setAttribute('aria-pressed',String(entry.timing.includes(id)));markDialog();},'bfv-chip');
      b.setAttribute('aria-pressed',String(entry.timing.includes(id)));timing.append(b);
    }
    dialog.append(timing);const assignment=el('div');dialog.append(assignment);entryAssignment(assignment,entry,markDialog);
    const error=el('p');error.className='bfv-error';dialog.append(error);
    dialog.append(row(button('应用词条',()=>{const test=copy(force());const s=scope===force().v2.common?test.v2.common:test.v2.ruleGroups.find(g=>g.id===scope.id);
      s.entries=(s.entries||[]).filter(e=>e.id!==entry.id);s.entries.push(entry);
      const issues=BattleForceV2.validateDefinition(test).filter(i=>i.path.includes('.entries.'));if(issues.length){error.textContent=issues.map(i=>i.message).join('；');return;}
      if(current)scope.entries[scope.entries.indexOf(current)]=entry;else(scope.entries||=[]).push(entry);dialogDirty=false;dialog.close();changed();},'primary'),button('取消',()=>{if(!dialogDirty||confirm('放弃词条窗口中的修改？'))dialog.close();})));
    dialog.addEventListener('cancel',e=>{if(dialogDirty&&!confirm('放弃词条窗口中的修改？'))e.preventDefault();});
    dialog.addEventListener('close',()=>{dialogDirty=false;dialog.remove();});document.body.append(dialog);dialog.showModal();
  }
  function groups(box,bf){
    const list=el('div');list.className='bfv-group-nav';const pane=el('div');pane.style.minWidth='0';
    if(!bf.v2.ruleGroups.some(g=>g.id===groupId))groupId=bf.v2.ruleGroups[0]?.id;
    for(const g of bf.v2.ruleGroups){const b=button(label(g),()=>{groupId=g.id;render();});b.setAttribute('aria-pressed',String(g.id===groupId));b.dataset.groupId=g.id;list.append(b);}
    list.append(button('＋ 规则组',()=>{const g={id:uniqueId('group'),name:{zh:'新规则组',en:'New Rule Group'}};bf.v2.ruleGroups.push(g);groupId=g.id;changed();}));
    const selectedGroup=bf.v2.ruleGroups.find(g=>g.id===groupId);
    if(selectedGroup){const g=selectedGroup;pane.append(namedFields(g),stableId(g.id),row(
      button('复制规则组',()=>{const c=copy(g);c.id=uniqueId('group');c.name.zh+=' 副本';c.name.en+=' Copy';
        for(const e of [...(c.modifiers||[]),...(c.entries||[])])e.id=uniqueId('effect');bf.v2.ruleGroups.push(c);groupId=c.id;changed();}),
      button('删除规则组',()=>{const refs=bf.v2.selectionSchemes.flatMap(s=>s.groups).filter(s=>s.ruleGroupIds.includes(g.id));
        if(!confirm('删除「'+label(g)+'」'+(refs.length?'并从 '+refs.length+' 个选择组移除其引用':'')+'？'))return;
        refs.forEach(s=>s.ruleGroupIds=s.ruleGroupIds.filter(id=>id!==g.id));bf.v2.ruleGroups=bf.v2.ruleGroups.filter(r=>r!==g);groupId=null;changed();})));
      scopeForm(pane,g);
    }else pane.append(el('p','添加规则组后，可配置其许可、属性修改和局部词条。'));
    const layout=el('div');layout.className='bfv-group-layout';layout.append(list,pane);box.append(layout);
  }
  function schemes(box,bf){
    bf.v2.selectionSchemes.forEach((s,i)=>{const fs=fold(label(s),true);fs.dataset.schemeId=s.id;fs.append(namedFields(s),stableId(s.id));
      s.groups.forEach((g,j)=>{const entry=el('div');entry.className='bfv-item';entry.dataset.selectionId=g.id;entry.append(namedFields(g),stableId(g.id),
        grid(field('最少选择',g.min,v=>g.min=v,'number'),field('最多选择',g.max,v=>g.max=v,'number')),
        checks('候选规则组',bf.v2.ruleGroups.map(r=>option(r.id,label(r))),g.ruleGroupIds,v=>g.ruleGroupIds=v),
        button('删除选择组',()=>remove(s.groups,j)));fs.append(entry);});
      fs.append(row(button('＋ 选择组',()=>{s.groups.push({id:uniqueId('selection'),name:{zh:'新选择组',en:'New Selection'},min:0,max:0,ruleGroupIds:[]});changed();}),
        button('复制方案',()=>{const c=copy(s);c.id=uniqueId('scheme');c.name.zh+=' 副本';c.name.en+=' Copy';bf.v2.selectionSchemes.push(c);changed();}),
        button('删除方案',()=>{if(confirm('删除选择方案「'+label(s)+'」？'))remove(bf.v2.selectionSchemes,i);})));box.append(fs);});
    box.append(button('＋ 选择方案',()=>{bf.v2.selectionSchemes.push({id:uniqueId('scheme'),name:{zh:'新选择方案',en:'New Scheme'},groups:[]});changed();}));
  }
  function previewForm(box,bf){
    preview||={mode:'standard',schemeId:bf.v2.selectionSchemes[0]?.id||null,groups:{},unitId:null,rankId:null,upgrades:[]};
    const p=preview;
    const control=(name,val,items,set)=>{const wrap=el('div');wrap.className='field';wrap.append(el('span',name),EditorOptions.control(val,items,v=>{set(v);render();},{label:name,nullable:false,preserveType:false}));return wrap;};
    box.append(control('测试模式',p.mode,[option('standard','标准 · 1000'),option('recon','侦察 · 600')],v=>p.mode=v));
    if(bf.v2.selectionSchemes.length){box.append(control('测试选择方案',p.schemeId,bf.v2.selectionSchemes.map(s=>option(s.id,label(s))),v=>{p.schemeId=v;p.groups={};p.upgrades=[];}));
      const s=bf.v2.selectionSchemes.find(s=>s.id===p.schemeId);for(const g of s?.groups||[]){const line=el('div');line.className='bfv-chips';line.append(el('strong',label(g)+' '+g.min+'–'+g.max));
        for(const id of g.ruleGroupIds){const r=bf.v2.ruleGroups.find(r=>r.id===id),b=button(label(r)||id,()=>{const a=p.groups[g.id]||[];
          p.groups[g.id]=a.includes(id)?a.filter(v=>v!==id):[...a,id];p.upgrades=[];render();},'bfv-chip');b.setAttribute('aria-pressed',String((p.groups[g.id]||[]).includes(id)));line.append(b);}box.append(line);}}
    const errors=problems();if(errors.length){box.append(el('p','先修正配置，再预览效果。'));return;}
    const draftPkg=copy(pkg);draftPkg.battleForces[selected].status='preview';
    const source={...catalog,defs,pkg:draftPkg};const army={armyId:Number(selected),mode:p.mode,pointsLimit:p.mode==='recon'?600:1000,units:[],commandIds:[],options:[]};
    if(p.schemeId)army.battleForceSelection={battleForceId:Number(selected),schemeId:p.schemeId,groups:copy(p.groups)};
    let data=RulesCore.resolveArmyData(army,source);
    const allowed=Object.values(data.units).filter(u=>u._v2Allowed);
    if(!data.units[p.unitId])p.unitId=allowed[0]?.id;
    box.append(control('测试单位',p.unitId,[...allowed,...Object.values(data.units).filter(u=>!u._v2Allowed&&u.usage!=='counterpart'&&!u.isCounterpart)]
      .map(u=>option(u.id,(u._v2Allowed?'':'[未许可] ')+title(u))),v=>{p.unitId=v;p.rankId=null;p.upgrades=[];}));
    if(!data.units[p.unitId])return;
    const ranks=data.units[p.unitId]._v2Ranks||[data.units[p.unitId].rankId];if(!ranks.includes(p.rankId))p.rankId=ranks[0];
    box.append(control('加入军阶',p.rankId,rankOptions().filter(r=>ranks.includes(r.value)),v=>{p.rankId=v;p.upgrades=[];}));
    army.units=[{instanceId:'editor-preview',unitId:p.unitId,rankId:p.rankId,upgrades:copy(p.upgrades)}];data=RulesCore.resolveArmyData(army,source);
    const unit=RulesCore.unitFor(army.units[0],army,data),original=catalog.units[p.unitId];
    const slots=RulesCore.slotListFor(data.pkg,unit,army.units[0],data.upgrades,army.armyId);
    const equipment=fold('测试装备',true);
    slots.forEach((slot,index)=>{const selected=p.upgrades.find(c=>c.slotIndex===index);const name=label({name:pkg.slots.find(s=>s.id===slot.key)?.name})||slot.key;
      const cards=Object.values(data.upgrades).filter(c=>RulesCore.accessKeys(c,data.pkg,data.pkg.upgradeRules?.[String(c.upstream?.id)]||{}).includes(slot.key)&&
        RulesCore.upgradeEligibility(c,unit,army,data,army.units[0].upgrades.filter(x=>x.slotIndex!==index).map(x=>data.upgrades[x.upgradeId])).ok);
      equipment.append(control(name+' '+(index+1),selected?.upgradeId||'',[option('','不装备'),...cards.map(c=>option(c.id,label(c)+' · '+RulesCore.upgradePoints(c,unit,army,data)+'分'))],v=>{
        if(!v){if(selected)BuilderModel.removeUpgrade(army,data,'editor-preview',selected.instanceId);p.upgrades=army.units[0].upgrades;}
        else{const result=BuilderModel.equip(army,data,{unitInstanceId:'editor-preview',slotIndex:index,slotKey:slot.key},v,false,()=>uniqueId('preview'));
          if(!result.ok){status(result.reason,true);return;}p.upgrades=result.draft.units[0].upgrades;}}));});box.append(equipment);
    const t=el('table');t.className='bfv-table';const header=el('tr');for(const c of ['属性','原卡','当前规则'])header.append(el('th',c));t.append(header);
    const nameBy=(items,id)=>label(items.find(i=>i.id===id))||String(id);
    const kw=k=>[k._entry?.name?.zh||nameBy(defs.keywords,k.id),k.value,k.parameter||k.parameterRefs?.map(r=>r.id).join(' / ')].filter(v=>v!=null&&v!=='').join(' ');
    const present=u=>[u.points+' 分',nameBy(defs.ranks,u.rankId),nameBy(defs.factions,u.factionId),(u.affiliationIds||[]).map(id=>nameBy(defs.affiliations,id)).join('、')||'—',
      (u.keywords||[]).map(kw).join('、')||'—'];
    const before=present(original),after=present(unit);['费用','军阶','势力','组织','词条'].forEach((name,i)=>{const tr=el('tr');tr.append(el('th',name),el('td',before[i]),el('td',after[i]));t.append(tr);});box.append(t);
    const weapons=fold('有效武器与局部词条',true);
    const weaponRows=[...(unit.weapons||[]),...army.units[0].upgrades.flatMap(ch=>BattleForceRuntime.upgradeFor(data.upgrades[ch.upgradeId],unit,data)?.weapons||[])];
    for(const w of weaponRows)weapons.append(el('p',label(w)+' · '+(w.keywords||[]).map(kw).join('、')));
    for(const k of unit.keywords||[])if(k._entry){const item=fold(label(k._entry));const text=el('p',k._entry.full);text.className='bfv-preview-text';item.append(text);weapons.append(item);}box.append(weapons);
    const report=RulesCore.validateArmy(army,source);box.append(el('h3','测试军表 · '+report.effectivePoints+' 分'));
    for(const issue of report.issues.filter(i=>i.code!=='coverage_note')){const p=el('p',issue.message);p.className='bfv-message'+(issue.status==='invalid'?' bfv-error':'');box.append(p);}
  }
  function render(){if(!pkg)return;const box=$('#content');
    if(renderedKey)folds.set(renderedKey,new Map([...box.querySelectorAll('details')].map(n=>[n.dataset.foldKey,n.open])));
    renderedKey=[selected,section,groupId||''].join('/');
    renderList();const bf=force();box.replaceChildren();
    if(!bf){box.append(el('p','没有 V2 战斗部队。'));return;}
    $('#title').textContent=bf.nameZh||bf.name;
    for(const b of document.querySelectorAll('[data-section]'))b.setAttribute('aria-pressed',String(b.dataset.section===section));
    validate();try{if(section==='base')base(box,bf);else if(section==='common')scopeForm(box,bf.v2.common);
      else if(section==='groups')groups(box,bf);else if(section==='schemes')schemes(box,bf);else previewForm(box,bf);
    }catch(e){status('无法绘制配置：'+e.message,true);box.append(el('p','原数据仍保留，可导出草稿检查。'));}
    const seen=new Map(),saved=folds.get(renderedKey);
    for(const n of box.querySelectorAll('details')){const name=n.dataset.modifierId||n.dataset.schemeId||n.querySelector(':scope > summary').textContent.replace(/ · \d+$/,'');
      const count=seen.get(name)||0;seen.set(name,count+1);n.dataset.foldKey=name+':'+count;if(saved?.has(n.dataset.foldKey))n.open=saved.get(n.dataset.foldKey);}
  }
  async function catalogs(){const loaded=await EditorOptions.load(true);defs=loaded.defs;
    catalog={units:Object.fromEntries(loaded.units.units.map(u=>[u.id,u])),upgrades:UpgradeFaces.index(loaded.upgrades.cards)};
    catalog.nameIndex=RulesCore.buildNameIndex(catalog.upgrades,defs);return loaded.pkg;
  }
  async function reload(){if(dirty&&!confirm('放弃尚未保存的规则修改？'))return;
    try{const fresh=await catalogs();let response;
      try{response=await api('/api/slot-rules');}catch(e){status('当前为只读服务，可编辑并导出草稿；保存需要本地 Python 服务。',true);}
      pkg=response?.rules||fresh;revision=response?.revision;definitionsRevision=response?.definitionsRevision;
      selected=pkg.battleForces[location.hash.slice(1)]?.engineVersion===2?location.hash.slice(1):
        pkg.battleForces[selected]?.engineVersion===2?selected:Object.keys(pkg.battleForces).find(id=>pkg.battleForces[id].engineVersion===2);
      dirty=false;preview=null;$('#dirty').textContent='';$('#save').disabled=!revision;$('#save-banner')?.remove();if(response)status('');render();
    }catch(e){status(e.message,true);}
  }
  async function save(){if(busy||!revision)return;const issues=validate();if(issues.length){status('请先修正配置中的 '+issues.length+' 项问题。',true);return;}
    busy=true;$('#save').disabled=true;$('.bfv-layout').inert=true;$('.tabs').inert=true;const sent=copy(pkg);
    try{const r=await api('/api/slot-rules/save',{rules:sent,revision,definitionsRevision});pkg=r.rules||sent;revision=r.revision;definitionsRevision=r.definitionsRevision;
      if(r.definitions){const fields=defs.ruleFields;defs=r.definitions;defs.ruleFields=fields;defs.slotRules=pkg;defs.semanticSlots=pkg.slots||[];
        Object.defineProperty(defs,'editorOptions',{value:EditorOptions.create(defs,Object.values(catalog.units),Object.values(catalog.upgrades),pkg,fields),configurable:true});}
      dirty=false;$('#dirty').textContent='已保存';$('#save-banner')?.remove();status('已保存');render();
    }catch(e){SaveUI.fail(e,reload);}finally{busy=false;$('#save').disabled=!revision;$('.bfv-layout').inert=false;$('.tabs').inert=false;}
  }
  $('#save').onclick=save;$('#reload').onclick=()=>{if(!busy)reload();};
  $('#export').onclick=()=>{if(pkg)EditorCommon.download(pkg,'battleforce-rules-draft.json');};
  $('#refresh-catalogs').onclick=async()=>{if(busy)return;try{await catalogs();preview=null;render();status('卡牌与枚举选项已刷新，规则草稿已保留。');}catch(e){status(e.message,true);}};
  for(const b of document.querySelectorAll('[data-section]'))b.onclick=()=>{section=b.dataset.section;status('');render();};
  addEventListener('beforeunload',e=>{if(dirty||dialogDirty){e.preventDefault();e.returnValue='';}});
  reload();
})();
