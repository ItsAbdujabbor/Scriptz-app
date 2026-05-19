// Shared module-scope constants for the thumbnail generator surface.
// Extracted so both ThumbnailGenerator.jsx and the sibling presentational
// modules (dialogs, etc.) reference the exact same values.

const IOS_EASE = [0.32, 0.72, 0, 1]

const DISLIKE_REASONS = [
  { id: 'generic', label: 'Too generic' },
  { id: 'style', label: 'Wrong style' },
  { id: 'colors', label: 'Colors are off' },
  { id: 'quality', label: 'Low quality' },
  { id: 'subject', label: 'Subject unclear' },
  { id: 'text', label: 'Text hard to read' },
  { id: 'niche', label: "Doesn't fit my niche" },
  { id: 'other', label: 'Other' },
]

const ANALYZE_DISLIKE_REASONS = [
  { id: 'score_high', label: 'Score seems too high' },
  { id: 'score_low', label: 'Score seems too low' },
  { id: 'recommendations', label: 'Recommendations not helpful' },
  { id: 'missed_issues', label: 'Missed key issues' },
  { id: 'niche', label: "Doesn't fit my niche" },
  { id: 'other', label: 'Other' },
]

export { IOS_EASE, DISLIKE_REASONS, ANALYZE_DISLIKE_REASONS }
