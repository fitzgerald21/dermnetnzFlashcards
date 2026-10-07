# Derm Board Flashcards

Image flashcards for dermatology board prep. Each card shows a clinical photo from
[DermNet](https://dermnetnz.org); you name the diagnosis, then see the look-alikes to rule out
and a board pearl. Nearly 1,000 diagnoses and about 4,400 photos, rare conditions included.

## Run it

No build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```
npm start        # http://localhost:8000
```

Photos load live from dermnetnz.org, so you need an internet connection.

## Studying

- **Difficulty:** Core (118), Intermediate (93) and Advanced (42) are hand-reviewed, each with look-alikes and a
  pearl. **Extended** (about 720) is the rest of DermNet's diagnoses, rare ones included: photos only, no pearl, and
  look-alikes only where DermNet's own page lists a differential. Combine any tiers.
- **Topics:** 23 categories (papulosquamous, bullous, genodermatoses, nail, and so on). Extended cards are sorted
  by keyword, so a few land in the wrong topic or in "Other".
- **Answer modes:**
  - *Type & pick* – type to search the full list of diagnoses and pick one (no options to jog memory).
  - *Multiple choice* – four options, built from true look-alikes.
  - *Flip* – reveal and grade yourself.
- **Scoring:** a look-alike from that card's differential counts as "close", not just wrong.
- **Spaced repetition:** Again / Hard / Good / Easy schedules each card. Misses return later in the same session.
- **Progress:** accuracy by topic and difficulty, weakest cards, and which diagnoses you mix up. Stored in your
  browser (localStorage); use Export/Import on the Progress page to move it between devices.
- **Photos:** each question shows one photo and nothing hints that there are more. "Show more photos" opens
  the rest of that diagnosis's photos, before or after you answer; "Hide extra photos" returns to the original.
- **Keys:** `Enter` accepts the suggested rating, `1`–`4` rate or choose, `?` = I don't know,
  `M` shows or hides extra photos (not while typing an answer), `←`/`→` move between them once open,
  click a photo to enlarge.

## How the deck is made

`data/diagnoses.mjs` is the hand-written content: DermNet topic slug, answer and aliases, category,
difficulty, look-alikes, and the pearl. `scripts/build-deck.mjs` then reads **every** DermNet topic page
(listed in its sitemap) and writes `data/deck.js`, which the app loads:

1. Curated entries keep their pearls and look-alikes. Their photos come from the topic page, skipping histology,
   culture plates, charts and dermoscopy. Matching photo-gallery pages ("...-images") add more photos.
2. Every other topic becomes an Extended card if it looks like a diagnosis: it has photos and disease-style
   headings ("Who gets...", "Clinical features...", "Differential diagnosis...") rather than treatment ones
   ("Side effects...", "How to take..."). Drugs, procedures, plants, allergens, dermoscopy and histology pages are
   dropped (rules in `scripts/lib/classify.mjs`).
3. Duplicates of curated cards are skipped. Photos whose captions name a different condition are removed.
4. Extended look-alikes are read from the page's "differential diagnosis" section; the topic is guessed from the name.

```
npm run build            # rebuild data/deck.js (pages are cached in .cache/ after the first run)
npm run build:refresh    # re-download every page
node scripts/build-deck.mjs --report   # also write .cache/report.txt: what was kept, skipped and why
```

The first build downloads about 2,500 pages (a few minutes, four requests at a time); later builds use the cache.

To add or promote a diagnosis to a hand-reviewed card, append an entry to `data/diagnoses.mjs` using its slug from
`https://dermnetnz.org/topics/<slug>` and run `npm run build`. The build lists any curated slug with no usable photos.
Optional per-card fields: `f` (regex a photo's title must match) and `x` (regex that excludes a photo).

## Notes

- Photos are © DermNet and its contributors. This app links to them on dermnetnz.org rather than copying them,
  and shows them unmodified and watermarked, with credit and a link to the source page on every card. DermNet's
  [image licence](https://dermnetnz.org/image-licence) permits this for education under CC BY-NC-ND 4.0:
  keep it non-commercial, and don't edit the images or remove watermarks. Unofficial; not affiliated with DermNet.
- The pearls (core, intermediate and advanced cards only) are written for review and should be checked against your board text before you rely on them.
  Treatment and approval details change.
- The filter is heuristic. Some non-diagnosis pages may slip in, and some real diagnoses (for example Kawasaki
  disease, sporotrichosis, anogenital warts, RMSF) are missing because DermNet has no photos on their pages.
