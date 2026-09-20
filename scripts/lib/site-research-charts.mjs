// Research charts (M60, D-137). Responsive HTML marks rather than one scaled SVG:
// labels stay readable at 320px because rows reflow instead of shrinking. Every
// chart carries a direct label on each mark plus a screen-reader data table, so
// identity and value never depend on colour alone.
import { escape } from './site-research-template.mjs';

const pct0 = v => Math.round(v * 100) + '%';
const count = m => Math.round(m.value * m.n);
const signed2 = v => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}`;

export function brandChip(brand) {
  if (!brand) throw new Error('Chart references an unknown brand');
  if (!brand.colour || !(brand.logo || brand.monogram)) throw new Error(`Brand ${brand.name} needs a colour and a logo or monogram`);
  return brand.logo
    ? `<span class="logo-chip"><img src="${escape(brand.logo)}" alt="" width="40" height="40" loading="lazy"></span>`
    : `<span class="logo-chip mono-chip" style="--c:${escape(brand.colour)}" aria-hidden="true">${escape(brand.monogram)}</span>`;
}

const dataTable = (caption, headers, rows) => `<div class="sr-only chart-data"><table><caption>${escape(caption)}</caption><thead><tr>${headers.map(h => `<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => i === 0 ? `<th scope="row">${escape(c)}</th>` : `<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

const figure = (block, slug, inner, table) => `<figure class="chart chart-${escape(block.chart)}" id="chart-${escape(block.id)}" role="group" aria-label="${escape(block.title)}"><h3 class="chart-title">${escape(block.title)}</h3><div class="chart-body" aria-hidden="true">${inner}</div>${table}<figcaption>${escape(block.caption)} <a class="chart-save" href="/research/${escape(slug)}-${escape(block.id)}.png" download>Save chart</a></figcaption></figure>`;

export function renderChart(block, a, brands) {
  const ev = key => { const item = a.evidence[key]?.data; if (item === undefined) throw new Error(`Chart evidence missing: ${key}`); return item; };
  switch (block.chart) {
    case 'ranking': {
      const rows = block.rows.map(r => ({ ...r, brand: brands[r.brand], m: ev(r.ref) }));
      const inner = `<div class="bars">${rows.map(r => {
        const zero = count(r.m) === 0;
        return `<div class="bar-row${zero ? ' is-zero' : ''}${r.subject ? ' is-subject' : ''}" title="${escape(r.brand.name)}: named in ${count(r.m)} of ${r.m.n} answers">${brandChip(r.brand)}<span class="bar-name">${escape(r.brand.name)}</span><span class="bar-track"><span class="bar-fill" style="--w:${(r.m.value * 100).toFixed(2)}%;--c:${zero ? 'var(--ghost)' : escape(r.brand.colour)}"></span></span><span class="bar-value">${zero ? 'never named' : pct0(r.m.value)}</span></div>`;
      }).join('')}</div>`;
      return figure(block, a.slug, inner, dataTable(block.title, ['Jeweller', 'Answers naming it', 'Share'], rows.map(r => [r.brand.name, `${count(r.m)} of ${r.m.n}`, (r.m.value * 100).toFixed(1) + '%'])));
    }
    case 'funnel': {
      const steps = block.steps.map(s => {
        const ms = s.refs.map(ev); const hits = ms.reduce((t, m) => t + count(m), 0); const n = ms.reduce((t, m) => t + m.n, 0);
        return { ...s, hits, n, rate: hits / n };
      });
      const inner = `<ol class="funnel">${steps.map(s => `<li title="${escape(s.label)}: ${s.hits} of ${s.n}"><span class="funnel-value">${s.hits === 0 ? '0' : pct0(s.rate)}</span><span class="funnel-label">${escape(s.label)}</span><span class="funnel-track"><span class="funnel-fill" style="--w:${(s.rate * 100).toFixed(2)}%"></span></span><span class="funnel-note">${s.hits} of ${s.n} ${escape(s.unit)}</span></li>`).join('')}</ol>`;
      return figure(block, a.slug, inner, dataTable(block.title, ['Step', 'Count', 'Share'], steps.map(s => [s.label, `${s.hits} of ${s.n}`, (s.rate * 100).toFixed(1) + '%'])));
    }
    case 'leaders': {
      const groups = block.groups.map(g => { const d = ev(g.ref); return { ...g, n: d.n, rows: d.counts.slice(0, g.top ?? 4) }; });
      const inner = `<div class="leader-grid">${groups.map(g => `<section class="leader-group"><h4>${escape(g.label)}</h4>${g.rows.map(r => `<div class="leader-row" title="${escape(r.brand)}: first pick in ${r.count} of ${g.n} shortlists"><span class="bar-name">${escape(r.brand)}</span><span class="bar-track"><span class="bar-fill" style="--w:${(r.count / g.n * 100).toFixed(2)}%;--c:var(--ink-bar)"></span></span><span class="bar-value">${pct0(r.count / g.n)}</span></div>`).join('')}<p class="leader-subject">${escape(g.subjectNote)}</p></section>`).join('')}</div>`;
      return figure(block, a.slug, inner, dataTable(block.title, ['Shopping need', 'Brand', 'First-place picks'], groups.flatMap(g => g.rows.map(r => [g.label, r.brand, `${r.count} of ${g.n}`]))));
    }
    case 'attributes': {
      const d = ev(block.ref); const labels = block.labels;
      const rows = d.counts.map(c => ({ label: labels[c.name] || c.name, count: c.count, rate: c.count / d.n })).sort((x, y) => y.count - x.count);
      const max = block.max ?? 0.2;
      const inner = `<div class="bars bars-compact">${rows.map(r => `<div class="bar-row${r.count === 0 ? ' is-zero' : ''}" title="${escape(r.label)}: ${r.count} of ${d.n} answers"><span class="bar-name">${escape(r.label)}</span><span class="bar-track"><span class="bar-fill" style="--w:${Math.min(100, r.rate / max * 100).toFixed(2)}%;--c:${r.count === 0 ? 'var(--ghost)' : 'var(--accent)'}"></span></span><span class="bar-value">${r.count === 0 ? 'never' : pct0(r.rate)}</span></div>`).join('')}</div><p class="chart-scale">Bars run from 0 to ${pct0(max)} of the ${d.n} answers that named SK.</p>`;
      return figure(block, a.slug, inner, dataTable(block.title, ['What AI could have said', 'Answers', 'Share'], rows.map(r => [r.label, `${r.count} of ${d.n}`, (r.rate * 100).toFixed(1) + '%'])));
    }
    case 'dumbbell': {
      const [lo, hi] = block.domain; const pos = v => ((v - lo) / (hi - lo) * 100).toFixed(2) + '%';
      const rows = block.rows.map(r => { const c = ev(r.current).value, n = ev(r.next).value; return { ...r, c, n, d: n - c }; });
      const ticks = block.ticks.map(t => `<span class="axis-tick" style="--x:${pos(t)}">${t.toFixed(1)}</span>`).join('');
      const inner = `<div class="dumbbells">${rows.map(r => {
        const dir = Math.abs(r.d) < 0.005 ? 'flat' : r.d > 0 ? 'up' : 'down';
        return `<div class="dumbbell-row is-${dir}" title="${escape(r.label)}: ${r.c.toFixed(2)} before, ${r.n.toFixed(2)} after"><span class="bar-name">${escape(r.label)}</span><span class="dumbbell-track"><span class="dumbbell-link" style="--a:${pos(Math.min(r.c, r.n))};--b:${pos(Math.max(r.c, r.n))}"></span><span class="dot dot-before" style="--x:${pos(r.c)}"></span><span class="dot dot-after" style="--x:${pos(r.n)}"></span></span><span class="bar-value">${dir === 'flat' ? 'no change' : `${dir === 'up' ? '▲' : '▼'} ${signed2(r.d)}`}</span></div>`;
      }).join('')}<div class="dumbbell-axis"><span class="bar-name"></span><span class="axis">${ticks}</span><span class="bar-value"></span></div></div><p class="chart-key"><span class="key-dot dot-before"></span> before <span class="key-dot dot-after"></span> after the sourcing line · interest score out of 5, axis zoomed to ${lo.toFixed(1)}–${hi.toFixed(1)}</p>`;
      return figure(block, a.slug, inner, dataTable(block.title, ['Buyer', 'Before', 'After', 'Change'], rows.map(r => [r.label, r.c.toFixed(2), r.n.toFixed(2), signed2(r.d)])));
    }
    case 'flips': {
      const rows = block.rows.map(r => { const c = ev(r.current), n = ev(r.next); return { ...r, c: c.included, n: n.included, of: c.n }; });
      const pos = k => (k / 5 * 100).toFixed(2) + '%';
      const inner = `<div class="dumbbells flips">${rows.map(r => {
        const dir = r.n === r.c ? 'flat' : r.n > r.c ? 'up' : 'down';
        return `<div class="dumbbell-row is-${dir}" title="${escape(r.short)}: ${r.c} of ${r.of} before, ${r.n} of ${r.of} after"><span class="bar-name">${escape(r.short)}</span><span class="dumbbell-track"><span class="dumbbell-link" style="--a:${pos(Math.min(r.c, r.n))};--b:${pos(Math.max(r.c, r.n))}"></span><span class="dot dot-before" style="--x:${pos(r.c)}"></span><span class="dot dot-after" style="--x:${pos(r.n)}"></span></span><span class="bar-value">${r.c}/5 → ${r.n}/5</span></div>`;
      }).join('')}<div class="dumbbell-axis"><span class="bar-name"></span><span class="axis">${[0, 1, 2, 3, 4, 5].map(k => `<span class="axis-tick" style="--x:${pos(k)}">${k}</span>`).join('')}</span><span class="bar-value"></span></div></div><p class="chart-key"><span class="key-dot dot-before"></span> before <span class="key-dot dot-after"></span> after · shortlists (out of 5) that included SK</p>`;
      return figure(block, a.slug, inner, dataTable(block.title, ['Shopping question', 'Before', 'After'], rows.map(r => [r.short, `${r.c} of ${r.of}`, `${r.n} of ${r.of}`])));
    }
    default: throw new Error(`Unknown chart ${block.chart}`);
  }
}
