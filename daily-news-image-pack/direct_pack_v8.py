from __future__ import annotations
import io,json,os,shutil,zipfile
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
API='https://commons.wikimedia.org/w/api.php'
S=requests.Session(); S.headers.update({'User-Agent':'daily-news-image-pack/8.0'})

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

def meta(title):
    try:
        r=S.get(API,params={'action':'query','format':'json','titles':title,'prop':'imageinfo','iiprop':'url|extmetadata'},timeout=30);r.raise_for_status()
        p=next(iter((r.json().get('query',{}).get('pages') or {}).values()));ii=(p.get('imageinfo') or [{}])[0];e=ii.get('extmetadata') or {}
        val=lambda k:((e.get(k) or {}).get('value',''))
        return {'source_page':ii.get('descriptionurl',''),'license':val('LicenseShortName'),'license_url':val('LicenseUrl'),'artist':val('Artist'),'date_time_original':val('DateTimeOriginal') or val('DateTime')}
    except Exception:return {'source_page':'','license':'','license_url':'','artist':'','date_time_original':''}

def direct(title):
    name=title[5:] if title.lower().startswith('file:') else title
    url='https://commons.wikimedia.org/wiki/Special:Redirect/file/'+quote(name,safe='')
    data=get(url); ck=verify(data) if data else None
    if not ck:return None
    w,h,fmt=ck;m=meta(title);m.update({'title':title,'download_url':url,'source':'Wikimedia Commons','width':w,'height':h,'format':fmt,'source_tier':'verified-direct-file'})
    return data,m

def search(q):
    try:
        r=S.get(API,params={'action':'query','format':'json','generator':'search','gsrsearch':q,'gsrnamespace':6,'gsrlimit':20,'prop':'imageinfo','iiprop':'url|size|mime|extmetadata','redirects':1},timeout=30);r.raise_for_status()
        pages=list((r.json().get('query',{}).get('pages') or {}).values())
    except Exception:return []
    out=[]
    for p in pages:
        ii=(p.get('imageinfo') or [{}])[0]
        if (ii.get('mime') or '').lower() not in {'image/jpeg','image/png','image/webp'}:continue
        w=int(ii.get('width') or 0);h=int(ii.get('height') or 0)
        if w<MIN_W or h<MIN_H:continue
        out.append(p.get('title',''))
    return out

def ext(fmt):return {'JPEG':'.jpg','PNG':'.png','WEBP':'.webp'}.get(fmt,'.jpg')

def main():
    shutil.rmtree(OUT,ignore_errors=True);IMG.mkdir(parents=True,exist_ok=True)
    used=set();items=[];total=0
    for item in NEWS:
        pid=str(item['id']); pool=POOL.get(pid,{})
        rec={'id':item['id'],'title':item['title'],'images':[]}
        titles=list(pool.get('files') or [])
        for q in pool.get('queries') or []:
            if len(titles)>=12:break
            for t in search(q):
                if t not in titles:titles.append(t)
                if len(titles)>=12:break
        for title in titles:
            if len(rec['images'])>=N:break
            if title in used:continue
            r=direct(title)
            if not r:continue
            data,m=r; fn=f"{int(item['id']):02d}_{len(rec['images'])+1}{ext(m['format'])}";(IMG/fn).write_bytes(data);m['file']=fn;rec['images'].append(m);used.add(title);total+=1
        rec['missing']=N-len(rec['images']);items.append(rec)
    manifest={'generated_at_utc':datetime.now(timezone.utc).isoformat(),'generated_at_beijing':datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(),'version':'8.0','downloaded_images':total,'missing_images':13*N-total,'items':items,'rules':{'direct_commons_redirect_first':True,'real_images_only':True,'target_images':13*N,'minimum':[MIN_W,MIN_H]}}
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    lines=['每日新闻相关图片包 v8','',f'实际下载：{total}/{13*N} 张。','人工图片池中的 Commons 文件直接通过 Special:Redirect/file 下载，搜索只负责补候选。','']+[f"{r['id']:02d}. {r['title']} — {len(r['images'])}/{N}" for r in items]
    (OUT/'README_来源与许可.txt').write_text('\n'.join(lines),encoding='utf-8')
    stamp=datetime.now(ZoneInfo('Asia/Shanghai')).strftime('%Y-%m-%d');zp=ROOT/f'daily-news-images-{stamp}.zip'
    if zp.exists():zp.unlink()
    with zipfile.ZipFile(zp,'w',zipfile.ZIP_DEFLATED) as z:
        for p in sorted(IMG.iterdir()):z.write(p,p.name)
        z.write(OUT/'manifest.json','manifest.json');z.write(OUT/'README_来源与许可.txt','README_来源与许可.txt')
    print(f'Downloaded {total}/{13*N}; ZIP={zp.name}')

if __name__=='__main__':main()
