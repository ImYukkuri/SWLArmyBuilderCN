/* Command conditions reuse the catalog-backed, searchable editor controls. */
window.CommandRequirementsEditor = (() => {
  const fields = [
    ['title','按称号'],['name','按单位名称'],['nameIdentityId','按名称标识'],['id','按具体单位'],
    ['factionId','按单位阵营'],['affiliationIds','按组织'],['rankId','按军阶'],['unitTypeId','按单位类型'],['keywords','按词条'],
  ];
  const types = [...fields.map(([id,label])=>({value:'unit:'+id,label})),
    {value:'unitNames',label:'按单位名称组合（全部在场）'},
    {value:'armyFaction',label:'按军表阵营'}, {value:'battleForce',label:'按战斗部队'},
    {value:'upgrade',label:'按已装备升级卡'}];
  const E=(tag,text)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;return e;};
  const button=(label,action)=>{const b=E('button',label);b.type='button';b.onclick=action;return b;};
  const options=(defs,kind)=>{
    const table={title:'titles',name:'names',nameIdentityId:'unitNameIdentities',id:'units',factionId:'factions',
      affiliationIds:'affiliations',rankId:'ranks',unitTypeId:'unitTypes',keywords:'keywords',unitNames:'names',upgrade:'localUpgrades'}[kind];
    if(table)return defs.editorOptions.table(table).map(o=>({...o,value:kind==='affiliationIds'?String(o.value):o.value}));
    if(kind==='armyFaction')return defs.armies.filter(a=>[1,2,4,5,8,9].includes(a.id)).map(a=>({value:a.id,label:EditorOptionsLabel(a)}));
    return Object.entries(defs.editorOptions.pkg.battleForces||{}).map(([id,bf])=>({value:Number(id),label:(bf.nameZh||bf.name)+' · '+id}));
  };
  const EditorOptionsLabel=a=>[a.name?.zh,a.name?.en].filter(Boolean).join(' / ');
  function render(card,defs,change,refresh) {
    const root=E('fieldset');root.className='command-matching';root.id='command-matching';
    root.append(E('legend','使用条件'));
    if(!card.requirements) {
      root.append(E('p','此历史记录使用旧绑定。恢复后请配置新的使用条件。'));
      root.append(button('重新配置使用条件',()=>{card.requirements={any:[]};write();draw();}));
    }
    const head=E('div');head.className='command-match-toolbar';
    head.append(E('small','任一条件组满足即可；同组条件全部满足。'));
    if(refresh)head.append(button('刷新候选项',refresh));root.append(head);
    const content=E('div');root.append(content);
    const write=()=>{for(const k of ['factions','unlockedBy','requiredUnitGroups','titleMatch','mercenary','condition'])delete card[k];change();};
    const control=(value,choices,onChange,label)=>EditorOptions.control(value,choices,onChange,{label,nullable:false,preserveType:false});
    function values(owner,kind,label) {
      const box=E('div');box.className='command-match-values';
      const choices=options(defs,kind),current=owner.values;
      current.forEach((value,i)=>{
        const row=E('div');row.className='command-match-value';
        row.append(control(value,choices.filter(o=>o.value===value||!current.includes(o.value)),v=>{owner.values[i]=v;write();draw();},label+' '+(i+1)));
        row.append(button('移除',()=>{owner.values.splice(i,1);write();draw();}));box.append(row);
      });
      const picker=EditorOptions.control(null,choices.filter(o=>!current.includes(o.value)),v=>{
        if(v!=null){current.push(v);write();draw();}
      },{label:'添加'+label,nullable:true,preserveType:false});
      box.append(picker);return box;
    }
    function draw() {
      content.replaceChildren();if(!card.requirements)return;
      const groups=card.requirements.any;
      if(!groups.length)content.append(E('p','不限（通用指挥卡）'));
      groups.forEach((group,gi)=>{
        const section=E('section');section.className='command-match-group';
        const title=E('div');title.className='command-match-toolbar';
        title.append(E('strong','条件组 '+(gi+1)),button('删除条件组',()=>{groups.splice(gi,1);write();draw();}));section.append(title);
        group.all.forEach((atom,ai)=>{
          const row=E('div');row.className='command-match-atom';
          const toolbar=E('div');toolbar.className='command-match-toolbar';
          const kind=atom.type==='unit'?'unit:'+atom.all[0]?.field:atom.type;
          toolbar.append(control(kind,types,value=>{
            group.all[ai]=value.startsWith('unit:')?{type:'unit',all:[{field:value.slice(5),values:[]}]}:{type:value,values:[]};write();draw();
          },`匹配方式 ${gi+1}-${ai+1}`),button('删除条件',()=>{group.all.splice(ai,1);write();draw();}));row.append(toolbar);
          if(atom.type==='unit') {
            if(atom.all.length>1)row.append(E('small','由同一单位同时满足以下条件'));
            atom.all.forEach((filter,fi)=>{
              const filterBox=E('div');filterBox.className='command-match-filter';
              if(fi) {
                const filterHead=E('div');filterHead.className='command-match-toolbar';
                filterHead.append(control(filter.field,fields.map(([value,label])=>({value,label})),field=>{
                  atom.all[fi]={field,values:[]};write();draw();
                },`同单位匹配方式 ${gi+1}-${ai+1}-${fi+1}`),button('删除筛选',()=>{atom.all.splice(fi,1);write();draw();}));filterBox.append(filterHead);
              }
              filterBox.append(values(filter,filter.field,`匹配值 ${gi+1}-${ai+1}-${fi+1}`));row.append(filterBox);
            });
            row.append(button('＋ 叠加同单位条件',()=>{atom.all.push({field:'title',values:[]});write();draw();}));
          } else row.append(values(atom,atom.type,`匹配值 ${gi+1}-${ai+1}`));
          if(atom.type==='unitNames')row.append(E('small','每个名称都须有独立单位在场；组合角色卡不会自动拆分。'));
          section.append(row);
        });
        section.append(button('＋ 添加条件',()=>{group.all.push({type:'unit',all:[{field:'id',values:[]}]});write();draw();}));content.append(section);
      });
      content.append(button('＋ 添加备选条件组',()=>{groups.push({all:[{type:'unit',all:[{field:'id',values:[]}]}]});write();draw();}));
      const errors=RulesCore.commandRequirementErrors(card.requirements);
      if(errors.length){const error=E('p',[...new Set(errors)].join('；'));error.className='error';content.append(error);}
    }
    draw();return root;
  }
  return {render,options};
})();
