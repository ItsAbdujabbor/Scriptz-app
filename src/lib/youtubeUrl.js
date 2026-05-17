/** Shared YouTube video URL detection (watch + short links). */
export const YOUTUBE_URL_RE =
  /https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]+/

export function extractYoutubeUrl(text) {
  const m = String(text || '').match(YOUTUBE_URL_RE)
  return m ? m[0] : null
}

/** Pull the 11-char video id out of a watch or youtu.be URL. */
export function extractYoutubeVideoId(text) {
  const url = extractYoutubeUrl(text)
  if (!url) return null
  const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

/**
 * Deterministic fallback thumbnail URL straight from YouTube's CDN.
 * Used when our backend preview lookup fails but the link is still a
 * valid YouTube video — lets the user proceed instead of being blocked
 * by a transient preview failure. `hqdefault` always exists for a
 * public video (unlike `maxresdefault`).
 */
export function youtubeThumbnailFromUrl(text) {
  const id = extractYoutubeVideoId(text)
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}

/** Optional video URL row + prompt body (same as one textarea). */
export function buildCombinedPromptMessage(videoUrl, promptBody) {
  const v = String(videoUrl || '').trim()
  const p = String(promptBody || '').trim()
  if (v && p) return `${v}\n\n${p}`
  if (v) return v
  if (p) return p
  return ''
}
