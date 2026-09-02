from __future__ import annotations
import hashlib, html, io, json, os, re, shutil, time, zipfile
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import requests
from PIL import Image

ROOT = Path(__file__).resolve().parent
NEWS = json.loads((ROOT / 'news.json').read_text(encoding='utf-8'))
POOL = json.loads((ROOT / 'curated_pool.json').read_text(encoding='utf-8'))
OUT = ROOT / 'output'
IMG = OUT / 'images'
N = int(os.getenv('IMAGES_PER_NEWS', '3'))
MIN_W = int(os.getenv('MIN_WIDTH', '1200'))
MIN_H = int(os.getenv('MIN_HEIGHT', '675'))
SEARCH_LIMIT = int(os.getenv('SEARCH_LIMIT', '80'))
BING_LIMIT = int(os.getenv('BING_LIMIT', '40'))
OPENVERSE_LIMIT = int(os.getenv('OPENVERSE_LIMIT', '40'))
COMMONS_LIMIT = int(os.getenv('COMMONS_LIMIT', '40'))

COMMONS_API = 'https://commons.wikimedia.org/w/api.php'
OPENVERSE_API = 'https://api.openverse.org/v1/images/'
BING_IMAGES = 'https://www.bing.com/images/search'

S = requests.Session()
S.headers.update({
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36 daily-news-image-pack/11.0',
    'Accept-Language': 'en-US,en;q=0.9',
})

REJECT = (
    'diagram','chart','graph','illustration','drawing','painting','poster','logo','icon','render','rendering',
    'infographic','cartoon','collage','coat of arms','emblem','3d model','vector','locator map','route map','map.svg'
)
OFFICIAL_HINTS = (
    '.gov', '.mil', 'nasa.gov', 'esa.int', 'un.org', 'who.int', 'nato.int', 'consilium.europa.eu',
    'gov.cn', 'xinjiang.gov.cn', 'mod.gov.cn', 'customs.gov.cn', 'nea.gov.cn', 'ndrc.gov.cn',
    'xjbt.gov.cn', 'ts.cn', 'xjdaily.com', 'xinhuanet.com', 'people.com.cn', 'cctv.com'
)
KNOWN_REUSE = ('upload.wikimedia.org','commons.wikimedia.org','images.unsplash.com','images.pexels.com')

class BingParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.items = []
    def handle_starttag(self, tag, attrs):
        if tag != 'a':
            return
        d = dict(attrs)
        classes = d.get('class','')
        m = d.get('m')
        if 'iusc' not in classes or not m:
            return
        try:
            obj = json.loads(html.unescape(m))
        except Exception:
            return
        murl = obj.get('murl') or obj.get('turl')
        purl = obj.get('purl') or ''
        title = obj.get('t') or obj.get('desc') or ''
        if murl:
            self.items.append({'download_url': murl, 'source_page': purl, 'title': title})

def clean_text(s: str) -> str:
    return re.sub(r'<[^>]+>', ' ', s or '').replace('&nbsp;', ' ').strip()

def reject_text(*parts: str) -> bool:
    blob = ' '.join(p or '' for p in parts).lower()
    return any(x in blob for x in REJECT)

def verify(data: bytes | None):
    if not data:
        return None
    try:
        im = Image.open(io.BytesIO(data))
        fmt = (im.format or '').upper()
        w, h = im.size
        if fmt not in {'JPEG','PNG','WEBP'} or w < MIN_W or h < MIN_H:
            return None
        return w, h, fmt
    except Exception:
        return None

def get_bytes(url: str):
    try:
        r = S.get(url, timeout=30, allow_redirects=True, stream=False, headers={'Referer':'https://www.bing.com/'})
        r.raise_for_status()
        ctype = (r.headers.get('content-type') or '').lower()
        if 'svg' in ctype or 'text/html' in ctype:
            return None
        data = r.content
        return data if len(data) > 20000 else None
    except Exception:
        return None

def host(url: str) -> str:
    try:
        return urlparse(url).netloc.lower()
    except Exception:
        return ''

def rights_rank(c):
    lic = (c.get('license') or '').lower()
    h = host(c.get('download_url') or '') + ' ' + host(c.get('source_page') or '')
    if lic and lic not in {'unknown','all rights reserved'}:
        return 0
    if any(x in h for x in KNOWN_REUSE):
        return 1
    if any(x in h for x in OFFICIAL_HINTS):
        return 2
    return 3

def candidate_key(c):
    return hashlib.sha1((c.get('download_url') or c.get('source_page') or c.get('title') or '').encode('utf-8')).hexdigest()

def commons_search(q: str):
    try:
        r = S.get(COMMONS_API, params={
            'action':'query','format':'json','generator':'search','gsrsearch':q,'gsrnamespace':6,
            'gsrlimit':COMMONS_LIMIT,'prop':'imageinfo','iiprop':'url|size|mime|extmetadata','iiurlwidth':1800,
            'redirects':1
        }, timeout=30)
        r.raise_for_status()
        pages = list((r.json().get('query',{}).get('pages') or {}).values())
    except Exception:
        return []
    out=[]
    for p in pages:
        ii=(p.get('imageinfo') or [{}])[0]; e=ii.get('extmetadata') or {}
        title=p.get('title',''); desc=clean_text(((e.get('ImageDescription') or {}).get('value','')))
        if reject_text(title,desc):
            continue
        mime=(ii.get('mime') or '').lower(); ow=int(ii.get('width') or 0); oh=int(ii.get('height') or 0)
        if mime not in {'image/jpeg','image/png','image/webp'} or ow<MIN_W or oh<MIN_H:
            continue
        lic=((e.get('LicenseShortName') or {}).get('value','')) or ((e.get('UsageTerms') or {}).get('value','')) or 'unknown'
        out.append({
            'title': title, 'download_url': ii.get('thumburl') or ii.get('url',''),
            'source_page': ii.get('descriptionurl',''), 'source':'Wikimedia Commons', 'license': clean_text(lic),
            'license_url': ((e.get('LicenseUrl') or {}).get('value','')), 'source_tier':'commons-search'
        })
    return [x for x in out if x.get('download_url')]

def openverse_search(q: str):
    try:
        r=S.get(OPENVERSE_API, params={'q':q,'page_size':OPENVERSE_LIMIT,'mature':'false'}, timeout=30)
        r.raise_for_status(); data=r.json().get('results') or []
    except Exception:
        return []
    out=[]
    for x in data:
        url=x.get('url') or x.get('thumbnail') or ''
        title=x.get('title') or ''
        if not url or reject_text(title,url):
            continue
        lic=(x.get('license') or 'unknown')
        licver=x.get('license_version') or ''
        out.append({
            'title':title,'download_url':url,'source_page':x.get('foreign_landing_url') or '',
            'source':x.get('source') or 'Openverse','license':(lic+' '+licver).strip(),
            'license_url':x.get('license_url') or '', 'creator':x.get('creator') or '',
            'source_tier':'openverse-full-web-index'
        })
    return out

def bing_search(q: str):
    try:
        r=S.get(BING_IMAGES, params={'q':q,'form':'HDRSC3','first':'1','tsc':'ImageBasicHover'}, timeout=30)
        r.raise_for_status()
        p=BingParser(); p.feed(r.text)
    except Exception:
        return []
    out=[]
    for x in p.items[:BING_LIMIT]:
        if reject_text(x.get('title',''),x.get('download_url',''),x.get('source_page','')):
            continue
        x.update({'source':'Bing Images web search','license':'unknown','license_url':'','source_tier':'full-web-search'})
        out.append(x)
    return out

def exact_commons(title: str):
    try:
        r=S.get(COMMONS_API, params={'action':'query','format':'json','titles':title,'prop':'imageinfo','iiprop':'url|size|mime|extmetadata','iiurlwidth':1800,'redirects':1},timeout=30)
        r.raise_for_status(); pages=list((r.json().get('query',{}).get('pages') or {}).values())
    except Exception:
        return []
    out=[]
    for p in pages:
        ii=(p.get('imageinfo') or [{}])[0]; e=ii.get('extmetadata') or {}
        if not ii: continue
        title2=p.get('title',title)
        if reject_text(title2): continue
        lic=((e.get('LicenseShortName') or {}).get('value','')) or ((e.get('UsageTerms') or {}).get('value','')) or 'unknown'
        url=ii.get('thumburl') or ii.get('url') or ''
        if url:
            out.append({'title':title2,'download_url':url,'source_page':ii.get('descriptionurl',''),'source':'Wikimedia Commons','license':clean_text(lic),'license_url':((e.get('LicenseUrl') or {}).get('value','')),'source_tier':'curated-exact'})
    return out

def ext(fmt):
    return {'JPEG':'.jpg','PNG':'.png','WEBP':'.webp'}.get(fmt,'.jpg')

def main():
    shutil.rmtree(OUT, ignore_errors=True); IMG.mkdir(parents=True, exist_ok=True)
    used=set(); items=[]; total=0; diagnostics={}
    for item in NEWS:
        pid=str(item['id']); pool=POOL.get(pid,{})
        rec={'id':item['id'],'title':item['title'],'images':[]}; candidates=[]; diag=[]
        for t in pool.get('files') or []:
            arr=exact_commons(t); candidates.extend(arr); diag.append({'type':'exact','query':t,'found':len(arr)})
        queries=list(pool.get('queries') or [])
        if item.get('title') and item['title'] not in queries:
            queries.append(item['title'])
        for q in queries:
            if len(candidates) >= SEARCH_LIMIT*3:
                break
            a=commons_search(q); b=openverse_search(q); c=bing_search(q)
            candidates.extend(a); candidates.extend(b); candidates.extend(c)
            diag.append({'type':'full-web','query':q,'commons':len(a),'openverse':len(b),'bing':len(c)})
            time.sleep(.12)
        uniq=[]; seen=set()
        for c in sorted(candidates, key=rights_rank):
            k=candidate_key(c)
            if k in seen: continue
            seen.add(k); uniq.append(c)
        for c in uniq:
            if len(rec['images']) >= N: break
            k=candidate_key(c)
            if k in used: continue
            data=get_bytes(c.get('download_url','')); ck=verify(data)
            if not ck: continue
            w,h,fmt=ck; fn=f"{int(item['id']):02d}_{len(rec['images'])+1}{ext(fmt)}"
            (IMG/fn).write_bytes(data)
            m=dict(c); m.update({'file':fn,'width':w,'height':h,'format':fmt,'rights_status':'known' if rights_rank(c)<3 else 'unknown-check-source-page'})
            rec['images'].append(m); used.add(k); total+=1
        rec['missing']=N-len(rec['images']); items.append(rec); diagnostics[pid]=diag
        print(f"{int(item['id']):02d}: {len(rec['images'])}/{N} web_candidates={len(uniq)}")
    manifest={
        'generated_at_utc':datetime.now(timezone.utc).isoformat(),
        'generated_at_beijing':datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(),
        'version':'11.0-full-web','downloaded_images':total,'missing_images':13*N-total,
        'items':items,'diagnostics':diagnostics,
        'rules':{
            'search_scope':'full web','engines':['Wikimedia Commons','Openverse','Bing Images'],
            'real_images_only':True,'target_images':13*N,'minimum':[MIN_W,MIN_H],
            'rights_priority':'known reusable > known reuse hosts > official/public institutions > unknown-rights web images',
            'unknown_rights_marked_in_manifest':True
        }
    }
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    lines=['每日新闻相关图片包 v11 · 全网搜索','',f'实际下载：{total}/{13*N} 张。',
           '搜索范围：Wikimedia Commons + Openverse 全网开放许可索引 + Bing Images 全网图片搜索。',
           '优先可复用许可和官方来源；版权状态不明确的候选会在 manifest 中标记 unknown-check-source-page。','']
    lines += [f"{r['id']:02d}. {r['title']} — {len(r['images'])}/{N}" for r in items]
    (OUT/'README_来源与许可.txt').write_text('\n'.join(lines),encoding='utf-8')
    stamp=datetime.now(ZoneInfo('Asia/Shanghai')).strftime('%Y-%m-%d'); zp=ROOT/f'daily-news-images-{stamp}.zip'
    if zp.exists(): zp.unlink()
    with zipfile.ZipFile(zp,'w',zipfile.ZIP_DEFLATED) as z:
        for p in sorted(IMG.iterdir()): z.write(p,p.name)
        z.write(OUT/'manifest.json','manifest.json'); z.write(OUT/'README_来源与许可.txt','README_来源与许可.txt')
    print(f'Downloaded {total}/{13*N}; ZIP={zp.name}')

if __name__=='__main__':
    main()
