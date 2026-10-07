(() => {
  'use strict';

  const ORIGIN = 'https://dermnetnz.org';
  const STORE_KEY = 'dermflash.v1';
  const DAY = 864e5;
  const { categories: CATS, cards: CARDS } = window.DECK;
  for (const c of CARDS) { c.alt ||= []; c.dx ||= []; c.pearl ||= ''; }
  const BY_ID = new Map(CARDS.map((c) => [c.id, c]));
  const LEVELS = {
    1: { name: 'Core', blurb: 'Classic, bread-and-butter presentations you must not miss.' },
    2: { name: 'Intermediate', blurb: 'Board-level distinctions, variants and associations.' },
    3: { name: 'Advanced', blurb: 'Rare, syndromic or high-yield-but-obscure diagnoses.' },
    4: { name: 'Extended', blurb: 'The rest of DermNet, rare conditions included. Photos only, no pearl.' },
  };
  const LEVEL_IDS = Object.keys(LEVELS).map(Number);

  // ---------- helpers ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const imgUrl = (u) => (u.startsWith('http') ? u : ORIGIN + u);
  const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);
  const dayKey = (t = Date.now()) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const today = () => dayKey();

  // ---------- persistence ----------
  const DEFAULT_PREFS = { v: 2, levels: [1, 2, 3, 4], cats: [], mode: 'type', queue: 'smart', size: 20 };
  const load = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
  };
  const saved = load();
  const state = { cards: saved.cards || {}, log: saved.log || {}, prefs: { ...DEFAULT_PREFS, ...(saved.prefs || {}) } };
  // Before the Extended tier existed, "all levels" was [1, 2, 3]. Keep such users on "all".
  if (!saved.prefs?.v) {
    if ([1, 2, 3].every((l) => state.prefs.levels.includes(l))) state.prefs.levels = [1, 2, 3, 4];
    state.prefs.v = 2;
  }
  const save = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* private mode etc. */ }
  };

  // ---------- spaced repetition ----------
  // Again = 1, Hard = 2, Good = 3, Easy = 4. Intervals are in days; "Again" returns in 10 minutes.
  function nextSchedule(s, rating) {
    const n = { e: s?.e ?? 2.5, i: s?.i ?? 0, r: s?.r ?? 0, l: s?.l ?? 0 };
    if (rating === 1) {
      n.l++; n.r = 0; n.i = 0; n.e = Math.max(1.3, n.e - 0.2);
      n.due = Date.now() + 10 * 60e3;
      return n;
    }
    if (rating === 2) { n.i = n.r === 0 ? 1 : Math.max(1, Math.round(n.i * 1.2)); n.e = Math.max(1.3, n.e - 0.15); }
    if (rating === 3) { n.i = n.r === 0 ? 1 : n.r === 1 ? 3 : Math.round(n.i * n.e); }
    if (rating === 4) { n.i = n.r === 0 ? 4 : Math.round(Math.max(n.i, 1) * n.e * 1.3); n.e += 0.15; }
    n.r++;
    n.due = Date.now() + n.i * DAY;
    return n;
  }
  const intervalLabel = (s, rating) => {
    const n = nextSchedule(s, rating);
    if (rating === 1) return '10 min';
    return n.i < 30 ? `${n.i} d` : n.i < 365 ? `${Math.round(n.i / 30)} mo` : `${(n.i / 365).toFixed(1)} y`;
  };

  function record(card, rating, verdict, pickedId) {
    const s = (state.cards[card.id] ||= { n: 0, ok: 0 });
    s.n++;
    if (verdict === 'correct') s.ok++;
    else if (pickedId && pickedId !== card.id) (s.cf ||= {})[pickedId] = (s.cf[pickedId] || 0) + 1;
    const nx = nextSchedule(s, rating);
    Object.assign(s, { e: nx.e, i: nx.i, r: nx.r, l: nx.l, d: nx.due, last: Date.now() });
    state.log[today()] = (state.log[today()] || 0) + 1;
    save();
  }

  // ---------- answer matching ----------
  const norm = (s) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[’'`]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ')
      .replace(/ae/g, 'e').replace(/oe/g, 'e').replace(/tumour/g, 'tumor')
      .replace(/is(ed|ing|ation|e)\b/g, 'iz$1').replace(/\s+/g, ' ').trim();

  const LABELS = [];
  for (const c of CARDS) {
    const raw = new Set([c.name, ...c.alt]);
    const paren = c.name.match(/^(.*?)\s*\((.+)\)\s*$/);
    if (paren) { raw.add(paren[1]); raw.add(paren[2]); }
    for (const label of raw) if (label.trim()) LABELS.push({ id: c.id, label, n: norm(label), primary: label === c.name });
  }

  function search(query) {
    const q = norm(query);
    if (q.length < 2) return [];
    const tokens = q.split(' ');
    const best = new Map();
    for (const l of LABELS) {
      const words = l.n.split(' ');
      let score = null;
      if (l.n.startsWith(q)) score = 0;
      else if (tokens.every((t) => words.some((w) => w.startsWith(t)))) score = 1;
      else if (l.n.includes(q)) score = 2;
      if (score === null) continue;
      score += l.primary ? 0 : 0.2;
      const prev = best.get(l.id);
      if (!prev || score < prev.score) best.set(l.id, { ...l, score });
    }
    return [...best.values()].sort((a, b) => a.score - b.score || a.label.length - b.label.length).slice(0, 8);
  }
  const exactMatch = (text) => {
    const n = norm(text);
    return LABELS.find((l) => l.n === n) || null;
  };

  // Variants of one disease (Scalp psoriasis, Genital psoriasis, Plaque psoriasis...): drop site and age words
  // and compare what is left. Only names are compared; aliases would link unrelated diagnoses.
  const MODIFIERS = new Set(('scalp facial face genital vulval vulvar penile perianal extragenital nipple hand hands foot feet palmar plantar palms soles palm sole ' +
    'eyelid periocular ear lip limbs limb leg legs arm arms torso trunk children child childhood paediatric pediatric adult adults pregnancy plaque chronic ' +
    'cutaneous vulgaris flexural inverse skin colour color of the in on and with from to a').split(' '));
  const TOO_GENERIC = new Set(('dermatitis eczema ulcer ulcers cyst cysts infection infections tumor tumors naevus naevi nevus lesion lesions rash erythema ' +
    'keratosis papules papule nodule nodules allergy lymphoma sarcoma carcinoma cancer').split(' '));
  const baseDisease = (card) => {
    const words = norm(card.name.replace(/\(.*?\)/g, ' ')).split(' ').filter((w) => w && !MODIFIERS.has(w));
    const key = words.sort().join(' ');
    return TOO_GENERIC.has(key) ? '' : key;
  };
  const BASE = new Map(CARDS.map((c) => [c.id, baseDisease(c)]));
  const isVariant = (a, b) => a.id !== b.id && !!BASE.get(a.id) && BASE.get(a.id) === BASE.get(b.id);

  const relatedIds = (card) => new Set(card.dx.filter((d) => d.id).map((d) => d.id));
  const GENERIC = new Set(['syndrome', 'disease', 'infection', 'reaction', 'cutaneous', 'disorder', 'dermatosis', 'eruption', 'children', 'pustulosis', 'induced', 'allergy']);
  const keyTerms = (card) => new Set(norm(card.name).split(' ').filter((w) => w.length >= 7 && !GENERIC.has(w)).map((w) => w.slice(0, 7)));
  function judge(card, pickedId) {
    if (pickedId === card.id) return 'correct';
    const picked = BY_ID.get(pickedId);
    if (picked && isVariant(card, picked)) return 'variant';
    if (relatedIds(card).has(pickedId) || (picked && relatedIds(picked).has(card.id))) return 'close';
    // Different diagnoses that share a key word in the same topic (e.g. two carcinomas) count as close.
    if (picked && picked.cat === card.cat) {
      const mine = keyTerms(card);
      if ([...keyTerms(picked)].some((t) => mine.has(t))) return 'close';
    }
    return 'wrong';
  }

  // ---------- queue ----------
  const inPool = (c) => state.prefs.levels.includes(c.lvl) && (!state.prefs.cats.length || state.prefs.cats.includes(c.cat));
  const poolStats = () => {
    const pool = CARDS.filter(inPool);
    const now = Date.now();
    const seen = pool.filter((c) => state.cards[c.id]);
    return { total: pool.length, fresh: pool.length - seen.length, due: seen.filter((c) => state.cards[c.id].d <= now).length };
  };

  function buildQueue() {
    const { queue, size } = state.prefs;
    const now = Date.now();
    const pool = CARDS.filter(inPool);
    const seen = pool.filter((c) => state.cards[c.id]);
    const fresh = pool.filter((c) => !state.cards[c.id]).map((c) => [c, c.lvl + Math.random() * 2]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
    let list;
    if (queue === 'shuffle') {
      list = shuffle(pool);
    } else if (queue === 'weak') {
      const weakness = (c) => {
        const s = state.cards[c.id];
        return (s.l || 0) * 2 + (1 - s.ok / Math.max(1, s.n)) * 5;
      };
      list = [...seen.filter((c) => state.cards[c.id].ok < state.cards[c.id].n).sort((a, b) => weakness(b) - weakness(a)), ...fresh];
    } else {
      const due = seen.filter((c) => state.cards[c.id].d <= now).sort((a, b) => state.cards[a.id].d - state.cards[b.id].d);
      const ahead = seen.filter((c) => state.cards[c.id].d > now).sort((a, b) => state.cards[a.id].d - state.cards[b.id].d);
      list = [...due, ...fresh, ...ahead];
    }
    return (size ? list.slice(0, size) : list).map((c) => c.id);
  }

  // ---------- view state ----------
  const app = $('#app');
  let view = 'home';
  let session = null; // { queue, idx, results: [{id, verdict}], startedAt }
  let cur = null;     // { card, img, phase, verdict, pickedId, options }

  const setView = (v) => {
    view = v;
    $$('.nav-btn').forEach((b) => (b.dataset.view === (v === 'study' || v === 'summary' ? 'home' : v) ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
    ({ home: renderHome, stats: renderStats, study: renderStudy, summary: renderSummary })[v]();
    window.scrollTo(0, 0);
  };

  // ---------- home ----------
  function renderHome() {
    const p = state.prefs;
    const radio = (name, value, title, text) => `
      <label class="option"><input type="radio" name="${name}" value="${value}" ${String(p[name]) === String(value) ? 'checked' : ''}>
        <strong>${title}</strong><span>${text}</span></label>`;
    app.innerHTML = `
      <div class="stack">
        <section class="panel hero stack">
          <div>
            <h1>What's the diagnosis?</h1>
            <p class="lede">${CARDS.length.toLocaleString()} diagnoses and ${CARDS.reduce((n, c) => n + c.images.length, 0).toLocaleString()} clinical photos from DermNet. ${CARDS.filter((c) => c.pearl).length} of them are hand-reviewed with look-alikes and a board pearl; the rest add breadth, including rare conditions. Spaced repetition brings back what you miss.</p>
          </div>

          <fieldset class="fieldset"><legend>Difficulty</legend>
            <div class="levels">
              ${LEVEL_IDS.map((l) => `<button type="button" class="level-btn" data-level="${l}" aria-pressed="${p.levels.includes(l)}">
                <strong>${LEVELS[l].name} <span class="badge l${l}">${CARDS.filter((c) => c.lvl === l).length}</span></strong><span>${LEVELS[l].blurb}</span></button>`).join('')}
            </div>
          </fieldset>

          <fieldset class="fieldset"><legend>Topics <button type="button" class="btn ghost small" data-cats="all">All</button><button type="button" class="btn ghost small" data-cats="none">None</button></legend>
            <div class="chips">
              ${Object.entries(CATS).map(([k, name]) => `<button type="button" class="chip" data-cat="${k}" aria-pressed="${!p.cats.length || p.cats.includes(k)}">${esc(name)}</button>`).join('')}
            </div>
          </fieldset>

          <fieldset class="fieldset"><legend>How do you want to answer?</legend>
            <div class="options">
              ${radio('mode', 'type', 'Type &amp; pick', 'Recall it, then pick from the full diagnosis list. Closest to the real exam.')}
              ${radio('mode', 'mc', 'Multiple choice', 'Four options built from true look-alikes.')}
              ${radio('mode', 'flip', 'Flip', 'Think it through, reveal, then grade yourself.')}
            </div>
          </fieldset>

          <fieldset class="fieldset"><legend>Which cards?</legend>
            <div class="options">
              ${radio('queue', 'smart', 'Smart review', 'Cards due for review first, then new ones (easier first, mixed).')}
              ${radio('queue', 'weak', 'Weak spots', 'Cards you have missed, worst first.')}
              ${radio('queue', 'shuffle', 'Shuffle', 'Everything in the pool, random order.')}
            </div>
          </fieldset>

          <div class="row spread">
            <label class="row">Session length
              <select id="size">${[[10, '10 cards'], [20, '20 cards'], [50, '50 cards'], [0, 'Everything']].map(([v, t]) => `<option value="${v}" ${p.size === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
            </label>
            <div class="pool" id="pool" aria-live="polite"></div>
          </div>

          <div class="row"><button class="btn primary big" data-action="start">Start studying</button>
            <span class="muted small" id="start-note"></span></div>
        </section>
      </div>`;
    updatePool();
  }

  function updatePool() {
    const s = poolStats();
    const el = $('#pool');
    if (!el) return;
    el.innerHTML = `<span><b>${s.total}</b>in pool</span><span><b>${s.due}</b>due</span><span><b>${s.fresh}</b>new</span>`;
    $('#start-note').textContent = s.total ? '' : 'Pick at least one difficulty and topic.';
    $('[data-action="start"]').disabled = !s.total;
  }

  // ---------- study ----------
  function startSession() {
    const queue = buildQueue();
    if (!queue.length) { renderHome(); return; }
    session = { queue, idx: 0, results: [], startedAt: Date.now() };
    setView('study');
  }

  function makeOptions(card) {
    const picks = new Set([card.id]);
    const add = (list) => { for (const c of shuffle(list)) if (picks.size < 4 && !isVariant(card, c)) picks.add(c.id); };
    add(card.dx.filter((d) => d.id).map((d) => BY_ID.get(d.id)));
    add(CARDS.filter((c) => c.dx.some((d) => d.id === card.id)));
    add(CARDS.filter((c) => c.cat === card.cat && c.lvl === card.lvl));
    add(CARDS.filter((c) => c.cat === card.cat));
    add(CARDS);
    return shuffle([...picks]).map((id) => BY_ID.get(id));
  }

  function renderStudy() {
    const id = session.queue[session.idx];
    const card = BY_ID.get(id);
    const first = questionPhoto(card);
    cur = {
      card,
      first,            // the one photo this question is tied to
      img: first,       // the photo currently on screen (differs only while browsing extras)
      more: false,
      phase: 'ask',
      verdict: null,
      pickedId: null,
      options: state.prefs.mode === 'mc' ? makeOptions(card) : null,
    };
    paintStudy();
    preloadNext();
  }

  const questionPhoto = (card) => {
    const picks = (session.picks ||= {});
    return (picks[card.id] ??= Math.floor(Math.random() * card.images.length));
  };

  function preloadNext() {
    const nextId = session.queue[session.idx + 1];
    const next = nextId && BY_ID.get(nextId);
    if (next) new Image().src = imgUrl(next.images[questionPhoto(next)].u);
  }

  function photoHtml() {
    const { card, img } = cur;
    return `<div class="photo" id="photo">
      <img id="main-img" src="${esc(imgUrl(card.images[img].u))}" alt="Skin photograph to identify" referrerpolicy="no-referrer">
    </div>`;
  }

  // Extra photos stay hidden until asked for, before or after answering.
  function moreHtml() {
    const { card, img, more } = cur;
    const n = card.images.length;
    if (n < 2) return '';
    if (!more) return `<button class="btn small" data-action="more" aria-expanded="false">Show more photos</button>`;
    return `<div class="thumbs" role="group" aria-label="Other photos of this diagnosis">${card.images.map((im, i) => `<button data-thumb="${i}" aria-current="${i === img}" aria-label="Photo ${i + 1} of ${n}"><img src="${esc(imgUrl(im.u))}" alt="" referrerpolicy="no-referrer"></button>`).join('')}</div>
      <button class="btn ghost small" data-action="more" aria-expanded="true">Hide extra photos</button>`;
  }

  function showImage(i) {
    cur.img = i;
    $('#photo').outerHTML = photoHtml();
    wirePhoto();
    $('#more').innerHTML = moreHtml();
    if (cur.phase === 'revealed') $('#reveal').innerHTML = revealHtml(); // the caption follows the photo on screen
  }

  function toggleMore() {
    if (cur.card.images.length < 2) return;
    cur.more = !cur.more;
    if (!cur.more && cur.img !== cur.first) showImage(cur.first);
    else $('#more').innerHTML = moreHtml();
  }

  // Paint a new card. The photo is built once here and left alone on reveal, so it never reloads or flashes.
  function paintStudy() {
    const total = session.queue.length;
    const mode = state.prefs.mode;
    app.innerHTML = `
      <div class="study">
        <div class="row spread small muted">
          <span>Card ${session.idx + 1} of ${total}</span>
          <span class="row"><button class="btn ghost small" data-action="skip">Skip</button><button class="btn ghost small" data-action="end">End session</button></span>
        </div>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${session.idx}"><i style="width:${pct(session.idx, total)}%"></i></div>
        ${photoHtml()}
        <div id="more" class="more">${moreHtml()}</div>
        <div id="interaction">${askHtml(mode)}</div>
        <div id="reveal"></div>
      </div>`;
    wirePhoto();
    wireAsk(mode);
  }

  function showReveal() {
    const total = session.queue.length;
    const done = session.idx + 1;
    $('#interaction').innerHTML = state.prefs.mode === 'mc' ? markedChoicesHtml() : '';
    $('#reveal').innerHTML = revealHtml();
    $('.progress').setAttribute('aria-valuenow', done);
    $('.progress > i').style.width = `${pct(done, total)}%`;
    $('[data-rate].default')?.focus({ preventScroll: true });
    $('#reveal').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function askHtml(mode) {
    if (mode === 'type') {
      return `<div class="stack">
        <p class="prompt">What is the most likely diagnosis? Start typing and pick from the list.</p>
        <div class="row">
          <div class="combo">
            <input id="answer" type="text" role="combobox" aria-expanded="false" aria-controls="results" aria-autocomplete="list" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="e.g. lichen planus" aria-label="Diagnosis">
            <ul class="listbox" id="results" role="listbox" hidden></ul>
          </div>
          <button class="btn" data-action="giveup">I don't know <kbd>?</kbd></button>
        </div>
        <p class="hint" id="hint" role="status"></p>
      </div>`;
    }
    if (mode === 'mc') {
      return `<div class="stack"><p class="prompt">Choose the most likely diagnosis.</p>
        <div class="mc">${cur.options.map((o, i) => `<button data-pick="${esc(o.id)}"><kbd>${i + 1}</kbd>${esc(o.name)}</button>`).join('')}</div>
        <button class="btn ghost" data-action="giveup">I don't know <kbd>?</kbd></button></div>`;
    }
    return `<div class="stack"><p class="prompt">Commit to a diagnosis and a differential in your head, then reveal.</p>
      <button class="btn primary big" data-action="giveup">Show answer <kbd>Space</kbd></button></div>`;
  }

  // --- type-ahead combobox
  function wireAsk(mode) {
    if (mode !== 'type') return;
    const input = $('#answer');
    const list = $('#results');
    let matches = [];
    let active = -1;

    const paint = () => {
      list.hidden = !matches.length;
      input.setAttribute('aria-expanded', String(!!matches.length));
      list.innerHTML = matches.map((m, i) => `<li role="option" id="opt-${i}" data-id="${esc(m.id)}" aria-selected="${i === active}">${esc(m.label)}${m.primary ? '' : `<small>= ${esc(BY_ID.get(m.id).name)}</small>`}</li>`).join('');
      if (active >= 0) input.setAttribute('aria-activedescendant', `opt-${active}`); else input.removeAttribute('aria-activedescendant');
      $('#hint').textContent = '';
    };
    const choose = (id) => answer(id);

    input.addEventListener('input', () => { matches = search(input.value); active = matches.length ? 0 : -1; paint(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && matches.length) { e.preventDefault(); active = (active + 1) % matches.length; paint(); }
      else if (e.key === 'ArrowUp' && matches.length) { e.preventDefault(); active = (active - 1 + matches.length) % matches.length; paint(); }
      else if (e.key === 'ArrowLeft' && !input.value) { e.preventDefault(); stepImage(-1); }
      else if (e.key === 'ArrowRight' && !input.value) { e.preventDefault(); stepImage(1); }
      else if (e.key === 'Escape') { matches = []; active = -1; paint(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const exact = exactMatch(input.value);
        if (matches[active]) choose(matches[active].id);
        else if (exact) choose(exact.id);
        else $('#hint').textContent = input.value ? 'No match. Pick a diagnosis from the list, or choose “I don’t know”.' : 'Type a diagnosis first, or choose “I don’t know”.';
      }
    });
    list.addEventListener('mousedown', (e) => {
      const li = e.target.closest('li');
      if (li) { e.preventDefault(); choose(li.dataset.id); }
    });
    input.addEventListener('blur', () => { setTimeout(() => { if (list.isConnected) { list.hidden = true; } }, 120); });
    input.addEventListener('focus', () => { if (matches.length) list.hidden = false; });
    input.focus();
  }

  function answer(pickedId) {
    if (cur.phase !== 'ask') return;
    cur.phase = 'revealed';
    cur.pickedId = pickedId;
    const verdict = pickedId === null ? 'skipped' : judge(cur.card, pickedId);
    cur.variant = verdict === 'variant';
    cur.verdict = cur.variant ? 'correct' : verdict;
    showReveal();
  }

  function markedChoicesHtml() {
    return `<div class="mc">${cur.options.map((o, i) => {
      const cls = o.id === cur.card.id ? 'correct' : o.id === cur.pickedId ? 'wrong' : '';
      return `<button class="${cls}" disabled><kbd>${i + 1}</kbd>${esc(o.name)}</button>`;
    }).join('')}</div>`;
  }

  function revealHtml() {
    const { card, verdict, pickedId, img } = cur;
    const picked = pickedId && BY_ID.get(pickedId);
    const related = relatedIds(card);
    const msg = {
      correct: cur.variant
        ? `✓ Counted as correct. ${esc(picked.name)} is a variant of this diagnosis, which DermNet files under “${esc(card.name)}”. Worth knowing the specific label too.`
        : '✓ Correct',
      close: `≈ Close. ${esc(picked?.name || '')} is a look-alike or a closely related diagnosis, but it's not the answer.`,
      wrong: `✗ Not quite. You chose ${esc(picked?.name || '')}.`,
      skipped: 'Answer revealed',
    }[verdict];
    const defaultRating = verdict === 'correct' ? 3 : 1;
    const s = state.cards[card.id];
    const labels = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
    const flipMode = state.prefs.mode === 'flip';
    const caption = card.images[img].cap;

    return `<div class="reveal">
      <div class="verdict ${verdict}" role="status">${msg}</div>
      <div class="body">
        <div>
          <div class="row" style="margin-bottom:6px"><span class="badge l${card.lvl}">${LEVELS[card.lvl].name}</span><span class="badge">${esc(CATS[card.cat])}</span></div>
          <h2>${esc(card.name)}</h2>
          ${card.alt.length ? `<p class="aka">Also: ${card.alt.map(esc).join(' · ')}</p>` : ''}
        </div>
        ${caption ? `<p class="caption">This photo: ${esc(caption)} <span>(${esc(card.images[img].c || '© DermNet')})</span></p>` : ''}
        ${card.dx.length ? `<div><div class="eyebrow">Look-alikes to rule out</div>
          <div class="dx" style="margin-top:6px">${card.dx.map((d) => {
            const name = d.id ? BY_ID.get(d.id).name : d.text;
            return `<span class="${d.id && d.id === pickedId ? 'hit' : ''}">${esc(name)}</span>`;
          }).join('')}</div></div>` : ''}
        ${card.pearl ? `<div class="pearl">${esc(card.pearl)}</div>` : '<p class="muted small">No pearl for this one. The DermNet page below has the details.</p>'}
        <p class="small">Image sourced from <a href="${ORIGIN}/topics/${esc(card.id)}" target="_blank" rel="noopener">DermNet: ${esc(card.name)} ↗</a></p>
        <div>
          <div class="eyebrow" style="margin-bottom:6px">${flipMode ? 'How did you do?' : 'Schedule next review'}</div>
          <div class="rate">${[1, 2, 3, 4].map((r) => `<button data-rate="${r}" class="${!flipMode && r === defaultRating ? 'default' : ''}">${labels[r]}<small>${intervalLabel(s, r)} · ${r}</small></button>`).join('')}</div>
          <p class="muted small" style="margin-top:8px">${flipMode ? 'Be honest: Again if you missed it or were guessing.' : `Enter accepts “${labels[defaultRating]}”.`}</p>
        </div>
      </div>
    </div>`;
  }

  function wirePhoto() {
    const img = $('#main-img');
    if (!img) return;
    img.addEventListener('error', () => {
      const wrap = $('#photo');
      if (!wrap || $('.msg', wrap)) return;
      wrap.insertAdjacentHTML('beforeend', '<div class="msg"><div><p>Couldn’t load this photo from DermNet.</p><p class="small">Check your connection, or press Skip.</p></div></div>');
    });
    img.addEventListener('click', () => {
      const lb = $('#lightbox');
      $('img', lb).src = img.src;
      lb.hidden = false;
    });
  }

  function stepImage(dir) {
    if (!cur.more) return; // arrows only work once extra photos have been opened
    const n = cur.card.images.length;
    showImage((cur.img + dir + n) % n);
  }

  function rate(rating) {
    if (cur.phase !== 'revealed') return;
    cur.phase = 'rated';
    const verdict = state.prefs.mode === 'flip' ? (rating >= 3 ? 'correct' : 'wrong') : cur.verdict;
    record(cur.card, rating, verdict === 'skipped' ? 'wrong' : verdict, cur.pickedId);
    session.results.push({ id: cur.card.id, verdict, rating });
    if (rating === 1) {
      // Show it again a few cards later in this session.
      const at = Math.min(session.queue.length, session.idx + 5);
      session.queue.splice(at, 0, cur.card.id);
    }
    next();
  }

  function next() {
    session.idx++;
    if (session.idx >= session.queue.length) setView('summary'); else renderStudy();
  }

  // ---------- summary ----------
  function renderSummary() {
    const r = session.results;
    const firstPass = new Map();
    for (const x of r) if (!firstPass.has(x.id)) firstPass.set(x.id, x);
    const right = [...firstPass.values()].filter((x) => x.verdict === 'correct').length;
    const missed = [...firstPass.values()].filter((x) => x.verdict !== 'correct');
    const mins = Math.max(1, Math.round((Date.now() - session.startedAt) / 60000));
    app.innerHTML = `
      <section class="panel stack">
        <div><div class="eyebrow">Session complete</div><h1>${pct(right, firstPass.size)}% on first look</h1>
          <p class="lede">${right} of ${firstPass.size} correct on the first try · ${mins} min</p></div>
        ${missed.length ? `<div><h2 style="font-size:18px;margin-bottom:8px">To review</h2><ul class="list">${missed.map((m) => {
          const c = BY_ID.get(m.id);
          return `<li><span>${esc(c.name)}</span><span class="muted small">${esc(CATS[c.cat])}</span></li>`;
        }).join('')}</ul></div>` : '<p>Clean sweep. Nothing missed this round.</p>'}
        <div class="row">
          <button class="btn primary big" data-action="start">Study more</button>
          ${missed.length ? '<button class="btn big" data-action="retry">Retry missed</button>' : ''}
          <button class="btn big" data-action="home">Back to setup</button>
        </div>
      </section>`;
    session.missed = missed.map((m) => m.id);
  }

  // ---------- stats ----------
  function renderStats() {
    const entries = CARDS.map((c) => [c, state.cards[c.id]]);
    const seen = entries.filter(([, s]) => s);
    const attempts = seen.reduce((n, [, s]) => n + s.n, 0);
    const right = seen.reduce((n, [, s]) => n + s.ok, 0);
    const mastered = seen.filter(([, s]) => s.i >= 21).length;
    const last7 = Array.from({ length: 7 }, (_, i) => dayKey(Date.now() - i * DAY)).reduce((n, d) => n + (state.log[d] || 0), 0);
    let streak = 0;
    for (let i = (state.log[today()] ? 0 : 1); state.log[dayKey(Date.now() - i * DAY)]; i++) streak++;

    const group = (keyFn, names) => Object.entries(names).map(([k, name]) => {
      const inGroup = entries.filter(([c]) => keyFn(c) === k);
      const s = inGroup.filter(([, st]) => st);
      return { name, total: inGroup.length, seen: s.length, n: s.reduce((a, [, st]) => a + st.n, 0), ok: s.reduce((a, [, st]) => a + st.ok, 0) };
    });
    const bar = (g) => {
      const acc = pct(g.ok, g.n);
      const cls = !g.n ? '' : acc < 60 ? 'low' : acc < 80 ? 'mid' : '';
      return `<div class="bar"><span>${esc(g.name)}</span><span class="track"><i class="${cls}" style="width:${g.n ? acc : 0}%"></i></span><span class="num">${g.n ? acc + '%' : '–'} · ${g.seen}/${g.total}</span></div>`;
    };

    const weak = seen.filter(([, s]) => s.ok < s.n).sort((a, b) => (b[1].l * 2 + (1 - b[1].ok / b[1].n)) - (a[1].l * 2 + (1 - a[1].ok / a[1].n))).slice(0, 10);
    const confusions = [];
    for (const [c, s] of seen) for (const [oid, n] of Object.entries(s.cf || {})) if (BY_ID.has(oid)) confusions.push({ c, other: BY_ID.get(oid), n });
    confusions.sort((a, b) => b.n - a.n);

    app.innerHTML = `
      <div class="stack">
        <section class="panel stack">
          <h1>Progress</h1>
          <div class="grid">
            <div class="stat"><b>${seen.length}<span class="muted small"> / ${CARDS.length}</span></b>cards seen</div>
            <div class="stat"><b>${attempts ? pct(right, attempts) + '%' : '–'}</b>accuracy (${attempts} answers)</div>
            <div class="stat"><b>${mastered}</b>mastered (21+ day interval)</div>
            <div class="stat"><b>${last7}</b>reviews, last 7 days</div>
            <div class="stat"><b>${streak}</b>day streak</div>
          </div>
        </section>
        <section class="panel stack"><h2>By topic</h2><div class="bars">${group((c) => c.cat, CATS).map(bar).join('')}</div></section>
        <section class="panel stack"><h2>By difficulty</h2><div class="bars">${group((c) => String(c.lvl), Object.fromEntries(LEVEL_IDS.map((l) => [l, LEVELS[l].name]))).map(bar).join('')}</div></section>
        <section class="panel stack"><h2>Weakest cards</h2>
          ${weak.length ? `<ul class="list">${weak.map(([c, s]) => `<li><span>${esc(c.name)}</span><span class="muted small">${s.ok}/${s.n} right</span></li>`).join('')}</ul>` : '<p class="muted">Nothing yet. Misses show up here.</p>'}
        </section>
        <section class="panel stack"><h2>What you mix up</h2>
          ${confusions.length ? `<ul class="list">${confusions.slice(0, 10).map((x) => `<li><span>${esc(x.c.name)} <span class="muted">called</span> ${esc(x.other.name)}</span><span class="muted small">×${x.n}</span></li>`).join('')}</ul>` : '<p class="muted">Wrong answers you pick from the list are tracked here, so you can see which pairs to drill.</p>'}
        </section>
        <section class="panel stack"><h2>Your data</h2>
          <p class="muted small">Progress is saved in this browser only. Export a backup to move it to another device.</p>
          <div class="row">
            <button class="btn" data-action="export">Export</button>
            <label class="btn">Import<input type="file" id="import" accept="application/json" hidden></label>
            <button class="btn danger" data-action="reset">Reset all progress</button>
          </div>
        </section>
      </div>`;
  }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action],[data-level],[data-cat],[data-cats],[data-pick],[data-rate],[data-thumb]');
    if (!t) return;
    if (t.dataset.action) {
      const a = t.dataset.action;
      if (a === 'home') { e.preventDefault(); setView('home'); }
      else if (a === 'stats') setView('stats');
      else if (a === 'start') startSession();
      else if (a === 'retry') { session = { queue: shuffle(session.missed), idx: 0, results: [], startedAt: Date.now() }; setView('study'); }
      else if (a === 'skip') next();
      else if (a === 'end') (session.results.length ? setView('summary') : setView('home'));
      else if (a === 'giveup') answer(null);
      else if (a === 'more') toggleMore();
      else if (a === 'export') exportData();
      else if (a === 'reset') { if (confirm('Erase all saved progress? This cannot be undone.')) { state.cards = {}; state.log = {}; save(); renderStats(); } }
    } else if (t.dataset.level) {
      const l = Number(t.dataset.level);
      const set = new Set(state.prefs.levels);
      set.has(l) ? set.delete(l) : set.add(l);
      state.prefs.levels = [...set].sort();
      save(); renderHome();
    } else if (t.dataset.cat) {
      const all = Object.keys(CATS);
      const set = new Set(state.prefs.cats.length ? state.prefs.cats : all);
      set.delete('__none__');
      set.has(t.dataset.cat) ? set.delete(t.dataset.cat) : set.add(t.dataset.cat);
      state.prefs.cats = set.size === all.length ? [] : set.size ? [...set] : ['__none__'];
      save(); renderHome();
    } else if (t.dataset.cats) {
      state.prefs.cats = t.dataset.cats === 'all' ? [] : ['__none__'];
      save(); renderHome();
    } else if (t.dataset.pick) answer(t.dataset.pick);
    else if (t.dataset.rate) rate(Number(t.dataset.rate));
    else if (t.dataset.thumb) showImage(Number(t.dataset.thumb));
  });

  document.addEventListener('change', (e) => {
    if (e.target.name === 'mode' || e.target.name === 'queue') { state.prefs[e.target.name] = e.target.value; save(); updatePool(); }
    else if (e.target.id === 'size') { state.prefs.size = Number(e.target.value); save(); }
    else if (e.target.id === 'import') importData(e.target.files[0]);
  });

  $('#lightbox').addEventListener('click', () => { $('#lightbox').hidden = true; });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#lightbox').hidden) { $('#lightbox').hidden = true; return; }
    if (view !== 'study' || !cur || e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = e.target.id === 'answer';
    if (cur.phase === 'ask') {
      if (typing) {
        if (e.key === '?' && !e.target.value) { e.preventDefault(); answer(null); }
        return;
      }
      const mode = state.prefs.mode;
      if (e.key === 'm' || e.key === 'M') toggleMore();
      else if (mode === 'mc' && /^[1-4]$/.test(e.key)) answer(cur.options[Number(e.key) - 1]?.id ?? null);
      else if (e.key === '?' || (mode === 'flip' && (e.key === ' ' || e.key === 'Enter'))) { e.preventDefault(); answer(null); }
      else if (e.key === 'ArrowLeft') stepImage(-1);
      else if (e.key === 'ArrowRight') stepImage(1);
    } else {
      if (e.key === 'm' || e.key === 'M') toggleMore();
      else if (/^[1-4]$/.test(e.key)) rate(Number(e.key));
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (state.prefs.mode !== 'flip') rate(cur.verdict === 'correct' ? 3 : 1);
      } else if (e.key === 'ArrowLeft') stepImage(-1);
      else if (e.key === 'ArrowRight') stepImage(1);
    }
  });

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `derm-flashcards-progress-${today()}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function importData(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (typeof data.cards !== 'object') throw new Error('bad file');
      state.cards = data.cards; state.log = data.log || {};
      state.prefs = { ...DEFAULT_PREFS, ...(data.prefs || {}) };
      save(); renderStats();
    } catch { alert('That file doesn’t look like a progress export.'); }
  }

  setView('home');
})();
