import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const route='/research/sk-jewellery-ai-visibility-message-test';
const headline='AI knows SK Jewellery. What would make it recommend the brand?';

test('SK publishes separate evidence, every slice, prompts and actionable briefs',async({page})=>{
 await page.goto(route);
 await expect(page.locator('h1')).toHaveText(headline);
 await expect(page.locator('#visibility')).toContainText('135 of 139');
 await expect(page.locator('#recommendation-test')).toContainText('−1.4 pp');
 await expect(page.locator('#recommendation-test')).toContainText('−12.9 to +8.6');
 await expect(page.locator('#recommendation-test')).toContainText('does not establish harm or equivalence');
 await expect(page.locator('#buyer-response')).toContainText('3.20');
 await expect(page.locator('#buyer-response')).toContainText('3.24');
 await expect(page.locator('#buyer-response')).toContainText('point estimates, no interval');
 await expect(page.locator('#profiles tbody tr')).toHaveCount(6);
 await expect(page.locator('#shopping-situations tbody tr')).toHaveCount(14);
 await expect(page.locator('[data-prompt]')).toHaveCount(85);
 await expect(page.locator('.action-brief')).toHaveCount(3);
 for(const brief of await page.locator('.action-brief').all())for(const label of ['Observation.','Interpretation.','Owner','Content destination','Evidence needed','Next comparison'])await expect(brief).toContainText(label);
 const text=await page.locator('main').innerText();
 expect(text).not.toMatch(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/);
 await page.locator('#profile-p3 > summary').click();
 await expect(page.locator('#profile-p3 blockquote')).toBeVisible();
 await expect(page.locator('#profile-p3')).toContainText('Proposed next test.');
});

test('SK social metadata agrees with visible content and serves its existing raster card',async({page,request})=>{
 await page.goto(route);
 for(const selector of ['meta[property="og:title"]','meta[name="twitter:title"]'])await expect(page.locator(selector)).toHaveAttribute('content',headline);
 await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content',`https://windtunnel.tech${route}.og.jpg`);
 const article=(await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(s=>JSON.parse(s)['@graph']||[]).find(s=>s['@type']==='Article');
 expect(article.headline).toBe(headline);expect(article.datePublished).toBe(await page.locator('time').getAttribute('datetime'));
 expect(Date.parse(article.datePublished)).toBeLessThanOrEqual(Date.now());
 const card=await request.get(`${route}.og.jpg`);expect(card.status()).toBe(200);expect(card.headers()['content-type']).toContain('image/jpeg');
 expect((await card.body()).subarray(0,2).toString('hex')).toBe('ffd8');
 const dimensions=await page.evaluate(async url=>{const img=new Image();img.src=url;await img.decode();return [img.naturalWidth,img.naturalHeight];},`${route}.og.jpg`);
 expect(dimensions).toEqual([1200,630]);
 await page.goto('/feed.xml');
 expect(await page.locator('parsererror').count()).toBe(0);
 expect(await (await request.get('/sitemap.xml')).text()).toContain(`https://windtunnel.tech${route}`);
});

test('SK evidence remains usable without JavaScript',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
 try {
  const page=await context.newPage();await page.goto(`http://127.0.0.1:8097${route}`);
  await expect(page.locator('.copy-link')).toBeHidden();
  await expect(page.locator('#profiles table')).toBeVisible();
  await page.locator('#buyer-response .message-columns details').first().locator('summary').click();
  await expect(page.locator('#buyer-response .message-columns pre').first()).toBeVisible();
 }finally{await context.close();}
});

test('legacy destinations retain their fragment IDs and permanent redirects',()=>{
 const config=JSON.parse(readFileSync('site/vercel.json','utf8'));
 for(const slug of ['', '/insta360','/insta360-message-lift','/hotel-group']){
  const redirect=config.redirects.find((r:{source:string})=>r.source===`/studies${slug}`);
  expect(redirect).toMatchObject({destination:`/research${slug}`,statusCode:301});
  expect(redirect.destination).not.toContain('#'); // browsers inherit incoming fragment
 }
});
