import { useState } from 'react'

/**
 * Image from /public that shows a plain grey box until the file exists.
 * Figma assets are added by the owner later; never reference Figma URLs.
 */
export function AssetImg({
  src,
  className = '',
  placeholderClassName = 'bg-line',
}: {
  src: string
  className?: string
  placeholderClassName?: string
}) {
  const [loaded, setLoaded] = useState(false)
  return (
    <span aria-hidden className={`block shrink-0 ${loaded ? '' : placeholderClassName} ${className}`}>
      <img
        src={src}
        alt=""
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(false)}
        className={`size-full object-cover ${loaded ? '' : 'invisible'}`}
      />
    </span>
  )
}
