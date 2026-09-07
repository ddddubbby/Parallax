import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() && !e.name.startsWith('.') ? files(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []);
}
const pages = files('site').map(file => ({ file, route: file === 'site/index.html' ? '/' : file.replace(/^site/, '').replace(/\.html$/, '') }));

test('static server handles clean URLs, queries, missing routes and traversal', async ({ request }) => {
  for (const { route } of pages) expect((await request.get(route)).status()).toBe(route === '/404' ? 404 : 200);
  expect((await request.get('/styles.css?v=test')).headers()['content-type']).toContain('text/css');
  expect((await request.get('/not-a-page')).status()).toBe(404);
  expect((await request.get('/%2e%2e%2fMASTER_CONTEXT.md')).status()).toBe(403);
  expect((await request.get('/.vercel/project.json')).status()).toBe(403);
  expect((await request.post('/')).status()).toBe(405);
});

test('all pages have valid links, fragments, unique IDs and one H1', async ({ page, request }) => {
  const checked = new Set<string>();
  const versions = new Set<string>();
  for (const { route } of pages) {
    await page.goto(route);
    await expect(page.locator('h1')).toHaveCount(1);
    const ids = await page.locator('[id]').evaluateAll(es => es.map(e => e.id));
    expect(new Set(ids).size, route).toBe(ids.length);
    const links = await page.locator('a[href]').evaluateAll(es => es.map(e => e.getAttribute('href')!));
    for (const href of links) {
      if (/^(https?:|mailto:|tel:)/.test(href)) continue;
      const url = new URL(href, `http://127.0.0.1:8097${route}`);
      if (checked.has(url.href)) continue;
      checked.add(url.href);
      const response = await request.get(url.pathname);
      expect(response.status(), href).toBe(url.pathname === "/404" ? 404 : 200);
      if (url.hash) expect(await response.text(), href).toContain(`id="${decodeURIComponent(url.hash.slice(1))}"`);
    }
    const source = readFileSync(pages.find(p => p.route === route)!.file, 'utf8');
    const css = source.match(/styles\.css\?v=([^"&]+)/)?.[1];
    const js = source.match(/motion\.js\?v=([^"&]+)/)?.[1];
    expect(css).toBeTruthy(); expect(js).toBe(css); versions.add(css!);
    for (const block of await page.locator('script[type="application/ld+json"]').allTextContents()) expect(() => JSON.parse(block)).not.toThrow();
  }
  expect(versions.size).toBe(1);
});

test('published evidence retains values, qualification and anonymity', async ({ page }) => {
  await page.goto('/studies/insta360');
  await expect(page.locator('main')).toContainText('20/25');
  await expect(page.locator('main')).toContainText('0/25');
  await expect(page.locator('main')).toContainText('not a client');
  await expect(page.locator('main')).toContainText('ungrounded');
  await page.goto('/studies/insta360-message-lift');
  for (const text of ['+0.15', '+0.57', '−0.31', 'Directional', 'n=5', 'Separate baselines, not a head-to-head.']) await expect(page.locator('main')).toContainText(text);
  await expect(page.locator('main')).toContainText('Simulated');
  await page.goto('/studies/hotel-group');
  for (const text of ['3.45', '3.41', 'Simulated', 'n=30', 'DeepSeek', 'ungrounded', '31 Jul 2026']) await expect(page.locator('main')).toContainText(text);
  for (const { file } of pages) expect(readFileSync(file, 'utf8')).not.toMatch(/marriott/i);
});

test('mobile menu supports keyboard, Escape and breakpoint recovery', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Toggle menu' });
  await toggle.focus(); await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#nav-menu a').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('#nav-menu')).not.toHaveAttribute('inert');
});

test('content is readable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  for (const route of ['/', '/studies', '/methodology']) {
    await page.goto(`http://127.0.0.1:8097${route}`);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('h1')).toHaveCSS('opacity', '1');
    await expect(page.locator('#nav-menu a').first()).toBeVisible();
  }
  await context.close();
});

test('all pages reflow at target widths and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1440, 1280, 768, 390, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const { route } of pages) {
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} at ${width}`).toBe(true);
      await expect(page.locator('h1')).toHaveCSS('opacity', '1');
    }
  }
});

for (const route of ['/', '/studies', '/studies/insta360', '/studies/hotel-group', '/methodology', '/method/mention-rate', '/404']) {
  test(`accessible page: ${route}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(route);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('metadata, public assets and homepage disclosures agree', async ({ page, request }) => {
  for (const { route } of pages) {
    await page.goto(route);
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', description!);
    await expect(page.locator('meta[name="twitter:description"]')).toHaveAttribute('content', description!);
    const assets = await page.locator('script[src],link[rel="stylesheet"],link[rel="icon"],img[src]').evaluateAll(es => es.map(e => e.getAttribute('src') || e.getAttribute('href')!));
    for (const asset of assets.filter(a => a.startsWith('/'))) expect((await request.get(asset)).status(), asset).toBe(200);
    const schemas = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(s => { const data = JSON.parse(s); return data['@graph'] || [data]; });
    const term = schemas.find(s => s['@type'] === 'DefinedTerm');
    if (term) expect(term.description).toBe((await page.locator('main .lead').first().innerText()).trim());
    const faq = schemas.find(s => s['@type'] === 'FAQPage');
    if (faq) {
      const visible = await page.locator('#faq details').evaluateAll(es => es.map(e => ({ q: e.querySelector('summary')!.textContent, a: e.querySelector('p')!.textContent })));
      expect(faq.mainEntity.map((q: {name: string; acceptedAnswer: {text: string}}) => ({ q: q.name, a: q.acceptedAnswer.text }))).toEqual(visible);
    }
    expect(readFileSync(pages.find(p => p.route === route)!.file, 'utf8')).not.toContain('__SITE_URL__');
  }
  await page.goto('/');
  for (const text of ['0 of 25', '11 Jul 2026', 'DeepSeek', 'ungrounded', 'single-analyst', '3.45', '3.41', 'n=30 per message', '31 Jul 2026', 'not a client']) {
    await expect(page.locator('main')).toContainText(new RegExp(text, 'i'));
  }
});

test('homepage retains the product showcase and full methodology', async ({ page }) => {
  await page.goto('/');
  const dashboard = page.locator('#dashboard');
  for (const value of ['94.9%', '33.2%', '32.7%', '31.5%', '2.5%', 'n=112', '80% positive', '19% mixed', '1% negative', 'different baselines']) await expect(dashboard).toContainText(value);
  await expect(page.locator('#metrics .pillar-card')).toHaveCount(4);
  await expect(page.locator('#metrics')).toContainText('Illustrative example');
  await expect(page.locator('#methodology .pipe-stage')).toHaveCount(5);
  for (const text of ['Stored answer', 'Embedding', 'Cosine vs anchors', 'Distribution', 'Labeled result', 'Glass Box', 'AI recommendation follows a different path.']) await expect(page.locator('#methodology')).toContainText(text);
  await expect(page.locator('#method .method-list li')).toHaveCount(7);
  await expect(page.locator('#faq details')).toHaveCount(7);
});
