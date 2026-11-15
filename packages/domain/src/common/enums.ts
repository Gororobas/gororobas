/**
 * Enum types for domain entities.
 * Using Schema.Literals for type-safe enum values.
 */
import { Schema } from "effect"

/**
 * Order matters: the first language is the web app's default, and content falls back through the
 * others in this order when the requested language is missing.
 */
export const SupportedLanguage = Schema.Literals(["en", "pt", "es"])
export type SupportedLanguage = typeof SupportedLanguage.Type

export const TrustedAccessLevel = Schema.Literals([
  "COMMUNITY", // Has been approved and has access to public & community content
  "MODERATOR", // Can trust or block newcomers, censor or reapprove content, and evaluate revisions
  "ADMIN", // Moderator access + manage other moderators and admins
])

export type TrustedAccessLevel = typeof TrustedAccessLevel.Type

export const PlatformAccessLevel = Schema.Literals([
  ...TrustedAccessLevel.literals,
  "NEWCOMER", // Just signed up, limited access
  "BLOCKED", // Has been blocked by a moderator or admin, same access as visitors
])

export type PlatformAccessLevel = typeof PlatformAccessLevel.Type

export const PlatformAccessLevelOrVisitor = Schema.Literals([
  ...PlatformAccessLevel.literals,
  "VISITOR",
])
export type PlatformAccessLevelOrVisitor = typeof PlatformAccessLevelOrVisitor.Type

export const ModerationStatus = Schema.Literals([
  "APPROVED_BY_DEFAULT",
  "CENSORED",
  "REAPPROVED_AFTER_CENSORING",
])

export type ModerationStatus = typeof ModerationStatus.Type

export const ProfileType = Schema.Literals(["PERSON", "ORGANIZATION"])
export type ProfileType = typeof ProfileType.Type

export const OrganizationInvitationStatus = Schema.Literals(["PENDING", "ACCEPTED", "EXPIRED"])
export type OrganizationInvitationStatus = typeof OrganizationInvitationStatus.Type

export const OrganizationAccessLevel = Schema.Literals(["MANAGER", "EDITOR", "VIEWER"])
export type OrganizationAccessLevel = typeof OrganizationAccessLevel.Type

// @TODO review organization types
/**
 * What kind of collective an organization is. Shared by organization profiles (groups using the
 * app) and NOTEWORTHY_ENTITY wiki articles (groups documented in the wiki), so an article and the
 * profile its members create classify the group the same way.
 */
export const OrganizationType = Schema.Literals([
  "COLLECTIVE", // Informal groups: community gardens, mutirões, seed guardians
  "COOPERATIVE", // Producer, consumer and credit cooperatives and associations
  "FARM", // Sítios, roças, agroforests and other productive units
  "TERRITORY", // Assentamentos, quilombos, indigenous lands and traditional communities
  "SOCIAL_MOVEMENT", // Organized movements such as the MST or La Via Campesina
  "NETWORK", // Networks and coalitions of groups, such as the ANA
  "NONPROFIT", // NGOs and civil-society institutes
  "EDUCATIONAL_INSTITUTION", // Schools, universities and training centers
  "RESEARCH_ORGANIZATION", // Research groups and centers
  "PUBLIC_AGENCY", // Government agencies and programs, such as extension services
  "MEDIA_ORGANIZATION", // Independent media and publishers
  "BUSINESS", // Shops, restaurants and other companies
  "OTHER",
])

export type OrganizationType = typeof OrganizationType.Type

/** Profiles can't be private */
export const ProfileVisibility = Schema.Literals(["COMMUNITY", "PUBLIC"])
export type ProfileVisibility = typeof ProfileVisibility.Type

export const InformationVisibility = Schema.Literals(["PRIVATE", "COMMUNITY", "PUBLIC"])
export type InformationVisibility = typeof InformationVisibility.Type

/** What a PLACE wiki article is, as people perceive it: a territory, an ecological region, a landscape. */
export const PlaceKind = Schema.Literals([
  "COUNTRY",
  "STATE", // States, departments, provinces
  "MUNICIPALITY", // Municipalities, counties, partidos
  "LOCALITY", // Veredas, bairros, towns and villages within a municipality
  "BIOME", // Large named regions such as the Cerrado or the Amazon
  "ECOREGION", // Mapped subdivisions of a biome, such as RESOLVE ecoregions
  "ECOSYSTEM", // Páramos, mangroves, dry forests: places people recognize wherever they occur
  "WATERSHED",
  "PROTECTED_AREA",
  "LANDFORM", // Mountains, valleys, plateaus, serras
])

export type PlaceKind = typeof PlaceKind.Type

/** Publications can't be private */
export const PublicationVisibility = Schema.Literals(["COMMUNITY", "PUBLIC"])
export type PublicationVisibility = typeof PublicationVisibility.Type

export const RevisionEvaluation = Schema.Literals(["PENDING", "APPROVED", "REJECTED"])
export type RevisionEvaluation = typeof RevisionEvaluation.Type

/** Inspired by https://schema.org/EventAttendanceModeEnumeration */
export const EventAttendanceMode = Schema.Literals(["IN_PERSON", "VIRTUAL", "MIXED"])
export type EventAttendanceMode = typeof EventAttendanceMode.Type

export const BookmarkState = Schema.Literals([
  "INTERESTED", // ex for plants in the wiki: "Want to plant"
  "ACTIVE", // "Am planting" for plant articles
  "PREVIOUSLY_ACTIVE", // "Have planted" for plant articles
  "INDIFFERENT", // "Not interested"
])

export type BookmarkState = typeof BookmarkState.Type

export const PublicationKind = Schema.Literals(["POST", "EVENT"])
export type PublicationKind = typeof PublicationKind.Type

export const WikiArticleStatus = Schema.Literals(["PENDING_APPROVAL", "PUBLISHED", "ARCHIVED"])
export type WikiArticleStatus = typeof WikiArticleStatus.Type

export const AgroforestryStratum = Schema.Literals(["EMERGENT", "HIGH", "MEDIUM", "LOW", "GROUND"])
export type AgroforestryStratum = typeof AgroforestryStratum.Type

export const EdiblePlantPart = Schema.Literals([
  "FRUIT",
  "FLOWER",
  "LEAF",
  "STEM",
  "SEED",
  "BARK",
  "BULB",
  "SPROUT",
  "ROOT",
  "TUBER",
  "RHIZOME",
])

export type EdiblePlantPart = typeof EdiblePlantPart.Type

/** A plant's habit, as botanists classify it. */
export const GrowthForm = Schema.Literals(["TREE", "SHRUB", "HERB", "VINE", "GRAMINOID"])
export type GrowthForm = typeof GrowthForm.Type

/** How fast a plant grows compared to others of its growth form. */
export const GrowthRate = Schema.Literals(["SLOW", "MODERATE", "FAST"])
export type GrowthRate = typeof GrowthRate.Type

/** How well a plant recovers from pruning, which syntropic management relies on. */
export const PruningResponse = Schema.Literals(["GOOD", "MODERATE", "POOR", "INTOLERANT"])
export type PruningResponse = typeof PruningResponse.Type

/**
 * When a plant lives in natural succession, as syntropic agriculture groups them: placentas
 * prepare the ground, secondaries follow, and climax species close the cycle. Ordered by lifespan.
 */
export const SuccessionalGroup = Schema.Literals([
  "PLACENTA_1", // Live up to ~6 months
  "PLACENTA_2", // Up to ~2 years
  "SECONDARY_1", // Up to ~10–15 years
  "SECONDARY_2", // Up to ~25–50 years
  "CLIMAX", // Up to centuries
])

export type SuccessionalGroup = typeof SuccessionalGroup.Type

/** Whether a plant keeps its leaves through the year. */
export const LeafPersistence = Schema.Literals(["EVERGREEN", "SEMI_DECIDUOUS", "DECIDUOUS"])
export type LeafPersistence = typeof LeafPersistence.Type

/** How seeds survive drying and cold storage, which decides how seed banks keep them. */
export const SeedStorageBehavior = Schema.Literals([
  "ORTHODOX", // Survive drying and freezing for years
  "INTERMEDIATE", // Survive some drying, but not freezing
  "RECALCITRANT", // Die when dried: sown fresh
])

export type SeedStorageBehavior = typeof SeedStorageBehavior.Type

export const CrownShape = Schema.Literals([
  "ROUNDED",
  "SPREADING",
  "UMBRELLA",
  "CONICAL",
  "IRREGULAR",
])

export type CrownShape = typeof CrownShape.Type

/** Broad climates a plant occurs in. Specific places a plant grows in are `growsIn` relations.
 * @todo review and possibly expand
 */
export const ClimateZone = Schema.Literals([
  "TROPICAL",
  "SUBTROPICAL",
  "MEDITERRANEAN",
  "TEMPERATE",
  "SEMI_ARID",
  "ARID",
])

export type ClimateZone = typeof ClimateZone.Type

export const PlantLifecycle = Schema.Literals(["SEMIANNUAL", "ANNUAL", "BIENNIAL", "PERENNIAL"])
export type PlantLifecycle = typeof PlantLifecycle.Type

// @todo Rename PlantUsage to PlantHumanUsage.
export const PlantUsage = Schema.Literals([
  "MOTHER_TREE", // Fast-growing trees that facilitate other plants in an agroforest
  "HUMAN_FEED",
  "ANIMAL_FEED",
  "CONSTRUCTION",
  "COSMETIC",
  "ORGANIC_MATTER",
  "MEDICINAL",
  "ORNAMENTAL",
  "RITUALISTIC",
  "ECOSYSTEM_SERVICE",
  "FUEL", // Firewood and charcoal
  "INDUSTRIAL_MATERIAL", // Fibers, resins, dyes, latex, tannins
  "NITROGEN_FIXATION",
  "BIOCONTROL", // Repelling or controlling pests and diseases
])

export type PlantUsage = typeof PlantUsage.Type

export const PlantingMethod = Schema.Literals([
  "SEED",
  "SEEDLING",
  "STEM_CUTTING",
  "RHIZOME",
  "TUBER",
  "GRAFT",
  "BULB",
  "DIVISION",
  // @TODO review LAYERING and OFFSET, I still don't understand either
  "LAYERING", // Rooting a branch while it's still attached to the plant: tip and air layering
  "OFFSET", // Suckers, runners and bulbils: plantlets the plant produces by itself
])

export type PlantingMethod = typeof PlantingMethod.Type

/** Ecological contributions animals can make. */
export const AnimalEcologicalFunction = Schema.Literals([
  "POLLINATOR",
  "PEST_CONTROL",
  "SOIL_ENGINEER",
  "ORGANIC_MATTER_RECYCLING", // Breaks down or consumes dead organic matter, including carrion & worms.
  "SEED_DISPERSER",
])

export type AnimalEcologicalFunction = typeof AnimalEcologicalFunction.Type

export const AnimalFeedingBehavior = Schema.Literals([
  "PLANT_EATER", // Cattle eat grass; bees feed on nectar and pollen.
  "ANIMAL_EATER", // Owls eat mice; swallows eat insects.
  "OMNIVORE", // Pigs and chickens eat both plants and animals.
  "SCAVENGER", // Vultures and hyenas eat carrion.
  "DEAD_MATTER_EATER", // Earthworms and woodlice eat decaying organic matter.
  "FILTER_FEEDER", // Oysters and mussels filter food from water.
  "PARASITE", // Ticks and fleas feed on living hosts.
])

export type AnimalFeedingBehavior = typeof AnimalFeedingBehavior.Type

/** Systems in which people raise animals. */
export const AnimalProductionSystem = Schema.Literals([
  "LIVESTOCK", // Raising cattle, goats, poultry or other land animals.
  "AQUACULTURE", // Farming fish, shrimp or molluscs.
  "BEEKEEPING", // Keeping bees for honey, wax or pollination.
])

export type AnimalProductionSystem = typeof AnimalProductionSystem.Type

// @todo review and reduce options
export const AnimalHumanUsage = Schema.Literals([
  "DRAFT_ANIMAL", // Oxen pull plows; horses pull carts.
  "TRANSPORT", // Donkeys carry loads; horses carry riders.
  "HUMAN_FOOD", // Fish provide meat; hens lay eggs; bees make honey.
  "ANIMAL_FEED", // Insect larvae and fish meal feed livestock.
  "MATERIAL", // Cattle provide leather; bees provide wax; Sheep provide wool; Silkworms produce silk
  "FERTILIZER", // Manure and worm castings nourish soil.
  "POLLINATION", // Managed bees pollinate crops.
  "PEST_CONTROL", // Ducks eat slugs; ladybirds eat aphids.
  "COMPOSTING", // Earthworms process organic waste.
  "GUARDIAN", // Dogs protect livestock; geese guard farms.
  "COMPANIONSHIP", // Dogs and cats are kept as companions.
  "ORNAMENTAL", // Peacocks and ornamental fish are kept for display.
  "RESEARCH", // Fruit flies and mice are used in research.
  "MEDICINAL", // Leeches are used in medicine.
  "RITUALISTIC", // Animals feature in ceremonies and traditions.
])

export type AnimalHumanUsage = typeof AnimalHumanUsage.Type

// @todo Delete AnimalRole when the rest of the codebase adopts the new claims properties.
export const AnimalRole = Schema.Literals([
  "POLLINATOR",
  "PEST_CONTROL",
  "GRAZER",
  "LIVESTOCK",
  "DRAFT_ANIMAL",
  "AQUACULTURE",
  "COMPOSTING",
  "SEED_DISPERSER",
])

export type AnimalRole = typeof AnimalRole.Type

export const ToolUsage = Schema.Literals([
  "HAND_TOOL",
  "IRRIGATION",
  "SOIL_PREPARATION",
  "PLANTING",
  "HARVEST",
  "PROCESSING",
  "STORAGE",
  "MEASUREMENT",
  "PROTECTION",
  "MACHINERY",
  "INFRASTRUCTURE",
])

export type ToolUsage = typeof ToolUsage.Type

export const GrammaticalGender = Schema.Literals(["NEUTRAL", "MALE", "FEMALE"])
export type GrammaticalGender = typeof GrammaticalGender.Type

export const TranslationSource = Schema.Literals(["ORIGINAL", "AUTOMATIC", "MANUAL"])
export type TranslationSource = typeof TranslationSource.Type

export const ContentChannelType = Schema.Literals([
  "YOUTUBE",
  "PODCAST",
  "NEWSLETTER",
  "MAGAZINE",
  "RADIO",
  "OTHER",
])

/** Wiki entities use the same taxonomy as organization profiles; see `OrganizationType`. */
export const NoteworthyEntityType = OrganizationType

export const ResourceFormat = Schema.Literals([
  "SOCIAL_MEDIA",
  "VIDEO",
  "ARTICLE",
  "PODCAST",
  "COURSE",
  "ACADEMIC_WORK",
  "DATASET",
  "OTHER",
])

export const MediaAssetFormat = Schema.Literals(["VIDEO", "AUDIO", "IMAGE"])

export const AudiovisualFormat = Schema.Literals(["FILM", "SERIES"])
export type AudiovisualFormat = typeof AudiovisualFormat.Type
