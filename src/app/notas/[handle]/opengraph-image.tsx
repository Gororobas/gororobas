import type { SanityImageHotspot } from '@sanity/image-url'
import { notFound } from 'next/navigation'
import { ImageResponse } from 'next/og'
import type { CSSProperties } from 'react'
import GororobasLogo from '@/components/icons/GororobasLogo'
import type { TiptapNode } from '@/types'
import { getImageProps } from '@/utils/getImageProps'
import { NOTE_TYPE_TO_LABEL } from '@/utils/labels'
import { truncate } from '@/utils/strings'
import { tiptapJSONtoPlainText } from '@/utils/tiptap'
import { pathToAbsUrl } from '@/utils/urls'
import { getNoteRouteData } from './page'

export const dynamic = 'force-dynamic'

export const size = {
  width: 512,
  height: 512,
}

export const contentType = 'image/png'

/** Adaptation of SanityImage that runs in @vercel/og and doesn't require client components */
function StaticSanityImage({
  alt,
  ...props
}: {
  applyHotspot?: boolean
} & Partial<
  React.DetailedHTMLProps<
    React.ImgHTMLAttributes<HTMLImageElement>,
    HTMLImageElement
  >
> &
  Parameters<typeof getImageProps>[0]) {
  const imageProps = getImageProps(props)

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
  const style = {
    ...hotspotStyle,
    ...imageProps.style,
    ...props.style,
  }

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
    <img key={imageProps.src} {...elProps} {...imageProps} style={style} />
  )
}

export default async function Image({
  params,
}: {
  params: { handle: string }
}) {
  const note = await getNoteRouteData(params.handle)
  const regularFontData = await fetch(
    new URL(pathToAbsUrl('/fonts/PlusJakartaSans-Regular.ttf')),
  ).then((res) => res.arrayBuffer())

  const semiboldFontData = await fetch(
    new URL(pathToAbsUrl('/fonts/PlusJakartaSans-SemiBold.ttf')),
  ).then((res) => res.arrayBuffer())

  if (!note) return notFound()

  return new ImageResponse(
    (
      <div
        style={{
          padding: '0rem',
          display: 'flex',
          width: '100%',
          height: '100%',
          flexDirection: 'column',
          background: 'transparent',
        }}
      >
        <div
          style={{
            flex: '1',
            background: 'rgb(254, 249, 195)',
            border: '2px solid rgb(254, 240, 138)',
            display: 'flex',
            flexDirection: 'column',
            padding: '1rem',
            gap: '1rem',
            borderRadius: '0.5rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
          >
            {note.published_at && (
              <time
                dateTime={note.published_at.toISOString()}
                style={{ color: 'rgb(133, 77, 14)', fontSize: '1.25rem' }}
              >
                {note.published_at.toLocaleDateString('pt-BR', {
                  month: '2-digit',
                  day: '2-digit',
                  year: 'numeric',
                })}
              </time>
            )}
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {note.types.slice(0, 2).map((type) => (
                <div
                  key={type}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '9999px',
                    border: '1px solid rgb(253, 230, 138)',
                    backgroundColor: 'rgb(254, 243, 199)',
                    color: 'rgb(146, 64, 14)',
                    padding: '0.5rem 0.75rem',
                    fontSize: '1.25rem',
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    fontWeight: 600,
                    transition: 'colors',
                  }}
                >
                  {NOTE_TYPE_TO_LABEL[type]}
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              color: 'rgb(66, 32, 6)', // yellow-950
              fontSize: '2rem',
              lineHeight: 1.1,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxHeight: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {truncate(
              tiptapJSONtoPlainText(note.title as TiptapNode) || '',
              225,
            )
              .split('\n')
              .map((line, index) => (
                // biome-ignore lint: index is all we have and it won't change, no need to be keyed
                <div key={index}>{line}</div>
              ))}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              {note.created_by?.photo && (
                <StaticSanityImage
                  image={note.created_by.photo}
                  maxWidth={48}
                  style={{
                    width: '3rem',
                    height: '3rem',
                    borderRadius: '9999px',
                    objectFit: 'cover',
                  }}
                />
              )}
              <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                {truncate(note.created_by?.name || '', 40)}
              </div>
            </div>
            <GororobasLogo />
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      emoji: 'noto',
      fonts: [
        {
          name: 'Jakarta',
          data: regularFontData,
          style: 'normal',
          weight: 400,
        },
        {
          name: 'Jakarta',
          data: semiboldFontData,
          style: 'normal',
          weight: 600,
        },
      ],
    },
  )
}
