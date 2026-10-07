# Derm Board Flashcards

Image flashcards for dermatology board prep. Each card shows a clinical photo from
[DermNet](https://dermnetnz.org); you name the diagnosis, then see the look-alikes to rule out
and a board pearl. 253 diagnoses, about 1,360 photos.

## Run it

No build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```
npm start        # http://localhost:8000
```

Photos load live from dermnetnz.org, so you need an internet connection.

## Studying

- **Difficulty:** Core (118) / Intermediate (93) / Advanced (42). Combine any of them.
- **Topics:** 22 categories (papulosquamous, bullous, genodermatoses, nail, and so on).
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
difficulty, look-alikes, and the pearl. `scripts/build-deck.mjs` reads each DermNet topic page, collects its
gallery photos and captions (skipping histology, culture plates, charts and dermoscopy), and writes
`data/deck.js`, which the app loads.

```
npm run build            # rebuild data/deck.js (page HTML is cached in .cache/)
npm run build:refresh    # re-download every page
```

To add a diagnosis, append an entry to `data/diagnoses.mjs` using its slug from
`https://dermnetnz.org/topics/<slug>` and run `npm run build`. The build lists any slug with no usable photos.
Optional per-card fields: `f` (regex a photo's title must match) and `x` (regex that excludes a photo).

## Notes

- Photos are © DermNet and its contributors. This app links to them on dermnetnz.org rather than copying them,
  and shows them unmodified and watermarked, with credit and a link to the source page on every card. DermNet's
  [image licence](https://dermnetnz.org/image-licence) permits this for education under CC BY-NC-ND 4.0:
  keep it non-commercial, and don't edit the images or remove watermarks. Unofficial; not affiliated with DermNet.
- The pearls are written for review and should be checked against your board text before you rely on them.
  Treatment and approval details change.
- 14 topics were left out because DermNet has no photos on those pages (for example Kawasaki disease,
  sporotrichosis, anogenital warts, RMSF).
