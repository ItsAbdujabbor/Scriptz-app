import faqHtml from '../sections/faq/faq.html?raw'

export function Faq() {
  return (
    <section
      id="landing-faq"
      dangerouslySetInnerHTML={{ __html: faqHtml }}
    />
  )
}

