import { ActivePeriodProperty } from "./active-period.js"
import { AliasesProperty } from "./aliases.js"
import { AnimalRolesProperty } from "./animal-roles.js"
import { AreasOfWorkProperty } from "./areas-of-work.js"
import { BasedInProperty } from "./based-in.js"
import { BookAuthorsProperty } from "./book-authors.js"
import { BookEditionsProperty } from "./book-editions.js"
import { ContainedByPlaceProperty } from "./contained-by-place.js"
import { ContentChannelsProperty } from "./content-channels.js"
import { CountryOfOriginProperty } from "./country-of-origin.js"
import { CreditLineProperty } from "./credit-line.js"
import { CultivarOfProperty } from "./cultivar-of.js"
import { DevelopmentCycleProperty } from "./development-cycle.js"
import { EdiblePartsProperty } from "./edible-parts.js"
import { EditionLabelProperty } from "./edition-label.js"
import { FilmDirectorsProperty } from "./film-directors.js"
import { FilmGenresProperty } from "./film-genres.js"
import { GbifTaxonIdProperty } from "./gbif-taxon-id.js"
import { GeonamesIdProperty } from "./geonames-id.js"
import { GoogleBooksVolumeIdProperty } from "./google-books-volume-id.js"
import { GrowsInProperty } from "./grows-in.js"
import { HeightProperty } from "./height.js"
import { ImagesProperty } from "./images.js"
import { InheritsFromParentProperty } from "./inherits-from-parent.js"
import { IsbnProperty } from "./isbn.js"
import { LabelProperty } from "./label.js"
import { LanguagesProperty } from "./languages.js"
import { LifecyclesProperty } from "./lifecycles.js"
import { LifespanProperty } from "./lifespan.js"
import { MainImageProperty } from "./main-image.js"
import { OccupationsProperty } from "./occupations.js"
import { OrganizationTypeProperty } from "./organization-type.js"
import { OriginProperty } from "./origin.js"
import { PageCountProperty } from "./page-count.js"
import { PlaceKindProperty } from "./place-kind.js"
import { PlantUsageProperty } from "./plant-usage.js"
import { PlantingMethodsProperty } from "./planting-methods.js"
import { PublicationDateProperty } from "./publication-date.js"
import { PublisherProperty } from "./publisher.js"
import { RelatedToProperty } from "./related-to.js"
import { ReleaseDateProperty } from "./release-date.js"
import { ResourceFormatProperty } from "./resource-format.js"
import { ResourceUrlProperty } from "./resource-url.js"
import { ScientificNamesProperty } from "./scientific-names.js"
import { StrataProperty } from "./strata.js"
import { SuggestedKindProperty } from "./suggested-kind.js"
import { TaxonomicClassificationProperty } from "./taxonomic-classification.js"
import { TaxonomyGroupProperty } from "./taxonomy-group.js"
import { TemperatureProperty } from "./temperature.js"
import { ToolUsageProperty } from "./tool-usage.js"
import { WebsiteProperty } from "./website.js"
import { WhosOnFirstIdProperty } from "./whos-on-first-id.js"
import { WikidataIdProperty } from "./wikidata-id.js"
import { WikipediaPageProperty } from "./wikipedia-page.js"

/** Every property, the whole registry. Kinds have the properties that list them. */
export const properties = [
  ActivePeriodProperty,
  AliasesProperty,
  AnimalRolesProperty,
  AreasOfWorkProperty,
  BasedInProperty,
  BookAuthorsProperty,
  BookEditionsProperty,
  ContainedByPlaceProperty,
  ContentChannelsProperty,
  CountryOfOriginProperty,
  CreditLineProperty,
  CultivarOfProperty,
  DevelopmentCycleProperty,
  EdiblePartsProperty,
  EditionLabelProperty,
  FilmDirectorsProperty,
  FilmGenresProperty,
  GbifTaxonIdProperty,
  GeonamesIdProperty,
  GoogleBooksVolumeIdProperty,
  GrowsInProperty,
  HeightProperty,
  ImagesProperty,
  InheritsFromParentProperty,
  IsbnProperty,
  LabelProperty,
  LanguagesProperty,
  LifecyclesProperty,
  LifespanProperty,
  MainImageProperty,
  OccupationsProperty,
  OrganizationTypeProperty,
  OriginProperty,
  PageCountProperty,
  PlaceKindProperty,
  PlantUsageProperty,
  PlantingMethodsProperty,
  PublicationDateProperty,
  PublisherProperty,
  RelatedToProperty,
  ReleaseDateProperty,
  ResourceFormatProperty,
  ResourceUrlProperty,
  ScientificNamesProperty,
  StrataProperty,
  SuggestedKindProperty,
  TaxonomicClassificationProperty,
  TaxonomyGroupProperty,
  TemperatureProperty,
  ToolUsageProperty,
  WebsiteProperty,
  WhosOnFirstIdProperty,
  WikidataIdProperty,
  WikipediaPageProperty,
] as const

export type Property = (typeof properties)[number]

export type PropertyId = Property["id"]
