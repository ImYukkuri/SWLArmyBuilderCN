/* Run explicitly with external Playwright: node tools/performance/profile-upgrades.cjs
 * --baseline b1a4af5 --runs 5 --out <outside-repo.json>
 * Omit --baseline to measure the working tree. All browser storage is isolated. */
const fs=require('node:fs/promises'),path=require('node:path'),{createServer}=require('node:http');
const {execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const {bootstrap,instrument}=require('./instrument.cjs');
const root=path.resolve(__dirname,'../..'),args=process.argv.slice(2);
const arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const baseline=arg('--baseline',null),runs=Number(arg('--runs',5)),out=arg('--out',null);
if(!out||path.resolve(out).startsWith(root+path.sep))throw Error('--out must point outside the repository');
const sourceFiles=['builder.js','builder-view.js','builder-model.js','rules-core.js','battleforce-runtime.js','upgrade-faces.js'];
const bodies=new Map();
const server=createServer(async(req,res)=>{
  const rel=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\//,'')||'index.html';
  const file=path.resolve(root,rel);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  try{
    const body=bodies.get(rel)??await fs.readFile(file);
    res.setHeader('Content-Type',{'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.webp':'image/webp','.ttf':'font/ttf'}[path.extname(file)]||'application/octet-stream');
    res.end(body);
  }catch{res.writeHead(404).end();}
});
(async()=>{
  for(const file of sourceFiles){const code=baseline?execFileSync('git',['show',baseline+':'+file],{cwd:root,encoding:'utf8'}):await fs.readFile(path.join(root,file),'utf8');bodies.set(file,instrument(file,code));}
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined}),samples=[];
  try{
    for(const armyId of [4,28])for(let run=0;run<runs;run++){
      const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      const page=await context.newPage();await page.addInitScript(bootstrap);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>typeof data!=='undefined'&&data);
      await page.evaluate(armyId=>{
        const rec=BuilderLibrary.create(4,'Performance fixture',data,uid,new Date().toISOString());rec.army.armyId=armyId;
        if(armyId===28)for(const [group,choice]of [['ccb_battalion','ccb_assault'],['ccb_jedi','ccb_decisive'],['ccb_veteran','ccb_reinforced']])rec.army=BattleForceV2.choose(rec.army,data.pkg.battleForces[28],'clone-traits',group,[choice]);
        const ids=['republic-jedi-knight-general',...Array(4).fill('republic-clone-trooper'),...Array(2).fill('republic-clone-commandos'),...Array(2).fill('republic-barc'),'republic-saber-class','republic-clone-commander-leadership','republic-jedi-knight'];
        rec.army.units=ids.map(id=>({unitId:id,instanceId:uid(),upgrades:[],...(armyId===28?{rankId:data.units[id].rankId}:{})}));
        __rulePerf.reset();openRoster(rec);window.profileSetup=structuredClone(__rulePerf.metrics);window.profileRecord=structuredClone(rec);
      },armyId);
      for(const operation of ['open-cold','open-hot','equip-next-cold','equip-next-hot']){
        const sample=await page.evaluate(async operation=>{
          if(browser)closeBrowser();
          if(operation.startsWith('equip'))openRoster(structuredClone(window.profileRecord));
          const open=()=>{
            const inst=army.units[0],index=unitSlotRecords(data.units[inst.unitId],inst).findIndex(s=>s.key==='training');
            const host=[...document.querySelectorAll('#army-units > .roster-unit')].find(el=>JSON.parse(el.dataset.instances).includes(inst.instanceId));
            host.querySelector(`[data-slot-index="${index}"] .slot-name`).click();
          };
          if(operation.startsWith('equip'))open();
          // Strict cold engine cache: a fresh source identity misses both old
          // and new WeakMaps. Keep the current view/DOM so layout and events
          // remain identical. No downloads or source cloning enter the timing.
          if(operation.endsWith('-cold')) {
            const freshSource={...(data._source||data)};
            data={...data};Object.defineProperty(data,'_source',{value:freshSource});
          }
          __rulePerf.reset();const start=performance.now();
          if(operation.startsWith('equip')){
            const card=document.querySelector('#card-grid [data-id="training-endurance"] h3');
            if(!card)throw Error('Expected Endurance as a legal candidate');card.click();
          }else open();
          const syncMs=performance.now()-start,metrics=structuredClone(__rulePerf.metrics);
          await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
          return {operation,syncMs,frameMs:performance.now()-start,metrics,candidates:currentCandidates.length,
            visible:document.querySelector('#card-grid').children.length,setup:window.profileSetup};
        },operation);
        if(sample.candidates!==43)throw Error('Benchmark fixture must contain 43 training candidates');
        samples.push({armyId,run,...sample});
      }
      if(errors.length)throw Error(errors.join('\n'));
      await context.close();process.stdout.write(`Completed ${baseline||'working'} army ${armyId}, run ${run+1}/${runs}\n`);
    }
    const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
    const summary=[];
    for(const armyId of [4,28])for(const operation of ['open-cold','open-hot','equip-next-cold','equip-next-hot']){
      const rows=samples.filter(r=>r.armyId===armyId&&r.operation===operation),keys=new Set(rows.flatMap(r=>Object.keys(r.metrics)));
      summary.push({armyId,operation,medianMs:median(rows.map(r=>r.syncMs)),medianFrameMs:median(rows.map(r=>r.frameMs)),
        candidates:rows[0].candidates,metrics:Object.fromEntries([...keys].map(k=>[k,{count:median(rows.map(r=>r.metrics[k]?.count||0)),ms:median(rows.map(r=>r.metrics[k]?.ms||0))}]))});
    }
    await fs.writeFile(out,JSON.stringify({baseline,runs,samples,summary},null,2));
    console.log(JSON.stringify(summary,null,2));
  }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
