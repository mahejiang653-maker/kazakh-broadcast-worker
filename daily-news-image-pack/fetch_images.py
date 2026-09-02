from __future__ import annotations
import io,json,os,re,shutil,sys,time,zipfile
from datetime import datetime,timezone
from pathlib import Path
from typing import Any
import requests
from PIL import Image

COMMONS_API='https://commons.wikimedia.org/w/api.php'
OPENVERSE_API='https://api.openverse.org/v1/images/'
UA='daily-news-image-pack/4.0 (real-news-image collection)'
MIN_W=int(os.getenv('MIN_WIDTH','1600')); MIN_H=int(os.getenv('MIN_HEIGHT','900'))
FB_W=int(os.getenv('FALLBACK_MIN_WIDTH','1200')); FB_H=int(os.getenv('FALLBACK_MIN_HEIGHT','675'))
N=int(os.getenv('IMAGES_PER_NEWS','3')); LIMIT=int(os.getenv('SEARCH_LIMIT','50')); TIMEOUT=35
ROOT=Path(__file__).resolve().parent; INPUT=ROOT/'news.json'; OUT=ROOT/'output'; IMG=OUT/'images'
REJECT={'diagram','chart','graph','illustration','drawing','painting','poster','logo','icon','render','rendering','infographic','cartoon','collage','coat of arms','emblem','3d model','vector','locator map','route map'}
LEADERS={'donald trump','vladimir putin','volodymyr zelensky','ali khamenei','xi jinping','joe biden','emmanuel macron','narendra modi','recep tayyip erdogan'}
OKLIC={'cc0','by','by-sa','pdm','pdmark','pdcert'}
s=requests.Session(); s.headers.update({'User-Agent':UA,'Accept':'application/json,text/plain,*/*'})

def clean(x): return re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',str(x or '')).lower()).strip()
def story_ok(blob,item):
 b=clean(blob)
 if any(x in b for x in REJECT) or any(x in b for x in LEADERS): return False
 if any(clean(x) in b for x in item.get('avoid',[])): return False
 must=[clean(x) for x in item.get('must_any',[]) if x]
 return not must or any(x in b for x in must)
def story_bonus(blob,item): return sum(5 for x in item.get('prefer',[]) if clean(x) in clean(blob))
def verify(data,mw,mh):
 try:
  im=Image.open(io.BytesIO(data)); fmt=(im.format or '').upper(); im.verify(); im=Image.open(io.BytesIO(data)); w,h=im.size
 except Exception:return None
 return (w,h,fmt) if w>=mw and h>=mh and fmt in {'JPEG','PNG','WEBP'} else None
def getbytes(url):
 try:
  r=s.get(url,timeout=TIMEOUT,allow_redirects=True); r.raise_for_status()
  if len(r.content)<20000:return None
  return r.content
 except Exception:return None
def ext(fmt): return {'JPEG':'.jpg','PNG':'.png','WEBP':'.webp'}.get(fmt,'.jpg')
def ev(e,k): return re.sub(r'<[^>]+>',' ',((e.get(k) or {}).get('value',''))).strip()
def cblob(p):
 ii=(p.get('imageinfo') or [{}])[0]; e=ii.get('extmetadata') or {}
 return ' '.join([p.get('title','')]+[ev(e,k) for k in ('ImageDescription','Categories','ObjectName','Credit','Artist')])
def clic(p):
 ii=(p.get('imageinfo') or [{}])[0]; e=ii.get('extmetadata') or {}; z=' '.join(ev(e,k) for k in ('LicenseShortName','License','UsageTerms','Copyrighted')).lower()
 return any(x in z for x in ('cc by','cc-by','cc0','public domain','pd-')) or ev(e,'Copyrighted').lower() in {'false','no'}
def commons(q,item,mw,mh):
 pa={'action':'query','format':'json','generator':'search','gsrsearch':q,'gsrnamespace':6,'gsrlimit':LIMIT,'prop':'imageinfo','iiprop':'url|size|mime|mediatype|extmetadata','iiurlwidth':3840,'redirects':1}
 r=s.get(COMMONS_API,params=pa,timeout=TIMEOUT); r.raise_for_status(); arr=list((r.json().get('query',{}).get('pages',{}) or {}).values()); out=[]
 for p in arr:
  ii=(p.get('imageinfo') or [{}])[0]; w=int(ii.get('width') or 0); h=int(ii.get('height') or 0); b=cblob(p)
  if (ii.get('mime') or '').lower() not in {'image/jpeg','image/png','image/webp'} or w<mw or h<mh or not clic(p) or not story_ok(b,item):continue
  p['_score']=min(w*h//1000000,20)+(8 if h and 1.4<=w/h<=2.05 else 0)+story_bonus(b,item)+(4 if any(y in clean(b) for y in ('2026','2025','2024')) else 0); out.append(p)
 return sorted(out,key=lambda x:x['_score'],reverse=True)
def cdownload(p,mw,mh):
 ii=(p.get('imageinfo') or [{}])[0]; url=ii.get('thumburl') or ii.get('url'); data=getbytes(url); ck=verify(data,mw,mh) if data else None
 if not ck:return None
 w,h,f=ck;e=ii.get('extmetadata') or {}
 return data,{'width':w,'height':h,'format':f,'title':p.get('title',''),'source':'Wikimedia Commons','source_page':ii.get('descriptionurl',''),'download_url':url,'license':ev(e,'LicenseShortName'),'license_url':ev(e,'LicenseUrl'),'artist':ev(e,'Artist'),'credit':ev(e,'Credit'),'date_time_original':ev(e,'DateTimeOriginal') or ev(e,'DateTime')}
def oblob(x):
 tags=x.get('tags') or []; return ' '.join([str(x.get('title') or ''),str(x.get('creator') or ''),str(x.get('source') or ''),str(x.get('category') or ''),' '.join(str(t.get('name','')) if isinstance(t,dict) else str(t) for t in tags)])
def openverse(q,item,mw,mh):
 r=s.get(OPENVERSE_API,params={'q':q,'page_size':min(50,LIMIT),'license':'cc0,by,by-sa,pdm,pdmark,pdcert','extension':'jpg,jpeg,png,webp'},timeout=TIMEOUT)
 if r.status_code==429:return []
 r.raise_for_status();out=[]
 for x in r.json().get('results') or []:
  if str(x.get('license') or '').lower() not in OKLIC:continue
  w=int(x.get('width') or 0);h=int(x.get('height') or 0);b=oblob(x)
  if w and h and (w<mw or h<mh):continue
  if not story_ok(b,item):continue
  x['_score']=(min(w*h//1000000,20) if w and h else 1)+(8 if h and 1.4<=w/h<=2.05 else 0)+story_bonus(b,item);out.append(x)
 return sorted(out,key=lambda x:x['_score'],reverse=True)
def odownload(x,mw,mh):
 for url in (x.get('url'),x.get('thumbnail')):
  data=getbytes(str(url or ''));ck=verify(data,mw,mh) if data else None
  if ck:
   w,h,f=ck;return data,{'width':w,'height':h,'format':f,'title':x.get('title') or '','source':f"Openverse/{x.get('source') or 'unknown'}",'source_page':x.get('foreign_landing_url') or x.get('detail_url') or '','download_url':url or '','license':x.get('license') or '','license_url':x.get('license_url') or '','artist':x.get('creator') or '','credit':x.get('attribution') or '','date_time_original':x.get('created_on') or ''}
 return None
def collect(q,item,mw,mh):
 out=[]
 try:out += [('commons',x) for x in commons(q,item,mw,mh)]
 except Exception as e:print(' Commons:',e)
 try:out += [('openverse',x) for x in openverse(q,item,mw,mh)]
 except Exception as e:print(' Openverse:',e)
 return out
def key(m):return clean('|'.join(str(m.get(k,'')) for k in ('source','title','source_page')))

def main():
 news=json.loads(INPUT.read_text(encoding='utf-8')); shutil.rmtree(OUT,ignore_errors=True);IMG.mkdir(parents=True,exist_ok=True)
 manifest={'generated_at_utc':datetime.now(timezone.utc).isoformat(),'version':'4.0','rules':{'news_count':13,'images_per_news':N,'target_images':13*N,'preferred_minimum':[MIN_W,MIN_H],'fallback_minimum':[FB_W,FB_H],'sources':['Wikimedia Commons','Openverse'],'story_specific_whitelist':True,'real_images_only':True,'ai_generated_images':False,'reusable_license_required':True},'items':[]};used=set();total=0
 for item in news:
  rec={'id':item['id'],'title':item['title'],'images':[],'missing':0};print(f"\n[{item['id']:02d}] {item['title']}")
  for quality,mw,mh in [('preferred',MIN_W,MIN_H),('fallback',FB_W,FB_H)]:
   for q in item.get('queries') or []:
    if len(rec['images'])>=N:break
    print(' ',quality,q)
    for source,c in collect(q,item,mw,mh):
     if len(rec['images'])>=N:break
     try:r=cdownload(c,mw,mh) if source=='commons' else odownload(c,mw,mh)
     except Exception:continue
     if not r:continue
     data,m=r;k=key(m)
     if not k or k in used:continue
     fn=f"{int(item['id']):02d}_{len(rec['images'])+1}{ext(m['format'])}"; (IMG/fn).write_bytes(data);m.update({'file':fn,'search_query':q,'quality_tier':quality});used.add(k);rec['images'].append(m);total+=1;print('   +',fn,m['source'],m['title'])
    time.sleep(.12)
  rec['missing']=max(0,N-len(rec['images']));manifest['items'].append(rec)
 manifest['downloaded_images']=total;manifest['missing_images']=13*N-total;(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
 lines=['每日新闻相关图片包 v4','',f'实际下载：{total} 张；目标：{13*N} 张。','每条新闻使用独立实体/地点/设施白名单；不允许跨主题凑图。','来源为 Wikimedia Commons + Openverse 可再利用真实摄影/卫星/设施图片。','禁止AI图、程序示意图、地图/图表/插画补位。','']+[f"{r['id']:02d}. {r['title']} — {len(r['images'])}/{N} 张" for r in manifest['items']]
 (OUT/'README_来源与许可.txt').write_text('\n'.join(lines),encoding='utf-8');stamp=datetime.now(timezone.utc).strftime('%Y-%m-%d');zp=ROOT/f'daily-news-images-{stamp}.zip'
 if zp.exists():zp.unlink()
 with zipfile.ZipFile(zp,'w',zipfile.ZIP_DEFLATED) as z:
  for p in sorted(IMG.iterdir()):z.write(p,arcname=p.name)
  z.write(OUT/'manifest.json',arcname='manifest.json');z.write(OUT/'README_来源与许可.txt',arcname='README_来源与许可.txt')
 print(f'\nDownloaded {total}/{13*N}');return 0
if __name__=='__main__':raise SystemExit(main())
