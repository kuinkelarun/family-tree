/**
 * Pronoun derivation utility.
 * Given a gender value and optional override string, returns a pronoun set.
 * Override format: "subject|object|possessive" (e.g., "he|him|his").
 * Nonbinary & unknown default to they/them/their for inclusivity.
 *
 * SEO note: Explicit pronoun fields can enhance accessibility-oriented search queries
 * around genealogical records and inclusive family history documentation.
 */
export function derivePronouns(gender, override) {
  if (override && typeof override === 'string' && override.includes('|')) {
    const [subject, object, possessive] = override.split('|').map(s => s.trim()).filter(Boolean);
    if (subject && object && possessive) return { subject, object, possessive };
  }
  switch (gender) {
    case 'male': return { subject: 'he', object: 'him', possessive: 'his' };
    case 'female': return { subject: 'she', object: 'her', possessive: 'her' };
    // nonbinary & unknown share neutral pronouns
    default: return { subject: 'they', object: 'them', possessive: 'their' };
  }
}

/**
 * Optional Nepali pronoun mapping placeholder.
 * Future enhancement: localize pronouns by locale (e.g., male → "उनी", female → "उनी", neutral → "उ"/context-based).
 */
export function deriveLocalePronouns(gender, locale) {
  // Simple English-only for now; extend later.
  return derivePronouns(gender);
}
