// Heuristics for turning the whole DermNet topic list into flashcards.
// None of this is exact; the goal is "diagnoses people can be asked to name from a photo", with few false positives.

// Non-clinical or off-topic gallery items (histology, culture plates, charts, dermoscopy, X-rays...).
export const NOT_A_PHOTO = new RegExp(
  [
    'patholog', 'histolog', 'histopath', 'microscop', 'culture', 'stain', 'h&e', 'dermoscop',
    'classification', 'score', 'mortality', 'hair cycle', 'diagram', 'figure \\d', '\\btick\\b',
    'x-?ray', '\\bmri\\b', 'fluorescence', 'mattress', 'eggs', '\\bnits\\b', 'miniaturis',
  ].join('|'),
  'i',
);

// Page headings that appear on disease pages vs. treatment / procedure / drug pages.
const DISEASE_HEADING = /clinical features|who gets|what causes|differential diagnosis|complications of|how is .* diagnosed|what are the (signs|symptoms)|what does .* look like|what is the cause|signs and symptoms|what are the .* features/i;
const TREATMENT_HEADING = /how to take|side effects|contraindications|how does .* work|benefits and disadvantages|used for|aftercare|how is the procedure|how to use|dose|dosage|prescri/i;

// Topics that are not a diagnosis you could name from a photo.
const DENY = new RegExp(
  [
    'dermoscop', '^skin-biopsy', 'surgery', 'grafting', '^differential-diagnosis', '^guidelines', 'psycholog', 'therapy',
    'definition-and-pathogenesis', '^annular-granular', '^interferon', 'antifungal-drug-resistance', 'immunosuppression$',
    'aeroallergens', 'food-allergy', 'peanut', 'pollen-food', '^risks-and', '-and-the-skin$',
    '^skin-(conditions|problems|changes|reactions|infections|health|effects|toxicity|signs|manifestations|disorders)-',
    'cellulitis-mimics', 'reactions-to-cosmetics', 'patch-test', 'mohs', '^conditions-affecting', '^comparative',
    'polarised', 'negative-network', '^spot-the', '^key-clinical', 'trial', '^laser', 'laser-', '^how-', '^what-', '^who-',
    '^do-i', '^check-', '^see-your', '^self-', '^cosmetic', 'injection', '^introduction', '^laboratory', 'trichoscopy',
    'histology', 'stains$', '^image', '^nikolsky', '^pasi', '-score', 'terminology', '^dermatomes', '^skin-flaps',
    '^skin-tension', '^the-', '^occupational', 'mimics', 'genetic', '^genes-', '^causes-of', 'treatment', 'guideline',
    '^diagnosis-of', '^facial-rashes', '^rashes-affecting', '^fever-and', '^ethnic', '^pigmentation-disorders',
    '^pigmented-skin-lesions', '^benign-skin-lesions', '^blistering-skin', '^blisters-and-pustules', '^pustular-skin',
    '^vascular-proliferations', '^urticaria-and-urticaria-like', '^lichenoid-disorders', '^neutrophilic-dermatoses',
    '^sweat-gland-lesions', '^torch', '^lichens$', '^nail-disorder', 'wound', 'debridement', 'photography', 'biologics',
    '^autoimmune-diseases-in', 'barrier-function', '^complications-of', 'histological-clearance', '^superimposed-segmental',
    '^liver-problems', 'insulin-resistance', '^hypogonadism', 'phantom-vibration', '^dermatological-manifestations-of',
    '^lactation', '^bleeding-and', '^skin-ageing', '^sensitive-skin', '^enlarged-pores', '^urticaria$', '^dermatitis$',
    '^hair-loss$', '^keratinocyte-cancer', '^compulsive-hand', '^malassezia-infections$', '^conjunctivitis', 'bacterial-conjunctivitis',
    '^otitis', '^irritant-contact-dermatitis-images$', '^melanocortin', 'oestrogen-hypersensitivity', '^atopy$', '^excessive-hair',
    '^bacterial-biofilm', '^bacterial-skin-infections$', '^skin-cancer$', '^coagulase-negative', '^human-polyomavirus', '^epstein-barr',
  ].join('|'),
);

// Real diagnoses on short pages that the heading test misses.
const ALLOW = new Set([
  'epulis', 'sister-mary-joseph-nodule-of-the-umbilicus', 'solar-comedo', 'venous-malformation', 'pubic-lice', 'comedones',
  'clear-cell-acanthoma', 'dermatitis-artefacta', 'focal-dermal-hypoplasia', 'sapho-syndrome', 'pyoderma-faciale',
  'palmar-erythema', 'squamous-cell-papilloma', 'oil-folliculitis', 'maculopapular-cutaneous-mastocytosis',
  'streptococcal-skin-infections', 'infective-panniculitis', 'marginal-keratoderma',
  'blueberry-muffin-syndrome', 'connective-tissue-naevi', 'bullous-drug-eruptions', 'elastosis', 'amputation-stump-dermatoses',
  'eyelid-contact-dermatitis', 'acne-due-to-medicine', 'adult-acne', 'non-langerhans-cell-histiocytosis', 'thermal-burn',
  'onychophagia', 'cutaneous-mucinoses', 'neonatal-cephalic-pustulosis', 'lepra-reactions',
]);

export const isGallerySlug = (slug) => /-images$/.test(slug);

export function isDiagnosisPage(page) {
  const { slug, h2 = [], images } = page;
  if (!images.length) return { ok: false, why: 'no photos' };
  if (slug.includes('/')) return { ok: false, why: 'sub-page' };
  if (/-pathology$/.test(slug)) return { ok: false, why: 'histology' };
  if (DENY.test(slug)) return { ok: false, why: 'denied pattern' };
  if (ALLOW.has(slug)) return { ok: true };
  if (isGallerySlug(slug)) return { ok: true };
  const d = h2.filter((x) => DISEASE_HEADING.test(x)).length;
  const n = h2.filter((x) => TREATMENT_HEADING.test(x)).length;
  if (d >= 2 && n <= 1) return { ok: true, strong: true };
  if (d === 1 && n === 0) return { ok: true };
  return { ok: false, why: `headings d${d}/n${n}` };
}

export function titleFromPage(page) {
  let t = (page.title || page.slug.replace(/-/g, ' ')).replace(/\s+/g, ' ').trim();
  t = t.replace(/\s*[-–:|]?\s*images?$/i, '').replace(/\s*[-–]\s*DermNet.*$/i, '').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Spelling-insensitive key (British/American, case, punctuation).
export const normName = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/ae/g, 'e').replace(/oe/g, 'e')
    .replace(/tumour/g, 'tumor').replace(/\s+/g, ' ').trim();

// Keep a topic's photos only if their captions are about the topic (many pages also show related conditions).
const STOP = new Set(['skin', 'with', 'from', 'disease', 'syndrome', 'the', 'and', 'for', 'due', 'type', 'image', 'images', 'other', 'common', 'case', 'cases', 'infection', 'infections']);
const tokens = (s) => normName(s).split(' ').filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 5));
export function relevantImages(images, name, { fallbackAll = false } = {}) {
  const want = new Set(tokens(name));
  if (!want.size) return images;
  const overlaps = (text) => tokens(text).some((w) => want.has(w));
  const generic = (text) => tokens(text).length === 0; // "fig 2", "DSCN0925", "close-up"
  const keep = images.filter((i) => overlaps(i.t) || generic(i.t) || (!i.t && overlaps(i.a)));
  if (keep.length) return keep;
  const byAlt = images.filter((i) => overlaps(i.a));
  return byAlt.length ? byAlt : fallbackAll ? images.slice(0, 6) : [];
}

// Topic guess from the diagnosis name. First match wins, so order matters.
const RULES = [
  ['ben', /\b(epidermal|sebaceous|connective tissue|comedo|vascular|eccrine|lipomatosus|woolly hair|organoid|smooth muscle)\s+na?evus|\b(epidermal|connective tissue) na?evi/],
  ['nail', /\bnail|onych|ungual|paronych|subungual|melanonychia/],
  ['mal', /carcinoma|sarcoma|lymphoma|leuka?emia|malignan|metasta|mycosis fungoides|s[eé]zary|actinic keratos|bowen|keratoacanthoma|paget|t-cell|neoplas|intraepithelial|in situ|lymphomatoid|dermatofibrosarcoma|merkel/],
  ['mel', /melanoma|\bna?evus|\bna?evi\b|melanocytic|lentigo maligna|lentiginous|\bmole\b|spitz|melanocytosis|\bmoles\b/],
  ['drug', /\berythema\b(?! (multiforme|nodosum|ab igne|infectiosum|migrans|toxicum))|annular erythema|exanthems?\b|reactive infectious|\bdrug|adverse|toxicity|induced|chemotherapy|checkpoint|stevens|toxic epidermal|\bdress\b|hypersensitivity syndrome|\bfixed\b|exanthema|serum sickness|medicine|kinase|egfr/],
  ['bul', /pemphig|bullous|bulla|blister|epidermolysis bullosa|dermatitis herpetiformis|scalded|porphyria|linear iga|hailey/],
  ['ctd', /lupus|dermatomyositis|scleroderma|systemic sclerosis|morphoea|sj[oö]gren|mixed connective|antiphospholipid|sclerodactyly|eosinophilic fasciitis|raynaud|myositis|synthetase|overlap/],
  ['vas', /urticaria|angioedema|dermographism|acrocyanosis|capillaritis|cryoglobulin|cholesterol emboli|cutis marmorata|palmar erythema|\bbruis|petechiae|septic embol|vasculitis|purpura|angiitis|arteritis|telangiect|vascular|\bvein|venous|lymphatic|lymphoedema|ulcer|livedo|erythromelalgia|angioma|angiokeratoma|kawasaki|beh[cç]et|thrombo|capillary|stasis|varicose|chilblain|pernio|gangrene|necrosis|calciphylaxis|haemangioma|hemangioma|pyogenic granuloma|port.wine|cherry|lymphangi/],
  ['inf', /pinworm|dracuncul|podoconi|malaria|scabies|\blice\b|\blouse\b|pedicul|\bmites?\b|larva|myiasis|tungiasis|bed bug|\bfleas?\b|\bbites?\b|stings?\b|leishman|trypanosom|filaria|onchocerc|\bticks?\b|leech|jellyfish|spider|caterpillar|infestation|demodex|helminth|schistosom|cercarial|swimmer|sea bather|creeping|\bworms?\b|parasit|dermatitis due to .*(insect|arthropod)|papular urticaria|\bants?\b|\bbees?\b|wasp/],
  ['fun', /piedra|tinea|fung|candid|ringworm|dermatophyt|\byeast|malassezia|versicolor|sporotrich|chromoblast|blastomyc|histoplasm|cryptococc|coccidioid|aspergill|mucor|mycetoma|trichophyton|favus|kerion|majocchi|mycosis(?! fungoides)|zygomyc|phaeohypho|lobomyc|paracoccid/],
  ['vir', /herpangina|whitlow|chikungunya|virus|viral|herpes|zoster|varicella|chickenpox|\bwarts?\b|verruca|condyloma|molluscum|\bpox\b|poxvirus|measles|rubella|roseola|erythema infectiosum|parvovirus|hand.foot.and.mouth|\borf\b|milker|\bhpv\b|\bhiv\b|cytomegalo|epstein|mononucleosis|gianotti|enterovirus|coxsackie|hepatitis|zika|dengue|covid|mpox|monkeypox|cowpox|vaccinia|smallpox|fifth disease|sixth disease|papular acrodermatitis|tanapox|buffalopox|paravaccinia/],
  ['bac', /listeri|nocardio|melioid|typhus|erysipeloid|bacteri|staph|strep|cellulitis|erysipelas|impetigo|abscess|furunc|\bboils?\b|carbuncle|mycobacter|tubercul|leprosy|lepra|syphilis|gonorrh|chancroid|anthrax|borrel|lyme|rickett|pseudomonas|erythrasma|actinomyc|nocardia|bartonella|cat scratch|scarlet|diphtheria|tularaemia|brucell|plague|\byaws\b|\bpinta\b|donovanosis|granuloma inguinale|lymphogranuloma|chlamydia|mycoplasma|ecthyma|botryomycosis|toxic shock|buruli|aeromonas|vibrio|salmonella|gram.negative|pitted keratolysis|trichomycosis|meningococc|necrotising|fasciitis|osler|janeway|pyoderma(?! gangrenosum)|pustulosis? \(?bacter/],
  ['photo', /photo|solar|\bsun\b|sunburn|polymorphic light|polymorphous light|actinic(?! keratos)|\buv\b|hydroa|light eruption|chronic actinic/],
  ['oral', /\boral\b|\bmouth\b|\blips?\b|\btongue\b|gingiv|stomatitis|cheilitis|aphthous|glossitis|mucos|\bgums?\b|epulis|buccal|palate|dental|vulva|vulval|genital|penile|balanitis|\banal\b|perianal|labial|vaginal|scrotal|lichen sclerosus|angular|mucocele|geographic tongue|leukoplakia|erythroplakia|pearly penile/],
  ['acn', /\bacne|rosacea|folliculitis|hidradenitis|pilaris|perioral|periorificial|miliaria|hyperhidrosis|\bsweat|comedo|rhinophyma|pseudofolliculitis|infundibul|steatocystoma|apocrine|eccrine|bromhidrosis|hirsutism|perforating|acanthosis/],
  ['ecz', /eczema|dermatitis|atopic|allerg|\bcontact\b|prurigo|lichen simplex|pompholyx|neurodermatitis|napkin|diaper|intertrigo|irritant|erythroderma|\bitch|pruritus|xerosis|dry skin|asteatotic|nummular|discoid eczema|id reaction|autoeczematization|lichenification/],
  ['pap', /psoria|lichen|pityriasis|parapsoriasis|keratoderma|ichthyosis|keratosis|porokeratosis|kerato|darier|exfoliat|scal(y|ing)/],
  ['pig', /pigment|melasma|vitiligo|hypomelanosis|hyperpigment|depigment|lentig|freckle|ephelid|caf[eé] au lait|dyschromia|leukoderma|albinism|piebald|poikiloderma|tattoo|acanthosis nigricans|hypopigment|argyria|ochronosis|achromic|melanosis|\bmacules?\b/],
  ['hair', /alopecia|\bhair|trich(?!ophyt|oepith|ilemm|oblast|ofolliculoma|ilemmoma)|madarosis|pili\b|folliculitis decalvans|scalp|eyelash|eyebrow|hirsut|baldness|pseudopelade/],
  ['gran', /granuloma|sarcoid|necrobiosis|xanthoma|amyloid|mucinosis|calcinosis|\bgout|lipodystrophy|panniculitis|pellagra|scurvy|deficiency|diabet|thyroid|myxoedema|cushing|acromegaly|erythema nodosum|pyoderma gangrenosum|sweet|neutrophilic|metabolic|vitamin|\bzinc\b|\biron\b|histiocytosis|lipoedema|hyperlipid|haemochromatosis|renal|kidney|liver|hepatic|calcifi|xanthelasma|obesity|polycythaemia|mucin|scleredema|scleromyxoedema|porphyri/],
  ['neo', /neonatal|infanc|infant|newborn|\bbaby|babies|paediatric|\bchild|juvenile|cradle cap|toxic erythema|mastocyt|congenital|\bnapkin/],
  ['ben', /acanthoma|trichilemmoma|\bhorn\b|fordyce|knuckle pad|\bcorn\b|callus|supernumerary|fibrous papule|cracked heel|gyrata|anetoderma|atrophoderma|elastosis|elastolysis|linea nigra|cyst|lipoma|fibroma|angioma|keratosis|papilloma|tumou?r|hyperplasia|syringoma|hamartoma|acrochordon|skin tag|xanthelasma|milium|milia|adenoma|neurofibroma|leiomyoma|poroma|spiradenoma|cylindroma|trichoepithelioma|pilomatri|dermatofibroma|\bscars?\b|keloid|nodule|papule|polyp|histiocytoma|schwannoma|neuroma|granular cell|lipomatosis|myxoma|chondroma|osteoma|calcifying|\bhaemangioma|stria|striae|stretch/],
  ['gen', /hereditary|congenital|inherited|ichthyos|ectodermal|epidermolysis|neurofibromatosis|tuberous|xeroderma|ehlers|incontinentia|albinism|poikiloderma|familial|x-linked|autosomal|syndrome|dysplasia|hypoplasia|dystroph|naevoid|\bgene\b|marfan|cutis laxa|pseudoxanthoma|dyskeratosis|ectodermal|palmoplantar|disease$/],
];

export function categorize(name, slug = '') {
  const text = `${name} ${slug.replace(/-/g, ' ')}`.toLowerCase();
  for (const [cat, re] of RULES) if (re.test(text)) return cat;
  return 'misc';
}
