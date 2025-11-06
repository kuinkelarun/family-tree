# Gender & Side-Aware Kinship Localization TODO

This roadmap tracks the introduction of gender, pronouns (he/she/they), maternal/paternal side inference, and richly localized Nepali/English kinship terms (including affinal / in-law distinctions). Each item includes intent, acceptance criteria, and notes. Mark items completed directly in this file to preserve historical context.

## Legend
- Status: [ ] = pending, [~] = in progress, [x] = done
- Priority: H = High, M = Medium, L = Low

---

### 1. Design gender data model (H)
Status: [ ]
Add `gender` to `Member` schema (`male` | `female` | `nonbinary` | `unknown`). Optional `pronounOverride` for custom pronouns.
Acceptance:
- Schema updated with enum validation.
- Existing members default to `unknown`.
- API returns gender field in member payloads.
Notes: Keep flexible for future expansions (e.g., cultural titles).

### 2. Add pronoun support (M)
Status: [ ]
Derive pronouns from gender if no override: male→he/him, female→she/her, nonbinary/unknown→they/them.
Acceptance:
- Utility `derivePronouns(gender, override?)` returns `{ subject, object, possessive }`.
- Kinship API optionally includes `pronouns` for the subject person (A relative to B) and the referenced person.
Notes: Facilitate future localization (Nepali pronouns: उ / उनी / उनि etc.).

### 3. RelationCode gender extension (H)
Status: [ ]
Include `genderOfA` (the referenced relative) and `genderOfB` (subject) inside `relationCode` for precise term selection.
Acceptance:
- `relationCode` objects carry `gender: 'male'|'female'|'nonbinary'|'unknown'` for the relative.
- Localization engine chooses gendered variant when available.
Notes: Distinguish whose gender drives the label (the relative, not the subject).

### 4. Maternal/paternal side inference (H)
Status: [ ]
Determine if an ancestor relationship flows through mother or father chain; set `side: 'maternal'|'paternal'|'ambiguous'`.
Acceptance:
- BFS/DFS inference chooses any valid path; if both maternal and paternal paths exist → ambiguous.
- `relationCode.side` populated for ancestor/collateral (aunt/uncle) and niece/nephew cases.
Notes: Enables Nepali side-specific forms later (e.g., काका vs फुपु distinctions).

### 5. Affinal detailed mapping (H)
Status: [ ]
Refine in-law terms by genders: spouse’s brother (सालो vs देवर vs जेठा), spouse’s sister (साली vs जेठानी vs भाउजय) etc.
Acceptance:
- Add structured affinal map keyed by relation base + genders + (older/younger optional).
- Fallback to neutral if specific not found.
Notes: Age rank support (#20) may be prerequisite for some distinctions.

### 6. Nepali kin term taxonomy (H)
Status: [ ]
Enumerate canonical Nepali terms with English gloss and usage notes.
Acceptance:
- Markdown section or JSON comment block listing terms: ससुरा (father-in-law), सासू (mother-in-law), देवर (husband’s younger brother), जेठा (husband’s elder brother), भाउजू (elder brother’s wife), श्रीमती (wife), पति (husband), दाइ (older brother), भाई (younger brother), दिदी (older sister), बहिनी (younger sister), सालो (wife’s brother), साली (wife’s sister), भिनाजु (sister’s husband), जेठानी (husband’s elder brother’s wife), कान्छी भाउजू (husband’s younger brother’s wife), इत्यादि.
Notes: Provide neutral composite forms for UI when specificity unknown.

### 7. English gendered terms (M)
Status: [ ]
Implement male/female versions: father/mother, grandfather/grandmother, uncle/aunt, nephew/niece, son/daughter.
Acceptance:
- Locale supports `neutral`, `male`, `female` sections per tier.
- Fallback gracefully to neutral.
Notes: Nonbinary fallback stays neutral.

### 8. Locale structure redesign (H)
Status: [ ]
Reshape `kinship-locales.json` sections to:
```json
"ancestor": {"neutral": {...}, "male": {...}, "female": {...}}
```
with each sub-object supporting `level1`, `level2`, `levels`, `greatPrefix`, `root`.
Acceptance:
- JSON updated; old keys preserved minimally or migrated.
- Loader backward-compatible or migration script provided.
Notes: Document schema in comments.

### 9. Localization engine upgrade (H)
Status: [ ]
Update `localizeKinship` to select gendered variant: if `relationCode.gender` & locale[section][gender], use that; else neutral.
Acceptance:
- Tests show correct fallback order.
- Affinal overrides also gender-aware.
Notes: Avoid performance regressions (cache parsed locale).

### 10. Update classification meta (H)
Status: [ ]
During classification, attach `gender` for the relative (look up Member.gender); attach `side` for ancestor/collateral.
Acceptance:
- `kinshipBetween` returns meta with enriched relationCode.
- No change for unrelated cases.
Notes: Keep optional to avoid breaking existing consumers.

### 11. SEO-focused comments (M)
Status: [ ]
Add descriptive comments in localization code and JSON explaining Nepali terms and their English translations to aid future indexing.
Acceptance:
- Comments present above each major mapping block.
Notes: Keep concise but keyword-rich.

### 12. Migrations (M)
Status: [ ]
Backfill members: set `gender: 'unknown'` where missing; optional script to infer from name lists.
Acceptance:
- Migration script executes without data loss.
- Admin endpoint to bulk update genders.
Notes: Provide dry-run mode.

### 13. API changes (M)
Status: [ ]
Extend kinship responses: `genderedLabel`, `neutralLabel`, `pronouns`.
Acceptance:
- Client can request `?includePronouns=true`.
Notes: Maintain backward compatibility.

### 14. Client UI enhancements (M)
Status: [ ]
Display/edit gender; toggle ‘Use gendered labels’. Show pronouns optionally.
Acceptance:
- KinshipPanel renders both forms when toggle active.
Notes: Add accessibility hints.

### 15. Testing plan (H)
Status: [ ]
Unit tests for: gender fallback, side inference ambiguous case, affinal selection by gender.
Acceptance:
- Minimum coverage thresholds met for new functions.
Notes: Include snapshot tests for locale outputs.

### 16. Edge cases enumeration (M)
Status: [ ]
Document ambiguous or multiple paths (dual maternal/paternal), unknown gender, cycles, missing parent data.
Acceptance:
- Section added to README or dedicated MD.
Notes: Guides future debugging.

### 17. Performance check (L)
Status: [ ]
Ensure side inference scales; memoize parent lineage sets per member.
Acceptance:
- Profiling shows negligible increase in kinship latency (<10%).
Notes: Consider caching in request scope.

### 18. Security & validation (M)
Status: [ ]
Validate gender updates (enum only); sanitize pronoun overrides; audit logs for bulk changes.
Acceptance:
- Server rejects invalid gender values.
Notes: Add tests.

### 19. Documentation updates (H)
Status: [ ]
Update `KINSHIP-LOCALIZATION.md` with gender, side, pronoun selection logic and examples (English & Nepali).
Acceptance:
- Contains example JSON fragments.
Notes: Link from README.

### 20. Optional age rank support (L)
Status: [ ]
Add sibling age ordering (`olderSibling` vs `youngerSibling`) and integrate with Nepali (दाइ/भाइ, दिदी/बहिनी, जेठा/काका distinctions).
Acceptance:
- Schema adds `birthOrderIndex` or compute from DOB.
- Localization uses rank when available.
Notes: Age rank may refine in-law terms (e.g., जेठानी).

---
## Implementation Order Suggestion
1 → 3 → 8 → 9 → 10 → 6/7 → 5 → 13 → 14 → 11/19 → 15 → 16 → 12 → 17 → 18 → 20.

## Fallback Hierarchy (Gendered Labels)
`specificGenderVariant` → `neutralVariant` → current generic English form.

## Example Future Locale Shape (Fragment)
```json
"ancestor": {
  "neutral": {"level1": "parent", "level2": "grandparent", "greatPrefix": "great-", "root": "grandparent"},
  "male":   {"level1": "father", "level2": "grandfather", "greatPrefix": "great-", "root": "grandfather"},
  "female": {"level1": "mother", "level2": "grandmother", "greatPrefix": "great-", "root": "grandmother"}
}
```

## Side Inference Notes
- Paternal path: lineage hops where parent edge references a male member.
- Maternal path: lineage hops where parent edge references a female member.
- Ambiguous: both possible or unknown gender at deciding generation.

## Nepali Term Gloss (Initial Subset)
| Nepali | English gloss | Notes |
|--------|----------------|-------|
| ससुरा | father-in-law | Husband or wife's father |
| सासू | mother-in-law | Husband or wife's mother |
| सालो | wife's brother | Requires spouse female; variant of brother-in-law |
| साली | wife's sister | Female sibling of wife |
| देवर | husband's younger brother | Requires spouse male + younger distinction |
| जेठा | husband's elder brother | Age rank needed |
| भाउजू | elder brother's wife | Age rank + sibling gender |
| जेठानी | elder husband's brother's wife | Compound in-law |
| भिनाजु | sister's husband | Affinal via sibling |
| बुहारी | daughter-in-law | Child's spouse (son's wife) |
| ज्वाइँ | son-in-law | Child's spouse (daughter's husband) |

## Open Questions
- Should we store side explicitly or always infer?
- Provide user override for ambiguous side/gendered term?
- Nonbinary kin terms: keep neutral or add custom mappings?

---
## Completion Tracking
Update the status boxes above as tasks are implemented. Consider linking commits by hash next to each item once complete.
