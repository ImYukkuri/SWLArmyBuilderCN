"""Locate weapon panels by dark card rectangles; do not split by guessed names."""
import json
from PIL import Image,ImageOps
from prepare import ROOT,WORK,save_crop

jobs=json.loads((WORK/'jobs.json').read_text());out=[]
for j in jobs:
    im=Image.open(ROOT/j['image']).convert('RGB');scaled=im.resize((1040,726));ys=[]
    dx=350 if j['layout']=='counterpart'else 0
    for y in range(210,718):
        ratio=sum(max(scaled.getpixel((x,y)))<80 for x in range(45+dx,475+dx,2))/215
        if ratio>.65:ys.append(y)
    bands=[]
    for y in ys:
        if not bands or y-bands[-1][-1]>15:bands.append([y])
        else:bands[-1].append(y)
    bands=[b for b in bands if b[-1]-b[0]>45]
    rows=[];fields=[];last_top=(bands[-1][-1]-98)if bands else 0;changed=False
    for i,b in enumerate(bands):
        top=b[-1]-98;folder=ROOT/j['folder'];expected=last_top-(len(bands)-1-i)*126
        # Long solid rule strips can join the next name strip. Recover regular slots.
        if abs(top-expected)>12:top=expected;changed=True
        row={'top':top/726,'bottom':(top+102)/726};rows.append(row)
        for name,box in [('name',[.037,(top+2)/726,.367,(top+45)/726]),('rules',[.037,(top+48)/726,.465,(top+89)/726]),('range',[.369,(top+2)/726,.464,(top+45)/726]),('dice',[.485,(top+12)/726,.609,(top+85)/726])]:
            if dx:box=[box[0]+dx/1040,box[1],min(.998,box[2]+dx/1040),box[3]]
            field=f'w{i}_{name}';save_crop(im,box,folder/(field+'.png'),True);fields.append(field)
    if changed:(ROOT/j['folder']/'weapons.json').unlink(missing_ok=True)
    j['weaponRows']=rows;j['fields']=fields;out.append(j)
(WORK/'weapon-jobs.json').write_text(json.dumps(out,indent=2),encoding='utf8');print('Prepared',sum(len(j['weaponRows'])for j in out),'weapon panels')
