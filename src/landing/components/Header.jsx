import headerHtml from '../header/header.html?raw'

export function Header() {
  return <div dangerouslySetInnerHTML={{ __html: headerHtml }} />
}

