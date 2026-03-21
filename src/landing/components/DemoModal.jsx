import demoModalHtml from '../demo-modal/demo-modal.html?raw'

export function DemoModal() {
  return (
    <div
      id="landing-demo-modal"
      dangerouslySetInnerHTML={{ __html: demoModalHtml }}
    />
  )
}

