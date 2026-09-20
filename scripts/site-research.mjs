#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { renderArticle, renderHub, cardSvg, escape, tokens } from './lib/site-research-template.mjs';

const dir='content/research';
const hash=value=>createHash('sha256').update(value).digest('hex');
const read=path=>readFileSync(path,'utf8');
const config=JSON.parse(read(dir+'/config.json'));
const articleSchema=z.object({schemaVersion:z.literal(1),slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
 headline:z.string().min(1).max(100),description:z.string().min(1).max(155),published:z.string().datetime({offset:true}),updated:z.string().datetime({offset:true}),
 type:z.enum(['Study','Method note','Category index']),status:z.array(z.enum(['Measured','Simulated','Directional'])).min(1),
 hubTeaser:z.string().min(1),cardLines:z.array(z.string().max(42)).min(1).max(3),legacy:z.boolean().optional()}).passthrough();
export function validateArticle(a) {
 articleSchema.parse(a);
 if(new Date(a.updated)<new Date(a.published))throw Error('dateModified predates datePublished');
 if(a.legacy)return;
 if(!a.evidence||!a.runs||!a.sections?.length)throw Error('Evidence and sections required');
 const ids=a.sections.map(s=>s.id);
 if(new Set(ids).size!==ids.length||ids.some(id=>!/^[-a-z0-9]+$/.test(id)))throw Error('Invalid or duplicate section id');
 for(const k of a.keyFindings)if(!ids.includes(k.anchor))throw Error('Unknown finding anchor');
 for(const [key,e] of Object.entries(a.evidence)){
  if(!a.runs[e.source?.run]||e.data===undefined)throw Error('Missing provenance for '+key);
  if(e.source.kind==='metric' && (!Number.isFinite(e.data.value)||!Number.isInteger(e.data.n)))throw Error('Invalid metric '+key);
 }
 for(const section of a.sections){
  if(!['Measured','Simulated','Proposed tests','Method'].includes(section.status))throw Error('Missing evidence status');
  if(section.studyType && section.status!=='Simulated')throw Error('Simulation wall missing');
  for(const block of section.blocks){
   if(['profiles','scenarios'].includes(block.type)&&section.status!=='Simulated')throw Error('Simulation slice requires wall');
   if(block.type==='profiles'&&block.rows.some(r=>a.evidence[r.current].data.n!==5||a.evidence[r.next].data.n!==5))throw Error('Profile caption requires n=5');
   if(block.type==='profiles') {
    const profiles=a.evidence.profiles.data;
    if(block.rows.length!==profiles.length||block.rows.some((r,i)=>r.key!==profiles[i].key||r.label!==profiles[i].label||r.need!==profiles[i].behavioralProfile))throw Error('Profile definitions or original order changed');
   }
   if(block.type==='scenarios') {
    const scenarios=a.evidence.scenarios.data;
    if(block.rows.length!==scenarios.length||block.rows.some((r,i)=>r.key!==scenarios[i].key||!scenarios[i].promptText.endsWith(r.label)))throw Error('Scenario definitions or original order changed');
   }
   if(block.type==='comparison'&&!a.evidence[block.run+'New'].data.includes(block.addition))throw Error('Addition is not verbatim stimulus text');
  }
 }
 const resolved=tokens(JSON.stringify(a.sections)+JSON.stringify(a.keyFindings)+a.dek+JSON.stringify(a.social),a);
 if(resolved.includes('{{'))throw Error('Unresolved content token');
}
const entries=()=>readdirSync(dir).filter(f=>f.endsWith('.json')&&!f.endsWith('.verified.json')&&!['config.json','cards.json'].includes(f)).map(f=>{
 const a=JSON.parse(read(dir+'/'+f));validateArticle(a);if(f!==a.slug+'.json')throw Error('Slug/file mismatch');return a;
}).sort((a,b)=>Date.parse(b.published)-Date.parse(a.published)||a.slug.localeCompare(b.slug));
const receiptPath=a=>`${dir}/${a.slug}.verified.json`;
function requireReceipt(a){
 if(a.legacy)return;
 const receipt=JSON.parse(read(receiptPath(a)));
 if(receipt.contentSha256!==hash(read(`${dir}/${a.slug}.json`))||receipt.sources!==Object.keys(a.evidence).length)throw Error(`Reverify changed evidence/content: ${a.slug}`);
}
function legacyHtml(a){
 let html=read(`site/research/${a.slug}.html`);
 const image=`${config.url}/research/${a.slug}.og.jpg`;
 html=html.replace(/(<meta (?:property="og:image"|name="twitter:image") content=")[^"]+/,`$1${image}`);
 html=html.replace(/(<meta name="twitter:image" content=")[^"]+/,`$1${image}`);
 html=html.replace(/("image":\s*")[^"]+"/g,`$1${image}"`);
 if(!html.includes('application/atom+xml'))html=html.replace('</head>','<link rel="alternate" type="application/atom+xml" title="Windtunnel Research" href="/feed.xml">\n</head>');
 if(!html.includes('BreadcrumbList'))html=html.replace('</head>',`<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[['Home','/'],['Research','/research'],[a.headline,'/research/'+a.slug]].map(([name,p],i)=>({'@type':'ListItem',position:i+1,name,item:config.url+p}))})}</script>\n</head>`);
 return html;
}
function outputs(all){
 const out=new Map();
 for(const a of all){
  requireReceipt(a);
  out.set(`site/research/${a.slug}.html`,a.legacy?legacyHtml(a):renderArticle(a,config,all));
  out.set(`site/research/${a.slug}.og.svg`,cardSvg(a,config));
  if(!a.legacy){
   const url=config.url+'/research/'+a.slug;
   const thread=a.social.thread.map((line,i)=>`${i+1}/${a.social.thread.length+1} ${tokens(line,a)}`);
   thread.push(`${thread.length+1}/${thread.length+1} Read the evidence, exact prompts and proposed tests: ${url}`);
   if(thread.some(t=>[...t].length>280))throw Error('X thread beat exceeds 280 characters');
   out.set(`${dir}/${a.slug}.social.md`,`# ${a.headline}\n\n## LinkedIn\n\n${tokens(a.social.linkedin,a)}\n\n${url}\n\n## X thread\n\n${thread.join('\n\n')}\n\n## Partner email\n\n${a.social.email}\n\n${url}\n\n## Image\n\nArticle card: site/research/${a.slug}.og.jpg. Optional figure exports are deferred.\n`);
  }
 }
 out.set('site/research.html',renderHub(all,config));
 const updated=all.reduce((d,a)=>a.updated>d?a.updated:d,all[0].updated);
 out.set('site/feed.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>Windtunnel Research</title><id>${config.url}/research</id><link href="${config.url}/feed.xml" rel="self"/><link href="${config.url}/research"/><updated>${updated}</updated><author><name>Windtunnel Research</name></author>${all.map(a=>`<entry><id>${config.url}/research/${a.slug}</id><title>${escape(a.headline)}</title><link href="${config.url}/research/${a.slug}"/><published>${a.published}</published><updated>${a.updated}</updated><summary>${escape(a.hubTeaser)}</summary></entry>`).join('')}</feed>\n`);
 const sitemap=read('site/sitemap.xml');
 const nonResearch=[...sitemap.matchAll(/<url>[\s\S]*?<\/url>/g)].map(x=>x[0]).filter(x=>!/<loc>[^<]*\/(?:studies|research)(?:<|\/)/.test(x));
 const research=[['/research',updated],...all.map(a=>['/research/'+a.slug,a.updated])].map(([path,date])=>`<url><loc>${config.url}${path}</loc><lastmod>${date.slice(0,10)}</lastmod></url>`);
 out.set('site/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...nonResearch,...research].join('\n')}\n</urlset>\n`);
 const llms=read('site/llms.txt').replace(/## (?:Studies|Research)[\s\S]*?(?=## Method)/,`## Research\n\n${all.map(a=>`- [${a.headline}](${config.url}/research/${a.slug}): ${a.status.join(' / ')}. ${a.hubTeaser}`).join('\n')}\n- [Research hub](${config.url}/research): studies and editorial method.\n\n`);
 out.set('site/llms.txt',llms);
 const featured=all[0];
 out.set('site/index.html',read('site/index.html').replace(/<!-- research:featured:start -->[\s\S]*?<!-- research:featured:end -->/,`<!-- research:featured:start --><a href="/research/${featured.slug}"><span class="mono">${escape(featured.status.join(' / '))} · ${escape(featured.shortLabel||featured.type)}</span><h3>${escape(featured.headline)}</h3><span aria-hidden="true">↗</span></a><!-- research:featured:end -->`));
 return out;
}
async function cards(all){
 const {chromium}=await import('@playwright/test');
 const browser=await chromium.launch();
 const fonts=[['Space Grotesk','space-grotesk'],['IBM Plex Mono','ibm-plex-mono']].map(([name,file])=>`@font-face{font-family:"${name}";font-weight:100 900;src:url(data:font/woff2;base64,${readFileSync('site/assets/fonts/'+file+'-latin.woff2').toString('base64')}) format('woff2')}`).join('');
 const manifest={};
 try{
  const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
  for(const a of all){
   const svg=cardSvg(a,config);
   await page.setContent(`<html><head><style>${fonts}body{margin:0}svg{display:block}</style></head><body>${svg}</body></html>`);
   await page.evaluate(()=>document.fonts.ready);
   const jpg=await page.screenshot({type:'jpeg',quality:92});
   writeFileSync(`site/research/${a.slug}.og.jpg`,jpg);
   manifest[a.slug]={svgSha256:hash(svg),jpgSha256:hash(jpg)};
  }
 }finally{await browser.close();}
 writeFileSync(dir+'/cards.json',JSON.stringify(manifest,null,2)+'\n');
}
function lint(all){
 const forbidden=/\b(?:guaranteed|calibrated|ROI|AI-powered|our research|Latent Preference Triangulation|conversion lift|purchase probability|proprietary algorithm|real-time|our validation|we published|Perceptual Manifold|Signal Fidelity Index|Resonance Tensor)\b|#1 in (?:ChatGPT|AI)|__SITE_URL__|marriott|resonance\.observer|windtunnel\.observer/gi;
 for(const a of all.filter(a=>!a.legacy)){
  const prose=[a.headline,a.description,tokens(a.dek,a),...a.sections.flatMap(s=>[s.title,...s.blocks.filter(b=>b.type==='p').map(b=>tokens(b.text,a)),...s.blocks.filter(b=>b.type==='actions').flatMap(b=>b.items.flatMap(Object.values)),...s.blocks.filter(b=>['profiles','scenarios'].includes(b.type)).flatMap(b=>b.rows.flatMap(r=>[r.interpretation,r.action]))]),...a.keyFindings.map(k=>tokens(k.text,a)),read(`${dir}/${a.slug}.social.md`)].join('\n');
  const matches=prose.match(forbidden);if(matches)throw Error('Claims lint: '+matches.join(', '));
  console.log(`${a.slug}: authored prose/social clean; verbatim model evidence checked separately by provenance`);
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
  writeFileSync(receiptPath(a),JSON.stringify({contentSha256:hash(read(`${dir}/${a.slug}.json`)),sources:Object.keys(a.evidence).length,verifiedAt:new Date().toISOString(),method:'Read-only repeatable-read transaction; metric, prompt, stimulus, quote and derived-count equality; verbatim baseline linkage'},null,2)+'\n');
  console.log(`Verified ${Object.keys(a.evidence).length} evidence entries in three completed runs; database unchanged.`);return;
 }
 const all=entries();
 if(command==='lint'){lint(all);return;}
 if(!['build','check'].includes(command))throw Error('Usage: site:research discover <brand> | pull <run-id> | verify <slug> | build | check | lint');
 const out=outputs(all);
 if(command==='build'){
  mkdirSync('site/research',{recursive:true});for(const [path,text] of out)writeFileSync(path,text);
  await cards(all);lint(all);console.log(`Built ${all.length} research articles, cards, hub, feed and discovery files.`);
 }else{
  for(const [path,text] of out)if(!existsSync(path)||read(path)!==text)throw Error(`Generated output is stale: ${path}`);
  const manifest=JSON.parse(read(dir+'/cards.json'));
  for(const a of all)if(manifest[a.slug]?.svgSha256!==hash(cardSvg(a,config))||manifest[a.slug]?.jpgSha256!==hash(readFileSync(`site/research/${a.slug}.og.jpg`)))throw Error('Stale/corrupt article card: '+a.slug);
  lint(all);console.log('Generated text and card hashes match committed content.');
 }
}
if(process.argv[1]?.endsWith('/site-research.mjs'))main().catch(error=>{console.error(`Research: ${error.code||error.message}`);process.exitCode=1;});
