import heroHtml from '../hero/hero.html?raw'

export function Hero() {
  return (
    <section
      id="landing-hero"
      dangerouslySetInnerHTML={{ __html: heroHtml }}
    />
  )
}

