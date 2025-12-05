'use client'

import type { SanityImageHotspot } from '@sanity/image-url'
import type React from 'react'
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { getImageProps } from '@/utils/getImageProps'

export function SanityImage({
  alt,
  loading = 'lazy',
  ...props
}: {
  loading?: 'lazy' | 'eager'
  /**
   * If this <img> component's size is constrained in ways that force it to have a different
   * aspect-ratio than the native image, then `applyHotspot` will apply a CSS `object-position`
   * to reflect the hotspot selected by editors in Sanity.
   */
  applyHotspot?: boolean
} & Partial<
  React.DetailedHTMLProps<
    React.ImgHTMLAttributes<HTMLImageElement>,
    HTMLImageElement
  >
> &
  Parameters<typeof getImageProps>[0]) {
  const imgRef = useRef<HTMLImageElement>(null)
  const imageProps = getImageProps(props)
  const [loaded, setLoaded] = useState(false)

  const hotspot = props.image?.hotspot as SanityImageHotspot | undefined
  const hotspotStyle: CSSProperties =
    hotspot && props.applyHotspot
      ? {
          objectFit: 'cover',
          objectPosition:
            'x' in hotspot &&
            typeof hotspot.x === 'number' &&
            typeof hotspot.y === 'number'
              ? `${hotspot.x * 100}% ${hotspot.y * 100}%`
              : undefined,
        }
      : {}
  const style: React.CSSProperties = {
    opacity: loaded ? 1 : 0,
    transition: 'opacity 0.15s',
    userSelect: 'none',
    ...hotspotStyle,
    ...imageProps.style,
    ...props.style,
  }

  useEffect(() => {
    // If the image was hydrated *after* it was already loaded, onload below won't be called
    // Let's make sure every loaded image is transitioned into setLoaded(true)
    if (imgRef?.current?.complete && !loaded) {
      setLoaded(true)
    }
  }, [loaded])

  if (!imageProps?.src) {
    return null
  }

  /* eslint-disable */
  const {
    forcedAspectRatio: _f,
    applyHotspot: _a,
    maxWidth: _m,
    image: _i,
    ...elProps
  } = props

  return (
    // biome-ignore lint: alt already provided
    <img
      key={imageProps.src}
      ref={imgRef}
      loading={loading}
      {...elProps}
      alt={alt || props.image.alt || props.image.label || ''}
      {...imageProps}
      style={style}
      onLoad={() => setLoaded(true)}
      onError={() => {
        setLoaded(true)
      }}
      data-loaded={loaded}
      fetchPriority={loading === 'eager' ? 'high' : 'auto'}
    />
  )
}
