import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {validateArticle} from '../../scripts/site-research.mjs';
import {resolveEvidence} from '../../scripts/lib/site-research-evidence.mjs';
import {stampDomain} from '../../scripts/site-domain.mjs';
import {tokens} from '../../scripts/lib/site-research-template.mjs';
const file='content/research/sk-jewellery-ai-visibility-message-test.json';
const article=JSON.parse(readFileSync(file,'utf8'));

test('malformed, re-ordered or unchosen content fails closed',()=>{
 const section=(a,id)=>a.sections.find(s=>s.id===id);
 for(const change of [
  a=>{delete a.evidence.mention.source;},
  a=>{a.headline='A headline nobody chose';},
  a=>{section(a,'one-fix').blocks.find(b=>b.chart==='dumbbell').rows.reverse();},
  a=>{section(a,'wording').blocks.find(b=>b.chart==='flips').rows.reverse();},
  a=>{section(a,'one-fix').blocks.find(b=>b.type==='addition').text='Invented statement';},
  a=>{section(a,'who-ai-names').blocks[0].text='Named in {{mention|nonsense}}';},
 ]) {const a=structuredClone(article);change(a);assert.throws(()=>validateArticle(a));}
});

test('prose numbers come from full-precision evidence',()=>{
 assert.equal(tokens('{{mention|pct0}}',article),'97%');
 assert.equal(tokens('{{recommendationCurrentScore|pct0}} {{recommendationNewScore|pct0}}',article),'63% 61%');
 assert.equal(tokens('{{recommendationLift|signed1}}',article),'−1.4');
 assert.equal(tokens('{{buyerCurrentScore|fixed2}} {{buyerNewScore|fixed2}}',article),'3.20 3.24');
});

test('first-place tallies fold spelling variants and skip invalid outputs',()=>{
 const rec=(brand,state='valid')=>({cell_id:'c',extraction_state:state,extracted_json:{kind:'recommendation',recommendations:[{rank:1,brand},{rank:2,brand:'Other'}]}});
 const bundle={cells:[{id:'c',panel_persona_key:'s1'}],samples:[rec('Poh Heng'),rec('Poh Heng Jewellery'),rec('JannPaul'),rec('JannPaul','dead_lettered')]};
 assert.deepEqual(resolveEvidence({kind:'rankOneCounts',keys:['s1'],aliases:{'Poh Heng':'POH HENG','Poh Heng Jewellery':'POH HENG'}},bundle),{n:3,counts:[{brand:'POH HENG',count:2},{brand:'JannPaul',count:1}]});
});

test('edited article cannot build with an old verification receipt',()=>{
 const root=mkdtempSync(join(tmpdir(),'research-receipt-'));
 try {
  cpSync('content',join(root,'content'),{recursive:true});
  const a=structuredClone(article);a.opening.push('Unverified editorial change.');
  writeFileSync(join(root,file),JSON.stringify(a));
  const result=spawnSync(process.execPath,[resolve('scripts/site-research.mjs'),'check'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/Reverify changed evidence\/content/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('evidence excludes invalid recommendations and refuses invented excerpts',()=>{
 const bundle={cells:[{id:'cell',panel_persona_key:'s1',stimulus_id:'new'}],samples:[
  {id:'ok',cell_id:'cell',extraction_state:'valid',raw_text:'A recorded answer.',extracted_json:{kind:'recommendation',targetIncluded:true,targetTopPick:false}},
  {cell_id:'cell',extraction_state:'dead_lettered',extracted_json:{kind:'recommendation',targetIncluded:true,targetTopPick:true}},
  {cell_id:'cell',extraction_state:'qa_reviewed',extracted_json:{kind:'recommendation',targetIncluded:false,targetTopPick:false}},
 ]};
 assert.deepEqual(resolveEvidence({kind:'scenario',key:'s1',stimulus:'new'},bundle),{n:2,included:1,topChoice:0});
 assert.throws(()=>resolveEvidence({kind:'sample',id:'ok',field:'raw_text',excerpt:'An invented answer.'},bundle),/not verbatim/);
});

test('domain restamping reaches nested research, feed and schema while preserving citations',()=>{
 const root=mkdtempSync(join(tmpdir(),'research-domain-'));
 try {
  mkdirSync(join(root,'content/research'),{recursive:true});mkdirSync(join(root,'site/research'),{recursive:true});
  writeFileSync(join(root,'content/research/config.json'),JSON.stringify({url:'https://old.example',assetVersion:'test'}));
  const document='https://old.example/research/sk.og.jpg https://old.example/#org https://www.skjewellery.com/product-category/gemstone-rings/ https://arxiv.org/abs/2510.08338';
  for(const path of ['site/research/sk.html','site/feed.xml','site/robots.txt','site/sitemap.xml','site/llms.txt'])writeFileSync(join(root,path),document);
  stampDomain(root,'https://new.example/');
  stampDomain(root,'https://new.example');
  for(const path of ['site/research/sk.html','site/feed.xml','site/robots.txt','site/sitemap.xml','site/llms.txt'])assert.equal(readFileSync(join(root,path),'utf8'),document.replaceAll('https://old.example','https://new.example'));
  assert.throws(()=>stampDomain(root,'https://example.com/path'));
 }finally{rmSync(root,{recursive:true,force:true});}
});
