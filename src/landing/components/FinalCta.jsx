import finalCtaHtml from '../sections/final-cta/final-cta.html?raw'

export function FinalCta() {
  return (
    <section
      id="landing-final-cta"
      dangerouslySetInnerHTML={{ __html: finalCtaHtml }}
    />
  )
}

