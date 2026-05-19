/* ─────────────────────────────────────────────────────────────────────
 * ICON WRAPPERS — thin pass-throughs over `lucide-react` so the rest of
 * the file keeps using `<IconPaperclip />`, `<IconArrowUp />`, etc.
 * exactly as before. Lucide gives us refined rounded line-caps and a
 * uniform stroke weight, which reads as the modern AI-app icon style.
 * `strokeWidth: 2.2` is a hair thicker than the default 2 — tightens
 * the visual density at small sizes (16-22 px).
 * ─────────────────────────────────────────────────────────────────── */
import {
  ArrowUp as LucideArrowUp,
  Check as LucideCheck,
  CloudUpload as LucideUploadCloud,
  Copy as LucideCopy,
  Download as LucideDownload,
  Pencil as LucidePencil,
  RefreshCw as LucideRefreshCw,
  Sparkles as LucideSparkles,
} from 'lucide-react'

export function IconCopy(props) {
  return <LucideCopy strokeWidth={2.2} {...props} />
}

export function IconArrowUp(props) {
  return <LucideArrowUp strokeWidth={2.4} {...props} />
}

export function IconCheck(props) {
  return <LucideCheck strokeWidth={2.5} {...props} />
}

export function IconPaperclip(props) {
  // Custom add-image glyph (src/assets/add-image.svg) — fill-based
  // icon that replaces the previous Lucide paperclip. Name kept for
  // backwards-compat with existing call sites.
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="m12,21c0,.553-.448,1-1,1h-6c-2.757,0-5-2.243-5-5V5C0,2.243,2.243,0,5,0h12c2.757,0,5,2.243,5,5v6c0,.553-.448,1-1,1s-1-.447-1-1v-6c0-1.654-1.346-3-3-3H5c-1.654,0-3,1.346-3,3v6.959l2.808-2.808c1.532-1.533,4.025-1.533,5.558,0l5.341,5.341c.391.391.391,1.023,0,1.414-.195.195-.451.293-.707.293s-.512-.098-.707-.293l-5.341-5.341c-.752-.751-1.976-.752-2.73,0l-4.222,4.222v2.213c0,1.654,1.346,3,3,3h6c.552,0,1,.447,1,1ZM15,3.5c1.654,0,3,1.346,3,3s-1.346,3-3,3-3-1.346-3-3,1.346-3,3-3Zm0,2c-.551,0-1,.448-1,1s.449,1,1,1,1-.448,1-1-.449-1-1-1Zm8,12.5h-3v-3c0-.553-.448-1-1-1s-1,.447-1,1v3h-3c-.552,0-1,.447-1,1s.448,1,1,1h3v3c0,.553.448,1,1,1s1-.447,1-1v-3h3c.552,0,1-.447,1-1s-.448-1-1-1Z" />
    </svg>
  )
}

export function IconDownload(props) {
  return <LucideDownload strokeWidth={2.2} {...props} />
}
export function IconRefresh(props) {
  return <LucideRefreshCw strokeWidth={2.2} {...props} />
}
export function IconEdit(props) {
  return <LucidePencil strokeWidth={2.2} {...props} />
}
export function IconSparkle(props) {
  return <LucideSparkles strokeWidth={2.2} {...props} />
}

export function IconUploadCloud(props) {
  return <LucideUploadCloud strokeWidth={1.8} {...props} />
}
