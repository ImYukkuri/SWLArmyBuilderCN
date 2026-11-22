/* A reviewable import/export boundary; importing never mutates the open draft. */
async function openShareDialog() {
  if (!activeRecord || document.getElementById('share-dialog')) return;
  const snapshot = structuredClone({...activeRecord, army}), href = location.href;
  const dialog = node('dialog', 'transfer-dialog share-dialog');dialog.id = 'share-dialog';
  dialog.setAttribute('aria-label', '分享军表');
  const head = node('div', 'dialog-head'), close = node('button', null, '×');
  close.setAttribute('aria-label', '关闭分享链接');close.onclick = () => dialog.close();
  head.append(node('h2', null, '分享军表'), close);
  const status = node('p', 'transfer-note', '正在生成链接…');status.setAttribute('role', 'status');
  const text = node('textarea', 'share-link');text.id = 'share-link';text.rows = 3;
  text.readOnly = true;text.spellcheck = false;text.setAttribute('aria-label', '军表分享链接');
  const actions = node('div', 'transfer-actions'), copy = node('button', 'choose-button', '复制链接');
  copy.disabled = true;actions.append(copy);
  copy.onclick = async () => {
    try {await navigator.clipboard.writeText(text.value);status.textContent = '链接已复制';}
    catch {text.focus();text.select();status.textContent = '请复制已选中的链接';}
  };
  dialog.append(head, status, text, actions);
  dialog.addEventListener('close', () => dialog.remove(), {once:true});
  document.body.append(dialog);showDialog(dialog);
  try {
    const code = await BuilderShare.encode(snapshot);
    if (!dialog.open) return;
    text.value = BuilderShare.link(href, code);copy.disabled = false;
    status.textContent = '链接保存生成时的军表；后续修改请重新分享。';
    try {await navigator.clipboard.writeText(text.value);status.textContent = '链接已复制；后续修改请重新分享。';}
    catch { /* The copy button provides a fresh user gesture on mobile browsers. */ }
  } catch (error) {status.textContent = '生成失败：' + error.message;}
}

function openTransferDialog(operation) {
  const importing=operation==='import';
  if(!importing&&!activeRecord)return;
  const dialog=node('dialog','transfer-dialog');dialog.id='transfer-dialog';
  const head=node('div','dialog-head'),title=node('h2',null,importing?'导入军表':'导出军表');
  const close=node('button',null,'×');close.setAttribute('aria-label','关闭 JSON '+(importing?'导入':'导出'));
  close.onclick=()=>dialog.close();head.append(title,close);dialog.append(head);
  const controls=node('div','transfer-controls');
  const formatLabel=node('label',null,'JSON 格式'),format=node('select');format.id='transfer-format';
  format.setAttribute('aria-label','JSON 格式');format.append(new Option('TTS JSON格式','tts'),new Option('原生 JSON格式（完整备份）','native'));
  format.value='tts';formatLabel.append(format);controls.append(formatLabel);
  const note=node('p','transfer-note');
  const text=node('textarea','transfer-json');text.id='transfer-json';text.spellcheck=false;
  text.setAttribute('aria-label',importing?'粘贴军表 JSON':'导出的军表 JSON');text.readOnly=!importing;
  text.placeholder='粘贴 JSON，或选择文件读取';
  const report=node('section','transfer-report');report.setAttribute('aria-live','polite');
  const actions=node('div','transfer-actions');
  dialog.append(controls,note,text,report,actions);
  let parsed=null,result=null,resolutions={},capTouched=false;
  function messages(items,cls) {
    if(!items?.length)return;
    const list=node('ul',cls);for(const item of items)list.append(node('li',null,item));report.append(list);
  }
  const formatNote=()=>{
    note.textContent=format.value==='tts'
      ? '使用英文卡名；分数表示已用点数。双面卡只输出一个名称，原生格式可保留正面／反面／双面状态。'
      : '保留本地 ID、分数上限、战斗部队、正反面／双面状态和完整军表设置。';
  };
  formatNote();
  if(!importing) {
    const download=node('button','choose-button','下载 JSON'),copy=node('button',null,'复制 JSON');
    actions.append(copy,download);
    function preview() {
      report.replaceChildren();formatNote();
      const record={...activeRecord,army};
      result=format.value==='tts'?BuilderTransfer.exportTTS(record,data):{json:record,issues:[],warnings:[]};
      text.value=JSON.stringify(result.json,null,2);
      messages(result.issues,'transfer-errors');messages(result.warnings,'transfer-warnings');
      download.disabled=copy.disabled=!!result.issues.length;
    }
    format.onchange=preview;preview();
    download.onclick=()=>{
      const url=URL.createObjectURL(new Blob([text.value],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;
      a.download=(activeRecord.name||'army').replace(/[<>:"/\\|?*]/g,'_')+(format.value==='tts'?'.tts.json':'.json');
      a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setStatus('已导出 '+(format.value==='tts'?'TTS JSON格式':'原生 JSON格式'));
    };
    copy.onclick=async()=>{try{await navigator.clipboard.writeText(text.value);copy.textContent='已复制';}
      catch{text.focus();text.select();copy.textContent='请复制已选中的 JSON';}};
  } else {
    const capLabel=node('label',null,'导入后的分数上限'),cap=node('input');cap.type='number';cap.min='1';cap.step='1';cap.value='1000';
    cap.setAttribute('aria-label','导入后的分数上限');capLabel.append(cap);controls.append(capLabel);
    const factionLabel=node('label',null,'未标势力时使用'),faction=node('select');faction.setAttribute('aria-label','补充势力');
    faction.append(new Option('自动识别',''));for(const f of BuilderLibrary.FACTIONS)faction.append(new Option(f.name,String(f.id)));
    factionLabel.append(faction);controls.append(factionLabel);
    const file=node('input');file.type='file';file.accept='.json,application/json';file.hidden=true;file.id='transfer-file';dialog.append(file);
    const choose=node('button',null,'选择 JSON 文件'),analyze=node('button',null,'解析预览'),commit=node('button','choose-button','导入为新军表');
    commit.disabled=true;actions.append(choose,analyze,commit);choose.onclick=()=>file.click();
    const invalidate=()=>{result=null;commit.disabled=true;};
    text.oninput=()=>{parsed=null;resolutions={};invalidate();};
    function preview({parse=false}={}) {
      report.replaceChildren();commit.disabled=true;result=null;formatNote();
      capLabel.hidden=factionLabel.hidden=format.value==='native';
      try {
        if(parse||!parsed) {
          parsed=BuilderTransfer.parse(text.value);
          if(!capTouched)cap.value=parsed.battlefieldDeck?.scenario==='recon'?'600':'1000';
        }
        if(BuilderTransfer.detect(parsed)!==format.value)throw Error('内容属于'+(BuilderTransfer.detect(parsed)==='tts'?'TTS JSON格式':'原生 JSON格式')+'，请切换上方格式。');
        const now=new Date().toISOString();
        result=format.value==='tts'?BuilderTransfer.importTTS(parsed,data,uid,now,{pointsLimit:Number(cap.value),resolutions,factionId:faction.value})
          :BuilderTransfer.readNative(parsed,data,uid,now);
        const imported=result.record.army;
        report.append(node('p','transfer-summary',`${result.record.name} · ${imported.units.length} 个单位 · ${RulesCore.validateArmy(imported,data).effectivePoints} / ${imported.pointsLimit} 分`));
        messages(result.warnings,'transfer-warnings');
        for(const issue of result.issues) {
          const row=node('div','transfer-resolution');
          row.append(node('strong',null,issue.name),node('small',null,issue.message));
          if(BuilderTransfer.catalogs(data)[issue.kind]) {
            const options=BuilderTransfer.catalogs(data)[issue.kind].filter(c=>issue.kind!=='battleForce'||
              BuilderLibrary.factionOf(c.id,data)===issue.factionId);
            const search=node('input');search.type='search';search.placeholder='搜索中文名、英文名或 ID';search.setAttribute('aria-label','查找匹配 '+issue.name);
            const select=node('select');select.setAttribute('aria-label','选择匹配 '+issue.name);
            function fill() {
              const q=search.value.toLowerCase();select.replaceChildren(new Option(issue.kind==='battleForce'?'请指定战斗部队':'请指定对应卡牌',''));
              const filtered=options.filter(c=>[c.id,c.name?.zh,c.name?.en,c.title?.en,c.title?.zh].join(' ').toLowerCase().includes(q));
              filtered.sort((a,b)=>Number(issue.candidates?.includes(b.id))-Number(issue.candidates?.includes(a.id)));
              for(const c of filtered)select.append(new Option([c.name?.zh,c.name?.en,c.title?.en,'['+c.id+']'].filter(Boolean).join(' · '),c.id));
            }
            search.oninput=fill;fill();
            select.onchange=()=>{if(!select.value)return;resolutions[issue.key]=select.value;preview();};row.append(search,select);
          }
          report.append(row);
        }
        if(!result.issues.length){
          const ruleIssues=RulesCore.validateArmy(imported,data).issues.filter(i=>i.status==='invalid');
          if(ruleIssues.length)report.append(node('p','transfer-note',`${ruleIssues.length} 项编制问题将保留在军表校验中，导入不删除卡牌。`));
          commit.disabled=false;
        }
      }catch(e){messages([e.message],'transfer-errors');}
    }
    analyze.onclick=()=>preview({parse:true});
    format.onchange=()=>{invalidate();formatNote();capLabel.hidden=factionLabel.hidden=format.value==='native';if(text.value.trim())preview({parse:true});};
    cap.oninput=()=>{capTouched=true;invalidate();};cap.onchange=()=>{if(text.value.trim())preview();};
    faction.onchange=()=>{if(text.value.trim())preview();};
    file.onchange=async()=>{try{
      if(!file.files[0])return;text.value=await file.files[0].text();parsed=BuilderTransfer.parse(text.value);resolutions={};
      format.value=BuilderTransfer.detect(parsed);
      if(!capTouched)cap.value=parsed.battlefieldDeck?.scenario==='recon'?'600':'1000';
      preview();
    }catch(e){invalidate();report.replaceChildren();messages([e.message],'transfer-errors');}finally{file.value='';}};
    commit.onclick=()=>{
      if(!result||result.issues.length)return;
      try {
        if(activeRecord&&!saveActiveRoster())return;
        collection=BuilderLibrary.writeRecord(localStorage,result.record);
        const record=result.record,warnings=result.warnings;dialog.close();openRoster(record);
        setStatus('已导入：'+record.name+(warnings.length?'；'+warnings.join('；'):''));
      }catch(e){messages(['导入未保存：'+e.message],'transfer-errors');}
    };
  }
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  document.body.append(dialog);showDialog(dialog);
}
