// Offline local batch OCR. The first run downloads the English language model.
const fs=require('node:fs/promises');
const {createWorker,PSM}=require('tesseract.js');
(async()=>{
  const jobs=JSON.parse(await fs.readFile('work/jobs.json','utf8'));let next=0,done=0;
  await Promise.all(Array.from({length:4},async()=>{
    const w=await createWorker('eng');
    try{while(next<jobs.length){
      const job=jobs[next++],output=`${job.folder}/ocr.json`;
      try{JSON.parse(await fs.readFile(output,'utf8'));done++;continue}catch{}
      const fields={};
      for(const name of ['header','type','keywords','weapons','hp','courage','models']){
        const numeric=['hp','courage','models'].includes(name);
        await w.setParameters({tessedit_char_whitelist:numeric?'0123456789-':'',tessedit_pageseg_mode:numeric?PSM.SINGLE_LINE:PSM.AUTO});
        const r=await w.recognize(`${job.folder}/${name}.png`,{}, {text:true,tsv:true});
        fields[name]={text:r.data.text.trim(),confidence:r.data.confidence,tsv:r.data.tsv};
      }
      await fs.writeFile(output,JSON.stringify(fields,null,2));done++;
      if(done%10===0||done===jobs.length)console.log(`${done}/${jobs.length} cards OCR complete`);
    }}finally{await w.terminate()}
  }));
})().catch(e=>{console.error(e);process.exitCode=1});
