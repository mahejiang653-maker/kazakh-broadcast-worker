name: Verify 2026-09-15 Globe V52
on: push
jobs:
  verify:
    if: contains(github.event.head_commit.message, 'VERIFY_GLOBE_20260915_V52')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: {node-version: '22'}
      - run: npm install --no-save playwright@1.55.0 && npx playwright install --with-deps chromium
      - run: |
          node - <<'EOF'
          const {chromium}=require('playwright'),C=require('crypto');
          const H=s=>C.createHash('sha256').update(s).digest('hex');
          (async()=>{let b=await chromium.launch({headless:true}),p=await b.newPage({viewport:{width:1440,height:900}}),u='https://kazakh-broadcast-worker.mahejiang653.workers.dev/news-globe-run-20260915-v52-r1.html?v=r2verify';let r=await p.goto(u,{waitUntil:'domcontentloaded',timeout:60000});if(!r||!r.ok())throw Error('unreachable');await p.waitForFunction(()=>window.NG14?.demo?.length===13,{timeout:90000});let d=await p.evaluate(()=>window.NG14.demo.map(x=>[x.title,x.sceneMode,x.location]));if(H(d.map(x=>x[0]).join('\n'))!=='b4309d83a1f253913b44e9e986b204d00e30b30560a51cc034bec18989206ed9')throw Error('titles');if(H(d.map(x=>x[1]).join('\n'))!=='01c67a592ed51c2f37b1b30f830b771a8e73c3fb0b6b8fdcf60f72219583b934')throw Error('modes');if(H(d.map(x=>x[2]).join('\n'))!=='ff2ad641bf8bfde33fc3bf4a1bca6d9d7d298770da4e9caa24c3f4cd02030026')throw Error('locations');for(let i=0;i<13;i++){await p.evaluate(i=>{let G=window.NG14;G.pause?.();G.focus?.(i,true)},i);await p.waitForTimeout(4500);let s=await p.evaluate(()=>{let G=window.NG14;return[(G.current??0)+1,!!G.viewer,G.viewer?.camera?.positionCartographic?.height||0]});if(s[0]!==i+1||!s[1]||!Number.isFinite(s[2])||s[2]<=0)throw Error('Top'+(i+1))}await b.close();console.log('PASS_13_13')})().catch(e=>{console.error(e);process.exit(1)});
          EOF
