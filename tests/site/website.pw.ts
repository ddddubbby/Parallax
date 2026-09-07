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
      expect(response.status(), href).toBe(200);
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
