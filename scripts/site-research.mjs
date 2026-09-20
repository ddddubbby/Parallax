#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { renderArticle, renderHub, cardSvg, escape, tokens, articleWords } from './lib/site-research-template.mjs';

const dir='content/research';
const hash=value=>createHash('sha256').update(value).digest('hex');
const read=path=>readFileSync(path,'utf8');
const config=JSON.parse(read(dir+'/config.json'));
const brands=JSON.parse(read(dir+'/brands.json'));
const reserved=['config.json','cards.json','brands.json'];
// D-137: research pieces are articles. Status chips, walls and limits lists are
// retired; what stays enforced is provenance (every number resolves to verified
// evidence) and the headline gate.
const articleSchema=z.object({schemaVersion:z.union([z.literal(1),z.literal(2)]),slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
 headline:z.string().min(1).max(90),description:z.string().min(1).max(155),published:z.string().datetime({offset:true}),updated:z.string().datetime({offset:true}),
 hubSummary:z.string().min(1).max(200),cardLines:z.array(z.string().max(34)).min(1).max(4),legacy:z.boolean().optional()}).passthrough();
const block=z.discriminatedUnion('type',[
 z.object({type:z.literal('p'),text:z.string().min(1)}),
 z.object({type:z.literal('pull'),text:z.string().min(1)}),
 z.object({type:z.literal('quote'),ref:z.string(),excerpt:z.string().optional(),who:z.string().min(1)}),
 z.object({type:z.literal('addition'),text:z.string().min(1),run:z.string(),who:z.string().min(1)}),
 z.object({type:z.literal('chart'),chart:z.enum(['ranking','funnel','leaders','attributes','dumbbell','flips']),id:z.string().regex(/^[a-z0-9-]+$/),title:z.string().min(1),caption:z.string().min(1)}).passthrough()]);
const sourcedSchema=z.object({headlineCandidates:z.array(z.string().max(90)).min(5),standfirst:z.string().min(1),opening:z.array(z.string()).min(1),shortVersion:z.array(z.string()).min(3).max(5),
 sections:z.array(z.object({id:z.string().regex(/^[-a-z0-9]+$/),title:z.string().min(1),blocks:z.array(block).min(1),takeaway:z.string().min(1)})).min(3).max(7),
 recommendations:z.object({title:z.string(),intro:z.string(),items:z.array(z.object({title:z.string(),body:z.string()})).min(2).max(4)}),
 how:z.object({title:z.string(),paragraphs:z.array(z.string()).min(1),credit:z.string()}),related:z.array(z.string()).min(2),byline:z.string(),brand:z.string(),category:z.string()}).passthrough();
export function validateArticle(a) {
 articleSchema.parse(a);
 if(new Date(a.updated)<new Date(a.published))throw Error('dateModified predates datePublished');
 if(a.legacy)return;
 sourcedSchema.parse(a);
 if(!a.headlineCandidates.includes(a.headline))throw Error('Headline gate: choose the headline from headlineCandidates');
 if(!a.evidence||!a.runs)throw Error('Evidence and runs required');
 const ids=a.sections.map(s=>s.id);
 if(new Set(ids).size!==ids.length)throw Error('Duplicate section id');
 for(const [key,e] of Object.entries(a.evidence)){
  if(!a.runs[e.source?.run]||e.data===undefined)throw Error('Missing provenance for '+key);
  if(e.source.kind==='metric' && (!Number.isFinite(e.data.value)||!Number.isInteger(e.data.n)))throw Error('Invalid metric '+key);
 }
 for(const s of a.sections)for(const b of s.blocks){
  if(b.type==='addition'&&!a.evidence[b.run+'New']?.data.includes(b.text))throw Error('Addition is not verbatim message text');
  if(b.type==='chart'&&b.chart==='dumbbell'){
   const profiles=a.evidence.profiles.data;
   if(b.rows.length!==profiles.length||b.rows.some((r,i)=>r.key!==profiles[i].key))throw Error('Buyer order changed from the tested order');
  }
  if(b.type==='chart'&&b.chart==='flips'){
   const scenarios=a.evidence.scenarios.data;
   if(b.rows.length!==scenarios.length||b.rows.some((r,i)=>r.key!==scenarios[i].key))throw Error('Question order changed from the tested order');
  }
 }
 const resolved=tokens(JSON.stringify([a.standfirst,a.opening,a.shortVersion,a.sections,a.recommendations,a.how,a.social]),a);
 if(resolved.includes('{{'))throw Error('Unresolved content token');
}
const entries=()=>readdirSync(dir).filter(f=>f.endsWith('.json')&&!f.endsWith('.verified.json')&&!reserved.includes(f)).map(f=>{
 const a=JSON.parse(read(dir+'/'+f));validateArticle(a);if(f!==a.slug+'.json')throw Error('Slug/file mismatch');return a;
}).sort((a,b)=>Date.parse(b.published)-Date.parse(a.published)||a.slug.localeCompare(b.slug));
const receiptPath=a=>`${dir}/${a.slug}.verified.json`;
function requireReceipt(a){
 if(a.legacy)return;
 const receipt=JSON.parse(read(receiptPath(a)));
 if(receipt.contentSha256!==hash(read(`${dir}/${a.slug}.json`))||receipt.sources!==Object.keys(a.evidence).length)throw Error(`Reverify changed evidence/content: ${a.slug}`);
}
const charts=a=>a.legacy?[]:a.sections.flatMap(s=>s.blocks.filter(b=>b.type==='chart'));
// Hand-authored pre-M60 pieces join the light publication theme and lose their chip rows;
// their prose is rewritten piece by piece in the weekly backlog, not here.
function legacyHtml(a){
 let html=read(`site/research/${a.slug}.html`);
 const image=`${config.url}/research/${a.slug}.og.jpg`;
 html=html.replace(/(<meta (?:property="og:image"|name="twitter:image") content=")[^"]+/g,`$1${image}`);
 html=html.replace(/("image":\s*")[^"]+"/g,`$1${image}"`);
 html=html.replace(/<body class="[^"]*">/,'<body class="article-page research-article research-legacy">');
 html=html.replace(/\s*<div class="stamps[^"]*">[\s\S]*?<\/div>/g,'');
 html=html.replace(/(styles\.css|motion\.js)\?v=[^"]+/g,`$1?v=${config.assetVersion}`);
 if(!html.includes('name="theme-color"'))html=html.replace('<title>','<meta name="theme-color" content="#FAF7F0">\n<title>');
 if(!html.includes('application/atom+xml'))html=html.replace('</head>','<link rel="alternate" type="application/atom+xml" title="Windtunnel Research" href="/feed.xml">\n</head>');
 if(!html.includes('BreadcrumbList'))html=html.replace('</head>',`<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[['Home','/'],['Research','/research'],[a.headline,'/research/'+a.slug]].map(([name,p],i)=>({'@type':'ListItem',position:i+1,name,item:config.url+p}))})}</script>\n</head>`);
 return html;
}
const publicEvidence=a=>JSON.stringify({article:`${config.url}/research/${a.slug}`,published:a.published,updated:a.updated,note:'Every figure in the article resolves to one of these entries. Prompts, messages and quoted outputs are verbatim.',runs:Object.keys(a.runs),evidence:Object.fromEntries(Object.entries(a.evidence).map(([k,e])=>[k,{kind:e.source.kind,run:e.source.run,data:e.data}]))},null,1)+'\n';
function outputs(all){
 const out=new Map();
 for(const a of all){
  requireReceipt(a);
  out.set(`site/research/${a.slug}.html`,a.legacy?legacyHtml(a):renderArticle(a,config,all,brands));
  out.set(`site/research/${a.slug}.og.svg`,cardSvg(a,config));
  if(!a.legacy){
   out.set(`site/research/${a.slug}.evidence.json`,publicEvidence(a));
   const url=config.url+'/research/'+a.slug;
   const thread=a.social.thread.map((line,i)=>`${i+1}/${a.social.thread.length+1} ${tokens(line,a)}`);
   thread.push(`${thread.length+1}/${thread.length+1} ${tokens(a.social.threadClose,a)} ${url}`);
   if(thread.some(t=>[...t].length>280))throw Error('X thread beat exceeds 280 characters');
   out.set(`${dir}/${a.slug}.social.md`,`# ${a.headline}\n\n## LinkedIn\n\n${tokens(a.social.linkedin,a)}\n\n${url}\n\n## X thread\n\n${thread.join('\n\n')}\n\n## Partner email\n\n${tokens(a.social.email,a)}\n\n${url}\n\n## Images to attach\n\n- Card: site/research/${a.slug}.og.jpg\n${charts(a).map(c=>`- ${c.title}: site/research/${a.slug}-${c.id}.png`).join('\n')}\n`);
  }
 }
 out.set('site/research.html',renderHub(all,config));
 const updated=all.reduce((d,a)=>a.updated>d?a.updated:d,all[0].updated);
 out.set('site/feed.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>Windtunnel Research</title><id>${config.url}/research</id><link href="${config.url}/feed.xml" rel="self"/><link href="${config.url}/research"/><updated>${updated}</updated><author><name>Windtunnel Research</name></author>${all.map(a=>`<entry><id>${config.url}/research/${a.slug}</id><title>${escape(a.headline)}</title><link href="${config.url}/research/${a.slug}"/><published>${a.published}</published><updated>${a.updated}</updated><summary>${escape(a.hubSummary)}</summary></entry>`).join('')}</feed>\n`);
 const sitemap=read('site/sitemap.xml');
 const nonResearch=[...sitemap.matchAll(/<url>[\s\S]*?<\/url>/g)].map(x=>x[0]).filter(x=>!/<loc>[^<]*\/(?:studies|research)(?:<|\/)/.test(x));
 const research=[['/research',updated],...all.map(a=>['/research/'+a.slug,a.updated])].map(([path,date])=>`<url><loc>${config.url}${path}</loc><lastmod>${date.slice(0,10)}</lastmod></url>`);
 out.set('site/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...nonResearch,...research].join('\n')}\n</urlset>\n`);
 const llms=read('site/llms.txt').replace(/## (?:Studies|Research)[\s\S]*?(?=## Method)/,`## Research\n\n${all.map(a=>`- [${a.headline}](${config.url}/research/${a.slug}): ${a.hubSummary}`).join('\n')}\n- [Research index](${config.url}/research): every piece, newest first.\n\n`);
 out.set('site/llms.txt',llms);
 const latest=all[0];
 out.set('site/index.html',read('site/index.html').replace(/<!-- research:featured:start -->[\s\S]*?<!-- research:featured:end -->/,`<!-- research:featured:start --><a href="/research/${latest.slug}"><span class="mono">Latest research</span><h3>${escape(latest.headline)}</h3><span aria-hidden="true">↗</span></a><!-- research:featured:end -->`));
 return out;
}
const fontFaces=()=>[['Space Grotesk','space-grotesk'],['Inter','inter'],['IBM Plex Mono','ibm-plex-mono']].map(([name,file])=>`@font-face{font-family:"${name}";font-weight:100 900;src:url(data:font/woff2;base64,${readFileSync('site/assets/fonts/'+file+'-latin.woff2').toString('base64')}) format('woff2')}`).join('');
async function images(all,out){
 const {chromium}=await import('@playwright/test');
 const browser=await chromium.launch();
 const manifest={};
 try{
  const card=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
  for(const a of all){
   const svg=cardSvg(a,config);
   await card.setContent(`<html><head><style>${fontFaces()}body{margin:0}svg{display:block}</style></head><body>${svg}</body></html>`);
   await card.evaluate(()=>document.fonts.ready);
   const jpg=await card.screenshot({type:'jpeg',quality:92});
   writeFileSync(`site/research/${a.slug}.og.jpg`,jpg);
   manifest[a.slug]={svgSha256:hash(svg),jpgSha256:hash(jpg),charts:{}};
  }
  // Chart images for social posts and image search: each figure rendered alone on paper at 2x.
  const css=read('site/styles.css').replace(/@font-face[^}]+}/g,'');
  const page=await browser.newPage({viewport:{width:1000,height:800},deviceScaleFactor:2});
  for(const a of all.filter(a=>!a.legacy)){
   const html=out.get(`site/research/${a.slug}.html`);
   for(const c of charts(a)){
    const fig=html.match(new RegExp(`<figure class="chart[^"]*" id="chart-${c.id}"[\\s\\S]*?</figure>`))?.[0];
    if(!fig)throw Error(`Chart markup missing: ${c.id}`);
    await page.setContent(`<html><head><style>${fontFaces()}${css}.chart-save{display:none}</style></head><body class="research-article" style="margin:0;padding:40px"><main><article class="article"><section class="prose">${fig.replace(/<img [^>]*src="\/research\/logos\/([^"]+)"/g,(m,f)=>m.replace(`/research/logos/${f}`,`data:image/${f.endsWith('.svg')?'svg+xml':'png'};base64,${readFileSync('site/research/logos/'+f).toString('base64')}`))}</section></article></main></body></html>`);
    await page.evaluate(()=>document.fonts.ready);
    const png=await page.locator('figure.chart').screenshot({type:'png'});
    writeFileSync(`site/research/${a.slug}-${c.id}.png`,png);
    manifest[a.slug].charts[c.id]=hash(png);
   }
  }
 }finally{await browser.close();}
 writeFileSync(dir+'/cards.json',JSON.stringify(manifest,null,2)+'\n');
}
// Promise words stay banned (playbook §5.3); report-speak is banned so pieces read like articles.
const promises=/\b(?:guaranteed|calibrated|ROI|AI-powered|our research|Latent Preference Triangulation|conversion lift|purchase probability|proprietary algorithm|real-time|our validation|we published|Perceptual Manifold|Signal Fidelity Index|Resonance Tensor|will rank|ranked first in ChatGPT)\b|#1 in (?:ChatGPT|AI)|ChatGPT says|__SITE_URL__|marriott|resonance\.observer|windtunnel\.observer/gi;
const reportSpeak=/\b(?:eligible|point[- ]estimate|construct|does not establish|directional|unbranded|ungrounded|simulated|measured audit)\b/gi;
function lint(all){
 for(const a of all.filter(a=>!a.legacy)){
  const paragraphs=[a.standfirst,...a.opening,...a.shortVersion,...a.sections.flatMap(s=>[s.title,s.takeaway,...s.blocks.filter(b=>['p','pull'].includes(b.type)).map(b=>b.text),...s.blocks.filter(b=>b.type==='chart').flatMap(b=>[b.title,b.caption])]),a.recommendations.intro,...a.recommendations.items.flatMap(i=>[i.title,i.body]),...a.how.paragraphs].map(p=>tokens(p,a));
  const prose=[a.headline,a.description,...paragraphs,read(`${dir}/${a.slug}.social.md`)].join('\n');
  const bad=prose.match(promises);if(bad)throw Error('Claims lint: '+bad.join(', '));
  const stiff=[a.headline,...paragraphs].join('\n').match(reportSpeak);if(stiff)throw Error('Readability lint, report-speak: '+[...new Set(stiff)].join(', '));
  const long=paragraphs.filter(p=>p.split(/\s+/).length>80);if(long.length)throw Error('Readability lint, paragraph over 80 words: '+long[0].slice(0,60));
  const words=articleWords(a);if(words<1000||words>2000)throw Error(`Readability lint: ${words} words (target 1,000–2,000)`);
  for(const s of a.sections)if(/^(We tested|The .* adds?)\b/.test(s.title))throw Error('Readability lint, heading describes process: '+s.title);
  console.log(`${a.slug}: ${words} words; claims and readability clean`);
 }
}

async function main(){
 const [command,argument]=process.argv.slice(2);
 if(['discover','pull','verify'].includes(command)){
  const {readEvidence,discoverRuns,pullRun,resolveEvidence}=await import('./lib/site-research-evidence.mjs');
  if(command==='discover'){console.log(JSON.stringify(await readEvidence(c=>discoverRuns(c,argument||'SK')),null,2));return;}
  if(command==='pull'){console.log(JSON.stringify(await readEvidence(c=>pullRun(c,argument)),null,2));return;}
  const a=entries().find(a=>a.slug===argument);if(!a||a.legacy)throw Error('Choose a sourced article');
  await readEvidence(async c=>{
   const bundles={};for(const [name,id] of Object.entries(a.runs)){
    const bundle=await pullRun(c,id);
    if(bundle.run.state!=='completed'||bundle.run.run_mode==='mock')throw Error('Only completed live runs publish');
    if(name==='audit'?bundle.run.kind!=='audit':bundle.study?.test_type!==(name==='buyer'?'buyer_response':'ai_recommendation'))throw Error('Study type mismatch');
    bundles[name]=bundle;
   }
   for(const [key,item] of Object.entries(a.evidence)){
    const actual=resolveEvidence(item.source,bundles[item.source.run]);
    // Normalize PostgreSQL Date objects to their JSON representation.
    if(actual===undefined||!isDeepStrictEqual(JSON.parse(JSON.stringify(actual)),item.data))throw Error('Evidence mismatch: '+key);
   }
   for(const name of ['recommendation','buyer']){
    const bundle=bundles[name];if(!bundle)continue;const baseline=bundle.stimuli.find(s=>s.id===bundle.study.baseline_stimulus_id);
    const raw=bundles.audit.samples.find(s=>s.id===baseline?.baseline_stamp_json?.responseId);
    if(!raw||baseline.body!==raw.raw_text)throw Error('Baseline is not verbatim stored audit evidence');
   }
  });
  writeFileSync(receiptPath(a),JSON.stringify({contentSha256:hash(read(`${dir}/${a.slug}.json`)),sources:Object.keys(a.evidence).length,verifiedAt:new Date().toISOString(),method:'Read-only repeatable-read transaction; metric, prompt, message, quote and derived-count equality; verbatim baseline linkage'},null,2)+'\n');
  console.log(`Verified ${Object.keys(a.evidence).length} evidence entries in ${Object.keys(a.runs).length} completed runs; database unchanged.`);return;
 }
 const all=entries();
 if(command==='lint'){lint(all);return;}
 if(!['build','check'].includes(command))throw Error('Usage: site:research discover <brand> | pull <run-id> | verify <slug> | build | check | lint');
 const out=outputs(all);
 if(command==='build'){
  mkdirSync('site/research',{recursive:true});for(const [path,text] of out)writeFileSync(path,text);
  await images(all,out);lint(all);console.log(`Built ${all.length} research articles, cards, chart images, index, feed and discovery files.`);
 }else{
  for(const [path,text] of out)if(!existsSync(path)||read(path)!==text)throw Error(`Generated output is stale: ${path}`);
  const manifest=JSON.parse(read(dir+'/cards.json'));
  for(const a of all){
   if(manifest[a.slug]?.svgSha256!==hash(cardSvg(a,config))||manifest[a.slug]?.jpgSha256!==hash(readFileSync(`site/research/${a.slug}.og.jpg`)))throw Error('Stale/corrupt article card: '+a.slug);
   for(const c of charts(a))if(manifest[a.slug].charts?.[c.id]!==hash(readFileSync(`site/research/${a.slug}-${c.id}.png`)))throw Error(`Stale chart image: ${a.slug}-${c.id}`);
  }
  lint(all);console.log('Generated text, card and chart hashes match committed content.');
 }
}
if(process.argv[1]?.endsWith('/site-research.mjs'))main().catch(error=>{console.error(`Research: ${error.code||error.message}`);process.exitCode=1;});
