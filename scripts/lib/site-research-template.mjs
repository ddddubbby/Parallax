import { readFileSync } from 'node:fs';
import { renderChart } from './site-research-charts.mjs';

export const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const json = value => JSON.stringify(value).replaceAll('<','\\u003c');
const signed = (value, digits=2) => `${value<0?'−':value>0?'+':''}${Math.abs(value).toFixed(digits)}`;
export function tokens(text, article) {
  return text.replace(/\{\{([\w]+)\|([\w]+)\}\}/g, (_,key,format) => {
    const item=article.evidence[key]?.data;
    if (!item) throw new Error(`Unknown evidence token ${key}`);
    const v=item.value;
    switch(format) {
      case 'n': return String(item.n);
      case 'count': return String(Math.round(v*item.n));
      case 'pct0': return Math.round(v*100)+'%';
      case 'percent': return (v*100).toFixed(1)+'%';
      case 'fixed2': return v.toFixed(2);
      case 'signed1': return signed(v,1);
      case 'signed2': return signed(v,2);
    }
    throw new Error(`Invalid evidence format ${key}|${format}`);
  });
}
const date = value => new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Singapore'});
export const titleTag = headline => `${headline} · Windtunnel`;

// D-136: Research is a publication surface. `research-article` and `research-index`
// switch the shared chrome to the light editorial tokens in styles.css.
export function shell({title,description,route,body,schema,config,image='/og.jpg',article=false,bodyClass}) {
  const home=readFileSync('site/index.html','utf8');
  const chrome=home.split(/<body[^>]*>/)[1].split('<main')[0].replace('href="/research"','href="/research" aria-current="page"');
  const footer=home.match(/<footer[\s\S]*?<\/footer>/)[0];
  return `<!DOCTYPE html>\n<html lang="en" class="no-js"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#FAF7F0">
<title>${escape(title)}</title><meta name="description" content="${escape(description)}">
<link rel="canonical" href="${config.url}${route}">
<meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}">
<meta property="og:type" content="${article?'article':'website'}"><meta property="og:url" content="${config.url}${route}">
<meta property="og:image" content="${config.url}${image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${escape(title)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}"><meta name="twitter:image" content="${config.url}${image}"><meta name="twitter:image:alt" content="${escape(title)}">
<link rel="icon" href="/favicon.png" type="image/png" sizes="96x96"><link rel="preload" href="/assets/fonts/space-grotesk-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css?v=${config.assetVersion}"><link rel="alternate" type="application/atom+xml" title="Windtunnel Research" href="/feed.xml">
<script type="application/ld+json">${json(schema)}</script><script>document.documentElement.className="js";</script>
</head><body class="${bodyClass}">${chrome}<main id="top">${body}</main>${footer}<script src="/motion.js?v=${config.assetVersion}"></script>${article?'<script src="/research.js?v='+config.assetVersion+'"></script>':''}</body></html>\n`;
}

function blockHtml(block, a, brands) {
  const t=text=>escape(tokens(text,a));
  switch(block.type) {
    case 'p': return `<p>${t(block.text)}</p>`;
    case 'pull': return `<p class="pull">${t(block.text)}</p>`;
    case 'chart': return renderChart(block,a,brands);
    case 'quote': {
      const text=a.evidence[block.ref]?.data; if(typeof text!=='string')throw new Error(`Quote evidence missing: ${block.ref}`);
      if(block.excerpt&&!text.includes(block.excerpt))throw new Error(`Quote excerpt is not verbatim: ${block.ref}`);
      return `<figure class="reaction"><blockquote data-evidence="quote"><p>${escape(block.excerpt||text)}</p></blockquote><figcaption>${escape(block.who)}</figcaption></figure>`;
    }
    case 'addition': return `<figure class="reaction addition"><blockquote data-evidence="quote"><p>${escape(block.text)}</p></blockquote><figcaption>${escape(block.who)}</figcaption></figure>`;
    default:throw new Error(`Unknown block type ${block.type}`);
  }
}

export function articleWords(a) {
  const text=[a.standfirst,...a.opening,...a.shortVersion,...a.sections.flatMap(s=>[s.title,s.takeaway,...s.blocks.filter(b=>['p','pull'].includes(b.type)).map(b=>b.text)]),a.recommendations.title,a.recommendations.intro,...a.recommendations.items.flatMap(i=>[i.title,i.body]),a.how.title,...a.how.paragraphs].join(' ');
  return tokens(text,a).split(/\s+/).filter(Boolean).length;
}

export function renderArticle(a,config,catalogue,brands) {
  const route='/research/'+a.slug;
  const readingTime=Math.max(1,Math.round(articleWords(a)/220));
  const images=[config.url+route+'.og.jpg',...a.sections.flatMap(s=>s.blocks.filter(b=>b.type==='chart').map(b=>`${config.url}${route}-${b.id}.png`))];
  const schema={'@context':'https://schema.org','@graph':[
    {'@type':'Article','@id':config.url+route+'#article',headline:a.headline,description:a.description,datePublished:a.published,dateModified:a.updated,author:{'@type':'Organization',name:a.byline,url:config.url+'/methodology'},publisher:{'@id':config.url+'/#org'},mainEntityOfPage:config.url+route,isPartOf:{'@id':config.url+'/#website'},about:{'@type':'Organization',name:a.brand},articleSection:a.category,image:images},
    {'@type':'BreadcrumbList',itemListElement:[['Home','/'],['Research','/research'],[a.headline,route]].map(([name,path],i)=>({'@type':'ListItem',position:i+1,name,item:config.url+path}))}
  ]};
  const more=a.related.slice(0,2).map(slug=>{const e=catalogue.find(c=>c.slug===slug);if(!e)throw new Error(`Unknown related article ${slug}`);return `<li><a href="/research/${slug}">${escape(e.headline)}</a></li>`;}).join('');
  const body=`<article class="article">
<header class="article-header"><p class="kicker"><a href="/research">Research</a> · ${escape(a.category)}</p><h1>${escape(a.headline)}</h1><p class="standfirst">${escape(tokens(a.standfirst,a))}</p><p class="byline">${escape(a.byline)} · <time datetime="${a.published}">${date(a.published)}</time> · ${readingTime} min read</p></header>
<div class="prose">${a.opening.map(p=>`<p>${escape(tokens(p,a))}</p>`).join('')}</div>
<aside class="short-version" aria-labelledby="short-h"><h2 id="short-h">The short version</h2><ul>${a.shortVersion.map(s=>`<li>${escape(tokens(s,a))}</li>`).join('')}</ul></aside>
${a.sections.map(s=>`<section class="prose" id="${s.id}"><h2>${escape(tokens(s.title,a))}</h2>${s.blocks.map(b=>blockHtml(b,a,brands)).join('\n')}<p class="takeaway"><strong>What this means for you.</strong> ${escape(tokens(s.takeaway,a))}</p></section>`).join('\n')}
<section class="prose" id="recommendations"><h2>${escape(a.recommendations.title)}</h2><p>${escape(tokens(a.recommendations.intro,a))}</p><ol class="recommendations">${a.recommendations.items.map(i=>`<li><h3>${escape(i.title)}</h3><p>${escape(tokens(i.body,a))}</p></li>`).join('')}</ol></section>
<section class="prose how" id="how-we-did-this"><h2>${escape(a.how.title)}</h2>${a.how.paragraphs.map(p=>`<p>${escape(tokens(p,a))}</p>`).join('')}<p><a href="/methodology">Read the method</a> · <a href="/research/${a.slug}.evidence.json" download>Download the full data</a></p><p class="credit">${escape(a.how.credit)}</p></section>
<footer class="article-footer"><div class="share-links"><a class="btn" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(a.headline)}&amp;url=${encodeURIComponent(config.url+route)}">Share on X</a><a class="btn" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(config.url+route)}">Share on LinkedIn</a><button class="btn copy-link" hidden data-copy-url="${config.url+route}">Copy link</button><span role="status" class="copy-status"></span></div><h2 class="more-h">Keep reading</h2><ul class="more-reads">${more}</ul><p class="article-cta">Want to know what AI says about your brand? <a href="/#contact">Request a brand audit →</a></p></footer></article>`;
  return shell({title:titleTag(a.headline),description:a.description,route,body,schema,config,image:route+'.og.jpg',article:true,bodyClass:'research-article'});
}

// D-138: the index is one flat newest-first list. No featured block, chips or filters.
export function renderHub(entries,config) {
 const rows=entries.map(e=>`<li><time datetime="${e.published}">${date(e.published)}</time><h2><a href="/research/${e.slug}">${escape(e.headline)}</a></h2><p>${escape(e.hubSummary)}</p></li>`).join('');
 const schema={'@context':'https://schema.org','@type':'CollectionPage','@id':config.url+'/research#webpage',url:config.url+'/research',name:'Research · Windtunnel',isPartOf:{'@id':config.url+'/#website'},mainEntity:{'@type':'ItemList',itemListElement:entries.map((e,i)=>({'@type':'ListItem',position:i+1,name:e.headline,url:config.url+'/research/'+e.slug}))}};
 return shell({title:'Research · Windtunnel',description:'How AI assistants talk about brands, and what changes their answers. Original research for brand marketers, newest first.',route:'/research',schema,config,bodyClass:'research-index',body:`<div class="index"><header class="index-header"><h1>Research</h1><p class="standfirst">How AI assistants talk about brands, and what changes their answers. New work most weeks. <a href="/feed.xml">Follow the feed</a>.</p></header><ol class="index-list" reversed>${rows}</ol></div>`});
}

const cardText=(lines,y,size)=>lines.map((line,i)=>`<text x="84" y="${y+i*size*1.18}">${escape(line)}</text>`).join('');
export function cardSvg(a,config) {
 const stat=a.cardStat;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#FAF7F0"/><rect x="84" y="150" width="96" height="6" fill="#F15A24"/><text x="84" y="108" fill="#17171A" font-family="Space Grotesk, sans-serif" font-size="30" font-weight="500">windtunnel</text><text x="1116" y="106" text-anchor="end" fill="#55524B" font-family="IBM Plex Mono, monospace" font-size="17">RESEARCH</text><g fill="#17171A" font-family="Space Grotesk, sans-serif" font-weight="500" font-size="56">${cardText(a.cardLines,238,56)}</g>${stat?`<text x="84" y="540" fill="#F15A24" font-family="Space Grotesk, sans-serif" font-weight="500" font-size="92">${escape(stat.value)}</text><text x="84" y="584" fill="#55524B" font-family="IBM Plex Mono, monospace" font-size="20">${escape(stat.label)}</text>`:''}<text x="1116" y="584" text-anchor="end" fill="#55524B" font-family="IBM Plex Mono, monospace" font-size="17">${escape(new URL(config.url).host)}/research</text></svg>\n`;
}
