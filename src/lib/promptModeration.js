/**
 * Client-side prompt moderation — a SOFT check that inspects a user's prompt
 * for signs they're trying to generate or reference a real public figure.
 *
 * Non-blocking by design: we return a warning the UI can surface, but never
 * auto-reject. The backend remains the source of truth for policy
 * enforcement; this is just a usability nudge so creators know up-front that
 * impersonation isn't supported.
 *
 * The list is intentionally short and well-known. It's not exhaustive — the
 * goal is to catch the most obvious prompts, not to be a content filter.
 */

// Well-known names (lowercased). Keep short; this is a nudge, not a block.
const FLAGGED_NAMES = [
  // Creators / YouTubers
  'mrbeast',
  'mr beast',
  'jimmy donaldson',
  'pewdiepie',
  'pewd iepie',
  'markiplier',
  'jacksepticeye',
  'logan paul',
  'jake paul',
  'kai cenat',
  'ishowspeed',
  'i show speed',
  'mkbhd',
  'marques brownlee',
  'casey neistat',
  'joe rogan',
  'lex fridman',

  // Tech & business
  'elon musk',
  'mark zuckerberg',
  'bill gates',
  'jeff bezos',
  'steve jobs',
  'tim cook',
  'sam altman',
  'sundar pichai',

  // Political / public figures (very recognisable)
  'donald trump',
  'joe biden',
  'barack obama',
  'kamala harris',
  'vladimir putin',
  'volodymyr zelensky',

  // Music / entertainment (high-likeness risk)
  'taylor swift',
  'beyonce',
  'beyoncé',
  'drake',
  'kanye west',
  'ye',
  'rihanna',
  'ariana grande',
  'billie eilish',
  'the weeknd',
  'bad bunny',
  'justin bieber',
  'selena gomez',

  // Sports
  'lionel messi',
  'cristiano ronaldo',
  'lebron james',
  'michael jordan',
  'kylian mbappe',

  // Actors (very recognisable faces)
  'dwayne johnson',
  'the rock',
  'keanu reeves',
  'tom cruise',
  'tom holland',
  'timothée chalamet',
  'timothee chalamet',
  'zendaya',
  'scarlett johansson',
  'brad pitt',
  'leonardo dicaprio',
]

const IMPERSONATION_VERBS = [
  'deepfake',
  'face swap',
  'faceswap',
  'face-swap',
  'impersonate',
  'impersonating',
  'look exactly like',
  'look like a real',
  'pretend to be',
  'pretending to be',
  'clone of',
  'in the style of a real',
]

/**
 * @param {string} prompt
 * @returns {{ ok: boolean, reason: null | 'real-person' | 'impersonation', matched: string | null }}
 */
export function checkPromptForRealPerson(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return { ok: true, reason: null, matched: null }
  }
  const haystack = prompt.toLowerCase()

  // 1) Exact well-known name hit (guarded by word boundaries to avoid false positives
  //    like "drake equation"). For multi-word names we just substring-match.
  for (const name of FLAGGED_NAMES) {
    if (name.includes(' ')) {
      if (haystack.includes(name)) return { ok: false, reason: 'real-person', matched: name }
    } else {
      const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      if (re.test(haystack)) return { ok: false, reason: 'real-person', matched: name }
    }
  }

  // 2) Impersonation-intent phrases (catches "deepfake my competitor",
  //    "make me look exactly like the CEO of X", etc.)
  for (const phrase of IMPERSONATION_VERBS) {
    if (haystack.includes(phrase)) return { ok: false, reason: 'impersonation', matched: phrase }
  }

  return { ok: true, reason: null, matched: null }
}

/**
 * Human-readable warning message for a given check result. The message is
 * phrased as guidance, not an accusation — we don't want to scare legitimate
 * creators whose video topic happens to mention a public figure.
 */
export function warningMessageFor(result) {
  if (!result || result.ok) return ''
  if (result.reason === 'real-person') {
    return `Prompts referencing real public figures (e.g. "${result.matched}") aren't supported. Scriptz AI is for original characters and content you have rights to.`
  }
  if (result.reason === 'impersonation') {
    return `Phrases like "${result.matched}" suggest impersonation, which isn't supported. Describe an original character instead.`
  }
  return ''
}
