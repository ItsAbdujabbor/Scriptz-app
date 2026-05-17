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

import { Component } from 'react'
import { DotLottieReact } from '@lottiefiles/dotlottie-react'

import loadingLottieUrl from '../assets/loading.lottie?url'
import './ChatHistorySkeleton.css'

/**
 * Guards the DotLottie player so a failed animation load (bad asset,
 * WASM/runtime error) degrades to a plain CSS spinner instead of
 * tearing down the surrounding chat thread.
 */
class LottieErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null
    }
    return this.props.children
  }
}

export function ChatHistorySkeleton({ leaving = false, label = 'Loading conversation' }) {
  return (
    <div
      className={`chat-loader ${leaving ? 'chat-loader--leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <LottieErrorBoundary fallback={<div className="chat-loader__spinner" aria-hidden="true" />}>
        <DotLottieReact src={loadingLottieUrl} loop autoplay className="chat-loader__lottie" />
      </LottieErrorBoundary>
    </div>
  )
}

export default ChatHistorySkeleton
