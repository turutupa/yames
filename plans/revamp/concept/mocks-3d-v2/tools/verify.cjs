// Functional checks: hash routes, tap-through, overflow, tabs, sound, WebGL loss, no-WebGL, reduced motion.
const {chromium,devices}=require('/home/turutupa/Dev/yames/node_modules/playwright');
const BASE=(process.env.BASE||'http://127.0.0.1:8765')+'/mocks-3d-v2/index.html';
const ARGS=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader'];
const ids="welcome input soundcheck goal placement placed today-first today today-back theory mechanics between result result-mech nocatch recap paths blues alt step-land step-even progress tools metronome metronome-result edge edge-result setlist setlist-run jam coach coach-why coach-honest settings".split(' ');
let fails=0; const check=(n,ok,x='')=>{console.log((ok?'PASS ':'FAIL ')+n+(x?' : '+x:'')); if(!ok)fails++;};
const watch=(p,errs)=>{p.on('console',m=>{const t=m.text();if(m.type()==='error'&&!/GPU stall|ReadPixels/.test(t))errs.push(t.slice(0,240))});p.on('pageerror',e=>errs.push('pageerror '+e.message))};
async function ready(p){await p.waitForFunction(()=>window.__ready&&window.__frames>2,null,{timeout:180000});}
async function tap(p,sel){await p.waitForSelector(sel,{timeout:20000});await p.click(sel,{timeout:30000,force:true});await p.waitForTimeout(500);}
const at=(p)=>p.evaluate(()=>window.__screen);
(async()=>{
 const b=await chromium.launch({args:ARGS});
 for(const [label,opts,q] of [['desktop1440',{viewport:{width:1440,height:900}},1],['desktop980',{viewport:{width:980,height:700}},1],['phone',{...devices['Pixel 7'],deviceScaleFactor:1},1]]){
  const ctx=await b.newContext(opts),p=await ctx.newPage(),errs=[];watch(p,errs);
  await p.goto(`${BASE}?q=${q}&snap=1#today`);await ready(p);
  // Every hash.
  let bad=[];
  for(const id of ids){
   await p.evaluate(i=>{location.hash=i},id);await p.waitForFunction(i=>window.__screen===i,id,{timeout:30000});await p.waitForTimeout(q===1?900:600);
   const r=await p.evaluate(()=>{const s=document.querySelector('.screen:not(.out)');const vw=document.documentElement.clientWidth;const o=[];
     if(document.documentElement.scrollWidth>vw+1)o.push('docX');if(s.scrollWidth>s.clientWidth+1)o.push('X'+(s.scrollWidth-s.clientWidth));if(s.scrollHeight>s.clientHeight+1)o.push('Y'+(s.scrollHeight-s.clientHeight));
     // Clipped interactive elements.
     s.querySelectorAll('button,input').forEach(el=>{const r=el.getBoundingClientRect();if(el.offsetParent&&r.width&&(r.right>vw+1||r.left<-1))o.push('offscreen:'+(el.textContent||'').trim().slice(0,18))});
     // Small tap targets on buttons (phone).
     return o});
   if(r.length)bad.push(id+'['+r.join(',')+']');
  }
  check(label+': all '+ids.length+' hashes fit',bad.length===0,bad.join(' '));
  // Tap-through flow.
  await p.evaluate(()=>{location.hash='today'});await p.waitForFunction(()=>window.__screen==='today');await p.waitForTimeout(500);
  await tap(p,'[data-min="15"]');
  const items=await p.$$eval('[data-list] .item',e=>e.length);check(label+': 15 min rebuilds plan',items===4,items+' items');
  await tap(p,'[data-min="10"]');
  await tap(p,'[data-start]');check(label+': Start goes to Theory',await at(p)==='theory');
  await p.waitForFunction(()=>document.querySelector('[data-countin]')?.hidden,null,{timeout:12000});
  await tap(p,'[data-end]');check(label+': End take goes to Between',await at(p)==='between');
  await tap(p,'.screen:not(.out) [data-go="theory"]');check(label+': Go again',await at(p)==='theory');
  await tap(p,'[data-end]');check(label+': second End goes to Result',await at(p)==='result');
  await p.waitForTimeout(800);
  await tap(p,'.screen:not(.out) [data-go="mechanics"]');check(label+': Next to Mechanics',await at(p)==='mechanics');
  await tap(p,'.screen:not(.out) [data-go="result-mech"]');check(label+': End to Mechanics result',await at(p)==='result-mech');
  await tap(p,'.screen:not(.out) [data-go="jam"]');check(label+': Next to Jam',await at(p)==='jam');
  await tap(p,'[data-done]');check(label+': Done to Recap',await at(p)==='recap');
  await tap(p,'.screen:not(.out) [data-go="today"].btn');check(label+': Done returns to Today',await at(p)==='today');
  // Nav.
  const nav=label==='phone'?'#tabs':'#rail';
  for(const n of ['paths','progress','tools','today']){await tap(p,`${nav} [data-nav="${n}"]`);check(label+': nav '+n,await at(p)===n);}
  const nv=await p.$$eval(label==='phone'?'#tabs button':'#rail button',e=>e.every(x=>{const r=x.getBoundingClientRect();return r.height>=30&&r.width>=40}));check(label+': nav targets large enough',nv);
  // Path tap to step.
  await tap(p,`${nav} [data-nav="paths"]`);await tap(p,'.screen:not(.out) [data-go="blues"]');check(label+': path card opens path',await at(p)==='blues');
  await tap(p,'.screen:not(.out) .steprow.cur');check(label+': current step opens',await at(p)==='step-land');
  // Setlist reorder.
  await p.evaluate(()=>{location.hash='setlist'});await p.waitForFunction(()=>window.__screen==='setlist');await p.waitForTimeout(400);
  const first=await p.$eval('[data-rows] .h3',e=>e.textContent);await tap(p,'[data-down="0"]');const after=await p.$eval('[data-rows] .h3',e=>e.textContent);check(label+': setlist reorder',first!==after,first+' -> '+after);
  await tap(p,'[data-up="1"]');
  // Coach show me.
  await p.evaluate(()=>{location.hash='coach'});await p.waitForFunction(()=>window.__screen==='coach');await p.waitForTimeout(300);await tap(p,'[data-show]');
  const msgs=await p.$$eval('[data-msgs] .msg',e=>e.length);check(label+': Show me adds messages',msgs===4);
  // Jam typed chords.
  await p.evaluate(()=>{location.hash='jam'});await p.waitForFunction(()=>window.__screen==='jam');await p.waitForTimeout(300);
  await p.fill('[data-chords]','Am7 Dm7 G7');await p.press('[data-chords]','Tab');await p.waitForTimeout(800);
  const ch=await p.$eval('[data-chord]',e=>e.textContent);check(label+': Jam takes typed chords',['Am7','Dm7','G7'].includes(ch),ch);
  // Index and label.
  await tap(p,'#indexBtn');check(label+': screen index opens',await p.isVisible('#index'));
  await tap(p,'#index a[href="#edge"]');await p.waitForFunction(()=>window.__screen==='edge');check(label+': index jumps',true);
  check(label+': mock label visible',await p.isVisible('.mock'));
  // Sound toggles, starts off.
  const s0=await p.getAttribute('#soundBtn','aria-pressed');await tap(p,'#soundBtn');const s1=await p.getAttribute('#soundBtn','aria-pressed');await tap(p,'#soundBtn');const s2=await p.getAttribute('#soundBtn','aria-pressed');check(label+': sound off, toggles, mutes',s0==='false'&&s1==='true'&&s2==='false');
  // Context loss.
  if(q===1||true){const hasExt=await p.evaluate(()=>{const gl=window.__W.renderer.getContext();const e=gl.getExtension('WEBGL_lose_context');if(!e)return false;window.__lc=e;e.loseContext();return true});
   if(hasExt){await p.waitForTimeout(1500);const t=await p.textContent('#toast');check(label+': context loss message',/reset/.test(t),t);await p.evaluate(()=>window.__lc.restoreContext());await p.waitForTimeout(6000);const t2=await p.textContent('#toast');check(label+': context restored',/restored/.test(t2),t2);const f0=await p.evaluate(()=>window.__frames);await p.waitForTimeout(1500);check(label+': still running after restore',(await p.evaluate(()=>window.__frames))>f0);}}
  check(label+': no console errors',errs.length===0,errs.slice(0,4).join(' | '));
  await ctx.close();
 }
 // No WebGL.
 {const ctx=await b.newContext({viewport:{width:800,height:600}}),p=await ctx.newPage(),errs=[];watch(p,errs);
  await p.goto(`${BASE}?nogl=1#today`);await ready(p);check('nogl: message shown',await p.isVisible('#toast'));
  for(const id of ['theory','result','paths','blues','progress','tools','edge','metronome','setlist','jam','coach','settings','recap']){await p.evaluate(i=>{location.hash=i},id);await p.waitForFunction(i=>window.__screen===i,id);await p.waitForTimeout(150);}
  check('nogl: screens work, no errors',errs.length===0,errs.slice(0,3).join(' | '));await ctx.close();}
 // Reduced motion.
 {const ctx=await b.newContext({viewport:{width:1000,height:700},reducedMotion:'reduce'}),p=await ctx.newPage(),errs=[];watch(p,errs);
  await p.goto(`${BASE}?q=0#theory`);await ready(p);await p.waitForTimeout(2500);
  const fly=await p.evaluate(()=>window.__W.flying());check('reduced motion: camera does not fly',fly===false);
  check('reduced motion: no errors',errs.length===0,errs.slice(0,3).join(' | '));await ctx.close();}
 await b.close();console.log(fails?`\n${fails} FAILED`:'\nALL PASS');process.exit(fails?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(2)});
