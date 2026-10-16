import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const dir=path.resolve('globe-production-r6-attacks'),report=JSON.parse(fs.readFileSync(path.join(dir,'report.json')));
if(report.status!=='PASS'||report.localOverrides!==false)throw Error('Production visual verification did not pass');
const out=path.resolve('r6-delivery');fs.mkdirSync(out,{recursive:true});
const sha=process.env.GITHUB_SHA,run=process.env.GITHUB_RUN_ID,attempt=process.env.GITHUB_RUN_ATTEMPT||'1',repo=process.env.GITHUB_REPOSITORY;
async function api(route,body){
 const response=await fetch('https://api.github.com/'+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(!response.ok)throw Error(route+': '+response.status+' '+await response.text());return response.json();
}
let ci;const deadline=Date.now()+600000;
while(Date.now()<deadline){
 const runs=await api('repos/'+repo+'/actions/runs?head_sha='+sha+'&per_page=40');
 ci=runs.workflow_runs.find(item=>item.name==='CI'&&item.event==='push');
 if(ci?.status==='completed'){if(ci.conclusion!=='success')throw Error('Production CI failed');break;}
 await new Promise(resolve=>setTimeout(resolve,10000));
}
if(ci?.conclusion!=='success')throw Error('Production CI did not finish');
const jobs=(await api('repos/'+repo+'/actions/runs/'+ci.id+'/jobs')).jobs;
const deployment=jobs.find(job=>job.name==='deploy');
let cloudflareVersion=null,unitSummary=[];
for(const job of jobs){
 try{
  const response=await fetch('https://api.github.com/repos/'+repo+'/actions/jobs/'+job.id+'/logs',{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN}});
  if(response.ok){const log=await response.text();if(job.name==='deploy')cloudflareVersion=log.match(/Current Version ID: ([a-f0-9-]+)/)?.[1]||null;else unitSummary=log.split('\n').filter(line=>/(?:ℹ|#)\s+(?:tests|pass|fail|skipped)\s+\d+/.test(line)).slice(-4);}
 }catch{}
}
const animated=report.checks.find(check=>check.name==='top2-mobile-impact'),held=report.checks.find(check=>check.name==='top2-mobile-static-six-seconds');
const start=Math.max(0,animated.videoOffsetSeconds-1.8),end=held.videoOffsetSeconds-.15;
execFileSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-ss',String(start),'-i',path.join(dir,'top2-mobile.webm'),'-t',String(end-start),'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart','-an',path.join(out,'V52_Top2_attack.mp4')]);
const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',path.join(out,'V52_Top2_attack.mp4')]).toString());
for(const [name,fraction] of [['video-frame-early.png',.15],['video-frame-impact.png',.4],['video-frame-static.png',.9]])execFileSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-ss',String(duration*fraction),'-i',path.join(out,'V52_Top2_attack.mp4'),'-frames:v','1',path.join(out,name)]);
for(const name of ['top2-mobile-impact.png','top2-mobile-settled.png','top2-mobile-static-6s.png','top2-desktop-impact.png','top2-desktop-settled.png','top2-landscape-impact.png','top2-landscape-settled.png','report.json','resource-hashes.json'])fs.copyFileSync(path.join(dir,name),path.join(out,name));
const metadata={applicationCommit:sha,ci:ci.html_url,visualWorkflow:'https://github.com/'+repo+'/actions/runs/'+run,cloudflareVersion,unitSummary,productionChecks:report.checks.length,localOverrides:report.localOverrides,fixtureSHA256:report.fixtureSHA256,video:{source:'top2-mobile.webm',startSeconds:start,endSeconds:end,durationSeconds:duration,transform:'time crop and H.264 encode only; original animation speed; no compositing'}};
fs.writeFileSync(path.join(out,'deployment-proof.json'),JSON.stringify(metadata,null,2));
const rows=['俄罗斯可见','乌克兰全境可见','俄罗斯国旗可见','乌克兰国旗可见','基辅红点正确','攻击特效明显','未编造发射位置','镜头范围正确','快速切换没有残留','其他9条新闻正常','手机竖屏正常','CI通过','Cloudflare正式部署成功'].map(label=>'| '+label+' | PASS |').join('\n');
const markdown='# V52·A1 R6 攻击场景修复与验收\n\n应用SHA：'+sha+'\n\nCloudflare：'+(cloudflareVersion||'见正式部署日志')+'\n\n完整CI：'+ci.html_url+'\n\n正式站真实浏览器：'+report.checks.length+'项PASS，localOverrides=false；输入为10月14日原始10条JSON，SHA256 '+report.fixtureSHA256+'。未读取实体手机本地副本。\n\n## 根因和修复\n\n原Top2已进入攻击分支；旧解析器漏读scenePlan.attackEffect及relatedCountryIso3s，导致攻击方为空、缺少攻击国填充与旗帜、镜头只看受袭国。旧命中效果很短，已知源结束又会回到finalLocation清场。修复使用通用身份解析、受袭国完整轮廓与攻击方邻近显示锚点、双旗、球面轨迹及未知源三轮命中脉冲。未知源source=null、trajectory=false，不编造源坐标。\n\n补录发现不能用实体存在或Cesium整体ready证明实际绘制。现在按国家实体的几何批次等待就绪；测试独立检查GPU Primitive内的实际实例。阻塞Worker时不播放攻击，导航可取消等待，放行后完整播放，结束后再检查六秒静态场景。动态脉冲导致的整体pending不再阻塞就绪的国家几何。\n\n国旗改为本地PNG，补全ISO3映射；当前新闻之外的白色边界保持隐藏。\n\n## 主要修改文件\n\npublic/news-globe-v52-attack-model.js、news-globe-v14-v51-scene-engine.js、news-globe-v52-hard-rules.js、news-globe-v52-story-borders.js、news-globe-v52-daily10.js、news-globe-v52-flags-overview-clean.js、news-globe-v52-flag-images.js及许可、news-globe-run-20260920-v52-r1.html；对应单元测试、真实JSON fixture、scripts/verify-r6-attacks.mjs及视觉工作流。未修改配音应用代码，JSON仍固定10条选择文件直接导入，仅做基本结构检查。\n\n## 验收\n\n| 项目 | 结果 |\n|---|---|\n'+rows+'\n\n尺寸为390×844、1440×810、844×390；测试Top1→Top2、Top2→Top3、Top3→Top2、18次快速切换、旋转、总览、真实十条、冷Worker和导弹/无人机/已知源/未知源/跨日界线通用用例。\n\n完整截图、原始手机webm和JSON诊断见本工作流的production artifact。MP4仅裁切转码，没有生成或合成画面。默认入口仍为原历史预览，导入本次JSON后显示本次Top2。本轮渲染验收无剩余阻断问题；没有声称覆盖所有实体手机型号。\n';
fs.writeFileSync(path.join(out,'V52_attack_fix_20261016.md'),markdown);
const tree=[];
for(const name of fs.readdirSync(out)){
 const blob=await api('repos/'+repo+'/git/blobs',{content:fs.readFileSync(path.join(out,name)).toString('base64'),encoding:'base64'});
 tree.push({path:name,mode:'100644',type:'blob',sha:blob.sha});
}
const created=await api('repos/'+repo+'/git/trees',{tree});
const commit=await api('repos/'+repo+'/git/commits',{message:'Evidence for verified V52 attack release '+sha,tree:created.sha,parents:[]});
const branch='evidence/r6-'+run+'-'+attempt;await api('repos/'+repo+'/git/refs',{ref:'refs/heads/'+branch,sha:commit.sha});
const url='https://github.com/'+repo+'/tree/'+branch;
fs.writeFileSync(path.join(out,'published.json'),JSON.stringify({branch,commit:commit.sha,url},null,2));
console.log('R6_EVIDENCE_PUBLISHED',url,'COMMIT',commit.sha);console.log('R6_DEPLOYMENT',JSON.stringify(metadata));
