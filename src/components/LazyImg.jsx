export function LazyImg({ src, alt = '', className = '', ...rest }) {
  return <img src={src} alt={alt} className={className} {...rest} />
}
