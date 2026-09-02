from __future__ import annotations
import io,json,os,shutil,time,zipfile
from datetime import datetime,timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import requests
from PIL import Image

ROOT=Path(__file__).resolve().parent
NEWS=json.loads((ROOT/'news.json').read_text(encoding='utf-8'))
POOL=json.loads((ROOT/'curated_pool.json').read_text(encoding='utf-8'))
OUT=ROOT/'output'; IMG=OUT/'images'
N=int(os.getenv('IMAGES_PER_NEWS','3')); MIN_W=int(os.getenv('MIN_WIDTH','1200')); MIN_H=int(os.getenv('MIN_HEIGHT','675'))
SEARCH_LIMIT=int(os.getenv('SEARCH_LIMIT','60')); THUMB_W=int(os.getenv('THUMB_WIDTH','1800'))
API='https://commons.wikimedia.org/w/api.php'
S=requests.Session(); S.headers.update({'User-Agent':'daily-news-image-pack/10.0 (GitHub Actions; real-image packer)','Accept':'application/json,image/*,*/*;q=0.8'})
REJECT=('diagram','chart','graph','illustration','drawing','painting','poster','logo','icon','render','rendering','infographic','cartoon','collage','coat of arms','emblem','3d model','vector','locator map','route map')

def verify(data):
    try:
        im=Image.open(io.BytesIO(data)); fmt=(im.format or '').upper(); w,h=im.size
        if fmt not in {'JPEG','PNG','WEBP'} or w<MIN_W or h<MIN_H:return None
        return w,h,fmt
    except Exception:return None

def get_bytes(url):
    try:
        r=S.get(url,timeout=45,allow_redirects=True); r.raise_for_status()
        return r.content if len(r.content)>20000 else None
    except Exception:return None

def val(e,k): return ((e.get(k) or {}).get('value',''))

def license_ok(e):
    blob=' '.join([val(e,'LicenseShortName'),val(e,'License'),val(e,'UsageTerms'),val(e,'Copyrighted')]).lower()
    return ('creative commons' in blob or 'cc by' in blob or 'cc-by' in blob or 'cc0' in blob or 'public domain' in blob or 'pd-' in blob or val(e,'Copyrighted').lower() in {'false','no'})

def page_to_candidate(p):
    ii=(p.get('imageinfo') or [{}])[0]; e=ii.get('extmetadata') or {}
    desc=' '.join([p.get('title',''),val(e,'ImageDescription'),val(e,'ObjectName'),val(e,'Categories')]).lower()
    if any(x in desc for x in REJECT): return None,'visual_reject'
    mime=(ii.get('mime') or '').lower(); ow=int(ii.get('width') or 0); oh=int(ii.get('height') or 0)
    if mime not in {'image/jpeg','image/png','image/webp'}: return None,'mime_reject'
    if ow<MIN_W or oh<MIN_H: return None,'source_too_small'
    if not license_ok(e): return None,'license_reject'
    url=ii.get('thumburl') or ii.get('url') or ''
    if not url: return None,'no_url'
    return {
        'title':p.get('title',''),'download_url':url,'source_page':ii.get('descriptionurl',''),
        'license':val(e,'LicenseShortName'),'license_url':val(e,'LicenseUrl'),'artist':val(e,'Artist'),'credit':val(e,'Credit'),
        'date_time_original':val(e,'DateTimeOriginal') or val(e,'DateTime'),'original_width':ow,'original_height':oh,
        'source':'Wikimedia Commons','source_tier':'commons-api-thumb-or-original'
    },None

def query_titles(titles):
    results=[]; reasons={}
    for start in range(0,len(titles),20):
        batch=titles[start:start+20]
        try:
            r=S.get(API,params={'action':'query','format':'json','titles':'|'.join(batch),'prop':'imageinfo','iiprop':'url|size|mime|extmetadata','iiurlwidth':THUMB_W,'redirects':1},timeout=35); r.raise_for_status()
            pages=list((r.json().get('query',{}).get('pages') or {}).values())
        except Exception:
            for t in batch: reasons[t]='api_error'
            continue
        for p in pages:
            c,why=page_to_candidate(p)
            if c: results.append(c)
            else: reasons[p.get('title','unknown')]=why
        time.sleep(.08)
    return results,reasons

def search_candidates(q):
    try:
        r=S.get(API,params={'action':'query','format':'json','generator':'search','gsrsearch':q,'gsrnamespace':6,'gsrlimit':SEARCH_LIMIT,'prop':'imageinfo','iiprop':'url|size|mime|extmetadata','iiurlwidth':THUMB_W,'redirects':1},timeout=35); r.raise_for_status()
        pages=list((r.json().get('query',{}).get('pages') or {}).values())
    except Exception:return [],{'search_api':'api_error'}
    out=[]; reasons={}
    for p in pages:
        c,why=page_to_candidate(p)
        if c: out.append(c)
        else: reasons[p.get('title','unknown')]=why
    return out,reasons

def ext(fmt):return {'JPEG':'.jpg','PNG':'.png','WEBP':'.webp'}.get(fmt,'.jpg')

def main():
    shutil.rmtree(OUT,ignore_errors=True);IMG.mkdir(parents=True,exist_ok=True)
    used=set(); items=[]; total=0; diagnostics={}
    for item in NEWS:
        pid=str(item['id']); pool=POOL.get(pid,{})
        rec={'id':item['id'],'title':item['title'],'images':[]}; di=[]
        candidates=[]
        exact=list(pool.get('files') or [])
        ex,rs=query_titles(exact) if exact else ([],{})
        candidates.extend(ex); di.append({'exact_candidates':len(ex),'exact_rejections':rs})
        for q in pool.get('queries') or []:
            if len(candidates)>=40: break
            arr,rr=search_candidates(q); di.append({'query':q,'candidates':len(arr),'rejections_sample':dict(list(rr.items())[:8])})
            seen_titles={c['title'].lower() for c in candidates}
            for c in arr:
                if c['title'].lower() not in seen_titles:
                    candidates.append(c); seen_titles.add(c['title'].lower())
            time.sleep(.08)
        for c in candidates:
            if len(rec['images'])>=N:break
            key=c['title'].lower()
            if key in used:continue
            data=get_bytes(c['download_url'])
            ck=verify(data) if data else None
            if not ck: continue
            w,h,fmt=ck; fn=f"{int(item['id']):02d}_{len(rec['images'])+1}{ext(fmt)}"; (IMG/fn).write_bytes(data)
            m=dict(c); m.update({'file':fn,'width':w,'height':h,'format':fmt}); rec['images'].append(m); used.add(key); total+=1
        rec['missing']=N-len(rec['images']); items.append(rec); diagnostics[pid]=di
        print(f"{int(item['id']):02d}: {len(rec['images'])}/{N} candidates={len(candidates)}")
    manifest={'generated_at_utc':datetime.now(timezone.utc).isoformat(),'generated_at_beijing':datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(),'version':'10.0','downloaded_images':total,'missing_images':13*N-total,'items':items,'diagnostics':diagnostics,'rules':{'batched_exact_lookup':True,'api_thumbnail_width':THUMB_W,'real_images_only':True,'reusable_license_required':True,'target_images':13*N,'minimum':[MIN_W,MIN_H]}}
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    lines=['每日新闻相关图片包 v10','',f'实际下载：{total}/{13*N} 张。','V10 使用 Commons API 批量解析文件，并优先下载约 1800px 的官方缩略原图；manifest 内含拒绝原因诊断。','']+[f"{r['id']:02d}. {r['title']} — {len(r['images'])}/{N}" for r in items]
    (OUT/'README_来源与许可.txt').write_text('\n'.join(lines),encoding='utf-8')
    stamp=datetime.now(ZoneInfo('Asia/Shanghai')).strftime('%Y-%m-%d'); zp=ROOT/f'daily-news-images-{stamp}.zip'
    if zp.exists():zp.unlink()
    with zipfile.ZipFile(zp,'w',zipfile.ZIP_DEFLATED) as z:
        for p in sorted(IMG.iterdir()):z.write(p,p.name)
        z.write(OUT/'manifest.json','manifest.json');z.write(OUT/'README_来源与许可.txt','README_来源与许可.txt')
    print(f'Downloaded {total}/{13*N}; ZIP={zp.name}')

if __name__=='__main__':main()
