/**
 * ThumbBackgroundFX — base canvas + center-weighted dot grid.
 *
 * The bottom shadow that fades messages into the input bar is rendered
 * separately by `ThumbnailGenerator` as a sibling of the footer chrome
 * inside `.coach-chat-shell`. That shared stacking context lets the
 * input bar's z-index 20 win over the shadow's z-index 5, putting the
 * bar on top while messages dissolve into the gradient behind it.
 */
import './ThumbBackgroundFX.css'

export function ThumbBackgroundFX() {
  return <div className="thumb-bg-fx" aria-hidden="true" />
}
