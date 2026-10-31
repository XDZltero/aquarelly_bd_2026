import { chromium } from 'playwright-core';
const out = process.argv[2];
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://localhost:5173/');
await p.waitForTimeout(2500);
await p.evaluate(() => {
  document.getElementById('title').classList.add('hidden');
  document.getElementById('final-title').textContent = '夏微，生日快樂！';
  document.getElementById('final-message').textContent = '謝謝你出現在我的生活裡。\n願你新的一歲，每天都開開心心，\n想做的事都能順利完成 ✨\n\n—— 萊姆';
  document.getElementById('final').classList.remove('hidden');
});
await p.waitForTimeout(800);
await p.screenshot({ path: out });
await b.close();
