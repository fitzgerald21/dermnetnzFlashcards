#!/usr/bin/env node
// Fetches the DermNet page for every Extended (level 4) card and writes the article text, in batches,
// for pearl drafting.   node scripts/extract-page-text.mjs <outDir> [batchSize]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPage, stripTags } from './lib/dermnet.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = process.env.CACHE_DIR || path.join(ROOT, '.cache');
const [outDir, size = '25'] = process.argv.slice(2);
if (!outDir) throw new Error('usage: extract-page-text.mjs <outDir> [batchSize]');

export function articleText(html) {
  let t = stripTags(html.replace(/<(script|style|nav|footer|header)[\s\S]*?<\/\1>/g, ''));
  t = t.replace(/" data-index[^>]*?>/g, ' ');
  const start = t.indexOf('ADVERTISEMENT');
  if (start >= 0) t = t.slice(start + 'ADVERTISEMENT'.length);
  const end = t.search(/ ADVERTISEMENT\s+References\b|\bReferences\s+[A-Z]/);
  if (end > 0) t = t.slice(0, end);
  return t.replace(/\s+/g, ' ').trim();
}

const src = await readFile(path.join(ROOT, 'data/deck.js'), 'utf8');
const deck = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
const cards = deck.cards.filter((c) => c.lvl === 4).sort((a, b) => a.cat.localeCompare(b.cat) || a.id.localeCompare(b.id));

const pages = [];
let next = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < cards.length) {
    const c = cards[next++];
    try {
      let html = await fetchPage(c.id, CACHE);
      let text = html ? articleText(html) : '';
      let from = c.id;
      // gallery pages ("...-images") carry captions only; fall back to the matching topic page
      if (text.length < 800 && c.id.endsWith('-images')) {
        for (const base of [c.id.replace(/-images$/, ''), c.id.replace(/-images$/, '').replace(/s$/, '')]) {
          const h2 = await fetchPage(base, CACHE).catch(() => null);
          const t2 = h2 ? articleText(h2) : '';
          if (t2.length >= 800) { text = t2; from = base; break; }
        }
      }
      pages.push({ id: c.id, name: c.name, cat: c.cat, text, ...(from !== c.id && { from }) });
    } catch (e) { console.error('FAIL', c.id, e.message); pages.push({ id: c.id, name: c.name, cat: c.cat, text: '' }); }
  }
}));
pages.sort((a, b) => a.cat.localeCompare(b.cat) || a.id.localeCompare(b.id));

await mkdir(outDir, { recursive: true });
const n = Number(size);
let b = 0;
for (let i = 0; i < pages.length; i += n, b++) {
  await writeFile(path.join(outDir, `batch-${String(b).padStart(2, '0')}.json`), JSON.stringify(pages.slice(i, i + n), null, 1));
}
const lens = pages.map((p) => p.text.length).sort((a, b) => a - b);
console.log(`${pages.length} pages, ${b} batches; text length min ${lens[0]} median ${lens[lens.length >> 1]} max ${lens.at(-1)}; empty ${lens.filter((x) => !x).length}; <800 chars ${lens.filter((x) => x < 800).length}`);
