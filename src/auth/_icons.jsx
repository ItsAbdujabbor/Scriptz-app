/**
 * Shared icon set for the auth screens. Each icon takes the surrounding
 * font color (currentColor) so callers control the tint. Sized with explicit
 * width/height — they're meant to live inside fixed slots (field icon area,
 * pwd toggle, alert glyph, etc.).
 */

export const MailIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
    <path d="M3 6l7 5 7-5" />
  </svg>
)

export const LockIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3.5" y="9" width="13" height="8" rx="2" />
    <path d="M7 9V6a3 3 0 016 0v3" />
  </svg>
)

export const EyeIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 4.5C5.6 4.5 2.5 10 2.5 10s3.1 5.5 7.5 5.5 7.5-5.5 7.5-5.5S14.4 4.5 10 4.5z" />
    <circle cx="10" cy="10" r="2.6" />
  </svg>
)

export const EyeOffIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 3l14 14" />
    <path d="M8.4 8.7a3 3 0 004 4" />
    <path d="M3.7 5.3A12 12 0 002 10s3.1 5.5 7.5 5.5c1.7 0 3.3-.6 4.6-1.5" />
    <path d="M7 4.4A8.5 8.5 0 0110 4c4.4 0 7.5 5.5 7.5 5.5a13 13 0 01-2.1 2.7" />
  </svg>
)

export const ArrowLeftIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 3l-5 5 5 5" />
    <path d="M5 8h8" />
  </svg>
)

export const ArrowRightIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8h10m0 0L9 4m4 4l-4 4" />
  </svg>
)

export const CheckCircleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12l3 3 5-6" />
  </svg>
)

export const AlertIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4M12 16h.01" />
  </svg>
)

export const InfoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8h.01M11 12h1v4h1" />
  </svg>
)

export const KeyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="8" cy="15" r="4" />
    <path d="M10.85 12.15L19 4l3 3-3 3-2-2-2 2-2-2-2.15 2.15z" />
  </svg>
)

export const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M12 8v4M12 16h.01" />
  </svg>
)

export const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3c-1.2 5.4-5.4 9-9 9 3.6 0 7.8 3.6 9 9 1.2-5.4 5.4-9 9-9-3.6 0-7.8-3.6-9-9z" />
  </svg>
)

/* Google "G" — full-color; never recolor via currentColor. */
export const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.44c-.28 1.48-1.12 2.73-2.39 3.58v2.97h3.86c2.26-2.09 3.58-5.17 3.58-8.79z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-2.97c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.27 14.32c-.25-.72-.38-1.49-.38-2.32s.14-1.6.38-2.32V6.59H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.41l3.98-3.09z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.59l3.98 3.09c.95-2.85 3.6-4.93 6.73-4.93z"
    />
  </svg>
)

/* Apple logo — single-color (uses currentColor so it adapts to the
 * surrounding text color). Standard "Sign in with Apple" glyph,
 * proportioned to sit inside the same 22px white circular slot as the
 * Google "G" without looking too small or off-center. */
export const AppleIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
    />
  </svg>
)
