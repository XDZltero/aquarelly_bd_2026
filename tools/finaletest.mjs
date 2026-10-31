import { chromium } from 'playwright-core';
const out = process.argv[2];
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => { if (m.type() !== 'log') console.log('[console]', m.type(), m.text().slice(0, 200)); });
await p.goto('http://localhost:5173/');
await p.waitForTimeout(3000);
await p.click('#start-btn');
await p.waitForTimeout(500);
await p.evaluate(() => { window.__game.state.mode = 'x'; window.__game.finale(); });
for (let i = 0; i < 8; i++) {
  await p.keyboard.press('Enter');
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => JSON.stringify(window.__game.renderer.info.memory) + ' prog:' + window.__game.renderer.info.programs.length);
  console.log(i, info);
  await p.screenshot({ path: `${out}/f${i}.png` });
}
await b.close();
