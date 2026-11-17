// Writes a desktop and a phone screenshot of each screen to shots/, at deviceScaleFactor 2.
// Software rendering: rendering is capped hard so the capture can get through. Frame rates here mean nothing.
const { chromium, devices } = require('/home/turutupa/Dev/yames/node_modules/playwright');
const path = require('path');
const BASE = (process.env.BASE || 'http://127.0.0.1:8765') + '/mocks-3d-v2/index.html';
const OUT = path.join(__dirname, '..', 'shots');
const IDS = (process.argv[2] || 'today,theory,mechanics,between,jam,coach,step-land,step-even,setlist-run,soundcheck,nocatch,placement,welcome,blues,alt,paths,tools,result,result-mech,edge,edge-result,metronome,progress,setlist,recap').split(',');
const MODE = process.argv[3] || 'both';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const run = async (label, opts, q, fps, wait) => {
    const ctx = await b.newContext(opts);
    for (const id of IDS) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const p = await ctx.newPage();
        p.on('pageerror', e => console.log(label, id, 'ERR', e.message));
        const extra = id === 'coach' ? '&show=1' : '';
        try {
          await p.goto(`${BASE}?q=${q}&snap=1&maxfps=${fps}${extra}#${id}`);
          await p.waitForFunction(() => window.__ready && window.__frames > 2, null, { timeout: 180000 });
          await p.waitForTimeout(wait);
          await p.screenshot({ path: path.join(OUT, `${id}-${label}.png`), timeout: 180000 });
          console.log(label, id);
          await p.close();
          break;
        } catch (e) { console.log(label, id, 'retry', attempt, e.message.split('\n')[0]); await p.close().catch(() => { }); }
      }
    }
    await ctx.close();
  };
  if (MODE !== 'phone' && MODE !== '980') await run('desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }, 2, 1, 15000);
  if (MODE === 'both' || MODE === '980') await run('desktop980', { viewport: { width: 980, height: 700 }, deviceScaleFactor: 2 }, 2, 1, 12000);
  if (MODE === 'both' || MODE === 'phone') await run('phone', { ...devices['Pixel 7'], deviceScaleFactor: 2 }, 1, 3, 11000);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
