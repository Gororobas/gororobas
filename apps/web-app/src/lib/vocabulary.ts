import {
  type AgroforestryStratum,
  type AnimalRole,
  type BookmarkState,
  type EdiblePlantPart,
  NoteworthyEntityType,
  type PlantLifecycle,
  type PlantUsage,
  type PlantingMethod,
  type ProfileType,
  type PublicationKind,
  ResourceFormat,
  type ToolUsage,
} from "@gororobas/domain/common/enums"
import type { WikiArticleKind } from "@gororobas/domain/wiki/domain"

/** UI copy is pt-BR until the interface is localized. */

export const wikiKindLabels: Readonly<
  Record<WikiArticleKind, Readonly<{ singular: string; plural: string }>>
> = {
  PLANT: { singular: "Planta", plural: "Plantas" },
  PLANT_CULTIVAR: { singular: "Variedade", plural: "Variedades" },
  ANIMAL: { singular: "Animal", plural: "Animais" },
  BOOK: { singular: "Livro", plural: "Livros" },
  FILM: { singular: "Filme", plural: "Filmes" },
  CONCEPT: { singular: "Conceito", plural: "Conceitos" },
  TOOL: { singular: "Ferramenta", plural: "Ferramentas" },
  RESOURCE: { singular: "Recurso", plural: "Recursos" },
  NOTEWORTHY_ENTITY: { singular: "Organização", plural: "Organizações" },
  UNCATEGORIZED: { singular: "Outro", plural: "Outros" },
}

export const plantUsageLabels: Readonly<Record<PlantUsage, string>> = {
  HUMAN_FEED: "Alimento humano",
  ANIMAL_FEED: "Alimento animal",
  CONSTRUCTION: "Construção",
  COSMETIC: "Cosmético",
  ORGANIC_MATTER: "Matéria orgânica",
  MEDICINAL: "Medicinal",
  ORNAMENTAL: "Ornamental",
  RITUALISTIC: "Ritualístico",
  ECOSYSTEM_SERVICE: "Serviço ecossistêmico",
}

export const ediblePartLabels: Readonly<Record<EdiblePlantPart, string>> = {
  FRUIT: "Fruto",
  FLOWER: "Flor",
  LEAF: "Folha",
  STEM: "Caule",
  SEED: "Semente",
  BARK: "Casca",
  BULB: "Bulbo",
  SPROUT: "Broto",
  ROOT: "Raiz",
  TUBER: "Tubérculo",
  RHIZOME: "Rizoma",
}

export const lifecycleLabels: Readonly<Record<PlantLifecycle, string>> = {
  SEMIANNUAL: "Semestral",
  ANNUAL: "Anual",
  BIENNIAL: "Bienal",
  PERENNIAL: "Perene",
}

export const stratumLabels: Readonly<Record<AgroforestryStratum, string>> = {
  EMERGENT: "Emergente",
  HIGH: "Alto",
  MEDIUM: "Médio",
  LOW: "Baixo",
  GROUND: "Rasteiro",
}

// Explainers from gororobas.com's encyclopedia, shown beside each value.

export const stratumExplainers: Readonly<Record<AgroforestryStratum, string>> = {
  EMERGENT:
    "Plantas que devem estar acima de todas as outras e receber o máximo de luz - toleram até ~20% de sombra ao longo do dia",
  HIGH: "Plantas que só ficam abaixo das de estrato emergente - toleram até ~40% de sombra ao longo do dia",
  MEDIUM:
    "Plantas que ficam abaixo das de estrato alto - toleram até ~60% de sombra ao longo do dia",
  LOW: "Plantas que ficam abaixo das de estrato médio - toleram até ~80% de sombra ao longo do dia",
  GROUND: "Plantas de solo de floresta, sobrevivem sem luz direta",
}

export const lifecycleExplainers: Readonly<Record<PlantLifecycle, string>> = {
  SEMIANNUAL:
    "Plantas que removemos ou colhemos em até 6 meses ou que morrem naturalmente nesse período",
  ANNUAL:
    "Plantas que removemos ou colhemos entre 6 meses e 1 ano ou que morrem naturalmente nesse período",
  BIENNIAL:
    "Plantas que removemos ou colhemos em 1 a 2 anos ou que morrem naturalmente nesse período",
  PERENNIAL:
    'Plantas que cultivamos por mais de 2 anos, como árvores frutíferas. "Perene" não significa pra sempre: muitas delas replantamos eventualmente para maximizar a produção, como o café, a banana, a parreira, etc.',
}

export const plantingMethodExplainers: Readonly<Record<PlantingMethod, string>> = {
  SEED: "Sejam plantadas diretamente no solo, ou em mudas a serem transplantadas",
  SEEDLING: "Plantas jovens, já enraizadas, que transplantamos para o lugar onde vão crescer",
  STEM_CUTTING:
    "Plantar um pedaço (estaca ou rama) do caule, folha ou raiz de uma planta. A estaca cria raízes e se desenvolve em uma nova planta geneticamente idêntica à original. Usado em roseiras, mandioca e muitas outras.",
  RHIZOME:
    "Rizomas são caules subterrâneos que crescem (também) horizontalmente e emitem raízes e brotos. Cortamos pedaços e plantamos, cada um originando uma nova planta. Banana é o exemplo clássico, mas também a cúrcuma, gengibre e bambu",
  TUBER:
    "Tubérculos são caules subterrâneos engrossados que armazenam nutrientes e possuem gemas que originam brotos. O plantio por tubérculo consiste em plantar o tubérculo inteiro ou seccionado, cada parte gerando uma nova planta. Nossas ancestrais já plantaram muuuita batata e inhame assim.",
  GRAFT:
    "Técnica de unir partes de duas plantas diferentes para combinar características desejáveis. Uma parte (o enxerto ou clone) é inserida em outra planta (o porta-enxerto ou cavalo) para que cresçam juntas. Grande parte da produção comercial de muitas frutíferas é feita assim (cacau, cítricas, amoras, etc.).",
  BULB: "Bulbos são caules subterrâneos curtos envoltos em folhas carnudas, como os da cebola e do alho. Plantamos o bulbo inteiro ou seus dentes, e cada um origina uma nova planta.",
  DIVISION:
    "Separar uma touceira em partes que tenham raízes e brotos, cada uma originando uma nova planta. Comum em capins, ervas como a cidreira e muitas ornamentais.",
}

export const plantingMethodLabels: Readonly<Record<PlantingMethod, string>> = {
  SEED: "Semente",
  SEEDLING: "Muda",
  STEM_CUTTING: "Estaca",
  RHIZOME: "Rizoma",
  TUBER: "Tubérculo",
  GRAFT: "Enxerto",
  BULB: "Bulbo",
  DIVISION: "Divisão",
}

export const animalRoleLabels: Readonly<Record<AnimalRole, string>> = {
  POLLINATOR: "Polinizador",
  PEST_CONTROL: "Controle de pragas",
  GRAZER: "Pastejo",
  LIVESTOCK: "Criação",
  DRAFT_ANIMAL: "Tração",
  AQUACULTURE: "Aquicultura",
  COMPOSTING: "Compostagem",
  SEED_DISPERSER: "Dispersor de sementes",
}

export const toolUsageLabels: Readonly<Record<ToolUsage, string>> = {
  HAND_TOOL: "Ferramenta manual",
  IRRIGATION: "Irrigação",
  SOIL_PREPARATION: "Preparo do solo",
  PLANTING: "Plantio",
  HARVEST: "Colheita",
  PROCESSING: "Beneficiamento",
  STORAGE: "Armazenamento",
  MEASUREMENT: "Medição",
  PROTECTION: "Proteção",
  MACHINERY: "Maquinário",
  INFRASTRUCTURE: "Infraestrutura",
}

export const resourceFormatLabels: Readonly<Record<typeof ResourceFormat.Type, string>> = {
  SOCIAL_MEDIA: "Rede social",
  VIDEO: "Vídeo",
  ARTICLE: "Artigo",
  PODCAST: "Podcast",
  COURSE: "Curso",
  ACADEMIC_WORK: "Trabalho acadêmico",
  DATASET: "Base de dados",
  OTHER: "Outro",
}

export const entityTypeLabels: Readonly<Record<typeof NoteworthyEntityType.Type, string>> = {
  COLLECTIVE: "Coletivo",
  COOPERATIVE: "Cooperativa",
  FARM: "Sítio ou roça",
  TERRITORY: "Território",
  SOCIAL_MOVEMENT: "Movimento social",
  NETWORK: "Rede",
  NONPROFIT: "ONG",
  EDUCATIONAL_INSTITUTION: "Instituição de ensino",
  RESEARCH_ORGANIZATION: "Pesquisa",
  PUBLIC_AGENCY: "Órgão público",
  MEDIA_ORGANIZATION: "Mídia",
  BUSINESS: "Empresa",
  OTHER: "Outro",
}

export const publicationKindLabels: Readonly<Record<PublicationKind, string>> = {
  POST: "Postagens",
  EVENT: "Eventos",
}

export const profileTypeLabels: Readonly<Record<ProfileType, string>> = {
  PERSON: "Pessoas",
  ORGANIZATION: "Organizações",
}

/** Plant wording; other kinds read these states generically. */
export const plantBookmarkLabels: Readonly<Record<BookmarkState, string>> = {
  INTERESTED: "Quero plantar",
  ACTIVE: "Estou plantando",
  PREVIOUSLY_ACTIVE: "Já plantei",
  INDIFFERENT: "Não tenho interesse",
}

export const bookmarkLabels: Readonly<Record<BookmarkState, string>> = {
  INTERESTED: "Tenho interesse",
  ACTIVE: "Estou usando",
  PREVIOUSLY_ACTIVE: "Já usei",
  INDIFFERENT: "Não tenho interesse",
}

/** How others' bookmarks are grouped on a plant page. */
export const plantBookmarkerGroupLabels: Readonly<Record<BookmarkState, string>> = {
  INTERESTED: "Querem plantar",
  ACTIVE: "Plantando",
  PREVIOUSLY_ACTIVE: "Já plantaram",
  INDIFFERENT: "Sem interesse",
}

export const bookmarkerGroupLabels: Readonly<Record<BookmarkState, string>> = {
  INTERESTED: "Têm interesse",
  ACTIVE: "Usando",
  PREVIOUSLY_ACTIVE: "Já usaram",
  INDIFFERENT: "Sem interesse",
}
