import {
  type AgroforestryStratum,
  type AnimalRole,
  type BookmarkState,
  type EdiblePlantPart,
  type InformationVisibility,
  NoteworthyEntityType,
  type PlaceKind,
  type PlantLifecycle,
  type PlantUsage,
  type PlantingMethod,
  type ProfileType,
  type PublicationKind,
  ResourceFormat,
  type ToolUsage,
} from "@gororobas/domain/common/enums"
import type { WikiArticleKind } from "@gororobas/domain/wiki/domain"
import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"

/** Labels for the domain's values, which views translate with their language's `Translator`. */
type Labels<Value extends string> = Readonly<Record<Value, MessageDescriptor>>

export const wikiKindLabels: Readonly<
  Record<WikiArticleKind, Readonly<{ singular: MessageDescriptor; plural: MessageDescriptor }>>
> = {
  PLANT: { singular: msg`Plant`, plural: msg`Plants` },
  PLANT_CULTIVAR: { singular: msg`Variety`, plural: msg`Varieties` },
  ANIMAL: { singular: msg`Animal`, plural: msg`Animals` },
  BOOK: { singular: msg`Book`, plural: msg`Books` },
  FILM: { singular: msg`Film`, plural: msg`Films` },
  CONCEPT: { singular: msg`Concept`, plural: msg`Concepts` },
  PLACE: { singular: msg`Place`, plural: msg`Places` },
  TOOL: { singular: msg`Tool`, plural: msg`Tools` },
  RESOURCE: { singular: msg`Resource`, plural: msg`Resources` },
  NOTEWORTHY_ENTITY: { singular: msg`Organization`, plural: msg`Organizations` },
  UNCATEGORIZED: {
    singular: msg({ message: "Other", context: "wiki article kind" }),
    plural: msg({ message: "Others", context: "wiki article kind" }),
  },
}

export const placeKindLabels: Labels<PlaceKind> = {
  COUNTRY: msg`Country`,
  STATE: msg`State or department`,
  MUNICIPALITY: msg`Municipality`,
  LOCALITY: msg`Locality`,
  BIOME: msg`Biome`,
  ECOREGION: msg`Ecoregion`,
  ECOSYSTEM: msg`Ecosystem`,
  WATERSHED: msg`Watershed`,
  PROTECTED_AREA: msg`Protected area`,
  LANDFORM: msg`Landform`,
}

export const informationVisibilityLabels: Labels<InformationVisibility> = {
  PUBLIC: msg`Public`,
  COMMUNITY: msg`Community`,
  PRIVATE: msg`Private`,
}

export const plantUsageLabels: Labels<PlantUsage> = {
  HUMAN_FEED: msg`Human food`,
  ANIMAL_FEED: msg`Animal feed`,
  CONSTRUCTION: msg`Construction`,
  COSMETIC: msg`Cosmetic`,
  ORGANIC_MATTER: msg`Organic matter`,
  MEDICINAL: msg`Medicinal`,
  ORNAMENTAL: msg`Ornamental`,
  RITUALISTIC: msg`Ritual`,
  ECOSYSTEM_SERVICE: msg`Ecosystem service`,
  FUEL: msg`Fuel`,
  INDUSTRIAL_MATERIAL: msg`Industrial material`,
  NITROGEN_FIXATION: msg`Nitrogen fixation`,
  BIOCONTROL: msg`Biocontrol`,
}

export const ediblePartLabels: Labels<EdiblePlantPart> = {
  FRUIT: msg`Fruit`,
  FLOWER: msg`Flower`,
  LEAF: msg`Leaf`,
  STEM: msg`Stem`,
  SEED: msg`Seed`,
  BARK: msg`Bark`,
  BULB: msg`Bulb`,
  SPROUT: msg`Sprout`,
  ROOT: msg`Root`,
  TUBER: msg`Tuber`,
  RHIZOME: msg`Rhizome`,
}

export const lifecycleLabels: Labels<PlantLifecycle> = {
  SEMIANNUAL: msg`Semiannual`,
  ANNUAL: msg`Annual`,
  BIENNIAL: msg`Biennial`,
  PERENNIAL: msg`Perennial`,
}

export const stratumLabels: Labels<AgroforestryStratum> = {
  EMERGENT: msg({ message: "Emergent", context: "agroforestry stratum" }),
  HIGH: msg({ message: "High", context: "agroforestry stratum" }),
  MEDIUM: msg({ message: "Medium", context: "agroforestry stratum" }),
  LOW: msg({ message: "Low", context: "agroforestry stratum" }),
  GROUND: msg({ message: "Ground", context: "agroforestry stratum" }),
}

// Explainers from gororobas.com's encyclopedia, shown beside each value.

export const stratumExplainers: Labels<AgroforestryStratum> = {
  EMERGENT: msg`Plants that should stand above all others and get the most light - they tolerate up to ~20% shade over the day`,
  HIGH: msg`Plants that only stand below the emergent stratum - they tolerate up to ~40% shade over the day`,
  MEDIUM: msg`Plants that stand below the high stratum - they tolerate up to ~60% shade over the day`,
  LOW: msg`Plants that stand below the medium stratum - they tolerate up to ~80% shade over the day`,
  GROUND: msg`Forest floor plants, which survive without direct light`,
}

export const lifecycleExplainers: Labels<PlantLifecycle> = {
  SEMIANNUAL: msg`Plants we remove or harvest within 6 months, or that die naturally in that time`,
  ANNUAL: msg`Plants we remove or harvest between 6 months and 1 year, or that die naturally in that time`,
  BIENNIAL: msg`Plants we remove or harvest within 1 to 2 years, or that die naturally in that time`,
  PERENNIAL: msg`Plants we grow for more than 2 years, such as fruit trees. "Perennial" doesn't mean forever: we eventually replant many of them to keep them productive, such as coffee, bananas and grapevines.`,
}

export const plantingMethodExplainers: Labels<PlantingMethod> = {
  SEED: msg`Sown straight into the soil, or into seedlings to be transplanted`,
  SEEDLING: msg`Young, already rooted plants that we transplant to where they will grow`,
  STEM_CUTTING: msg`Planting a piece (a cutting) of a plant's stem, leaf or root. The cutting grows roots and develops into a new plant, genetically identical to the original. Used for roses, cassava and many others.`,
  RHIZOME: msg`Rhizomes are underground stems that (also) grow sideways and put out roots and shoots. We cut pieces and plant them, each growing into a new plant. Bananas are the classic example, but also turmeric, ginger and bamboo.`,
  TUBER: msg`Tubers are thickened underground stems that store nutrients and have buds that sprout. Planting by tuber means planting the whole tuber or pieces of it, each growing into a new plant. Our ancestors planted a whole lot of potatoes and yams this way.`,
  GRAFT: msg`A technique that joins parts of two different plants to combine desirable traits. One part (the scion) is inserted into another plant (the rootstock) so they grow together. Much of the commercial production of many fruit trees is done this way (cacao, citrus, mulberries, etc.).`,
  BULB: msg`Bulbs are short underground stems wrapped in fleshy leaves, like onions and garlic. We plant the whole bulb or its cloves, and each grows into a new plant.`,
  DIVISION: msg`Splitting a clump into parts that each have roots and shoots, each growing into a new plant. Common for grasses, herbs such as lemon balm and many ornamentals.`,
  LAYERING: msg`Making a branch grow roots while it's still attached to the plant, by burying its tip or wrapping a wounded stretch of it in moist soil (air layering), then cutting it off as a new plant. Used for lychee, jabuticaba and many shrubs.`,
  OFFSET: msg`Planting the plantlets a plant produces by itself: suckers from its base or roots, runners along the ground, or bulbils. Strawberries, pineapples and bananas spread this way.`,
}

export const plantingMethodLabels: Labels<PlantingMethod> = {
  SEED: msg`Seed`,
  SEEDLING: msg`Seedling`,
  STEM_CUTTING: msg`Cutting`,
  RHIZOME: msg`Rhizome`,
  TUBER: msg`Tuber`,
  GRAFT: msg`Graft`,
  BULB: msg`Bulb`,
  DIVISION: msg`Division`,
  LAYERING: msg`Layering`,
  OFFSET: msg`Offset`,
}

export const animalRoleLabels: Labels<AnimalRole> = {
  POLLINATOR: msg`Pollinator`,
  PEST_CONTROL: msg`Pest control`,
  GRAZER: msg`Grazing`,
  LIVESTOCK: msg`Livestock`,
  DRAFT_ANIMAL: msg`Draft`,
  AQUACULTURE: msg`Aquaculture`,
  COMPOSTING: msg`Composting`,
  SEED_DISPERSER: msg`Seed disperser`,
}

export const toolUsageLabels: Labels<ToolUsage> = {
  HAND_TOOL: msg`Hand tool`,
  IRRIGATION: msg`Irrigation`,
  SOIL_PREPARATION: msg`Soil preparation`,
  PLANTING: msg`Planting`,
  HARVEST: msg`Harvest`,
  PROCESSING: msg`Processing`,
  STORAGE: msg`Storage`,
  MEASUREMENT: msg`Measurement`,
  PROTECTION: msg`Protection`,
  MACHINERY: msg`Machinery`,
  INFRASTRUCTURE: msg`Infrastructure`,
}

export const resourceFormatLabels: Labels<typeof ResourceFormat.Type> = {
  SOCIAL_MEDIA: msg`Social media`,
  VIDEO: msg`Video`,
  ARTICLE: msg`Article`,
  PODCAST: msg`Podcast`,
  COURSE: msg`Course`,
  ACADEMIC_WORK: msg`Academic work`,
  DATASET: msg`Dataset`,
  OTHER: msg({ message: "Other", context: "resource format" }),
}

export const entityTypeLabels: Labels<typeof NoteworthyEntityType.Type> = {
  COLLECTIVE: msg`Collective`,
  COOPERATIVE: msg`Cooperative`,
  FARM: msg`Farm`,
  TERRITORY: msg`Territory`,
  SOCIAL_MOVEMENT: msg`Social movement`,
  NETWORK: msg`Network`,
  NONPROFIT: msg`Nonprofit`,
  EDUCATIONAL_INSTITUTION: msg`Educational institution`,
  RESEARCH_ORGANIZATION: msg`Research`,
  PUBLIC_AGENCY: msg`Public agency`,
  MEDIA_ORGANIZATION: msg`Media`,
  BUSINESS: msg`Business`,
  OTHER: msg({ message: "Other", context: "organization category" }),
}

export const publicationKindLabels: Labels<PublicationKind> = {
  POST: msg({ message: "Posts", context: "publication kind" }),
  EVENT: msg`Events`,
}

export const profileTypeLabels: Labels<ProfileType> = {
  PERSON: msg({ message: "People", context: "profile type" }),
  ORGANIZATION: msg`Organizations`,
}

/** A bookmark's states in the words of what the article is about: a book is read, a plant planted. */
export type BookmarkVocabulary = Readonly<{
  /** Someone's own relationship to the article, such as "I want to read it". */
  states: Labels<BookmarkState>
  /** How others' bookmarks are grouped on the article's page, such as "Want to read it". */
  groups: Labels<BookmarkState>
}>

const vocabulary = (
  states: Omit<Labels<BookmarkState>, "INDIFFERENT">,
  groups: Omit<Labels<BookmarkState>, "INDIFFERENT">,
): BookmarkVocabulary => ({
  states: { ...states, INDIFFERENT: msg`Not interested` },
  groups: { ...groups, INDIFFERENT: msg`No interest` },
})

const plantVocabulary = vocabulary(
  {
    INTERESTED: msg`I want to plant it`,
    ACTIVE: msg`I'm planting it`,
    PREVIOUSLY_ACTIVE: msg`I've planted it`,
  },
  {
    INTERESTED: msg`Want to plant it`,
    ACTIVE: msg`Planting it`,
    PREVIOUSLY_ACTIVE: msg`Have planted it`,
  },
)

const usageVocabulary = vocabulary(
  {
    INTERESTED: msg`I'm interested`,
    ACTIVE: msg`I'm using it`,
    PREVIOUSLY_ACTIVE: msg`I've used it`,
  },
  {
    INTERESTED: msg`Interested`,
    ACTIVE: msg`Using it`,
    PREVIOUSLY_ACTIVE: msg`Have used it`,
  },
)

export const bookmarkVocabularies: Readonly<Record<WikiArticleKind, BookmarkVocabulary>> = {
  PLANT: plantVocabulary,
  PLANT_CULTIVAR: plantVocabulary,
  ANIMAL: vocabulary(
    {
      INTERESTED: msg`I want to raise them`,
      ACTIVE: msg`I'm raising them`,
      PREVIOUSLY_ACTIVE: msg`I've raised them`,
    },
    {
      INTERESTED: msg`Want to raise them`,
      ACTIVE: msg`Raising them`,
      PREVIOUSLY_ACTIVE: msg`Have raised them`,
    },
  ),
  BOOK: vocabulary(
    {
      INTERESTED: msg`I want to read it`,
      ACTIVE: msg`I'm reading it`,
      PREVIOUSLY_ACTIVE: msg`I've read it`,
    },
    {
      INTERESTED: msg`Want to read it`,
      ACTIVE: msg`Reading it`,
      PREVIOUSLY_ACTIVE: msg`Have read it`,
    },
  ),
  FILM: vocabulary(
    {
      INTERESTED: msg`I want to watch it`,
      ACTIVE: msg`I'm watching it`,
      PREVIOUSLY_ACTIVE: msg`I've watched it`,
    },
    {
      INTERESTED: msg`Want to watch it`,
      ACTIVE: msg`Watching it`,
      PREVIOUSLY_ACTIVE: msg`Have watched it`,
    },
  ),
  CONCEPT: vocabulary(
    {
      INTERESTED: msg`I want to learn it`,
      ACTIVE: msg`I'm practicing it`,
      PREVIOUSLY_ACTIVE: msg`I've practiced it`,
    },
    {
      INTERESTED: msg`Want to learn it`,
      ACTIVE: msg`Practicing it`,
      PREVIOUSLY_ACTIVE: msg`Have practiced it`,
    },
  ),
  PLACE: vocabulary(
    {
      INTERESTED: msg`I want to visit`,
      ACTIVE: msg`I'm there`,
      PREVIOUSLY_ACTIVE: msg`I've been there`,
    },
    {
      INTERESTED: msg`Want to visit`,
      ACTIVE: msg`Are there`,
      PREVIOUSLY_ACTIVE: msg`Have been there`,
    },
  ),
  TOOL: usageVocabulary,
  RESOURCE: usageVocabulary,
  NOTEWORTHY_ENTITY: vocabulary(
    {
      INTERESTED: msg`I want to get to know them`,
      ACTIVE: msg`I take part`,
      PREVIOUSLY_ACTIVE: msg`I've taken part`,
    },
    {
      INTERESTED: msg`Want to get to know them`,
      ACTIVE: msg`Take part`,
      PREVIOUSLY_ACTIVE: msg`Have taken part`,
    },
  ),
  UNCATEGORIZED: usageVocabulary,
}

/** A profile's bookmarks of every kind of article, grouped in words that suit them all. */
export const profileBookmarkStateLabels: Labels<Exclude<BookmarkState, "INDIFFERENT">> = {
  INTERESTED: msg`Interests`,
  ACTIVE: msg`Day to day`,
  PREVIOUSLY_ACTIVE: msg`Past`,
}
