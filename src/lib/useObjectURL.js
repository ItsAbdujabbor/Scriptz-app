import { useEffect, useState } from 'react'

export function useObjectURL(source) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!source) {
      setUrl('')
      return undefined
    }
    const next = URL.createObjectURL(source)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [source])
  return url
}
