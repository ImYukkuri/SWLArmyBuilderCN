window.EditorCommon=(()=>{
 const el=(t,s)=>{const n=document.createElement(t);if(s!==undefined)n.textContent=s;return n};
 async function api(url,body){const r=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const text=await r.text();let d;try{d=JSON.parse(text)}catch(e){throw Error('此操作需要 python server.py（当前静态服务无法读写源文件）。')}if(!r.ok)throw Error(d.error||r.statusText);return d}
 const download=(value,name)=>{const a=el('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000)};
 function field(title,value,change,type='text'){const row=el('label');row.className='field';row.append(el('span',title));const input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value??'';input.setAttribute('aria-label',title);input.oninput=()=>change(type==='number'?(input.value===''?null:Number(input.value)):input.value);row.append(input);return row}
 function select(title,value,items,change){const row=el('label');row.className='field';row.append(el('span',title));const s=el('select');for(const [v,t]of items){const o=el('option',t);o.value=String(v);s.append(o)}s.value=String(value??'');s.setAttribute('aria-label',title);s.onchange=()=>change(s.value);row.append(s);return row}
 function objectFields(parent,defs,change,rootKey=''){
  const container=el('div'),labels={name:'名称',en:'英文',zh:'中文',range:'射程',min:'最小',max:'最大',dice:'骰池',red:'红骰',black:'黑骰',white:'白骰',keywords:'词条',id:'词条 ID',value:'数值',parameter:'对象 / 参数',action:'行动类型'};
  const redraw=()=>{container.replaceChildren();walk(parent,container,rootKey)};
  function walk(obj,into,path){for(const key of Object.keys(obj)){const v=obj[key],label=labels[key]||key;
   if(Array.isArray(v)){const box=el('fieldset');box.append(el('legend',label+' · '+v.length));v.forEach((item,i)=>{const row=el('div');row.className='array-item';if(item&&typeof item==='object')walk(item,row,key);else row.append(field('内容',item,x=>{v[i]=x;change()}));const remove=el('button','删除该项');remove.onclick=()=>{v.splice(i,1);change();redraw()};row.append(remove);box.append(row)});const add=el('button','＋ 添加'+label);add.onclick=()=>{v.push(key==='keywords'?{id:defs.keywords[0].id,value:null,parameter:null}:key==='weapons'?{name:{en:'New Weapon',zh:''},range:{min:null,max:null},dice:{red:0,black:0,white:0},keywords:[]}:'' );change();redraw()};box.append(add);into.append(box)}
   else if(v&&typeof v==='object'){const box=el('fieldset');box.append(el('legend',label));walk(v,box,key);into.append(box)}
   else if(key==='id'&&path==='keywords'){into.append(select('词条 ID',v,defs.keywords.map(k=>[k.id,(k.name.zh||k.name.en)+' · '+k.id]),x=>{obj[key]=x;change()}))}
   else if(key==='action'){into.append(select(label,v??'none',[['none','无'],['action','卡牌行动'],['free-action','免费卡牌行动']],x=>{obj[key]=x;change()}))}
   else into.append(field(label,v,x=>{obj[key]=x;change()},typeof v==='number'||['min','max','red','black','white','value'].includes(key)?'number':'text'));
  }}redraw();return container;
 }
 return {el,api,download,field,select,objectFields};
})();
