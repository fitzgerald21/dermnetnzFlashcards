// Shared helpers for reading DermNet pages (used by the deck builder and the crawler).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const ORIGIN = 'https://dermnetnz.org';
export const UA = 'dermnetnz-flashcards-builder (personal study project)';

export const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
   .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export const stripTags = (s) => decode(s.replace(/<[^>]+>/g, ' '));

export const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'));
  return m ? decode(m[1]) : '';
};

export const cacheFile = (cacheDir, slug) => path.join(cacheDir, `${slug.replace(/\//g, '__')}.html`);

export async function fetchPage(slug, cacheDir, { refresh = false } = {}) {
  await mkdir(cacheDir, { recursive: true });
  const file = cacheFile(cacheDir, slug);
  if (!refresh && existsSync(file)) return readFile(file, 'utf8');
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${ORIGIN}/topics/${slug}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) });
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

export async function fetchSlugs(cacheDir) {
  await mkdir(cacheDir, { recursive: true });
  const file = path.join(cacheDir, 'sitemap.xml');
  let xml;
  if (existsSync(file)) xml = await readFile(file, 'utf8');
  else {
    const res = await fetch(`${ORIGIN}/sitemap.xml`, { headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`sitemap HTTP ${res.status}`);
    xml = await res.text();
    await writeFile(file, xml);
  }
  return [...new Set([...xml.matchAll(/<loc>https:\/\/dermnetnz\.org\/topics\/([^<]+)<\/loc>/g)].map((m) => m[1]))];
}

export function extractImages(html) {
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

// The "differential diagnosis" section of a topic page: linked topics and plain list items.
export function extractDifferential(html) {
  const heads = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)];
  const i = heads.findIndex((m) => /differential diagnosis/i.test(stripTags(m[1])));
  if (i < 0) return [];
  const start = heads[i].index + heads[i][0].length;
  const end = heads[i + 1] ? heads[i + 1].index : html.length;
  const block = html.slice(start, end);
  const out = [];
  const seen = new Set();
  const push = (slug, text) => {
    text = text.replace(/\s*\(.*$/, '').replace(/^.*:\s*/, '').trim();
    const key = slug || text.toLowerCase();
    if (!key || seen.has(key) || !text || text.length > 70) return;
    seen.add(key);
    out.push({ slug: slug || null, text });
  };
  for (const [, li] of block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)) {
    const a = li.match(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const slug = a ? (a[1].match(/\/topics\/([^"#?]+)/) || [])[1] : null;
    push(slug, stripTags(a && stripTags(li).length <= stripTags(a[2]).length + 3 ? a[2] : li));
  }
  return out;
}

export function parsePage(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  return {
    title: h1 ? stripTags(h1[1]) : '',
    h2: [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => stripTags(m[1])),
    images: extractImages(html),
    differential: extractDifferential(html),
  };
}

export async function pool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i], i);
      }
    }),
  );
  return results;
}
