import footerHtml from '../footer/footer.html?raw'

export function Footer() {
  return (
    <footer
      id="landing-footer"
      dangerouslySetInnerHTML={{ __html: footerHtml }}
    />
  )
}

