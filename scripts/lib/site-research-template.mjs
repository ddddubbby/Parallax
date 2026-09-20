import { readFileSync } from 'node:fs';

export const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const json = value => JSON.stringify(value).replaceAll('<','\\u003c');
const signed = (value, digits=2) => `${value<0?'−':value>0?'+':''}${Math.abs(value).toFixed(digits)}`;
export const tinyDelta = value => value!==0 && Math.abs(value)<0.005 ? `<0.01 ${value<0?'decrease':'increase'}` : signed(value);
export function tokens(text, article) {
  return text.replace(/\{\{([\w]+)\|([\w]+)\}\}/g, (_,key,format) => {
    const item=article.evidence[key]?.data;
    if (!item) throw new Error(`Unknown evidence token ${key}`);
    const v=item.value;
    switch(format) {
      case 'n': return String(item.n);
      case 'count': return String(Math.round(v*item.n));
      case 'percent': return (v*100).toFixed(1)+'%';
      case 'fixed2': return v.toFixed(2);
      case 'signed1': return signed(v,1);
      case 'signed2': return signed(v,2);
      case 'ciPercent': if(item.ci_low===null||item.ci_high===null)break;return `${(item.ci_low*100).toFixed(1)}–${(item.ci_high*100).toFixed(1)}%`;
      case 'ciSigned': if(item.ci_low===null||item.ci_high===null)break;return `${signed(item.ci_low,1)} to ${signed(item.ci_high,1)}`;
    }
    throw new Error(`Invalid evidence format ${key}|${format}`);
  });
}
const date = value => new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Singapore'});
const badge = text => `<span class="stamp${text==='Simulated'?' sim':''}">${escape(text)}</span>`;
const safeUrl = url => { if (!/^(https:\/\/|\/(?!\/)|#)/.test(url)) throw new Error('Unsafe link'); return escape(url); };
const table=(headers,rows,label)=>`<div class="table-scroll" role="region" aria-label="${escape(label)}" tabindex="0"><p class="table-scroll-hint">Scroll the table to see all results →</p><table class="metric-table"><thead><tr>${headers.map(h=>`<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((cell,i)=>i===0?`<th scope="row">${cell}</th>`:`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const num=value=>`<span class="numeric">${escape(value)}</span>`;

export function shell({title,description,route,body,schema,config,image='/og.jpg',article=false}) {
  const home=readFileSync('site/index.html','utf8');
  const chrome=home.split(/<body[^>]*>/)[1].split('<main')[0].replace('href="/research"','href="/research" aria-current="page"');
  const footer=home.match(/<footer[\s\S]*?<\/footer>/)[0];
  return `<!DOCTYPE html>\n<html lang="en" class="no-js"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title><meta name="description" content="${escape(description)}">
<link rel="canonical" href="${config.url}${route}">
<meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}">
<meta property="og:type" content="${article?'article':'website'}"><meta property="og:url" content="${config.url}${route}">
<meta property="og:image" content="${config.url}${image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${escape(title)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}"><meta name="twitter:image" content="${config.url}${image}"><meta name="twitter:image:alt" content="${escape(title)}">
<link rel="icon" href="/favicon.png" type="image/png" sizes="96x96"><link rel="preload" href="/assets/fonts/space-grotesk-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css?v=${config.assetVersion}"><link rel="alternate" type="application/atom+xml" title="Windtunnel Research" href="/feed.xml">
<script type="application/ld+json">${json(schema)}</script><script>document.documentElement.className="js";</script>
</head><body class="${article?'research-article':'research-hub'}">${chrome}<main id="top">${body}</main>${footer}<script src="/motion.js?v=${config.assetVersion}"></script>${article?'<script src="/research.js?v='+config.assetVersion+'"></script>':''}</body></html>\n`;
}

function blockHtml(block, a) {
  const t=text=>escape(tokens(text,a));
  const value=key=>a.evidence[key].data;
  const caption=block.caption?`<figcaption>${t(block.caption)}</figcaption>`:'';
  switch(block.type) {
    case 'p': return `<p>${t(block.text)}</p>`;
    case 'links': return `<ul class="research-links">${block.items.map(([label,url])=>`<li><a href="${safeUrl(url)}">${escape(label)}</a></li>`).join('')}</ul>`;
    case 'ranking': return `<figure class="research-figure" id="visibility-chart"><div class="ranking-legend mono">Tracked jeweller <span>Mentions · rate · 95% interval</span></div>${block.rows.map(row=>{
      const m=value(row.ref);return `<div class="ranking-row${row.client?' subject':''}"><div class="ranking-label"><span>${escape(row.label)}</span><span class="numeric">${Math.round(m.value*m.n)} of ${m.n} · ${(m.value*100).toFixed(1)}% <small>(${(m.ci_low*100).toFixed(1)}–${(m.ci_high*100).toFixed(1)})</small></span></div><div class="ranking-track" aria-hidden="true"><span style="width:${m.value*100}%"></span></div></div>`;
    }).join('')}${caption}</figure>`;
    case 'attributes': {const data=value(block.ref);return `<figure class="research-figure"><h3>Spontaneous associations in ${data.n} answers mentioning SK</h3>${table(['Configured attribute','Answers','Share of mentions'],data.counts.map(c=>[escape(c.name),num(`${c.count} of ${data.n}`),num((c.count/data.n*100).toFixed(1)+'%')]),'Spontaneous brand associations')}${caption}</figure>`;}
    case 'baseline': {const s=value(block.run+'Baseline');return `<aside class="baseline-note"><h3>${escape(block.title)}</h3><p class="evidence-foot">Selected recorded answer · ${escape(s.providerId==='openai'?'OpenAI':s.providerId)} API · ${escape(s.modelVersion)} · ${date(s.respondedAt)} · ${escape(s.generationMode)}<br>Prompt: “${escape(s.promptText)}”</p><blockquote data-evidence="quote">${escape(value(block.run+'Current'))}</blockquote><p class="evidence-foot">One selected answer from the separate ${value('representationCount')}-answer description lane. ${s.themeLabel?`Machine-generated browsing label: ${escape(s.themeLabel)}. Stored grouping count: ${s.recurrence.matching}/${s.recurrence.total}; a descriptive grouping, not recurrence of this exact wording.`:'Single observed instance; no recurrence claim.'}</p></aside>`;}
    case 'comparison': {const s=value(block.run+'Baseline');return `<div class="message-comparison"><p class="label">What changed · ${block.run==='buyer'?'Buyer response':'AI recommendation'}</p><blockquote class="message-addition" data-evidence="quote">${escape(block.addition)}</blockquote><p class="evidence-foot">Experimental addition, not an independently verified sourcing statement. The exact supplied messages follow.</p><div class="message-columns">${['Current','New'].map(k=>`<details><summary>${k} message · full text</summary><pre data-evidence="quote">${escape(value(block.run+k))}</pre></details>`).join('')}</div><p class="evidence-foot">Baseline: selected ${escape(s.providerId==='openai'?'OpenAI':s.providerId)} API answer to “${escape(s.promptText)}”, ${date(s.respondedAt)}, ${escape(s.modelVersion)}, ${escape(s.generationMode)}. ${s.recurrence?`Machine-generated theme: ${escape(s.themeLabel)}; descriptive grouping ${s.recurrence.matching}/${s.recurrence.total}, not identical-wording recurrence.`:'Single observed instance; no recurrence claim.'}</p></div>`;}
    case 'stats':return `<figure class="research-figure"><dl class="case-stats">${block.items.map(([label,v])=>`<div><dt>${escape(label)}</dt><dd>${t(v)}</dd></div>`).join('')}</dl>${caption}</figure>`;
    case 'profiles':return `<figure class="research-figure" id="profile-results"><div class="stamps">${badge('Simulated')}${badge('Directional')}${badge('n=5 per profile per message')}</div>${table(['Buyer profile','Current','New','Difference'],block.rows.map(row=>[escape(row.label),num(value(row.current).value.toFixed(2)),num(value(row.next).value.toFixed(2)),num(tinyDelta(value(row.next).value-value(row.current).value))]),'All six simulated buyer profiles')}${caption}</figure><div class="profile-notes">${block.rows.map(row=>`<details id="profile-${row.key}"><summary>${escape(row.label)} · ${escape(tinyDelta(value(row.next).value-value(row.current).value))}</summary><p><strong>Supplied purchase need.</strong> ${escape(row.need)}</p><blockquote data-evidence="quote">${escape(value(row.quote))}<cite>Simulated reaction · OpenAI API · New message · first repetition</cite></blockquote><p><strong>Interpretation.</strong> ${escape(row.interpretation)}</p><p><strong>Proposed next test.</strong> ${escape(row.action)}</p></details>`).join('')}</div>`;
    case 'scenarios':return `<figure class="research-figure"><div class="stamps">${badge('Simulated')}${badge('Directional')}${badge('n=5 per situation per message')}</div>${table(['Shopping situation','Current','New','Difference (pp)'],block.rows.map((row,i)=>{const c=value(row.current),n=value(row.next);return [`<a href="#situation-${row.key}">${i+1}. ${escape(row.label)}</a>`,num(`${c.included}/${c.n}`),num(`${n.included}/${n.n}`),num(signed((n.included/n.n-c.included/c.n)*100,0))]}),'All fourteen recommendation scenarios')}${caption}</figure><div class="scenario-notes">${block.rows.map((row,i)=>`<details id="situation-${row.key}"><summary>Situation ${i+1} · inspect the response and next test</summary><p>${escape(row.label)}</p><p class="evidence-foot">First New-message repetition. ${row.omitted?'SK was absent from this particular shortlist; inspect the complete output below.':'The model’s reason for including SK follows.'}</p><blockquote data-evidence="quote">${escape(value(row.quote))}<cite>Simulated recommendation · OpenAI API · n=5 per message · directional</cite></blockquote><p><strong>Interpretation.</strong> ${escape(row.interpretation)}</p><p><strong>Proposed next test.</strong> ${escape(row.action)}</p></details>`).join('')}</div>`;
    case 'actions':return `<div class="action-briefs">${block.items.map(item=>`<article class="action-brief"><span class="label">Proposed content experiment</span><h3>${escape(item.title)}</h3><p><strong>Observation.</strong> ${escape(item.observation)}</p><p><strong>Interpretation.</strong> ${escape(item.interpretation)}</p><dl><dt>Owner</dt><dd>${escape(item.owner)}</dd><dt>Content destination</dt><dd>${escape(item.destination)}</dd><dt>Evidence needed</dt><dd>${escape(item.proof)}</dd><dt>Next comparison</dt><dd>${escape(item.test)}</dd></dl></article>`).join('')}</div>`;
    case 'prompts':return `<details class="prompt-disclosure"><summary>${escape(block.title)}</summary><p class="evidence-foot">Verbatim stored resolved prompts, including protocol markers and quoted research material. These are experimental inputs.</p>${Object.entries(a.evidence).filter(([key])=>key.startsWith(block.run+'Prompt')).map(([key,entry],i)=>`<details><summary>Prompt ${i+1}</summary><pre data-evidence="quote" data-prompt="${escape(key)}">${escape(entry.data)}</pre></details>`).join('')}</details>`;
    default:throw new Error(`Unknown block type ${block.type}`);
  }
}

export function renderArticle(a,config,catalogue) {
  const route='/research/'+a.slug;
  const words=[a.opening,...a.sections.flatMap(s=>[s.title,...s.blocks.flatMap(b=>b.type==='p'?[b.text]:b.type==='actions'?b.items.flatMap(Object.values):b.rows?b.rows.flatMap(r=>[r.label,r.need||'',r.interpretation||'',r.action||'']):[])])].join(' ').split(/\s+/).length;
  const readingTime=Math.max(1,Math.ceil(words/200));
  const schema={'@context':'https://schema.org','@graph':[
    {'@type':'Article','@id':config.url+route+'#article',headline:a.headline,description:a.description,datePublished:a.published,dateModified:a.updated,author:{'@type':'Organization',name:a.byline,url:config.url+'/research#editorial-method'},publisher:{'@id':config.url+'/#org'},mainEntityOfPage:config.url+route,isPartOf:{'@id':config.url+'/#website'},about:{'@type':'Organization',name:a.brand},image:config.url+route+'.og.jpg'},
    {'@type':'BreadcrumbList',itemListElement:[['Home','/'],['Research','/research'],[a.headline,route]].map(([name,path],i)=>({'@type':'ListItem',position:i+1,name,item:config.url+path}))}
  ]};
  const body=`<article class="wrap research-layout"><header class="research-header"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/research">Research</a><span aria-hidden="true">/</span><span>${escape(a.brand)}</span></nav><p class="eyebrow">Research · ${escape(a.type)} · ${escape(a.category||a.brand)}</p><h1>${escape(a.headline)}</h1><p class="lead">${escape(tokens(a.dek,a))}</p><div class="research-byline"><a href="/research#editorial-method">${escape(a.byline)}</a><time datetime="${a.published}">${date(a.published)}</time><span>${readingTime} min read + evidence</span></div><div class="stamps">${a.status.map(badge).join('')}${badge('API study · ungrounded')}</div></header>
<div class="research-intro"><p>${escape(a.opening)}</p></div>
<nav class="key-findings" aria-label="Key findings"><h2>What the study tells us</h2><ol>${a.keyFindings.map(k=>`<li><a href="#${k.anchor}"><span class="finding-status">${escape(k.status)}</span>${escape(tokens(k.text,a))}</a></li>`).join('')}</ol></nav>
${a.sections.map(s=>`<section class="research-section${s.status==='Simulated'?' simulation-section':''}" id="${s.id}"${s.studyType?` data-study-type="${s.studyType}"`:''}><div class="section-label">${badge(s.status)}${s.studyType?`<span class="mono">${s.studyType==='buyer_response'?'Buyer response':'AI recommendation'}</span>`:''}</div><h2>${escape(s.title)}</h2>${s.blocks.map(b=>blockHtml(b,a)).join('\n')}</section>`).join('\n')}
<section class="research-section" id="share"><h2>Share the question. Keep the evidence attached.</h2><div class="share-links"><a class="btn" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(a.headline)}&amp;url=${encodeURIComponent(config.url+route)}">Share on X</a><a class="btn" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(config.url+route)}">Share on LinkedIn</a><button class="btn copy-link" hidden data-copy-url="${config.url+route}">Copy link</button><span role="status" class="copy-status"></span></div><p class="evidence-foot"><a href="${config.url+route}">Permanent article link</a></p><h3>Related research</h3><ul class="research-links">${a.related.map(slug=>{const entry=catalogue.find(c=>c.slug===slug);return `<li><a href="/research/${slug}">${escape(entry.headline)}</a></li>`}).join('')}</ul><a class="tlink" href="/#contact">Request a brand audit →</a></section></article>`;
  return shell({title:a.headline,description:a.description,route,body,schema,config,image:route+'.og.jpg',article:true});
}

export function renderHub(entries,config) {
 const cards=entries.map((e,i)=>`<article class="study-teaser${i===0?' research-featured':''}">${i===0?`<a class="research-card-image" href="/research/${e.slug}" tabindex="-1" aria-hidden="true"><img src="/research/${e.slug}.og.jpg" width="1200" height="630" alt=""></a>`:''}<div><div class="stamps">${e.status.map(badge).join('')}${badge(date(e.published))}</div><p class="mono">${escape(e.type)}</p><h${i===0?'2':'3'}><a href="/research/${e.slug}">${escape(e.headline)}</a></h${i===0?'2':'3'}><p class="lead">${escape(e.hubTeaser)}</p><a class="tlink" href="/research/${e.slug}">Read the study →</a></div></article>`).join('');
 const schema={'@context':'https://schema.org','@type':'CollectionPage','@id':config.url+'/research#webpage',url:config.url+'/research',name:'AI visibility and message testing research',isPartOf:{'@id':config.url+'/#website'},mainEntity:{'@type':'ItemList',itemListElement:entries.map((e,i)=>({'@type':'ListItem',position:i+1,name:e.headline,url:config.url+'/research/'+e.slug}))}};
 return shell({title:'AI visibility and message testing research · Windtunnel',description:'Original AI visibility audits and message tests. Explore findings, exact prompts, uncertainty, and practical next steps for brand teams.',route:'/research',schema,config,body:`<section><div class="wrap"><p class="eyebrow">Windtunnel Research</p><h1>Evidence for the next brand decision.</h1><p class="lead">What AI says about a brand. What changes when the message changes. Original studies with the findings, the method, and the next question worth testing.</p><a class="tlink" href="/feed.xml">Subscribe to the research feed →</a></div></section><section aria-label="Published research"><div class="wrap">${cards}</div></section><section id="editorial-method"><div class="wrap"><p class="eyebrow">Windtunnel Research · editorial method</p><h2>Every conclusion has a boundary.</h2><p class="lead">Windtunnel Research is the editorial byline for studies produced with Windtunnel. We verify reported figures against stored evidence, disclose methods and exact prompts, distinguish measurements from simulations, and publish negative and inconclusive findings.</p><p>Interpretations and proposed tests are labeled separately from observations. Dates identify publication and substantive updates. Existing study-specific relationship disclosures remain on their articles; publication alone implies no endorsement or client relationship.</p><a class="tlink" href="/methodology">Inspect the methodology →</a></div></section>`});
}

export function cardSvg(a,config) {
 const lines=a.cardLines;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#0B0B0D"/><path d="M52 104V52h52 M1096 52h52v52 M52 526v52h52 M1096 578h52v-52" fill="none" stroke="#F15A24" stroke-width="2"/><text x="82" y="112" fill="#F0EEE4" font-family="Space Grotesk, sans-serif" font-size="32" font-weight="500">windtunnel</text><text x="1118" y="109" text-anchor="end" fill="#B9B6AC" font-family="IBM Plex Mono, monospace" font-size="17">RESEARCH / ${escape(a.type.toUpperCase())}</text><g fill="#F0EEE4" font-family="Space Grotesk, sans-serif" font-weight="500" font-size="58">${lines.map((line,i)=>`<text x="82" y="${244+i*72}">${escape(line)}</text>`).join('')}</g><path d="M82 450h1036" stroke="#F0EEE4" stroke-opacity=".2"/><text x="82" y="500" fill="#B9B6AC" font-family="IBM Plex Mono, monospace" font-size="19">${escape(a.cardFooter||a.status.join(' / ').toUpperCase())}</text><text x="82" y="538" fill="#B9B6AC" font-family="IBM Plex Mono, monospace" font-size="17">${escape(new URL(config.url).host)} / research</text></svg>\n`;
}
