import { ActivePeriodProperty } from "./active-period.js"
import { AgroforestryRolesProperty } from "./agroforestry-roles.js"
import { AnimalRolesProperty } from "./animal-roles.js"
import { AreasOfWorkProperty } from "./areas-of-work.js"
import { AuthorsProperty } from "./authors.js"
import { BasedInProperty } from "./based-in.js"
import { BookEditionsProperty } from "./book-editions.js"
import { ClimateZonesProperty } from "./climate-zones.js"
import { ContainedInPlaceProperty } from "./contained-in-place.js"
import { ContentChannelItemProperty } from "./content-channel-item.js"
import { ContentChannelsProperty } from "./content-channels.js"
import { CountryOfOriginProperty } from "./country-of-origin.js"
import { CreditTextProperty } from "./credit-text.js"
import { CrownDiameterProperty } from "./crown-diameter.js"
import { CrownShapeProperty } from "./crown-shape.js"
import { CultivarOfProperty } from "./cultivar-of.js"
import { DatePublishedProperty } from "./date-published.js"
import { DevelopmentCycleProperty } from "./development-cycle.js"
import { DirectorsProperty } from "./directors.js"
import { EdiblePartsProperty } from "./edible-parts.js"
import { EditionLabelProperty } from "./edition-label.js"
import { GbifTaxonIdProperty } from "./gbif-taxon-id.js"
import { GenresProperty } from "./genres.js"
import { GeonamesIdProperty } from "./geonames-id.js"
import { GoogleBooksVolumeIdProperty } from "./google-books-volume-id.js"
import { GrowsInProperty } from "./grows-in.js"
import { GrowthFormProperty } from "./growth-form.js"
import { GrowthRateProperty } from "./growth-rate.js"
import { HeightProperty } from "./height.js"
import { ImagesProperty } from "./images.js"
import { InLanguageProperty } from "./in-language.js"
import { InheritsFromParentProperty } from "./inherits-from-parent.js"
import { IsbnProperty } from "./isbn.js"
import { LeafPersistenceProperty } from "./leaf-persistence.js"
import { LifecyclesProperty } from "./lifecycles.js"
import { LifespanProperty } from "./lifespan.js"
import { MainImageProperty } from "./main-image.js"
import { NamesProperty } from "./names.js"
import { OccupationsProperty } from "./occupations.js"
import { OrganizationTypeProperty } from "./organization-type.js"
import { OriginProperty } from "./origin.js"
import { PlaceKindProperty } from "./place-kind.js"
import { PlantUsageProperty } from "./plant-usage.js"
import { PlantingMethodsProperty } from "./planting-methods.js"
import { PruningResponseProperty } from "./pruning-response.js"
import { PublisherProperty } from "./publisher.js"
import { RelatedToProperty } from "./related-to.js"
import { ResourceFormatProperty } from "./resource-format.js"
import { ResourceUrlProperty } from "./resource-url.js"
import { ScientificNamesProperty } from "./scientific-names.js"
import { SeedDormancyProperty } from "./seed-dormancy.js"
import { SeedStorageBehaviorProperty } from "./seed-storage-behavior.js"
import { StrataProperty } from "./strata.js"
import { SuccessionalGroupProperty } from "./successional-group.js"
import { SuggestedKindProperty } from "./suggested-kind.js"
import { SyntropediaPlantIdProperty } from "./syntropedia-plant-id.js"
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
  AgroforestryRolesProperty,
  AnimalRolesProperty,
  AreasOfWorkProperty,
  AuthorsProperty,
  BasedInProperty,
  BookEditionsProperty,
  ClimateZonesProperty,
  ContainedInPlaceProperty,
  ContentChannelItemProperty,
  ContentChannelsProperty,
  CountryOfOriginProperty,
  CreditTextProperty,
  CrownDiameterProperty,
  CrownShapeProperty,
  CultivarOfProperty,
  DevelopmentCycleProperty,
  DirectorsProperty,
  EdiblePartsProperty,
  EditionLabelProperty,
  GbifTaxonIdProperty,
  GenresProperty,
  GeonamesIdProperty,
  GoogleBooksVolumeIdProperty,
  GrowsInProperty,
  GrowthFormProperty,
  GrowthRateProperty,
  HeightProperty,
  ImagesProperty,
  InheritsFromParentProperty,
  IsbnProperty,
  InLanguageProperty,
  LeafPersistenceProperty,
  LifecyclesProperty,
  LifespanProperty,
  MainImageProperty,
  NamesProperty,
  OccupationsProperty,
  OrganizationTypeProperty,
  OriginProperty,
  PlaceKindProperty,
  PlantUsageProperty,
  PlantingMethodsProperty,
  PruningResponseProperty,
  DatePublishedProperty,
  PublisherProperty,
  RelatedToProperty,
  ResourceFormatProperty,
  ResourceUrlProperty,
  ScientificNamesProperty,
  SeedDormancyProperty,
  SeedStorageBehaviorProperty,
  StrataProperty,
  SuccessionalGroupProperty,
  SuggestedKindProperty,
  SyntropediaPlantIdProperty,
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
