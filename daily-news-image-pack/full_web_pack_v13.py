from __future__ import annotations
import hashlib,html,io,json,os,re,shutil,time,zipfile
from datetime import datetime,timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo
import requests
from PIL import Image
ROOT=Path(__file__).resolve().parent; NEWS=json.loads((ROOT/'news.json').read_text(encoding='utf-8')); POOL=json.loads((ROOT/'curated_pool.json').read_text(encoding='utf-8'))
OUT=ROOT/'output'; IMG=OUT/'images'; N=int(os.getenv('IMAGES_PER_NEWS','3')); MIN_W=int(os.getenv('MIN_WIDTH','1200')); MIN_H=int(os.getenv('MIN_HEIGHT','675')); MIN_YEAR=int(os.getenv('MIN_RECENT_YEAR','2025')); BING_LIMIT=int(os.getenv('BING_LIMIT','80'))
BING='https://www.bing.com/images/search'; S=requests.Session(); S.headers.update({'User-Agent':'Mozilla/5.0 Chrome/126 daily-news-image-pack/13.0','Accept-Language':'en-US,en;q=0.9'})
REJECT=('illustration','drawing','painting','poster','logo','icon','render','rendering','infographic','cartoon','collage','3d','vector','wallpaper','concept art','fan art','ai generated','midjourney','stable diffusion','dall-e','dalle','diagram','chart','graph','map')
STORY={1:(['hormuz','persian gulf','gulf of oman'],['ship','vessel','navy','tanker']),2:(['kyiv','kiev'],['damage','destroy','attack','strike','building']),3:(['iran','iranian'],['radar','air base','airbase','military','missile','facility']),4:(['hormuz','persian gulf','gulf of oman'],['merchant','cargo','tanker','ship','vessel']),5:(['tanker','oil tanker','crude carrier'],['ship','vessel','gulf','hormuz']),6:(['qatar','qatarenergy','qatargas'],['lng','liquefied natural gas','gas carrier','carrier']),7:(['black sea','bosphorus','ukraine','turkey'],['cargo','merchant','ship','vessel','freighter']),8:(['data center','datacenter','server'],['rack','server','data centre']),9:(['china','chinese','xinjiang','khorgos'],['freight','container','intermodal','rail','train','logistics']),10:(['china','shenzhen','xinjiang'],['transmission','power grid','substation','tower','high voltage']),11:(['china','hong kong','construction'],['worker','helmet','hard hat','safety','protective']),12:(['xinjiang','turpan','urumqi','china'],['solar','photovoltaic','energy storage','power station','wind farm']),13:(['khorgos','horgos','xinjiang'],['port','border','freight','truck','train','terminal','customs'])}
AVOID={1:['gibraltar','suez','panama'],2:['moscow','odesa','odessa','kharkiv'],3:['iraq','ain al-assad','museum'],4:['gibraltar','suez'],5:['motor oil','lubricant','engine oil','bottle'],6:['sunset','resort','beach','tourism'],7:['cruise','yacht'],8:['gaming'],9:['great wall','flag','tourist'],10:['telecom tower','cell tower'],11:['shopping','isolated helmet'],12:['foundation','trantor','sci-fi'],13:['wedding','battery','hotel','restaurant']}
class BP(HTMLParser):
 def __init__(self): super().__init__(); self.items=[]
 def handle_starttag(self,tag,attrs):
  if tag!='a': return
  d=dict(attrs); m=d.get('m');
  if 'iusc' not in d.get('class','') or not m:return
  try:o=json.loads(html.unescape(m))
  except:return
  u=o.get('murl') or o.get('turl'); p=o.get('purl') or ''; t=o.get('t') or o.get('desc') or ''
  if u:self.items.append({'download_url':u,'source_page':p,'title':t})
def text(*x): return ' '.join((v or '') for v in x).lower()
def topic_ok(i,*parts):
 b=text(*parts)
 if any(x in b for x in REJECT) or any(x in b for x in AVOID[i]): return False
 a,c=STORY[i]; return any(x in b for x in a) and any(x in b for x in c)
def years(*parts): return [int(x) for x in re.findall(r'(?<!\d)(202[5-9]|203\d)(?!\d)',text(*parts))]
def page_date(url):
 if not url:return None,''
 try:
  r=S.get(url,timeout=15,allow_redirects=True); r.raise_for_status(); h=r.text[:500000]
 except:return None,''
 pats=[r'(?:datePublished|article:published_time|dateCreated|uploadDate)["\'\s:=]+(?:content=)?["\']?([^"\'<>]{4,40})',r'(?<!\d)(202[5-9]|203\d)[-/.](0?[1-9]|1[0-2])[-/.]([0-3]?\d)']
 for p in pats:
  m=re.search(p,h,re.I)
  if m:
   y=years(m.group(0));
   if y:return max(y),m.group(0)[:120]
 return None,''
def verify(data):
 try:
  im=Image.open(io.BytesIO(data)); fmt=(im.format or '').upper(); w,h=im.size
  if fmt not in {'JPEG','PNG','WEBP'} or w<MIN_W or h<MIN_H:return None
  exif=im.getexif(); dt=str(exif.get(36867,'') or exif.get(306,'') or '') if exif else ''; y=years(dt)
  return w,h,fmt,(max(y) if y else None),dt
 except:return None
def get(url):
 try:
  r=S.get(url,timeout=25,allow_redirects=True,headers={'Referer':'https://www.bing.com/'}); r.raise_for_status(); ct=(r.headers.get('content-type') or '').lower()
  if 'svg' in ct or 'text/html' in ct:return None
  return r.content if len(r.content)>20000 else None
 except:return None
def bing(q,i):
 try:
  rq=f'{q} 2026 2025 photo photograph -illustration -render -wallpaper -AI'; r=S.get(BING,params={'q':rq,'qft':'+filterui:photo-photo','form':'HDRSC3'},timeout=25); r.raise_for_status(); p=BP(); p.feed(r.text)
 except:return []
 out=[]
 for x in p.items[:BING_LIMIT]:
  if not topic_ok(i,x['title'],x['source_page'],x['download_url']):continue
  y=max(years(x['title'],x['source_page'],x['download_url']) or [0]); ev='result-title/url year' if y>=MIN_YEAR else ''
  if y<MIN_YEAR:
   py,pev=page_date(x['source_page']); y=py or 0; ev='source-page published date: '+pev if py else ''
  if y<MIN_YEAR:continue
  x.update({'source':'Bing Images full-web search','source_tier':'bing-recent-real-photo','recent_year':y,'recent_evidence':ev,'license':'unknown-check-source-page'}); out.append(x)
 return out
def k(c): return hashlib.sha1((c['download_url']+c.get('source_page','')).encode()).hexdigest()
def ext(f): return {'JPEG':'.jpg','PNG':'.png','WEBP':'.webp'}.get(f,'.jpg')
def main():
 shutil.rmtree(OUT,ignore_errors=True); IMG.mkdir(parents=True,exist_ok=True); used=set(); items=[]; total=0; diagnostics={}
 for item in NEWS:
  i=int(item['id']); pool=POOL.get(str(i),{}); qs=list(pool.get('queries') or []); rec={'id':i,'title':item['title'],'images':[]}; cand=[]; di=[]
  if item.get('title'): qs.append(item['title'])
  for q in qs:
   a=bing(q,i); cand+=a; di.append({'query':q,'accepted_recent_candidates':len(a)}); time.sleep(.08)
  uniq=[]; seen=set()
  for c in cand:
   z=k(c)
   if z not in seen:seen.add(z);uniq.append(c)
  uniq.sort(key=lambda c:-(c.get('recent_year') or 0))
  for c in uniq:
   if len(rec['images'])>=N:break
   z=k(c)
   if z in used:continue
   data=get(c['download_url']); ck=verify(data)
   if not ck:continue
   w,h,fmt,exify,exifdt=ck
   # If EXIF exists and is older, reject. If EXIF is absent, keep only because page/title/url already proved 2025+ evidence.
   if exify and exify<MIN_YEAR:continue
   fn=f'{i:02d}_{len(rec["images"])+1}{ext(fmt)}'; (IMG/fn).write_bytes(data)
   m=dict(c);m.update({'file':fn,'width':w,'height':h,'format':fmt,'exif_year':exify,'exif_datetime':exifdt,'real_photo_filter_passed':True,'recency_confidence':'high' if exify and exify>=MIN_YEAR else 'medium-high'});rec['images'].append(m);used.add(z);total+=1
  rec['missing']=N-len(rec['images']);items.append(rec);diagnostics[str(i)]=di;print(f'{i:02d}: {len(rec["images"])}/{N} candidates={len(uniq)}')
 manifest={'generated_at_utc':datetime.now(timezone.utc).isoformat(),'generated_at_beijing':datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(),'version':'13.0-recent-real-photo','downloaded_images':total,'missing_images':13*N-total,'items':items,'diagnostics':diagnostics,'rules':{'search_scope':'full web via Bing Images','real_photo_only':True,'reject_ai_render_illustration':True,'story_specific_relevance':True,'minimum_recent_year':MIN_YEAR,'recency_evidence':'EXIF >=2025 OR explicit 2025/2026 in result/image URL OR source-page published date >=2025','target_images':13*N,'minimum':[MIN_W,MIN_H]}}
 (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8'); (OUT/'README_来源与许可.txt').write_text(f'每日新闻相关图片包 v13\n实际下载：{total}/{13*N} 张。\n仅保留主题相关、实拍优先且有2025年及以后近期证据的图片。\nEXIF日期存在时必须不早于2025；无EXIF时必须由搜索结果/图片URL/来源页面日期提供2025或2026证据。\n',encoding='utf-8')
 stamp=datetime.now(ZoneInfo('Asia/Shanghai')).strftime('%Y-%m-%d'); zp=ROOT/f'daily-news-images-{stamp}.zip';
 if zp.exists():zp.unlink()
 with zipfile.ZipFile(zp,'w',zipfile.ZIP_DEFLATED) as z:
  for p in sorted(IMG.iterdir()):z.write(p,p.name)
  z.write(OUT/'manifest.json','manifest.json');z.write(OUT/'README_来源与许可.txt','README_来源与许可.txt')
 print(f'Downloaded {total}/{13*N}; ZIP={zp.name}')
if __name__=='__main__':main()
