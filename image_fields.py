"""Extract card geometry and isolated dice numerals without guessing missing data."""
from PIL import Image,ImageOps
import json
from prepare import ROOT,WORK
def components(points):
    out=[]
    while points:
        q=points.pop();stack=[q];part=[q]
        while stack:
            x,y=stack.pop()
            for q in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
                if q in points:points.remove(q);stack.append(q);part.append(q)
        if len(part)>8:
            xs=[p[0]for p in part];ys=[p[1]for p in part];out.append((min(xs),min(ys),max(xs)+1,max(ys)+1,part))
    return out
def glyph(image,box):
    im=image.crop(box).convert('RGB');mask=Image.new('L',im.size,0)
    for y in range(im.height):
        for x in range(im.width):
            if min(im.getpixel((x,y)))>185:mask.putpixel((x,y),255)
    bbox=mask.getbbox()
    return mask.crop(bbox).resize((40,40))if bbox else mask.resize((40,40))
def rank_glyph(image):
    im=image.crop((930,5,1000,70));pts={(x,y)for y in range(im.height)for x in range(im.width)if min(im.getpixel((x,y)))>185};mask=Image.new('L',im.size,0)
    for a,b,c,d,part in components(pts):
        if a<1 or b<2 or c>im.width-1 or d>im.height-1 or c-a<8 or d-b<8:continue
        for x,y in part:mask.putpixel((x,y),255)
    box=mask.getbbox();return mask.crop(box).resize((40,40))if box else mask.resize((40,40))
def distance(a,b):return sum(abs(x-y)for x,y in zip(a.getdata(),b.getdata()))/(1600*255)
def main():
    jobs=json.loads((WORK/'weapon-jobs.json').read_text());digitjobs=[]
    samples={'commander':'rebel/originals/luke_skywalker_hero_front.webp','operative':'rebel/originals/ahsoka_front.webp','corps':'empire/originals/stormtroopers_front.webp','special-forces':'empire/originals/scout_front.webp','support':'gar/originals/at_rt_gar_front.webp','heavy':'empire/originals/at_st_front.webp'}
    templates={n:rank_glyph(Image.open(ROOT/'assets/unit-cards'/p).convert('RGB').resize((1040,726)))for n,p in samples.items()}
    surge_samples={'none':('cis/originals/b1_front.webp',(798,638,833,674)),'critical':('rebel/originals/luke_skywalker_hero_front.webp',(798,638,833,674)),'hit':('empire/originals/stormtroopers_front.webp',(798,638,833,674))}
    surge_templates={n:glyph(Image.open(ROOT/'assets/unit-cards'/p).convert('RGB').resize((1040,726)),b)for n,(p,b)in surge_samples.items()}
    for j in jobs:
        im=Image.open(ROOT/j['image']).convert('RGB').resize((1040,726));shape=rank_glyph(im);ranks=sorted((distance(shape,t),n)for n,t in templates.items());rank='counterpart'if j['layout']=='counterpart'else ranks[0][1]if ranks[0][0]<.20 else None
        speed=0;on=False
        for x in range(700,1025):
            yes=any((lambda p:p[0]>130 and p[0]>p[1]*1.5 and p[2]>40)(im.getpixel((x,y)))for y in range(701,719))
            if yes and not on:speed+=1
            on=yes
        defense=sorted(min(im.getpixel((x,y)))for y in range(645,664)for x in range(858,878))[190]
        attack=glyph(im,(798,638,833,674));matches=sorted((distance(attack,t),n)for n,t in surge_templates.items())
        # A defense dash is much flatter than the block shield.
        block=glyph(im,(940,637,975,676));whitepoints=[(x,y)for y in range(637,676)for x in range(940,975)if min(im.getpixel((x,y)))>185]
        blockheight=max((p[1]for p in whitepoints),default=0)-min((p[1]for p in whitepoints),default=0)
        result={'rank':rank,'rankScores':ranks,'speed':speed if 1<=speed<=3 else None,'defenseDie':'white'if defense>130 else'red','attackSurge':matches[0][1]if matches[0][0]<.18 else None,'attackSurgeScores':matches,'defenseSurge':'block'if blockheight>13 else'none','weaponDice':[]}
        for i,row in enumerate(j['weaponRows']):
            top=round(row['top']*726);dx=350 if j['layout']=='counterpart'else 0;pic=im.crop((500+dx,top+9,641+dx,top+92));pts={(x,y)for y in range(pic.height)for x in range(pic.width)if min(pic.getpixel((x,y)))>175};found=[]
            for a,b,c,d,part in components(pts):
                w,h=c-a,d-b
                if not (5<=w<=50 and 15<=h<=65 and a>3 and c<130 and 8<b<65):continue
                if h>35:
                    # White die: its white face is one component surrounding a dark numeral.
                    crop=pic.crop((a+round(w*.28),b+round(h*.23),c-round(w*.28),d-round(h*.23))).convert('L');crop=crop.point(lambda n:0 if n<100 else 255);color='white'
                else:
                    crop=Image.new('L',(w+10,h+10),255)
                    for x,y in part:crop.putpixel((x-a+5,y-b+5),0)
                    color='red'if any((lambda p:p[0]>90 and p[0]>p[1]*1.6)(pic.getpixel((x,y)))for x,y in [(max(0,a-3),(b+d)//2),(min(pic.width-1,c+3),(b+d)//2)])else'black'
                file=f'{j["folder"]}/die-{i}-{len(found)}.png';ImageOps.expand(crop.resize((crop.width*5,crop.height*5)),20,fill=255).save(ROOT/file)
                found.append({'color':color,'image':file,'bbox':[a+500,b+top+9,c+500,d+top+9]});digitjobs.append({'file':file})
            result['weaponDice'].append(found)
        (ROOT/j['folder']/'shapes.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    (WORK/'digit-jobs.json').write_text(json.dumps(digitjobs),encoding='utf8');print('Prepared',len(digitjobs),'isolated dice numerals')
if __name__=='__main__':main()
