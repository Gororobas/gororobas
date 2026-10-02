import { Schema } from "effect"

const IndustryIdentifier = Schema.Struct({
  type: Schema.String,
  identifier: Schema.String,
})

const Dimensions = Schema.Struct({
  height: Schema.String,
  width: Schema.String,
  thickness: Schema.optional(Schema.String),
})

const ImageLinks = Schema.Struct({
  smallThumbnail: Schema.optional(Schema.String),
  thumbnail: Schema.optional(Schema.String),
  small: Schema.optional(Schema.String),
  medium: Schema.optional(Schema.String),
  large: Schema.optional(Schema.String),
  extraLarge: Schema.optional(Schema.String),
})

const VolumeInfo = Schema.Struct({
  title: Schema.String,
  subtitle: Schema.optional(Schema.String),
  authors: Schema.optional(Schema.Array(Schema.String)),
  publisher: Schema.optional(Schema.String),
  publishedDate: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  industryIdentifiers: Schema.optional(Schema.Array(IndustryIdentifier)),
  pageCount: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  dimensions: Schema.optional(Dimensions),
  printType: Schema.optional(Schema.String),
  mainCategory: Schema.optional(Schema.String),
  categories: Schema.optional(Schema.Array(Schema.String)),
  averageRating: Schema.optional(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
  ratingsCount: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  contentVersion: Schema.optional(Schema.String),
  imageLinks: Schema.optional(ImageLinks),
  language: Schema.optional(Schema.String),
  previewLink: Schema.optional(Schema.String),
  infoLink: Schema.optional(Schema.String),
  canonicalVolumeLink: Schema.optional(Schema.String),
})

const MonetaryAmount = Schema.Struct({
  amount: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
  currencyCode: Schema.optional(Schema.String),
})

const SaleInfo = Schema.Struct({
  country: Schema.optional(Schema.String),
  saleability: Schema.optional(Schema.String),
  onSaleDate: Schema.optional(Schema.String),
  isEbook: Schema.optional(Schema.Boolean),
  listPrice: Schema.optional(MonetaryAmount),
  retailPrice: Schema.optional(MonetaryAmount),
  buyLink: Schema.optional(Schema.String),
})

const DownloadAccess = Schema.Struct({
  kind: Schema.optional(Schema.Literal("books#downloadAccessRestriction")),
  volumeId: Schema.optional(Schema.String),
  restricted: Schema.optional(Schema.Boolean),
  deviceAllowed: Schema.optional(Schema.Boolean),
  justAcquired: Schema.optional(Schema.Boolean),
  maxDownloadDevices: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  downloadsAcquired: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  nonce: Schema.optional(Schema.String),
  source: Schema.optional(Schema.String),
  reasonCode: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  signature: Schema.optional(Schema.String),
})

const AccessInfo = Schema.Struct({
  country: Schema.optional(Schema.String),
  viewability: Schema.optional(Schema.String),
  embeddable: Schema.optional(Schema.Boolean),
  publicDomain: Schema.optional(Schema.Boolean),
  textToSpeechPermission: Schema.optional(Schema.String),
  epub: Schema.optional(
    Schema.Struct({
      isAvailable: Schema.optional(Schema.Boolean),
      downloadLink: Schema.optional(Schema.String),
      acsTokenLink: Schema.optional(Schema.String),
    }),
  ),
  pdf: Schema.optional(
    Schema.Struct({
      isAvailable: Schema.optional(Schema.Boolean),
      downloadLink: Schema.optional(Schema.String),
      acsTokenLink: Schema.optional(Schema.String),
    }),
  ),
  webReaderLink: Schema.optional(Schema.String),
  accessViewStatus: Schema.optional(Schema.String),
  downloadAccess: Schema.optional(DownloadAccess),
})

const UserInfo = Schema.Struct({
  // `review` and `readingPosition` are mylibrary resources whose payloads Google documents as
  // opaque and only returns for the authenticated user; we only care about their presence.
  review: Schema.optional(Schema.Unknown),
  readingPosition: Schema.optional(Schema.Unknown),
  isPurchased: Schema.optional(Schema.Boolean),
  isPreordered: Schema.optional(Schema.Boolean),
  updated: Schema.optional(Schema.String),
})

const SearchInfo = Schema.Struct({
  textSnippet: Schema.optional(Schema.String),
})

/**
 * Google Books omits every field it has no value for instead of returning nulls, so only
 * `kind`, `id` and `volumeInfo.title` — the fields the provider contract actually depends on —
 * are required. Everything else is optional, including whole nested objects, which may be
 * absent depending on how much metadata the publisher contributed.
 */
export const GoogleBooksVolume = Schema.Struct({
  kind: Schema.Literal("books#volume"),
  id: Schema.String,
  etag: Schema.optional(Schema.String),
  selfLink: Schema.optional(Schema.String),
  volumeInfo: VolumeInfo,
  userInfo: Schema.optional(UserInfo),
  saleInfo: Schema.optional(SaleInfo),
  accessInfo: Schema.optional(AccessInfo),
  searchInfo: Schema.optional(SearchInfo),
})
