from __future__ import annotations
import hashlib,io,json,os,shutil,time,zipfile
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo
import requests
from PIL import Image

ROOT=Path(__file__).resolve().parent
NEWS=json.loads((ROOT/'news.json').read_text(encoding='utf-8'))
POOL=json.loads((ROOT/'curated_pool.json').read_text(encoding='utf-8'))
OUT=ROOT/'output'; IMG=OUT/'images'
N=int(os.getenv('IMAGES_PER_NEWS','3')); MIN_W=int(os.getenv('MIN_WIDTH','1200')); MIN_H=int(os.getenv('MIN_HEIGHT','675'))
SEARCH_LIMIT=int(os.getenv('SEARCH_LIMIT','60'))
API='https://commons.wikimedia.org/w/api.php'
S=requests.Session(); S.headers.update({'User-Agent':'daily-news-image-pack/9.0','Accept':'application/json,image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'})
OKLIC=('cc by','cc-by','cc0','public domain','pd-','pdm','creative commons')
REJECT=('diagram','chart','graph','illustration','drawing','painting','poster','logo','icon','render','rendering','infographic','cartoon','collage','coat of arms','emblem','3d model','vector','locator map','route map')

def verify(data):
    try:
        im=Image.open(io.BytesIO(data)); fmt=(im.format or '').upper(); w,h=im.size
        if fmt not in {'JPEG','PNG','WEBP'} or w<MIN_W or h<MIN_H:return None
        return w,h,fmt
    except Exception:return None

def get(url):
    try:
        r=S.get(url,timeout=45,allow_redirects=True); r.raise_for_status()
        return r.content if len(r.content)>20000 else None
    except Exception:return None

def clean_title(title):
    return title[5:] if title.lower().startswith('file:') else title

def upload_url(title):
    name=clean_title(title).replace(' ','_')
    digest=hashlib.md5(name.encode('utf-8')).hexdigest()
    return f'https://upload.wikimedia.org/wikipedia/commons/{digest[0]}/{digest[:2]}/{quote(name,safe="()!$&\'*,;=:@-_.~")}'

def meta(title):
    try:
        r=S.get(API,params={'action':'query','format':'json','titles':title,'prop':'imageinfo','iiprop':'url|size|mime|extmetadata','redirects':1},timeout=30);r.raise_for_status()
        p=next(iter((r.json().get('query',{}).get('pages') or {}).values()));ii=(p.get('imageinfo') or [{}])[0];e=ii.get('extmetadata') or {}
        val=lambda k:((e.get(k) or {}).get('value',''))
        blob=' '.join([p.get('title',''),val('ImageDescription'),val('ObjectName'),val('Categories')]).lower()
        lic=' '.join([val('LicenseShortName'),val('License'),val('UsageTerms'),val('Copyrighted')]).lower()
        reusable=any(x in lic for x in OKLIC) or val('Copyrighted').lower() in {'false','no'}
        safe=not any(x in blob for x in REJECT)
        return {'canonical_title':p.get('title') or title,'source_page':ii.get('descriptionurl',''),'api_url':ii.get('url',''),'license':val('LicenseShortName'),'license_url':val('LicenseUrl'),'artist':val('Artist'),'credit':val('Credit'),'date_time_original':val('DateTimeOriginal') or val('DateTime'),'reusable':reusable,'safe':safe}
    except Exception:return {'canonical_title':title,'source_page':'','api_url':'','license':'','license_url':'','artist':'','credit':'','date_time_original':'','reusable':False,'safe':False}

def download_title(title):
    m=meta(title)
    if not m['reusable'] or not m['safe']:return None
    candidates=[]
    if m.get('api_url'):candidates.append(('api-original',m['api_url']))
    candidates.append(('md5-upload',upload_url(m.get('canonical_title') or title)))
    candidates.append(('special-redirect','https://commons.wikimedia.org/wiki/Special:Redirect/file/'+quote(clean_title(m.get('canonical_title') or title),safe='')))
    for tier,url in candidates:
        data=get(url); ck=verify(data) if data else None
        if not ck:continue
        w,h,fmt=ck;m.update({'title':m.get('canonical_title') or title,'download_url':url,'source':'Wikimedia Commons','width':w,'height':h,'format':fmt,'source_tier':tier});return data,m
    return None

def search(q):
    try:
        r=S.get(API,params={'action':'query','format':'json','generator':'search','gsrsearch':q,'gsrnamespace':6,'gsrlimit':SEARCH_LIMIT,'prop':'imageinfo','iiprop':'url|size|mime|extmetadata','redirects':1},timeout=35);r.raise_for_status()
        pages=list((r.json().get('query',{}).get('pages') or {}).values())
    except Exception:return []
    out=[]
    for p in pages:
        ii=(p.get('imageinfo') or [{}])[0];w=int(ii.get('width') or 0);h=int(ii.get('height') or 0)
        if (ii.get('mime') or '').lower() not in {'image/jpeg','image/png','image/webp'} or w<MIN_W or h<MIN_H:continue
        out.append(p.get('title',''))
    return out

def ext(fmt):return {'JPEG':'.jpg','PNG':'.png','WEBP':'.webp'}.get(fmt,'.jpg')

def main():
    shutil.rmtree(OUT,ignore_errors=True);IMG.mkdir(parents=True,exist_ok=True)
    used=set();items=[];total=0
    for item in NEWS:
        pid=str(item['id']);pool=POOL.get(pid,{})
        rec={'id':item['id'],'title':item['title'],'images':[]}
        titles=list(pool.get('files') or [])
        for q in pool.get('queries') or []:
            if len(titles)>=30:break
            for t in search(q):
                if t not in titles:titles.append(t)
                if len(titles)>=30:break
            time.sleep(.05)
        for title in titles:
            if len(rec['images'])>=N:break
            k=title.lower()
            if k in used:continue
            r=download_title(title)
            if not r:continue
            data,m=r; fn=f"{int(item['id']):02d}_{len(rec['images'])+1}{ext(m['format'])}";(IMG/fn).write_bytes(data)
            m['file']=fn;rec['images'].append(m);used.add(k);total+=1
        rec['missing']=N-len(rec['images']);items.append(rec)
        print(f"{int(item['id']):02d}: {len(rec['images'])}/{N}")
    manifest={'generated_at_utc':datetime.now(timezone.utc).isoformat(),'generated_at_beijing':datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(),'version':'9.0','downloaded_images':total,'missing_images':13*N-total,'items':items,'rules':{'api_original_first':True,'deterministic_md5_upload_fallback':True,'special_redirect_last':True,'reusable_license_required':True,'real_images_only':True,'target_images':13*N,'minimum':[MIN_W,MIN_H]}}
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    lines=['每日新闻相关图片包 v9','',f'实际下载：{total}/{13*N} 张。','下载顺序：Commons API 原图地址 → upload.wikimedia.org MD5 确定性原图地址 → Special:Redirect/file。','仅接受可重复利用许可的真实 JPEG/PNG/WEBP 图片。','']+[f"{r['id']:02d}. {r['title']} — {len(r['images'])}/{N}" for r in items]
    (OUT/'README_来源与许可.txt').write_text('\n'.join(lines),encoding='utf-8')
    stamp=datetime.now(ZoneInfo('Asia/Shanghai')).strftime('%Y-%m-%d');zp=ROOT/f'daily-news-images-{stamp}.zip'
    if zp.exists():zp.unlink()
    with zipfile.ZipFile(zp,'w',zipfile.ZIP_DEFLATED) as z:
        for p in sorted(IMG.iterdir()):z.write(p,p.name)
        z.write(OUT/'manifest.json','manifest.json');z.write(OUT/'README_来源与许可.txt','README_来源与许可.txt')
    print(f'Downloaded {total}/{13*N}; ZIP={zp.name}')

if __name__=='__main__':main()
