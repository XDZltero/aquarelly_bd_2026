import { chromium } from 'playwright-core';
const [url, out] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(url); await p.waitForTimeout(3000);
await p.screenshot({ path: out, clip: { x: 160, y: 200, width: 500, height: 320 } });
await b.close();
