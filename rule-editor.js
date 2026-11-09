/* Rule editor for card `rules` blocks, using the shared data dictionary (defs).
 * Renders the fields the rule engine actually reads; edits declarations only. */
window.RuleEditor=(()=>{
  const E=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e};
  const labels={
    slotTypes:'可匹配槽位', availableIn:'允许的单位',
    unavailableWith:'互斥卡牌（旧字段，与互斥卡牌 ID 重复）', factions:'军队准入（含战斗部队）',
    requiredProperties:'适用条件（外层 OR / 内层 AND）', requiredDivisions:'光明/黑暗限定', unique:'整军唯一', locallyUnique:'同一单位不重复',
    limit:'数量上限', unlimited:'允许重复单位', addProperties:'增加属性', replaceProperties:'替换属性',
    modifiedPointsWith:'条件费用修正', tierCounting:'军阶计数修正', requiredChildren:'强制附带卡',
    quantityLimitedBy:'数量受母单位限制', chooseOneKey:'互斥选择组', poolBonuses:'雇佣兵池奖励',
    property:'比较属性',
    value:'目标值', tiers:'军阶', whenArmyIncludes:'需要军队包含', perSourceUnit:'每个来源提供名额',
    ignoreMinimum:'不计入最低', ignoreMaximum:'不计入最高', waivesMinimum:'免除最低', exempt:'条件豁免',
    ignoreMaximumWhenArmyIncludes:'存在指定单位时豁免上限', id:'引用 ID', elementPropertyName:'对象类别',
    upgradeIndex:'槽位索引', modifier:'点数变化', unit:'母单位', ratio:'数量比例', in:'限定对象',
    requiresTier:'军阶要求', replaceTier:'替换军阶', unavailableWithIds:'互斥卡牌 ID', rank:'军阶',
    slotGrants:'槽位授予（equipped=携带生效 / unitQualifies=单位满足条件生效）', trigger:'触发方式', type:'效果类型', slot:'槽位', when:'触发条件', field:'字段', op:'操作符'
  };
  const groups=[
    ['适用资格',['slotTypes','requiredProperties','requiredDivisions','availableIn','factions']],
    ['唯一性与互斥',['unique','unlimited','limit','locallyUnique','chooseOneKey','unavailableWithIds']],
    ['依赖与数量',['requiredChildren','quantityLimitedBy']],
    ['效果与费用',['addProperties','replaceProperties','modifiedPointsWith']],
    ['军阶和佣兵池',['tierCounting','poolBonuses']],
    ['军阶要求',['requiresTier']],
    ['槽位授予',['slotGrants']]
  ];
  const defaults={
    slotTypes:[2], availableIn:[], factions:[],
    requiredProperties:[[{property:'unitType',value:1}]], requiredDivisions:['Light'], unique:false, locallyUnique:false,
    unlimited:true, limit:1, chooseOneKey:'leader', addProperties:[], replaceProperties:[],
    modifiedPointsWith:[], tierCounting:{ignoreMinimum:false}, requiredChildren:[], quantityLimitedBy:[],
    poolBonuses:[], slotGrants:[]
  };
  let props=['unitType','faction','affiliation','keywords'];
  let atomTables={unitType:'unitTypes',faction:'factions',affiliation:'affiliations',keywords:'keywords'};
  let propLabels={unitType:'单位类型',faction:'阵营',affiliation:'组织',keywords:'关键词'};
  let pickerStyleReady=false;
  function ensurePickerStyle(){
    if(pickerStyleReady||document.getElementById('unit-picker-style')){pickerStyleReady=true;return}
    const style=document.createElement('style');style.id='unit-picker-style';
    style.textContent='.unit-picker-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:1000}'+
      '.unit-picker{background:#fff;border-radius:12px;width:min(440px,92vw);max-height:82vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.35)}'+
      '.unit-picker-head{display:flex;gap:8px;padding:12px;border-bottom:1px solid #e5e7eb;align-items:center}'+
      '.unit-picker-head strong{white-space:nowrap}'+
      '.unit-picker-head input{flex:1;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px}'+
      '.unit-picker-close{border:0;background:transparent;font-size:20px;cursor:pointer;padding:4px 8px}'+
      '.unit-picker-list{overflow:auto;padding:8px;display:flex;flex-direction:column;gap:4px}'+
      '.unit-picker-list .empty{padding:16px;color:#6b7280;text-align:center}'+
      '.unit-picker-item{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;cursor:pointer;text-align:left;font-size:14px}'+
      '.unit-picker-item:hover{background:#eef2ff;border-color:#c7d2fe}'+
      '.unit-picker-item.selected{background:#e0e7ff;border-color:#818cf8}'+
      '.unit-picker-item small{color:#6b7280}';
    document.head.append(style);pickerStyleReady=true;
  }
  function openSourceUnitPicker(defs,currentValue,onSelect){
    ensurePickerStyle();
    const items=(defs&&defs.sourceUnits)||[];
    const overlay=E('div');overlay.className='unit-picker-overlay';
    const dialog=E('div');dialog.className='unit-picker';
    const head=E('div');head.className='unit-picker-head';
    const input=E('input');input.placeholder='搜索 ID / 中文名 / 英文名';
    const close=E('button','×');close.type='button';close.className='unit-picker-close';close.setAttribute('aria-label','关闭');
    head.append(E('strong','选择单位'),input,close);
    const list=E('div');list.className='unit-picker-list';
    function draw(filter){
      list.replaceChildren();
      const f=(filter||'').trim().toLowerCase();
      const rows=items.filter(it=>{
        if(!f)return true;
        return String(it.id).toLowerCase().includes(f)||
          ((it.name&&it.name.zh)||'').toLowerCase().includes(f)||
          ((it.name&&it.name.en)||'').toLowerCase().includes(f);
      }).slice(0,200);
      if(!rows.length){const p=E('p','无匹配单位');p.className='empty';list.append(p);return}
      for(const it of rows){
        const b=E('button');b.type='button';b.className='unit-picker-item'+(String(it.id)===String(currentValue)?' selected':'');
        b.append(E('strong',(it.name&&(it.name.zh||it.name.en))||it.id),E('small',((it.name&&it.name.en)||'')+' · '+it.id));
        b.onclick=()=>{onSelect(String(it.id));closePicker()};
        list.append(b);
      }
    }
    function closePicker(){overlay.remove();document.removeEventListener('keydown',esc)}
    function esc(ev){if(ev.key==='Escape')closePicker()}
    document.addEventListener('keydown',esc);
    input.oninput=()=>draw(input.value);
    close.onclick=closePicker;
    overlay.onclick=ev=>{if(ev.target===overlay)closePicker()};
    dialog.append(head,list);overlay.append(dialog);document.body.append(overlay);
    draw('');
    setTimeout(()=>input.focus(),0);
  }

  function tableFor(key,path,parent){
    if(key==='value'&&parent.property)return atomTables[parent.property];
    if(key==='slotTypes'||path.includes('slotTypes'))return 'upgradeSlots';
    if(path[0]==='factions')return 'armies';
    if(path.includes('availableIn'))return 'sourceUnits';
    if(path.includes('requiredChildren')&&key==='id')return 'upgrades';
    if(path.includes('quantityLimitedBy')&&key==='unit')return 'sourceUnits';
    if(path.includes('unavailableWith')&&key==='id')return parent.propertyName==='units'?'sourceUnits':'upgrades';
    if(key==='tier'||key==='replaceTier'||path.includes('tiers')||path.includes('requiresTier'))return 'ranks';
    if(path.includes('poolBonuses'))return null;
    if(path.includes('modifiedPointsWith')&&(key==='id'||key==='in'))return 'sourceUnits';
    if(path.includes('whenArmyIncludes'))return 'sourceUnits';
    if(path.includes('slotGrants')&&key==='slot')return 'semanticSlots';
    return null;
  }

  function render(container,rules,defs,onchange,context={}){
    if(defs&&defs.ruleFields){
      props=Object.keys(defs.ruleFields.properties||{})||props;
      atomTables={};propLabels={};for(const [k,v]of Object.entries(defs.ruleFields.properties||{})){atomTables[k]=v.values;propLabels[k]=v.zh||k};
      for(const [k,v]of Object.entries(defs.ruleFields.fields||{}))labels[k]=v.zh||labels[k];
      for(const [k,v]of Object.entries(defs.ruleFields.nested||{}))labels[k]=v;
    }
    container.replaceChildren();
    const help=E('p',context.usage==='counterpart'?'伙伴用途：维护宿主资格、伙伴槽及费用来源；不会作为普通独立单位加入军表。':'这里维护机器可读限制。蓝色引用来自数据字典；未知结构保留并可编辑。声明已导入不代表完整合法性引擎已实现。');
    help.className='hint';container.append(help);
    const badge=E('div');badge.className='rule-overview';
    for(const [key,value]of Object.entries(rules||{})){const c=E('span',(labels[key]||key)+(Array.isArray(value)?' · '+value.length:''));c.className='rule-chip';badge.append(c)}
    container.append(badge);
    const notify=()=>onchange&&onchange();

    function control(object,key,path){
      const value=object[key],row=E('label');row.className='field';row.title=path.join('.');row.append(E('span',labels[key]||key));
      const table=tableFor(key,path,object),items=(table&&defs[table])||[];
      let input;
      if(path.includes('slotGrants')&&key==='trigger'){
        input=E('select');for(const [v,t]of [['equipped','携带该卡时生效'],['unitQualifies','单位满足条件时生效']]){const op=E('option',t);op.value=v;input.append(op)}
        input.value=value??'addSlot';input.onchange=()=>{object[key]=input.value;notify()};
      }else if(key==='property'&&props.length){
        input=E('select');for(const p of props){const op=E('option',(propLabels[p]||p)+' · '+p);op.value=p;input.append(op)}
        if(value!=null&&!props.includes(String(value))){const op=E('option','待确认引用：'+value);op.value=String(value);input.append(op)}
        input.value=value??'';input.onchange=()=>{object[key]=input.value||null;notify();render(container,rules,defs,onchange,context)};
      }else if(table==='sourceUnits'){
        const found=items.find(i=>String(i.id)===String(value));
        input=E('button');input.type='button';input.className='unit-picker-trigger';input.textContent=found?((found.name&&(found.name.zh||found.name.en))||found.id)+' · '+found.id:('选择单位'+(value!=null?' · '+value:''));
        input.onclick=()=>openSourceUnitPicker(defs,value,newValue=>{object[key]=typeof value==='number'?Number(newValue):newValue;notify();render(container,rules,defs,onchange,context)});
      }else if(table&&items.length){
        input=E('select');const none=E('option','未设置');none.value='';input.append(none);
        for(const item of items){const op=E('option',(item.name&&(item.name.zh||item.name.en))||item.id);op.value=String(item.id);input.append(op)}
        if(value!=null&&!items.some(i=>String(i.id)===String(value))){const op=E('option','待确认引用：'+value);op.value=String(value);input.append(op)}
        input.value=value??'';input.onchange=()=>{const found=items.find(i=>String(i.id)===input.value);object[key]=found?(typeof value==='number'?Number(found.id):found.id):input.value||null;notify()};
      }else if(path.includes('requiredDivisions')){input=E('select');for(const [v,t]of [['Light','光明面'],['Dark','黑暗面']]){const op=E('option',t);op.value=v;input.append(op)}input.value=value??'';input.onchange=()=>{object[key]=input.value||null;notify()}}
      else if(typeof value==='boolean'||['unique','unlimited','locallyUnique','ignoreMaximum','ignoreMinimum'].includes(key)){
        input=E('select');for(const [v,t]of [['null','未指定'],['true','是'],['false','否']]){const op=E('option',t);op.value=v;input.append(op)}input.value=String(value);input.onchange=()=>{object[key]=JSON.parse(input.value);notify()};
      }else{
        input=E('input');input.value=value??'';input.placeholder=value===null?'null':'';
        if(typeof value==='number'||['limit','modifier','ratio','perSourceUnit','upgradeIndex','value'].includes(key)){input.type='number';input.step='1'}
        input.oninput=()=>{object[key]=input.type==='number'?(input.value===''?null:Number(input.value)):input.value;notify()};
      }
      input.setAttribute('aria-label','规则 '+path.join('.'));row.append(input);return row;
    }

    function defaultItem(key,parent,path){
      if(key==='requiredProperties')return [{property:'unitType',value:1}];
      if(path.includes('requiredProperties'))return {property:'unitType',value:1};
      if(key==='requiredChildren')return {id:(defs.upgrades&&defs.upgrades[0]&&defs.upgrades[0].id)||64,elementPropertyName:'upgrades',upgradeIndex:0};
      if(key==='quantityLimitedBy')return {unit:(defs.sourceUnits&&defs.sourceUnits[0]&&defs.sourceUnits[0].id)||1,ratio:1};
      if(key==='modifiedPointsWith')return {id:'Children of the Watch',property:'options',modifier:-5,in:'33788'};
      if(['addProperties','replaceProperties'].includes(key))return [{property:'keywords',value:[]}];
      if(path.includes('addProperties')||path.includes('replaceProperties'))return {property:'keywords',value:[]};
      if(key==='unavailableWith')return {id:(defs.upgrades&&defs.upgrades[0]&&defs.upgrades[0].id)||'64',propertyName:'upgrades'};
      if(key==='factions')return 1;if(key==='slotTypes')return 2;
      if(key==='poolBonuses')return 'extraMercenary';
      if(path.includes('slotGrants'))return {trigger:'equipped',slot:'heavy_weapon'};
      if(key==='value'){const t=atomTables[parent.property];return defs[t]&&defs[t][0]?defs[t][0].id:1}
      return '';
    }

    function fields(object,path,into){
      for(const key of Object.keys(object)){
        const value=object[key],p=[...path,key];
        if(Array.isArray(value)){
          const box=E('fieldset');box.append(E('legend',(labels[key]||key)+(key==='requiredProperties'?'（外层 OR / 内层 AND）':'')));
          value.forEach((v,i)=>{
            const row=E('div');row.className='rule-item';
            if(Array.isArray(v)){
              const nested=E('div');nested.append(E('strong',key==='requiredProperties'?'条件组 '+(i+1)+'：全部满足':String(i+1)));
              fields(v,[...p,i],nested);
              const addAtom=E('button','＋ AND 条件');addAtom.type='button';addAtom.onclick=()=>{v.push({property:'unitType',value:1});notify();render(container,rules,defs,onchange,context)};nested.append(addAtom);
              row.append(nested);
            }else if(v!==null&&typeof v==='object'){
              fields(v,[...p,i],row);
            }else{
              row.append(control(value,i,[...p,i]));
            }
            const remove=E('button','删除');remove.type='button';remove.className='minor';remove.onclick=()=>{value.splice(i,1);notify();render(container,rules,defs,onchange,context)};row.append(remove);
            box.append(row);
          });
          const add=E('button',key==='requiredProperties'?'＋ OR 条件组':'＋ 添加');add.type='button';add.onclick=()=>{value.push(defaultItem(key,object,p));notify();render(container,rules,defs,onchange,context)};box.append(add);
          into.append(box);
        }else if(value!==null&&typeof value==='object'){
          const box=E('fieldset');box.append(E('legend',labels[key]||key));fields(value,p,box);
          if(key==='tierCounting'){
            const choices=E('select');for(const name of ['ignoreMinimum','ignoreMaximum','waivesMinimum','exempt','ignoreMaximumWhenArmyIncludes']){const op=E('option',labels[name]||name);op.value=name;choices.append(op)}
            const b=E('button','添加计数修正');b.type='button';b.onclick=()=>{const k=choices.value;if(!(k in value)){value[k]=k==='waivesMinimum'?{tiers:[1]}:k.includes('When')||k==='exempt'?{whenArmyIncludes:[],perSourceUnit:1}:false;notify();render(container,rules,defs,onchange,context)}};box.append(choices,b);
          }
          into.append(box);
        }else{
          into.append(control(object,key,p));
        }
      }
    }

    const seen=new Set();
    for(const [name,keys]of groups){
      const section=E('details');section.open=true;section.className='restriction-section';section.append(E('summary',name));
      for(const key of keys){seen.add(key);if(!(key in (rules||{})))continue;const block=E('div');block.dataset.ruleField=key;fields({get [key](){return rules[key]},set [key](v){rules[key]=v}},[],block);const remove=E('button','移除此限制项');remove.className='minor';remove.onclick=()=>{delete rules[key];notify();render(container,rules,defs,onchange,context)};block.append(remove);section.append(block)}
      const options=keys.filter(k=>!(k in (rules||{}))&&k in defaults);
      if(options.length){const select=E('select');select.setAttribute('aria-label',name+'添加字段');for(const k of options){const op=E('option',labels[k]||k);op.value=k;select.append(op)}const add=E('button','添加限制');add.onclick=()=>{rules[select.value]=structuredClone(defaults[select.value]);notify();render(container,rules,defs,onchange,context)};const controls=E('div');controls.className='rule-add';controls.append(select,add);section.append(controls)}
      container.append(section);
    }
    const extra=Object.keys(rules||{}).filter(k=>!seen.has(k));
    if(extra.length){const panel=E('details');panel.append(E('summary','其他保留字段'));for(const k of extra)fields({get [k](){return rules[k]},set [k](v){rules[k]=v}},[],panel);container.append(panel)}
  }
  return {render,labels};
})();
