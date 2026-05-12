/**
 * Chat-thread loading state.
 *
 * A single Lottie animation centered in the thread area while
 * messages for the selected conversation are fetched. The asset is
 * `src/assets/loading.lottie` (dotLottie format), played with
 * @lottiefiles/dotlottie-react.
 *
 * Component name kept as ChatHistorySkeleton so the import sites in
 * ThumbnailGenerator don't change. Styling lives in
 * ./ChatHistorySkeleton.css.
 */

import { DotLottieReact } from '@lottiefiles/dotlottie-react'

import loadingLottieUrl from '../assets/loading.lottie?url'
import './ChatHistorySkeleton.css'

export function ChatHistorySkeleton({ leaving = false, label = 'Loading conversation' }) {
  return (
    <div
      className={`chat-loader ${leaving ? 'chat-loader--leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <DotLottieReact src={loadingLottieUrl} loop autoplay className="chat-loader__lottie" />
    </div>
  )
}

export default ChatHistorySkeleton
