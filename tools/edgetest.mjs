import { chromium } from 'playwright-core';
const out = process.argv[2];
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
const mode = () => p.evaluate(() => window.__game.state.mode);
await p.goto('http://localhost:5173/');
await p.waitForTimeout(2500);
await p.click('#start-btn');
// 翻完開場對話，直到操作說明出現
for (let i = 0; i < 40 && (await p.isHidden('#howto')); i++) { await p.keyboard.press('Enter'); await p.waitForTimeout(300); }
await p.waitForTimeout(600);
await p.screenshot({ path: `${out}/howto.png` });
await p.keyboard.press('Enter');
await p.waitForTimeout(500);
console.log('mode', await mode());
// 往下走到底，再往上走，確認不會卡住
await p.keyboard.down('KeyS'); await p.waitForTimeout(4000); await p.keyboard.up('KeyS');
const z1 = await p.evaluate(() => window.__game.player.root.position.z);
await p.screenshot({ path: `${out}/bottom.png` });
await p.keyboard.down('KeyW'); await p.waitForTimeout(1500); await p.keyboard.up('KeyW');
const z2 = await p.evaluate(() => window.__game.player.root.position.z);
console.log('bottom z', z1.toFixed(2), 'after W', z2.toFixed(2));
// 滾輪拉近
await p.mouse.move(640, 360);
for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, -100); await p.waitForTimeout(100); }
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/zoomin.png` });
await b.close();
