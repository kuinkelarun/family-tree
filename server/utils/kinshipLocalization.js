import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Lazy load JSON to avoid assert syntax issues across Node versions.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesPath = path.resolve(__dirname, '../data/kinship-locales.json');
let localesCache = null;
function getLocales() {
  if (!localesCache) {
    const raw = fs.readFileSync(localesPath, 'utf-8');
    localesCache = JSON.parse(raw);
  }
  return localesCache;
}

/**
 * Localize a kinship classification to a human-readable label.
 * - Supports gender-aware selection using relationCode.gender: 'male'|'female'|'nonbinary'|'unknown'.
 * - Falls back to neutral when gender-specific mapping is not available.
 * - Affinal (in-law) forms: prefers explicit overrides per type; otherwise applies affinalSuffix.
 *
 * SEO note: We retain canonical English/Nepali kinship terms (e.g., grandfather/हजुरबा) which
 * improves semantic indexing for genealogy search queries in multilingual contexts.
 */
export function localizeKinship(result, locale = 'en', options = {}) {
  const locales = getLocales();
  const dict = locales[locale] || locales['en'];
  const code = result?.meta?.relationCode;
  const affinal = !!result?.meta?.affinal;
  const desiredGender = normalizeGender(options.forceGender || code?.gender || 'neutral');

  const affinalizeOut = (type, baseLabel, level) => {
    if (!affinal) return baseLabel;
    // Try affinal overrides per relation type first
    if (dict.affinal) {
      if ((type === 'ancestor' || type === 'descendant' || type === 'aunt_uncle' || type === 'niece_nephew') && dict.affinal[type]) {
        const section = resolveTierSection(dict.affinal[type], desiredGender);
        const over = formatTier(section, level || 1);
        if (over) return over;
      }
      if (type === 'sibling') {
        // Prefer spouse-gender-aware mapping if we know it
        const spouseGender = result?.meta?.affinalSpouseGender;
        const hasMatrix = dict.affinal.siblingBySpouseGender && (dict.affinal.siblingBySpouseGender[spouseGender] || dict.affinal.siblingBySpouseGender.neutral);
        if (spouseGender && hasMatrix) {
          return dict.affinal.siblingBySpouseGender[spouseGender] || dict.affinal.siblingBySpouseGender.neutral;
        }
        if (typeof dict.affinal.sibling === 'string' && dict.affinal.sibling) {
          return dict.affinal.sibling;
        }
      }
    }
    // Fallback to suffix strategy
    return baseLabel + (dict.affinalSuffix || ' in-law');
  };

  if (!code) return affinalizeOut('unknown', result?.label || '', 1);

  switch (code.type) {
    case 'self': return dict.self;
    case 'spouse': return dict.spouse;
    case 'ancestor': {
      const sec = resolveTierSection(dict.ancestor, desiredGender);
      return affinalizeOut('ancestor', formatTier(sec, code.level), code.level);
    }
    case 'descendant': {
      const sec = resolveTierSection(dict.descendant, desiredGender);
      return affinalizeOut('descendant', formatTier(sec, code.level), code.level);
    }
    case 'sibling': {
      const base = code.half ? dict.sibling.half : dict.sibling.full;
      return affinalizeOut('sibling', base, 1);
    }
    case 'step': return dict.step[code.role] || result.label;
    case 'aunt_uncle': {
      const sec = resolveTierSection(dict.aunt_uncle, desiredGender);
      return affinalizeOut('aunt_uncle', formatTier(sec, code.level), code.level);
    }
    case 'niece_nephew': {
      const sec = resolveTierSection(dict.niece_nephew, desiredGender);
      return affinalizeOut('niece_nephew', formatTier(sec, code.level), code.level);
    }
    case 'cousin': return affinalizeOut('cousin', formatCousin(dict.cousin, code.degree, code.removal), 1);
    case 'related_undetermined': return dict.related_undetermined;
    case 'unrelated': return dict.unrelated;
    default: return affinalizeOut(code.type || 'unknown', result?.label || '', 1);
  }
}

// Normalize gender to supported buckets for localization selection
function normalizeGender(g) {
  if (g === 'male' || g === 'female') return g;
  return 'neutral'; // nonbinary/unknown → neutral fallback
}

// Resolve a tier section to the gender-specific sub-block if present, otherwise neutral, otherwise legacy top-level.
function resolveTierSection(section, gender) {
  if (!section) return section;
  if (section[gender]) return section[gender];
  if (section.neutral) return section.neutral;
  return section; // backward-compatible keys (level1/level2...) live here
}

function formatTier(section, level) {
  if (!section) return '';
  // Explicit per-level override takes highest precedence
  if (section.levels && section.levels[String(level)]) {
    return section.levels[String(level)];
  }
  if (level === 1) return section.level1;
  if (level === 2) return section.level2;
  const n = level - 2;
  // Prefer prefix repetition if provided
  if (section.greatPrefix && section.root) {
    return `${section.greatPrefix.repeat(n)}${section.root}`;
  }
  // Fallback: try to expand templates containing 'great-{n}-' by repeating 'great-'
  if (section.greatTemplate) {
    let tpl = section.greatTemplate;
    if (tpl.includes('great-{n}-')) {
      tpl = tpl.replace('great-{n}-', 'great-'.repeat(n));
      return tpl;
    }
    // For templates like 'परहजुर{n}-बा/आमा' or 'परनाति{n}', drop the number for n=1 and remove placeholder otherwise.
    if (n === 1) return tpl.replace('{n}', '');
    return tpl.replace('{n}', '');
  }
  return '';
}

function formatCousin(cDict, degree, removal) {
  if (!cDict) return '';
  const ord = cDict.ordinals?.[String(degree)] || `${degree}th`;
  const base = (cDict.degreeTemplate || '{ordinal} cousin').replace('{ordinal}', ord);
  if (!removal) return base;
  if (removal === 1) return (cDict.removedOnce || '{base} once removed').replace('{base}', base);
  if (removal === 2) return (cDict.removedTwice || '{base} twice removed').replace('{base}', base);
  return (cDict.removedMany || '{base} {n} times removed').replace('{base}', base).replace('{n}', removal);
}
