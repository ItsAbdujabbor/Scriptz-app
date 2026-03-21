import anotherTenHtml from '../sections/another-10/another-10.html?raw'

export function AnotherTen() {
  return <div dangerouslySetInnerHTML={{ __html: anotherTenHtml }} />
}

