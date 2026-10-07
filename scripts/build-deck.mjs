#!/usr/bin/env node
// Builds data/deck.js from data/diagnoses.mjs by reading each DermNet topic page and
// collecting its gallery images. Images are NOT downloaded; the app links to DermNet directly.
//
//   node scripts/build-deck.mjs            # fetch (cached) and write data/deck.js
//   node scripts/build-deck.mjs --refresh  # ignore the cache
//   CACHE_DIR=/some/dir node scripts/build-deck.mjs

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, DIAGNOSES } from '../data/diagnoses.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = process.env.CACHE_DIR || path.join(ROOT, '.cache');
const ORIGIN = 'https://dermnetnz.org';
const MAX_IMAGES = 8;
const CONCURRENCY = 4;
const refresh = process.argv.includes('--refresh');

// Non-clinical or off-topic gallery items (histology, culture plates, charts, dermoscopy, X-rays...).
const NOT_A_PHOTO = new RegExp(
  [
    'patholog', 'histolog', 'histopath', 'microscop', 'culture', 'stain', 'h&e', 'dermoscop',
    'classification', 'score', 'mortality', 'hair cycle', 'diagram', 'figure \\d', '\\btick\\b',
    'x-?ray', '\\bmri\\b', 'fluorescence', 'mattress', 'eggs', '\\bnits\\b', 'miniaturis',
  ].join('|'),
  'i',
);

const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
   .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'));
  return m ? decode(m[1]) : '';
};

async function fetchPage(slug) {
  const file = path.join(CACHE, `${slug.replace(/\//g, '__')}.html`);
  if (!refresh && existsSync(file)) return readFile(file, 'utf8');
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${ORIGIN}/topics/${slug}`, {
        headers: { 'user-agent': 'dermnetnz-flashcards-builder (personal study project)' },
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      await writeFile(file, html);
      return html;
    } catch (err) {
      if (attempt === 3) throw new Error(`${slug}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

function extractImages(html) {
  const out = [];
  const seen = new Set();
  for (const [tag] of html.matchAll(/<img\b[^>]*js-gallery-image[^>]*>/g)) {
    const src = attr(tag, 'src');
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push({
      u: src.startsWith('http') ? src : ORIGIN + src,
      t: attr(tag, 'data-title') || attr(tag, 'alt'),
      a: attr(tag, 'alt'),
      c: attr(tag, 'data-copyright'),
    });
  }
  return out;
}

const humanize = (s) => {
  const t = s.replace(/-/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

async function pool(items, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i], i);
      }
    }),
  );
  return results;
}

async function main() {
  await mkdir(CACHE, { recursive: true });

  const ids = new Set(DIAGNOSES.map((d) => d.s));
  if (ids.size !== DIAGNOSES.length) {
    const dupes = DIAGNOSES.map((d) => d.s).filter((s, i, a) => a.indexOf(s) !== i);
    throw new Error(`Duplicate slugs: ${dupes.join(', ')}`);
  }
  for (const d of DIAGNOSES) {
    if (!CATEGORIES[d.c]) throw new Error(`${d.s}: unknown category "${d.c}"`);
    if (![1, 2, 3].includes(d.l)) throw new Error(`${d.s}: bad level`);
  }

  const problems = [];
  const pages = await pool(DIAGNOSES, async (d) => {
    try {
      const html = await fetchPage(d.s);
      if (!html) return { missing: true, images: [] };
      return { images: extractImages(html) };
    } catch (err) {
      return { error: err.message, images: [] };
    }
  });

  const kept = [];
  DIAGNOSES.forEach((d, i) => {
    const page = pages[i];
    if (page.missing) problems.push(`404       ${d.s}`);
    else if (page.error) problems.push(`ERROR     ${page.error}`);
    else if (page.images.length === 0) problems.push(`NO IMAGES ${d.s} (dropped from deck)`);

    const images = page.images
      .filter((img) => !NOT_A_PHOTO.test(`${img.t} ${img.a}`))
      .filter((img) => !d.f || new RegExp(d.f, 'i').test(`${img.t} ${img.a}`))
      .filter((img) => !d.x || !new RegExp(d.x, 'i').test(`${img.t} ${img.a}`))
      .slice(0, MAX_IMAGES);
    if (images.length) kept.push({ d, images });
  });

  // Look-alikes become deck ids only when that card survived; otherwise they stay as free text.
  const keptIds = new Set(kept.map((k) => k.d.s));
  const deck = kept.map(({ d, images }) => ({
    id: d.s,
    name: d.n,
    cat: d.c,
    lvl: d.l,
    alt: d.a ?? [],
    dx: (d.d ?? []).map((x) => (keptIds.has(x) ? { id: x } : { text: DIAGNOSES.find((e) => e.s === x)?.n ?? humanize(x) })),
    pearl: d.p,
    images: images.map(({ u, t, a, c }) => ({ u: u.replace(ORIGIN, ''), cap: a || t, c })),
  }));

  const freeText = new Set();
  for (const d of deck) for (const x of d.dx) if (x.text) freeText.add(x.text);

  const banner = '// Generated by scripts/build-deck.mjs from data/diagnoses.mjs. Do not edit by hand.\n';
  const body =
    `window.DECK = ${JSON.stringify({ categories: CATEGORIES, cards: deck })};\n`;
  await writeFile(path.join(ROOT, 'data', 'deck.js'), banner + body);

  const imgs = deck.reduce((n, d) => n + d.images.length, 0);
  console.log(`Wrote data/deck.js: ${deck.length} diagnoses, ${imgs} images.`);
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    problems.forEach((p) => console.log('  ' + p));
  }
  console.log(`\n${freeText.size} look-alikes are free text (not in the deck), e.g.:`);
  console.log('  ' + [...freeText].slice(0, 12).join('; '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
