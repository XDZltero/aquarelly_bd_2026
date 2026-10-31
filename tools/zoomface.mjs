// 近拍某角色的臉: node tools/zoomface.mjs <char> <expr> <out>
import { chromium } from 'playwright-core';
const [who, expr, out] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(`http://localhost:5173/preview.html?only=${who}&expr=${expr}`);
await p.waitForTimeout(2500);
await p.screenshot({ path: out, clip: { x: 490, y: 150, width: 300, height: 260 } });
await b.close();
