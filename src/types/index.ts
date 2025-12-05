import type {
  SanityImageCrop,
  SanityImageHotspot,
} from '@sanity/image-url'
import type { JSONContent } from '@tiptap/react'
import type { Image } from '@/gel.interfaces'

export type {
  EdiblePart,
  Gender,
  PlantingMethod,
  SourceType,
  Stratum,
  TipSubject,
  VegetableLifeCycle,
  VegetableUsage,
} from '@/gel.interfaces'

export type FormOption = {
  value: string
  label: string
  description?: string
}

export type ReferenceObjectType = 'Vegetable' | 'UserProfile' | 'Tag'

export type ReferenceValueType = 'id' | 'handle'

export type ReferenceOption = {
  value: string
  label: string
  objectType: ReferenceObjectType
  keywords?: string[]
  image?: ImageForRendering | null
}

export type ImageForRendering = Pick<Image, 'sanity_id'> & {
  hotspot?: SanityImageHotspot | unknown
  crop?: SanityImageCrop | unknown
  label?: Image['label'] | undefined
}

export type TiptapNode = JSONContent

export type NextSearchParams = {
  [query: string]: string | string[]
}
