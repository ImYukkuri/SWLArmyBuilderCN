"""Identify printed action arrows from pixels, independent of keyword semantics."""
import collections,json,math,re
from pathlib import Path
from PIL import Image,ImageOps
from image_fields import components
ROOT=Path(__file__).resolve().parent

def normalized(im):
    im=im.convert('L').point(lambda v:255 if v<115 else 0)
    box=im.getbbox()
    return im.crop(box).resize((40,32))if box else im.resize((40,32))
def score(a,b):return sum(abs(x-y)for x,y in zip(a.getdata(),b.getdata()))/(40*32*255)
def templates():
    # Equivalent to the two symbols supplied by the owner, cropped from local cards.
    solid=Image.open(ROOT/'assets/unit-cards/rebel/originals/luke_skywalker_hero_front.webp').resize((1040,726))
    free=Image.open(ROOT/'assets/unit-cards/empire/originals/id10-seeker_front.webp').resize((1040,726))
    return {'action':normalized(solid.crop((42,155,76,186))),
            'free-action':normalized(free.crop((390,156,411,177)))}
def line_regions(job):
    ocr=json.loads((ROOT/job['folder']/'ocr.json').read_bytes());region=job['regions']['keywords'];groups=collections.OrderedDict()
    limit=min((r['top']*job['height']for r in job['weaponRows']),default=job['height']*.99)
    for row in ocr['keywords'].get('tsv','').splitlines()[1:]:
        c=row.split('\t')
        if len(c)<12 or c[0]!='5' or not c[11].strip():continue
        x=(int(c[6])-15)/2+region[0]*job['width'];y=(int(c[7])-15)/2+region[1]*job['height'];h=int(c[9])/2
        if y>=limit-3:continue
        groups.setdefault(tuple(c[1:5]),[]).append({'text':c[11],'x':x,'y':y,'height':h})
    return groups.values()
def detect_lines(job):
    image=Image.open(ROOT/job['image']).convert('RGB');sx=image.width/1040;sy=image.height/726;tpl=templates();result=[]
    for words in line_regions(job):
        text=' '.join(w['text']for w in words);valid=[w for w in words if re.search('[A-Za-z]{2}',w['text'])]
        if not valid:continue
        y=sorted(w['y']for w in valid)[len(valid)//2];height=sorted(w['height']for w in valid)[len(valid)//2]
        left=(job['regions']['keywords'][0]*image.width);box=(round(left),max(0,round(y-8*sy)),round(left+88*sx),min(image.height,round(y+height+8*sy)))
        strip=image.crop(box);pts={(x,y)for y in range(strip.height)for x in range(strip.width)if max(strip.getpixel((x,y)))<115};cs=components(pts)
        cs=[c for c in cs if 5*sx<=c[2]-c[0]<=45*sx and 10*sy<=c[3]-c[1]<=45*sy];candidates=[]
        for i,c in enumerate(cs):
            candidates.append(c[:4])
            for other in cs[i+1:]:
                a,b=sorted([c,other],key=lambda x:x[0]);width=b[2]-a[0]
                if -16*sx<=b[0]-a[2]<=8*sx and abs((a[1]+a[3])-(b[1]+b[3]))<12*sy and width<45*sx:candidates.append((a[0],min(a[1],b[1]),b[2],max(a[3],b[3])))
        matches=[]
        for candidate in candidates:
            a,b,c,d=candidate;ratio=(c-a)/(d-b)
            if not .55<ratio<1.75:continue
            mask=normalized(strip.crop(candidate));scores=sorted((score(mask,t),kind)for kind,t in tpl.items());v,kind=scores[0]
            if v<.20 and scores[1][0]-v>.035:matches.append((v,kind,[a+box[0],b+box[1],c+box[0],d+box[1]]))
        matches.sort();best=matches[0]if matches else None
        result.append({'text':text,'action':best[1]if best else'none','score':round(best[0],4)if best else None,'bbox':best[2]if best else None,'lineBox':list(box)})
    return result
if __name__=='__main__':
    jobs=json.loads((ROOT/'work/weapon-jobs.json').read_bytes());data={j['image']:detect_lines(j)for j in jobs}
    (ROOT/'work/action-icons.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
    print(collections.Counter(line['action']for lines in data.values()for line in lines))
