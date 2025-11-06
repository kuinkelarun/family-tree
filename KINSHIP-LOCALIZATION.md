# Kinship Localization Guide

This document explains how relationship names are localized (e.g., English → Nepali), where to edit the mappings, and how the mapping connects to the kinship inference logic. Localization changes do NOT affect the BFS/MRCA algorithm; only display labels change.

## Where to edit

- Mapping file: `server/data/kinship-locales.json`
- Localizer: `server/utils/kinshipLocalization.js`
- API integration (already wired): `server/controllers/kinshipController.js`
- Client language toggle (Kinship Explorer): `client/src/components/KinshipPanel.jsx`

When you edit `server/data/kinship-locales.json`, restart the server to reload the mapping (the file is cached in-memory).

## How it works (high level)

- The classifier computes a relationship and attaches a structured code in `meta.relationCode`, for example:
  - `{ type: 'ancestor', level: 3 }` → great-grandparent
  - `{ type: 'descendant', level: 2 }` → grandchild
  - `{ type: 'sibling', half: true }` → half-sibling
  - `{ type: 'aunt_uncle', level: 2 }` → grand-aunt/uncle
  - `{ type: 'niece_nephew', level: 3 }` → great-grand-niece/nephew
  - `{ type: 'cousin', degree: 1, removal: 1 }` → first cousin once removed
  - `{ type: 'spouse' }`, `{ type: 'self' }`, `{ type: 'related_undetermined' }`, `{ type: 'unrelated' }`
- The localizer (`localizeKinship`) uses `relationCode` and the selected locale (e.g., `en`, `np`) to format a label.
- “In-law” relationships are handled by an `affinal` flag in `meta`; the localizer appends a locale-specific `affinalSuffix`.

### Per-level overrides (unique names for each generation)

If your language has unique names for each generation beyond grandparent/grandchild, you can add explicit overrides that take precedence over the prefix logic:

- Add a `levels` object inside `ancestor`, `descendant`, `aunt_uncle`, or `niece_nephew` with string keys for the level number.
- The lookup order is: `levels[level]` → `level1/level2` → `greatPrefix.repeat(n) + root` → `greatTemplate` fallback.

Example (Nepali):

```json
"ancestor": {
  "level1": "बा/आमा",
  "level2": "हजुरबा/हजुरआमा",
  "levels": {
    "3": "परहजुरबा/परहजुरआमा",
    "4": "प्रपरहजुरबा/प्रपरहजुरआमा",
    "5": "महाप्रपरहजुरबा/महाप्रपरहजुरआमा"
  },
  "greatPrefix": "पर",
  "root": "हजुरबा/हजुरआमा"
}
```

Do the same for `descendant` to control great-/great-great-grandchild labels explicitly.

## Mapping format

Open `server/data/kinship-locales.json`. It contains a top-level object keyed by locale code (e.g., `"en"`, `"np"`). Each locale has sections:

- `affinalSuffix`: suffix applied for in-law forms (when `affinal: true`).
- `self`, `spouse`, `related_undetermined`, `unrelated`: fixed labels.
- `ancestor`, `descendant`, `aunt_uncle`, `niece_nephew`:
  - `level1`: base (e.g., parent, child, aunt/uncle, niece/nephew)
  - `level2`: grand- forms (e.g., grandparent, grandchild)
  - `greatPrefix` + `root`: repeatable pattern for level >= 3
    - Example (English ancestor): `greatPrefix = "great-"`, `root = "grandparent"`
    - Example (Nepali ancestor): `greatPrefix = "पर"`, `root = "हजुरबा/हजुरआमा"`
- `sibling`: `{ full, half }`
- `step`: `{ parent, child, sibling }`
- `cousin`:
  - `degreeTemplate`: e.g., `"{ordinal} cousin"`
  - `removedOnce`, `removedTwice`, `removedMany`: e.g., `"{base} once removed"`, `"{base} {n} times removed"`
  - `ordinals`: mapping for `1`..`N` (fallback uses `"{n}th"` if missing)

### Example (snippet)

```json
{
  "np": {
    "affinalSuffix": " सालो",
    "self": "स्वयम्",
    "spouse": "जीवनसाथी",
    "ancestor": {
      "level1": "बा/आमा",
      "level2": "हजुरबा/हजुरआमा",
      "greatPrefix": "पर",
      "root": "हजुरबा/हजुरआमा"
    },
    "descendant": {
      "level1": "छोरा/छोरी",
      "level2": "नाति/नातिनी",
      "greatPrefix": "पर",
      "root": "नाति/नातिनी"
    },
    "sibling": { "full": "दाजुभाइ/दिदीबहिनी", "half": "सौतेनी दाजुभाइ/दिदीबहिनी" },
    "step": { "parent": "सौतेनी बाबु/आमा", "child": "सौतेनी छोरा/छोरी", "sibling": "सौतेनी दाजुभाइ/दिदीबहिनी" },
    "aunt_uncle": {
      "level1": "काका/काकी",
      "level2": "हजुर काका/काकी",
      "greatPrefix": "पर",
      "root": "हजुर काका/काकी"
    },
    "niece_nephew": {
      "level1": "भदै",
      "level2": "हजुर भदै",
      "greatPrefix": "पर",
      "root": "हजुर भदै"
    },
    "cousin": {
      "degreeTemplate": "{ordinal} कजिन",
      "removedOnce": "{base} एक पटक हटाइएको",
      "removedTwice": "{base} दुई पटक हटाइएको",
      "removedMany": "{base} {n} पटक हटाइएको",
      "ordinals": { "1": "पहिलो", "2": "दोस्रो", "3": "तेस्रो", "4": "चौथो" }
    },
    "related_undetermined": "अनिश्चित पारिवारिक सम्बन्ध",
    "unrelated": "रक्त सम्बन्ध छैन"
  }
}
```

## How the levels map

- Ancestor levels: 1 = parent, 2 = grandparent, 3 = great-grandparent, 4 = great-great-grandparent, etc.
  - Localizer renders: `level1`/`level2`, or `greatPrefix.repeat(level-2) + root` for `level >= 3`.
- Descendant levels are symmetrical (child → grandchild → great-grandchild...).
- Aunt/Uncle & Niece/Nephew levels: 1 = base, 2 = grand-, 3+ = great-...-grand- forms. Same prefix logic.
- Cousin: degree = 1 (first), 2 (second), ...; removal = 0/1/2/3… using the templates.

## English ↔ Nepali mapping strategies

- If you want single-gender terms (e.g., grandfather vs grandmother), extend the mapping and supply a `gender` in `relationCode` (requires a small code change). For now, the mapping uses combined forms (e.g., "हजुरबा/हजुरआमा").
- If your culture uses distinct maternal/paternal forms (e.g., फुफु vs काकी), you can:
  - Keep the current generic mapping and add a tooltip/explanation.
  - Or extend `relationCode` to include side (maternal/paternal) when data supports it, then add separate keys.

## Adding or refining Nepali terms

1. Edit `server/data/kinship-locales.json`, inside the `"np"` object.
2. Adjust strings for `ancestor`, `descendant`, `sibling`, `step`, `aunt_uncle`, `niece_nephew`, `cousin`, and suffixes.
3. Save and restart the server.
4. Test quickly:
   - No-DB smoke test:
     ```powershell
     node server/scripts/kinshipLocaleSmoke.js
     ```
   - API (ensure server and DB are running):
     ```powershell
     # Replace <TREE_ID>, from, to with real IDs
     curl "http://localhost:3000/api/trees/<TREE_ID>/kinship?from=<A>&to=<B>&locale=np"
     ```
   - UI: open Kinship Explorer, switch language, run Check.

## Switching language in the UI

- The language dropdown is in `client/src/components/KinshipPanel.jsx`.
- The selected language is saved in `localStorage` under `ft_locale`.
- When you change it, the panel re-runs the query and shows the localized label.

## Common pitfalls

- Numbers in labels like `परनाति1`: fixed by using `greatPrefix` + `root` (prefix repetition) instead of numeric placeholders.
- Missing ordinals in `cousin.ordinals`: the localizer will fall back to `"{n}th"`. Add entries for 1..10 (or more) as needed in Nepali.
- Affinal suffix: adjust `affinalSuffix` in each language. Set to an empty string if you prefer no suffix.

## Canonical relation codes (reference)

- `self`, `spouse`, `related_undetermined`, `unrelated`
- `ancestor(level)`, `descendant(level)`
- `sibling(half: boolean)`
- `step.role: 'parent'|'child'|'sibling'`
- `aunt_uncle(level)`, `niece_nephew(level)`
- `cousin(degree, removal)`
- `affinal` flag (in-law) comes from the classifier and appends `affinalSuffix` during localization.

## Adding a new language

1. Add a top-level object (e.g., `"hi"`) mirroring the structure under `"en"`/`"np"`.
2. Include `affinalSuffix`, all sections (even minimal), and ordinals.
3. Restart the server.
4. Add the new language option to the Kinship panel dropdown if you want it selectable in the UI.

---

If you want me to add gendered or side-specific (maternal/paternal) outputs next, I can extend `relationCode` and the localizer accordingly.
