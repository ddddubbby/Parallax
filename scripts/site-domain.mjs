#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

// Replace only this site's origin; third-party citations must survive a restamp.
// Rebuild cards and derived metadata afterward.
export function stampDomain(root, input) {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('Use an HTTPS origin without credentials, path, query or fragment');
  const configPath = join(root, 'content/research/config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const previous = config.url;
  const visit = dir => {
    for (const entry of readdirSync(dir, {withFileTypes:true})) {
      if (entry.name.startsWith('.')) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.(html|xml|txt)$/.test(entry.name)) {
        const text = readFileSync(path, 'utf8');
        writeFileSync(path, text.replaceAll(previous, url.origin).replaceAll('__SITE_URL__', url.origin));
      }
    }
  };
  visit(join(root, 'site'));
  config.url = url.origin;
  writeFileSync(configPath, JSON.stringify(config,null,2)+'\n');
  return url.origin;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const root = resolve(import.meta.dirname, '..');
    const url = stampDomain(root, process.argv[2]);
    const result = spawnSync(process.execPath, ['scripts/site-research.mjs','build'], {cwd:root,stdio:'inherit'});
    if (result.status !== 0) throw Error('Restamped metadata; build incomplete. Do not deploy until site:research build and check pass.');
    console.log(`Stamped ${url}; hosting domain aliases/redirects require separate configuration.`);
  } catch (error) { console.error(error.message); process.exitCode=1; }
}
