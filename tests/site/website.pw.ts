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

test('brand favicon is discoverable in a Google-supported format', async ({ page, request }) => {
  for (const { route } of pages) {
    await page.goto(route);
    await expect(page.locator('head link[rel="icon"]')).toHaveAttribute('href', '/favicon.png');
  }
  const icon = await request.get('/favicon.png');
  expect(icon.status()).toBe(200);
  expect(icon.headers()['content-type']).toContain('image/png');
  const png = await icon.body();
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(png.readUInt32BE(16)).toBe(96);
  expect(png.readUInt32BE(20)).toBe(96);
  expect((await request.get('/favicon.ico')).status()).toBe(200);
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
  await page.goto('/research/insta360-action-camera-ai-study');
  for (const text of ['100%', '98%', '95%', '8%', '97%', '70%', '20 of 25', '13 of 25', '+0.57', '+0.15', '−0.31', 'not interviews with real customers']) await expect(page.locator('main')).toContainText(text);
  await expect(page.locator('figure.chart')).toHaveCount(4);
  await page.goto('/research/hotel-group');
  for (const text of ['3.45', '3.41', 'DeepSeek', '31 Jul 2026']) await expect(page.locator('main')).toContainText(text);
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
  for (const route of ['/', '/research', '/methodology', '/research/sk-jewellery-ai-visibility-message-test']) {
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

for (const route of ['/', '/research', '/research/insta360-action-camera-ai-study', '/research/hotel-group', '/research/sk-jewellery-ai-visibility-message-test', '/methodology', '/method/mention-rate', '/404']) {
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
    if (route !== '/404') await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://windtunnel.tech${route}`);
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
  expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap: https://windtunnel.tech/sitemap.xml');
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain('windtunnel.observer');
  for (const text of ['97%', '0 of 140', '0 times', '80%', '98%', '10–20%', '25%']) await expect(page.locator('#why')).toContainText(text);
});

// M61 (D-140): the homepage says what we do, shows what a client gets, and proves it with findings.
test('homepage explains the service as a flow, four metrics, the message test and five proven benefits', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Measure how AI recommends your brand.');
  await expect(page.locator('main .stamp')).toHaveCount(0);
  await expect(page.locator('main .evidence-foot, main .disclosure')).toHaveCount(0);
  const steps = page.locator('#workflow .flow li');
  await expect(steps).toHaveCount(5);
  for (const step of await steps.all()) await expect(step.locator('.you-get')).toContainText('You get');
  await expect(page.locator('#audit .metric-card')).toHaveCount(4);
  for (const card of await page.locator('#audit .metric-card').all()) { await expect(card.locator('[role="img"]')).toHaveAttribute('aria-label', /Example/); await expect(card.locator('.why-line')).toContainText('Why it matters'); }
  await expect(page.locator('#audit')).toContainText('made-up brands');
  await expect(page.locator('#message-test .test-card')).toHaveCount(2);
  await expect(page.locator('#message-test')).toContainText('Only the message changes.');
  await expect(page.locator('#message-test')).toContainText('role-play');
  await expect(page.locator('#why .benefit-card')).toHaveCount(5);
  for (const card of await page.locator('#why .benefit-card').all()) await expect(card.locator('a.tlink')).toHaveAttribute('href', /^\/research/);
  await expect(page.locator('#research .research-list a')).toHaveCount(3);
  await expect(page.locator('#faq details')).toHaveCount(7);
  const colour = (selector: string) => page.evaluate(sel => getComputedStyle(document.querySelector(sel)!).backgroundColor, selector);
  expect(await colour('body')).toBe('rgb(11, 11, 13)');
  expect(await colour('#workflow')).toBe('rgb(250, 247, 240)');
});

test('scoring pipeline and commitments live on the methodology page', async ({ page }) => {
  await page.goto('/methodology');
  await expect(page.locator('#scoring .pipe-stage')).toHaveCount(5);
  for (const text of ['Stored answer', 'Embedding', 'Cosine vs anchors', 'Distribution', 'Labeled result', 'AI recommendation follows a different path.']) await expect(page.locator('#scoring')).toContainText(text);
  await expect(page.locator('#commitments .method-list li')).toHaveCount(7);
});
