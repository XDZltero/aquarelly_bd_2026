// 用法: node tools/shot.mjs <url> <out.png> [waitMs] [width] [height]
import { chromium } from 'playwright-core';
const [url, out, wait = '1500', w = '1280', h = '720'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
await browser.close();
console.log('saved', out);
