import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const route='/research/sk-jewellery-ai-visibility-message-test';
const article=JSON.parse(readFileSync('content/research/sk-jewellery-ai-visibility-message-test.json','utf8'));
const headline=article.headline;

// M60 (D-136/D-137/D-138): research reads as an article on a light publication theme.
test('SK article leads with findings, six charts and no label chips',async({page})=>{
 await page.goto(route);
 await expect(page.locator('h1')).toHaveText(headline);
 await expect(page).toHaveTitle(`${headline} · Windtunnel`);
 for(const text of ['97%','72%','0 of 140','never named','63%','61%','58%','54%'])await expect(page.locator('main')).toContainText(text);
 await expect(page.locator('.short-version li')).toHaveCount(article.shortVersion.length);
 await expect(page.locator('figure.chart')).toHaveCount(6);
 for(const chart of await page.locator('figure.chart').all()){
  await expect(chart).toHaveAttribute('aria-label',/.+/);
  expect(await chart.locator('div.sr-only tbody tr').count()).toBeGreaterThan(2);
 }
 await expect(page.locator('#chart-who-ai-names .bar-row')).toHaveCount(9);
 await expect(page.locator('#chart-who-ai-names .bar-row.is-zero')).toHaveCount(4);
 await expect(page.locator('#chart-six-buyers .dumbbell-row')).toHaveCount(6);
 await expect(page.locator('#chart-wording .dumbbell-row')).toHaveCount(14);
 await expect(page.locator('main .stamp')).toHaveCount(0);
 await expect(page.locator('article details')).toHaveCount(0);
 await expect(page.locator('.recommendations li')).toHaveCount(3);
 await expect(page.locator('#how-we-did-this')).toContainText('not interviews with real customers');
 const text=await page.locator('main').innerText();
 expect(text).not.toMatch(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/);
 expect(text.split(/\s+/).length).toBeLessThan(3400);
});

test('research is light, the rest of the site stays dark',async({page})=>{
 for(const path of [route,'/research','/research/hotel-group']){
  await page.goto(path);
  expect(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),path).toBe('rgb(250, 247, 240)');
 }
 for(const path of ['/','/methodology']){
  await page.goto(path);
  expect(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),path).toBe('rgb(11, 11, 13)');
 }
});

test('research index is one flat newest-first list',async({page})=>{
 await page.goto('/research');
 await expect(page.locator('h1')).toHaveText('Research');
 await expect(page.locator('main .stamp')).toHaveCount(0);
 const dates=await page.locator('.index-list time').evaluateAll(es=>es.map(e=>Date.parse(e.getAttribute('datetime')!)));
 expect(dates.length).toBeGreaterThanOrEqual(3);
 expect([...dates].sort((a,b)=>b-a)).toEqual(dates);
 const links=await page.locator('.index-list h2 a').evaluateAll(es=>es.map(e=>e.getAttribute('href')));
 const schema=JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!);
 expect(schema.mainEntity.itemListElement.map((i:{url:string})=>new URL(i.url).pathname)).toEqual(links);
});

test('SK social metadata, card, chart images and data file are served',async({page,request})=>{
 await page.goto(route);
 for(const selector of ['meta[property="og:title"]','meta[name="twitter:title"]'])await expect(page.locator(selector)).toHaveAttribute('content',`${headline} · Windtunnel`);
 await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content',`https://windtunnel.tech${route}.og.jpg`);
 const schema=(await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(s=>JSON.parse(s)['@graph']||[]).find(s=>s['@type']==='Article');
 expect(schema.headline).toBe(headline);expect(schema.datePublished).toBe(await page.locator('time').getAttribute('datetime'));
 expect(Date.parse(schema.dateModified)).toBeGreaterThanOrEqual(Date.parse(schema.datePublished));
 expect(schema.image.length).toBe(7);
 for(const url of schema.image){const r=await request.get(new URL(url).pathname);expect(r.status(),url).toBe(200);}
 const dimensions=await page.evaluate(async url=>{const img=new Image();img.src=url;await img.decode();return [img.naturalWidth,img.naturalHeight];},`${route}.og.jpg`);
 expect(dimensions).toEqual([1200,630]);
 const data=await request.get(`${route}.evidence.json`);expect(data.status()).toBe(200);
 expect(Object.keys((await data.json()).evidence).length).toBe(Object.keys(article.evidence).length);
 const headers=JSON.parse(readFileSync('site/vercel.json','utf8')).headers.find((h:{source:string})=>h.source.includes('evidence'));
 expect(headers.headers).toContainEqual({key:'X-Robots-Tag',value:'noindex'});
 await page.goto('/feed.xml');
 expect(await page.locator('parsererror').count()).toBe(0);
 expect(await (await request.get('/sitemap.xml')).text()).toContain(`https://windtunnel.tech${route}`);
});

test('SK article reads without JavaScript on a phone',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
 try {
  const page=await context.newPage();await page.goto(`http://127.0.0.1:8097${route}`);
  await expect(page.locator('.copy-link')).toBeHidden();
  await expect(page.locator('#chart-who-ai-names')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }finally{await context.close();}
});

test('retired URLs permanently redirect to their current article',()=>{
 const config=JSON.parse(readFileSync('site/vercel.json','utf8'));
 const target='/research/insta360-action-camera-ai-study';
 const expected:Record<string,string>={'/studies':'/research','/studies/hotel-group':'/research/hotel-group','/studies/insta360':target,'/studies/insta360-message-lift':target,'/research/insta360':target,'/research/insta360-message-lift':target};
 for(const [source,destination] of Object.entries(expected)){
  const redirect=config.redirects.find((r:{source:string})=>r.source===source);
  expect(redirect,source).toMatchObject({destination,statusCode:301});
  expect(config.redirects.some((r:{source:string})=>r.source===destination),`${source} must not chain`).toBe(false);
 }
});
