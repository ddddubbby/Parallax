import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

// Explicit opt-in: review artifacts are not deployed or part of ordinary CI runs.
test('capture review artifacts', async ({ page }) => {
  test.skip(process.env.M58_CAPTURE !== '1', 'Run with M58_CAPTURE=1 for review images.');
  test.setTimeout(120_000);
  const dir = 'docs/audits/m58';
  mkdirSync(dir, { recursive: true });
  const observations: object[] = [];
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, route] of [['home', '/'], ['studies', '/studies'], ['measured', '/studies/insta360'], ['simulated', '/studies/hotel-group'], ['methodology', '/methodology'], ['metric', '/method/mention-rate']]) {
      const errors: string[] = [];
      const failed = (response: import('@playwright/test').Response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); };
      page.on('response', failed);
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('h1')).toBeVisible();
      await page.screenshot({ path: `${dir}/${name}-${width}.png`, fullPage: true });
      if (name === "home") await page.screenshot({ path: `${dir}/home-opening-${width}.png` });
      observations.push({ route, width, errors, resources: await page.evaluate(() => performance.getEntriesByType('resource').map(e => ({ name: e.name, bytes: (e as PerformanceResourceTiming).decodedBodySize }))) });
      page.off('response', failed);
    }
  }
  writeFileSync(`${dir}/browser-observations.json`, JSON.stringify(observations, null, 2));
  await page.setViewportSize({ width: 1200, height: 630 });
  const fonts = '/styles.css?v=20260907c';
  await page.route('**/__social_artifact', route => route.fulfill({ contentType: 'text/html', body: `<html lang="en"><head><meta charset="utf-8"><link href="${fonts}" rel="stylesheet"><style>body{margin:0}svg{display:block}</style></head><body>${readFileSync('site/og.svg', 'utf8')}</body></html>` }));
  await page.goto('/__social_artifact');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'site/og.jpg', type: 'jpeg', quality: 92 });
  await page.screenshot({ path: `${dir}/social-full.png` });
  await page.setViewportSize({ width: 300, height: 158 });
  await page.addStyleTag({ content: 'svg{width:300px;height:auto}' });
  await page.screenshot({ path: `${dir}/social-thumbnail.png` });
});
