/** Shared YouTube video URL detection (watch + short links). */
export const YOUTUBE_URL_RE =
  /https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]+/

export function extractYoutubeUrl(text) {
  const m = String(text || '').match(YOUTUBE_URL_RE)
  return m ? m[0] : null
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
