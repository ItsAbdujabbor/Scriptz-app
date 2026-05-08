export function DemoModal() {
  return (
    <div
      id="demo-modal"
      className="landing-demo-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-modal-title"
      aria-hidden="true"
    >
      <div className="landing-demo-modal-backdrop" data-close-demo />
      <div className="landing-demo-modal-content">
        <button
          type="button"
          className="landing-demo-modal-close"
          aria-label="Close"
          data-close-demo
        >
          ×
        </button>
        <h2 id="demo-modal-title" className="visually-hidden">
          Watch Demo
        </h2>
        <div className="landing-demo-video-wrap">
          <div className="landing-demo-video-placeholder">
            <span className="landing-demo-play-icon" aria-hidden="true">
              ▶
            </span>
            <p>Video placeholder — replace with embedded demo (YouTube/Vimeo)</p>
          </div>
        </div>
      </div>
    </div>
  )
}
