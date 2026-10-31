// 自動試玩：從開始跑到結尾，沿途截圖
import { chromium } from 'playwright-core';
const out = process.argv[2];
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
let n = 0;
const shot = async (name) => { await p.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); console.log('shot', name, await p.evaluate(() => window.__game.state.mode)); };
const spam = async (ms, key = 'Enter') => { const end = Date.now() + ms; while (Date.now() < end) { await p.keyboard.press(key); await p.waitForTimeout(250); } };
const until = async (mode, ms = 30000) => { const end = Date.now() + ms; while (Date.now() < end) { if ((await p.evaluate(() => window.__game.state.mode)) === mode) return; await p.keyboard.press('Enter'); await p.waitForTimeout(300); } console.log('timeout waiting', mode); };

await p.goto('http://localhost:5173/');
await p.waitForTimeout(3000);
await p.click('#start-btn');
await p.waitForTimeout(3500);
await shot('intro');
await until('explore');
await p.waitForTimeout(800);
await shot('explore');
// 走路測試
await p.keyboard.down('KeyA'); await p.waitForTimeout(1200); await p.keyboard.up('KeyA');
await shot('walk');
for (const pos of [[-11, 4.6], [11, 4.6]]) {
  await p.evaluate(([x, z]) => window.__game.player.root.position.set(x, 0, z), pos);
  await p.waitForTimeout(1200);
  await shot('near-item');
  await p.keyboard.press('KeyE');
  await p.waitForTimeout(1500);
  await shot('picked');
}
await p.evaluate(() => window.__game.player.root.position.set(1.5, 0, -2.2));
await p.waitForTimeout(1500);
await shot('near-laimu');
await p.keyboard.press('KeyE');
await p.waitForTimeout(1500);
await shot('meet');
await until('blow', 40000);
await p.waitForTimeout(500);
await shot('blow-ready');
await p.keyboard.down('Space'); await p.waitForTimeout(1300);
await shot('blowing');
await p.waitForTimeout(7000); await p.keyboard.up('Space');
await p.waitForTimeout(1500);
await shot('blown');
await until('cut', 30000);
await p.waitForTimeout(500);
await shot('cut-ready');
await p.keyboard.press('Space'); await p.waitForTimeout(400);
await shot('slash1');
await p.waitForTimeout(1200);
await p.keyboard.press('Space'); await p.waitForTimeout(2000);
await shot('cut-done');
await until('finale', 20000);
await spam(4000);
await p.waitForTimeout(2500);
await shot('flip');
await p.waitForTimeout(3000);
await shot('celebrate');
for (let i = 0; i < 5; i++) { await p.waitForTimeout(2000); await shot('end' + i); }
await b.close();
