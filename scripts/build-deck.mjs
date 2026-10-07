#!/usr/bin/env node
// Builds data/deck.js.
//
//   1. Curated cards (data/diagnoses.mjs) keep their hand-written pearls and look-alikes.
//   2. Every other DermNet topic that looks like a diagnosis is added as an "Extended" card (level 4).
//      Look-alikes come from the topic's own "differential diagnosis" section; there is no pearl.
//
// Images are not downloaded; the app links to DermNet directly.
//
//   node scripts/build-deck.mjs              # fetch (cached) and write data/deck.js
//   node scripts/build-deck.mjs --refresh    # ignore the cache
//   node scripts/build-deck.mjs --report     # also write a classification report to <cache>/report.txt
//   CACHE_DIR=/some/dir node scripts/build-deck.mjs

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES as CURATED_CATEGORIES, DIAGNOSES } from '../data/diagnoses.mjs';
import { fetchPage, fetchSlugs, parsePage, pool } from './lib/dermnet.mjs';
import { categorize, isDiagnosisPage, isGallerySlug, normName, relevantImages, titleFromPage, NOT_A_PHOTO } from './lib/classify.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = process.env.CACHE_DIR || path.join(ROOT, '.cache');
const refresh = process.argv.includes('--refresh');
const wantReport = process.argv.includes('--report');
const CURATED_MAX_IMAGES = 8;
const EXTENDED_MAX_IMAGES = 10;
const MAX_LOOKALIKES = 6;

const CATEGORIES = { ...CURATED_CATEGORIES, misc: 'Other' };

const humanize = (s) => {
  const t = s.replace(/-/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

async function main() {
  // ---- validate the curated list
  const curatedIds = new Set(DIAGNOSES.map((d) => d.s));
  if (curatedIds.size !== DIAGNOSES.length) {
    throw new Error(`Duplicate slugs: ${DIAGNOSES.map((d) => d.s).filter((s, i, a) => a.indexOf(s) !== i).join(', ')}`);
  }
  for (const d of DIAGNOSES) {
    if (!CURATED_CATEGORIES[d.c]) throw new Error(`${d.s}: unknown category "${d.c}"`);
    if (![1, 2, 3].includes(d.l)) throw new Error(`${d.s}: bad level`);
  }

  // ---- read every topic page (cached after the first run)
  const slugs = await fetchSlugs(CACHE);
  const pages = new Map();
  let done = 0;
  await pool(slugs, 4, async (slug) => {
    try {
      const html = await fetchPage(slug, CACHE, { refresh });
      if (html) pages.set(slug, { slug, ...parsePage(html) });
    } catch (err) {
      console.warn(`  skipped ${slug}: ${err.message}`);
    }
    if (++done % 500 === 0) console.log(`  read ${done}/${slugs.length} pages`);
  });

  const report = [];
  const problems = [];
  const cleanImages = (imgs) => imgs.filter((img) => !NOT_A_PHOTO.test(`${img.t} ${img.a}`));

  // ---- curated cards
  const cards = [];
  const curatedNames = new Set();
  for (const d of DIAGNOSES) {
    const page = pages.get(d.s);
    if (!page) { problems.push(`404       ${d.s}`); continue; }
    const images = cleanImages(page.images)
      .filter((img) => !d.f || new RegExp(d.f, 'i').test(`${img.t} ${img.a}`))
      .filter((img) => !d.x || !new RegExp(d.x, 'i').test(`${img.t} ${img.a}`))
      .slice(0, CURATED_MAX_IMAGES);
    if (!images.length) { problems.push(`NO IMAGES ${d.s} (dropped)`); continue; }
    cards.push({ id: d.s, name: d.n, cat: d.c, lvl: d.l, alt: d.a ?? [], pearl: d.p, rawDx: (d.d ?? []).map((x) => ({ slug: x })), images });
    for (const n of [d.n, ...(d.a ?? [])]) curatedNames.add(normName(n));
    const paren = d.n.match(/^(.*?)\s*\((.+)\)\s*$/);
    if (paren) { curatedNames.add(normName(paren[1])); curatedNames.add(normName(paren[2])); }
  }

  // ---- extended cards
  const extended = new Map(); // normalized name -> card
  const skipped = { notDiagnosis: 0, duplicateOfCurated: 0, merged: 0, noRelevantImages: 0 };
  const ordered = [...pages.values()]
    .filter((p) => !curatedIds.has(p.slug))
    .sort((a, b) => isGallerySlug(a.slug) - isGallerySlug(b.slug) || a.slug.localeCompare(b.slug));

  for (const page of ordered) {
    const verdict = isDiagnosisPage(page);
    const base = isGallerySlug(page.slug) ? cards.find((c) => c.id === page.slug.replace(/-images$/, '')) : null;
    if (base && verdict.ok) {
      const spec = DIAGNOSES.find((d) => d.s === base.id);
      const have = new Set(base.images.map((i) => i.u));
      const more = cleanImages(page.images)
        .filter((i) => !have.has(i.u) && (!spec.f || new RegExp(spec.f, 'i').test(`${i.t} ${i.a}`)) && (!spec.x || !new RegExp(spec.x, 'i').test(`${i.t} ${i.a}`)));
      base.images.push(...more);
      base.images = base.images.slice(0, EXTENDED_MAX_IMAGES);
      skipped.merged++;
      continue;
    }
    if (!verdict.ok) { skipped.notDiagnosis++; report.push(`SKIP  ${page.slug}  (${verdict.why})`); continue; }
    const name = titleFromPage(page);
    const key = normName(name);
    if (!key) continue;
    if (curatedNames.has(key)) { skipped.duplicateOfCurated++; report.push(`DUP   ${page.slug}  = curated "${name}"`); continue; }

    const images = relevantImages(cleanImages(page.images), name, { fallbackAll: verdict.strong });
    if (!images.length) { skipped.noRelevantImages++; report.push(`NOIMG ${page.slug}  (no photo matches "${name}")`); continue; }

    const existing = extended.get(key);
    if (existing) {
      const have = new Set(existing.images.map((i) => i.u));
      existing.images.push(...images.filter((i) => !have.has(i.u)));
      existing.images = existing.images.slice(0, EXTENDED_MAX_IMAGES);
      existing.rawDx.push(...page.differential);
      skipped.merged++;
      continue;
    }
    extended.set(key, {
      id: page.slug,
      name,
      cat: categorize(name, page.slug),
      lvl: 4,
      alt: [],
      pearl: '',
      rawDx: page.differential,
      images: images.slice(0, EXTENDED_MAX_IMAGES),
    });
  }
  cards.push(...extended.values());

  // ---- resolve look-alikes now that the full card list is known
  const ids = new Set(cards.map((c) => c.id));
  const nameToId = new Map();
  for (const c of cards) for (const n of [c.name, ...c.alt]) nameToId.set(normName(n), c.id);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const curatedName = new Map(DIAGNOSES.map((d) => [d.s, d.n]));

  const deck = cards.map((c) => {
    const dx = [];
    const seen = new Set([c.id]);
    for (const r of c.rawDx) {
      let id = r.slug && ids.has(r.slug) ? r.slug : null;
      if (!id && r.slug) { // the slug may be a gallery page that was merged away; match on its title instead
        const t = pages.get(r.slug);
        if (t) id = nameToId.get(normName(titleFromPage(t))) ?? null;
      }
      if (!id && r.text) id = nameToId.get(normName(r.text)) ?? null;
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
        dx.push({ id });
      } else {
        const label = r.text || curatedName.get(r.slug) || (r.slug ? humanize(r.slug) : '');
        const k = `t:${normName(label)}`;
        if (!label || seen.has(k)) continue;
        seen.add(k);
        dx.push({ text: label.charAt(0).toUpperCase() + label.slice(1) });
      }
      if (c.lvl === 4 && dx.length >= MAX_LOOKALIKES) break;
    }
    const out = {
      id: c.id, name: c.name, cat: c.cat, lvl: c.lvl, dx,
      images: c.images.map(({ u, t, a, c: credit }) => {
        const img = { u: u.replace(ORIGIN_PREFIX, ''), cap: a || t };
        if (credit && credit !== '© DermNet') img.c = credit;
        return img;
      }),
    };
    if (c.alt.length) out.alt = c.alt;
    if (c.pearl) out.pearl = c.pearl;
    return out;
  });

  const banner = '// Generated by scripts/build-deck.mjs. Do not edit by hand.\n';
  await writeFile(path.join(ROOT, 'data', 'deck.js'), `${banner}window.DECK = ${JSON.stringify({ categories: CATEGORIES, cards: deck })};\n`);

  const imgs = deck.reduce((n, d) => n + d.images.length, 0);
  const lvl = [1, 2, 3, 4].map((l) => deck.filter((d) => d.lvl === l).length);
  console.log(`Wrote data/deck.js: ${deck.length} diagnoses (core ${lvl[0]}, intermediate ${lvl[1]}, advanced ${lvl[2]}, extended ${lvl[3]}), ${imgs} photos.`);
  console.log(`Extended: ${extended.size} added; skipped ${skipped.notDiagnosis} non-diagnosis pages, ${skipped.duplicateOfCurated} duplicates of curated cards, ${skipped.merged} merged into another card, ${skipped.noRelevantImages} with no matching photo.`);
  if (problems.length) { console.log('\nCurated problems:'); problems.forEach((p) => console.log('  ' + p)); }

  if (wantReport) {
    const cats = {};
    for (const d of deck) cats[d.cat] = (cats[d.cat] || 0) + 1;
    const lines = [
      `categories: ${JSON.stringify(cats)}`, '',
      'EXTENDED CARDS (id | name | category | photos | look-alikes)',
      ...deck.filter((d) => d.lvl === 4).map((d) => `${d.id} | ${d.name} | ${d.cat} | ${d.images.length} | ${d.dx.length}`),
      '', ...report,
    ];
    await writeFile(path.join(CACHE, 'report.txt'), lines.join('\n'));
    console.log(`Report written to ${path.join(CACHE, 'report.txt')}`);
  }
}

const ORIGIN_PREFIX = 'https://dermnetnz.org';

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
