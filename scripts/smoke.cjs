#!/usr/bin/env node
/*
 * Headless smoke test + screenshots for one game.
 *
 *   node scripts/smoke.cjs <game-slug> [outDir] [--query "demo=1"]
 *
 * Serves the repo, opens games/<slug>/index.html in Chromium at a phone
 * (390x844) and a desktop (1280x720) viewport, taps the centre of the screen
 * a few times, prints console errors and saves screenshots to outDir.
 * Exit code 1 if any page error / console error occurred.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const slug = args[0];
if (!slug) {
  console.error('usage: node scripts/smoke.cjs <game-slug> [outDir] [--query "a=1"]');
  process.exit(2);
}
const qi = args.indexOf('--query');
const query = qi >= 0 ? args[qi + 1] : '';
const outDir = path.resolve(args[1] && !args[1].startsWith('--') ? args[1] : path.join(ROOT, 'dist', 'screens'));
fs.mkdirSync(outDir, { recursive: true });

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg', '.webp': 'image/webp'
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(ROOT, urlPath);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/games/${slug}/index.html${query ? '?' + query : ''}`;
  const browser = await chromium.launch();
  let failures = 0;

  const viewports = [
    { name: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true },
    { name: 'desktop', width: 1280, height: 720, isMobile: false, hasTouch: false }
  ];

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => { failures++; console.log(`[${vp.name}] PAGE ERROR: ${e.message}`); });
    page.on('console', (m) => {
      if (m.type() === 'error') { failures++; console.log(`[${vp.name}] CONSOLE ERROR: ${m.text()}`); }
    });
    await page.goto(url);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(outDir, `${slug}-${vp.name}-1-start.png`) });
    for (let i = 0; i < 4; i++) {
      await page.mouse.click(vp.width / 2, vp.height / 2);
      await page.waitForTimeout(350);
    }
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(outDir, `${slug}-${vp.name}-2-play.png`) });
    await context.close();
  }

  await browser.close();
  server.close();
  console.log(`screenshots in ${outDir}`);
  console.log(failures ? `FAILED with ${failures} error(s)` : 'OK, no errors');
  process.exit(failures ? 1 : 0);
})();
