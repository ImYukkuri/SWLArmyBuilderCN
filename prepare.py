"""Prepare immutable card crops and local OCR jobs. No network or runtime coupling."""
import json, hashlib
from pathlib import Path
from PIL import Image, ImageEnhance, ImageOps

ROOT=Path(__file__).resolve().parent
WORK=ROOT/'work';WORK.mkdir(exist_ok=True)
REGIONS={'header':[.13,0,.895,.112],'type':[.14,.113,.665,.165],
         'keywords':[.02,.19,.646,.66],'weapons':[.02,.45,.64,.989]}

def save_crop(im,box,path,invert=False):
    box=tuple(round(v*(im.width if i%2==0 else im.height))for i,v in enumerate(box))
    crop=im.crop(box).convert('L')
    if invert:crop=ImageOps.invert(crop)
    crop=ImageEnhance.Contrast(crop).enhance(1.7)
    crop=ImageOps.expand(crop.resize((crop.width*2,crop.height*2)),border=15,fill='white')
    crop.save(path)

def main():
    jobs=[]
    for p in sorted((ROOT/'assets/unit-cards').rglob('*.webp')):
        rel=p.relative_to(ROOT).as_posix();key=hashlib.sha256(rel.encode()).hexdigest()[:16]
        im=Image.open(p).convert('RGB');folder=WORK/key;folder.mkdir(exist_ok=True)
        test=im.resize((1040,726));left=sum(min(test.getpixel((x,y)))>200 for x in range(50,350,8)for y in range(170,420,8));right=sum(min(test.getpixel((x,y)))>200 for x in range(700,1010,8)for y in range(170,420,8));counterpart=right>left*2 and right>700
        regions={**REGIONS,**({'header':[.14,0,.86,.112],'type':[.38,.113,.86,.165],'keywords':[.35,.19,.99,.80],'weapons':[.35,.78,.99,.989]}if counterpart else{})}
        for name,box in regions.items():save_crop(im,box,folder/(name+'.png'),name in ('header','type','weapons'))
        numeric=[('hp',[.16,.898,.23,.985]),('courage',[.25,.915,.33,.999]),('models',[.962,.003,.999,.091])]if counterpart else [('hp',[.731,.741,.811,.837]),('courage',[.917,.741,.993,.837]),('models',[.962,.003,.999,.091])]
        for n,box in numeric:
            c=im.crop(tuple(round(v*(im.width if i%2==0 else im.height))for i,v in enumerate(box))).convert('RGB');pix=c.load()
            for y in range(c.height):
                for x in range(c.width):
                    r,g,b=pix[x,y]
                    yes=(g>r*1.2 and g>b*1.2 and g>100)if n=='hp' else (r>130 and g>120 and b<100)if n=='courage' else min(r,g,b)>190
                    pix[x,y]=(0,0,0)if yes else(255,255,255)
            ImageOps.expand(c.resize((c.width*4,c.height*4)),border=20,fill='white').save(folder/(n+'.png'))
        jobs.append({'key':key,'image':rel,'width':im.width,'height':im.height,'folder':folder.relative_to(ROOT).as_posix(),'layout':'counterpart'if counterpart else'standard','regions':regions})
    (WORK/'jobs.json').write_text(json.dumps(jobs,indent=2),encoding='utf8')
    print(f'Prepared {len(jobs)} cards, {len(jobs)*7} region jobs')
if __name__=='__main__':main()
