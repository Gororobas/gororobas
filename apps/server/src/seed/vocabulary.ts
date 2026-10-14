/**
 * Word banks that make seeded data legible. Schema arbitraries decide the shape of
 * each record; these lists decide what a person reading the UI actually sees.
 *
 * Content is original and fictional, except for plant names and their scientific names.
 */
import type { GrammaticalGender, SupportedLanguage, WikiArticleKind } from "@gororobas/domain"
import type { Array as EffectArray } from "effect"

type NonEmpty<A> = EffectArray.NonEmptyReadonlyArray<A>

export type Localized = Readonly<Record<SupportedLanguage, string>>

export interface CatalogPlant {
  readonly names: Localized
  readonly scientificName: string
  /** Portuguese gender, used for agreement in cultivar qualifiers. */
  readonly gender: Extract<GrammaticalGender, "MALE" | "FEMALE">
  readonly family: string
}

const plant = (
  [pt, en, es]: readonly [string, string, string],
  details: Omit<CatalogPlant, "names">,
): CatalogPlant => ({ names: { pt, en, es }, ...details })

export const PLANTS: NonEmpty<CatalogPlant> = [
  plant(["Mandioca", "Cassava", "Yuca"], {
    scientificName: "Manihot esculenta",
    gender: "FEMALE",
    family: "Euphorbiaceae",
  }),
  plant(["Milho", "Corn", "Maíz"], {
    scientificName: "Zea mays",
    gender: "MALE",
    family: "Poaceae",
  }),
  plant(["Feijão", "Common bean", "Frijol"], {
    scientificName: "Phaseolus vulgaris",
    gender: "MALE",
    family: "Fabaceae",
  }),
  plant(["Abóbora", "Squash", "Calabaza"], {
    scientificName: "Cucurbita moschata",
    gender: "FEMALE",
    family: "Cucurbitaceae",
  }),
  plant(["Banana", "Banana", "Plátano"], {
    scientificName: "Musa paradisiaca",
    gender: "FEMALE",
    family: "Musaceae",
  }),
  plant(["Café", "Coffee", "Café"], {
    scientificName: "Coffea arabica",
    gender: "MALE",
    family: "Rubiaceae",
  }),
  plant(["Cacau", "Cacao", "Cacao"], {
    scientificName: "Theobroma cacao",
    gender: "MALE",
    family: "Malvaceae",
  }),
  plant(["Açaí", "Açaí palm", "Asaí"], {
    scientificName: "Euterpe oleracea",
    gender: "MALE",
    family: "Arecaceae",
  }),
  plant(["Juçara", "Juçara palm", "Palmito juçara"], {
    scientificName: "Euterpe edulis",
    gender: "FEMALE",
    family: "Arecaceae",
  }),
  plant(["Ingá", "Ice-cream bean", "Guaba"], {
    scientificName: "Inga edulis",
    gender: "MALE",
    family: "Fabaceae",
  }),
  plant(["Feijão-guandu", "Pigeon pea", "Gandul"], {
    scientificName: "Cajanus cajan",
    gender: "MALE",
    family: "Fabaceae",
  }),
  plant(["Mamão", "Papaya", "Papaya"], {
    scientificName: "Carica papaya",
    gender: "MALE",
    family: "Caricaceae",
  }),
  plant(["Abacate", "Avocado", "Aguacate"], {
    scientificName: "Persea americana",
    gender: "MALE",
    family: "Lauraceae",
  }),
  plant(["Manga", "Mango", "Mango"], {
    scientificName: "Mangifera indica",
    gender: "FEMALE",
    family: "Anacardiaceae",
  }),
  plant(["Goiaba", "Guava", "Guayaba"], {
    scientificName: "Psidium guajava",
    gender: "FEMALE",
    family: "Myrtaceae",
  }),
  plant(["Jabuticaba", "Jaboticaba", "Jaboticaba"], {
    scientificName: "Plinia cauliflora",
    gender: "FEMALE",
    family: "Myrtaceae",
  }),
  plant(["Pitanga", "Surinam cherry", "Pitanga"], {
    scientificName: "Eugenia uniflora",
    gender: "FEMALE",
    family: "Myrtaceae",
  }),
  plant(["Araçá", "Strawberry guava", "Arazá"], {
    scientificName: "Psidium cattleianum",
    gender: "MALE",
    family: "Myrtaceae",
  }),
  plant(["Taioba", "Arrowleaf elephant ear", "Malanga"], {
    scientificName: "Xanthosoma sagittifolium",
    gender: "FEMALE",
    family: "Araceae",
  }),
  plant(["Ora-pro-nóbis", "Barbados gooseberry", "Grosella de Barbados"], {
    scientificName: "Pereskia aculeata",
    gender: "FEMALE",
    family: "Cactaceae",
  }),
  plant(["Batata-doce", "Sweet potato", "Batata"], {
    scientificName: "Ipomoea batatas",
    gender: "FEMALE",
    family: "Convolvulaceae",
  }),
  plant(["Inhame", "Yam", "Ñame"], {
    scientificName: "Dioscorea alata",
    gender: "MALE",
    family: "Dioscoreaceae",
  }),
  plant(["Gengibre", "Ginger", "Jengibre"], {
    scientificName: "Zingiber officinale",
    gender: "MALE",
    family: "Zingiberaceae",
  }),
  plant(["Cúrcuma", "Turmeric", "Cúrcuma"], {
    scientificName: "Curcuma longa",
    gender: "FEMALE",
    family: "Zingiberaceae",
  }),
  plant(["Tomate", "Tomato", "Tomate"], {
    scientificName: "Solanum lycopersicum",
    gender: "MALE",
    family: "Solanaceae",
  }),
  plant(["Alface", "Lettuce", "Lechuga"], {
    scientificName: "Lactuca sativa",
    gender: "FEMALE",
    family: "Asteraceae",
  }),
  plant(["Couve", "Collard greens", "Col"], {
    scientificName: "Brassica oleracea",
    gender: "FEMALE",
    family: "Brassicaceae",
  }),
  plant(["Cebolinha", "Chives", "Cebollino"], {
    scientificName: "Allium schoenoprasum",
    gender: "FEMALE",
    family: "Amaryllidaceae",
  }),
  plant(["Coentro", "Coriander", "Cilantro"], {
    scientificName: "Coriandrum sativum",
    gender: "MALE",
    family: "Apiaceae",
  }),
  plant(["Manjericão", "Basil", "Albahaca"], {
    scientificName: "Ocimum basilicum",
    gender: "MALE",
    family: "Lamiaceae",
  }),
  plant(["Capim-limão", "Lemongrass", "Hierba limón"], {
    scientificName: "Cymbopogon citratus",
    gender: "MALE",
    family: "Poaceae",
  }),
  plant(["Margaridão", "Mexican sunflower", "Botón de oro"], {
    scientificName: "Tithonia diversifolia",
    gender: "MALE",
    family: "Asteraceae",
  }),
  plant(["Gliricídia", "Gliricidia", "Madre de cacao"], {
    scientificName: "Gliricidia sepium",
    gender: "FEMALE",
    family: "Fabaceae",
  }),
  plant(["Urucum", "Annatto", "Achiote"], {
    scientificName: "Bixa orellana",
    gender: "MALE",
    family: "Bixaceae",
  }),
  plant(["Amendoim", "Peanut", "Maní"], {
    scientificName: "Arachis hypogaea",
    gender: "MALE",
    family: "Fabaceae",
  }),
  plant(["Girassol", "Sunflower", "Girasol"], {
    scientificName: "Helianthus annuus",
    gender: "MALE",
    family: "Asteraceae",
  }),
  plant(["Cana-de-açúcar", "Sugarcane", "Caña de azúcar"], {
    scientificName: "Saccharum officinarum",
    gender: "FEMALE",
    family: "Poaceae",
  }),
  plant(["Pimenta", "Chili pepper", "Ají"], {
    scientificName: "Capsicum frutescens",
    gender: "FEMALE",
    family: "Solanaceae",
  }),
  plant(["Maracujá", "Passion fruit", "Maracuyá"], {
    scientificName: "Passiflora edulis",
    gender: "MALE",
    family: "Passifloraceae",
  }),
  plant(["Jaca", "Jackfruit", "Yaca"], {
    scientificName: "Artocarpus heterophyllus",
    gender: "FEMALE",
    family: "Moraceae",
  }),
  plant(["Baru", "Baru", "Baru"], {
    scientificName: "Dipteryx alata",
    gender: "MALE",
    family: "Fabaceae",
  }),
  plant(["Pequi", "Pequi", "Piquiá"], {
    scientificName: "Caryocar brasiliense",
    gender: "MALE",
    family: "Caryocaraceae",
  }),
  plant(["Erva-mate", "Yerba mate", "Yerba mate"], {
    scientificName: "Ilex paraguariensis",
    gender: "FEMALE",
    family: "Aquifoliaceae",
  }),
  plant(["Araucária", "Paraná pine", "Pino Paraná"], {
    scientificName: "Araucaria angustifolia",
    gender: "FEMALE",
    family: "Araucariaceae",
  }),
]

/** Biomes distinguish repeated plant names once the catalog is exhausted. */
export const BIOMES: NonEmpty<{ readonly qualifier: Localized; readonly prefixInEnglish: string }> =
  [
    {
      qualifier: { pt: "da Amazônia", en: "", es: "de la Amazonía" },
      prefixInEnglish: "Amazonian",
    },
    { qualifier: { pt: "do Cerrado", en: "", es: "del Cerrado" }, prefixInEnglish: "Cerrado" },
    { qualifier: { pt: "da Caatinga", en: "", es: "de la Caatinga" }, prefixInEnglish: "Caatinga" },
    {
      qualifier: { pt: "da Mata Atlântica", en: "", es: "de la Mata Atlántica" },
      prefixInEnglish: "Atlantic Forest",
    },
    { qualifier: { pt: "do Pampa", en: "", es: "de la Pampa" }, prefixInEnglish: "Pampas" },
    { qualifier: { pt: "do Pantanal", en: "", es: "del Pantanal" }, prefixInEnglish: "Pantanal" },
  ]

export const CULTIVAR_QUALIFIERS: NonEmpty<{
  readonly pt: Readonly<Record<CatalogPlant["gender"], string>>
  readonly en: string
  readonly es: string
}> = [
  { pt: { MALE: "Roxo", FEMALE: "Roxa" }, en: "Purple", es: "Morada" },
  { pt: { MALE: "Anão", FEMALE: "Anã" }, en: "Dwarf", es: "Enana" },
  { pt: { MALE: "Gigante", FEMALE: "Gigante" }, en: "Giant", es: "Gigante" },
  { pt: { MALE: "Precoce", FEMALE: "Precoce" }, en: "Early", es: "Precoz" },
  { pt: { MALE: "Crioulo", FEMALE: "Crioula" }, en: "Heirloom", es: "Criolla" },
  { pt: { MALE: "Branco", FEMALE: "Branca" }, en: "White", es: "Blanca" },
  { pt: { MALE: "Vermelho", FEMALE: "Vermelha" }, en: "Red", es: "Roja" },
  { pt: { MALE: "Amarelo", FEMALE: "Amarela" }, en: "Yellow", es: "Amarilla" },
]

const localized = ([pt, en, es]: readonly [string, string, string]): Localized => ({ pt, en, es })

export const CONCEPTS: NonEmpty<Localized> = [
  localized(["Agrofloresta", "Agroforestry", "Agroforestería"]),
  localized(["Sucessão ecológica", "Ecological succession", "Sucesión ecológica"]),
  localized(["Adubação verde", "Green manure", "Abono verde"]),
  localized(["Cobertura do solo", "Mulching", "Acolchado"]),
  localized(["Compostagem", "Composting", "Compostaje"]),
  localized(["Soberania alimentar", "Food sovereignty", "Soberanía alimentaria"]),
  localized(["Sementes crioulas", "Heirloom seeds", "Semillas criollas"]),
  localized(["Policultivo", "Polyculture", "Policultivo"]),
  localized(["Biofertilizante", "Biofertilizer", "Biofertilizante"]),
  localized(["Estratificação", "Stratification", "Estratificación"]),
]

/** Names for wiki kinds other than plants and cultivars, keyed by kind. */
export const WIKI_NAMES: Readonly<
  Record<Exclude<WikiArticleKind, "PLANT" | "PLANT_CULTIVAR">, NonEmpty<Localized>>
> = {
  ANIMAL: [
    localized(["Galinha caipira", "Free-range chicken", "Gallina criolla"]),
    localized(["Abelha jataí", "Jataí bee", "Abeja jataí"]),
    localized(["Abelha mandaçaia", "Mandaçaia bee", "Abeja mandaçaia"]),
    localized(["Minhoca", "Earthworm", "Lombriz"]),
    localized(["Pato", "Duck", "Pato"]),
    localized(["Cabra", "Goat", "Cabra"]),
    localized(["Joaninha", "Ladybug", "Mariquita"]),
    localized(["Codorna", "Quail", "Codorniz"]),
    localized(["Porco caipira", "Heritage pig", "Cerdo criollo"]),
    localized(["Tilápia", "Tilapia", "Tilapia"]),
  ],
  BOOK: [
    localized(["O Solo que Respira", "The Breathing Soil", "El Suelo que Respira"]),
    localized(["Sementes da Resistência", "Seeds of Resistance", "Semillas de la Resistencia"]),
    localized([
      "Agrofloresta para Todas as Mãos",
      "Agroforestry for Every Hand",
      "Agroforestería para Todas las Manos",
    ]),
    localized(["Quintais que Alimentam", "Backyards that Feed", "Patios que Alimentan"]),
    localized(["A Roça e o Tempo", "The Field and Time", "La Chacra y el Tiempo"]),
    localized([
      "Caderno de Campo da Mata",
      "Forest Field Notebook",
      "Cuaderno de Campo del Bosque",
    ]),
  ],
  CONCEPT: CONCEPTS,
  FILM: [
    localized(["Raízes da Terra", "Roots of the Land", "Raíces de la Tierra"]),
    localized(["Mulheres da Terra", "Women of the Land", "Mujeres de la Tierra"]),
    localized(["O Caminho das Sementes", "The Path of Seeds", "El Camino de las Semillas"]),
    localized(["Mutirão", "Collective Work Day", "Minga"]),
  ],
  NOTEWORTHY_ENTITY: [
    localized(["Rede de Sementes do Vale", "Valley Seed Network", "Red de Semillas del Valle"]),
    localized(["Escola Família Agrícola", "Family Farm School", "Escuela Familia Agrícola"]),
    localized([
      "Banco Comunitário de Sementes",
      "Community Seed Bank",
      "Banco Comunitario de Semillas",
    ]),
  ],
  RESOURCE: [
    localized(["Guia de consórcios", "Intercropping guide", "Guía de asociaciones"]),
    localized(["Calendário de plantio", "Planting calendar", "Calendario de siembra"]),
    localized(["Cartilha de compostagem", "Composting booklet", "Cartilla de compostaje"]),
    localized(["Mapa de viveiros", "Nursery map", "Mapa de viveros"]),
  ],
  TOOL: [
    localized(["Enxada", "Hoe", "Azada"]),
    localized(["Facão", "Machete", "Machete"]),
    localized(["Tesoura de poda", "Pruning shears", "Tijeras de podar"]),
    localized(["Carrinho de mão", "Wheelbarrow", "Carretilla"]),
    localized(["Biodigestor", "Biodigester", "Biodigestor"]),
    localized(["Plantadeira manual", "Hand seeder", "Sembradora manual"]),
  ],
  UNCATEGORIZED: [
    localized(["Feira de trocas", "Swap fair", "Feria de trueque"]),
    localized(["Casa de sementes", "Seed house", "Casa de semillas"]),
    localized(["Mutirão de plantio", "Planting work party", "Minga de siembra"]),
  ],
}

export const TAGS: NonEmpty<{ readonly names: Localized; readonly cluster: string }> = [
  { names: localized(["Agrofloresta", "Agroforestry", "Agroforestería"]), cluster: "practices" },
  { names: localized(["Compostagem", "Composting", "Compostaje"]), cluster: "practices" },
  { names: localized(["Adubação verde", "Green manure", "Abono verde"]), cluster: "practices" },
  { names: localized(["Irrigação", "Irrigation", "Riego"]), cluster: "practices" },
  { names: localized(["Poda", "Pruning", "Poda"]), cluster: "practices" },
  { names: localized(["Viveiro", "Plant nursery", "Vivero"]), cluster: "practices" },
  {
    names: localized(["Bioconstrução", "Natural building", "Bioconstrucción"]),
    cluster: "practices",
  },
  { names: localized(["Sementes", "Seeds", "Semillas"]), cluster: "commons" },
  { names: localized(["Mutirão", "Collective work", "Minga"]), cluster: "commons" },
  { names: localized(["Feira", "Market", "Feria"]), cluster: "commons" },
  { names: localized(["Reforma agrária", "Land reform", "Reforma agraria"]), cluster: "commons" },
  { names: localized(["Educação", "Education", "Educación"]), cluster: "commons" },
  { names: localized(["Cerrado", "Cerrado", "Cerrado"]), cluster: "ecosystems" },
  {
    names: localized(["Mata Atlântica", "Atlantic Forest", "Mata Atlántica"]),
    cluster: "ecosystems",
  },
  { names: localized(["Amazônia", "Amazon", "Amazonía"]), cluster: "ecosystems" },
  { names: localized(["Caatinga", "Caatinga", "Caatinga"]), cluster: "ecosystems" },
  { names: localized(["Água", "Water", "Agua"]), cluster: "ecosystems" },
  { names: localized(["Polinizadores", "Pollinators", "Polinizadores"]), cluster: "ecosystems" },
  { names: localized(["Receitas", "Recipes", "Recetas"]), cluster: "food" },
  { names: localized(["PANC", "Wild edibles", "Plantas silvestres comestibles"]), cluster: "food" },
  { names: localized(["Conservas", "Preserves", "Conservas"]), cluster: "food" },
  {
    names: localized(["Plantas medicinais", "Medicinal plants", "Plantas medicinales"]),
    cluster: "food",
  },
]

export const FIRST_NAMES: NonEmpty<string> = [
  "Ana",
  "Bruno",
  "Camila",
  "Diego",
  "Eduarda",
  "Fábio",
  "Gabriela",
  "Heitor",
  "Isabela",
  "João",
  "Juliana",
  "Kauã",
  "Larissa",
  "Marcos",
  "Natália",
  "Otávio",
  "Patrícia",
  "Rafael",
  "Sabrina",
  "Tiago",
  "Valentina",
  "Wagner",
  "Yara",
  "Zé",
  "Benedita",
  "Cícero",
  "Dandara",
  "Edson",
  "Francisca",
  "Iara",
  "Luana",
  "Mateus",
  "Raimunda",
  "Sebastião",
  "Tainá",
  "Ubiratã",
  "Lucía",
  "Mateo",
  "Sofía",
]

export const SURNAMES: NonEmpty<string> = [
  "Silva",
  "Souza",
  "Oliveira",
  "Santos",
  "Pereira",
  "Lima",
  "Carvalho",
  "Ferreira",
  "Rodrigues",
  "Almeida",
  "Nascimento",
  "Araújo",
  "Ribeiro",
  "Barbosa",
  "Rocha",
  "Gomes",
  "Moreira",
  "Cardoso",
  "Teixeira",
  "Moura",
  "Guarani",
  "Tupinambá",
  "Quispe",
  "Mamani",
  "Fernández",
  "Paz",
  "Batista",
]

export const PLACES: NonEmpty<string> = [
  "Viçosa, MG",
  "Alto Paraíso, GO",
  "Florianópolis, SC",
  "Recife, PE",
  "Belém, PA",
  "Porto Alegre, RS",
  "Ubatuba, SP",
  "Paraty, RJ",
  "Juazeiro, BA",
  "Botucatu, SP",
  "Londrina, PR",
  "Rio Branco, AC",
  "Manaus, AM",
  "São Luís, MA",
  "Natal, RN",
  "Montevidéu, Uruguai",
  "Cusco, Peru",
  "Bogotá, Colômbia",
  "Chapada Diamantina, BA",
  "Serra da Mantiqueira, MG",
]

export const ORGANIZATION_PREFIXES: NonEmpty<string> = [
  "Cooperativa",
  "Coletivo",
  "Associação",
  "Rede",
  "Instituto",
  "Sítio",
  "Assentamento",
  "Feira",
]

export const ORGANIZATION_CORES: NonEmpty<string> = [
  "Terra Viva",
  "Semente Crioula",
  "Raiz Forte",
  "Mutirão",
  "Floresta Comestível",
  "Água Limpa",
  "Bem Viver",
  "Mãos na Terra",
  "Sabiá",
  "Ipê Amarelo",
  "Beija-flor",
  "Quintal Vivo",
]

export const FILM_GENRES: NonEmpty<string> = ["Documentário", "Drama", "Animação", "Curta-metragem"]

export const AREAS_OF_WORK: NonEmpty<string> = [
  "Agroecologia",
  "Educação do campo",
  "Sementes crioulas",
  "Manejo florestal",
  "Apicultura",
]

export const PUBLISHERS: NonEmpty<string> = [
  "Editora Roça Viva",
  "Edições Mutirão",
  "Editorial Semilla",
  "Casa da Terra Livros",
]

type SentenceTemplate = (words: { plant: string; place: string; concept: string }) => string

/** Sentence templates per language; paragraphs stitch a few together. */
export const SENTENCES: Readonly<Record<SupportedLanguage, NonEmpty<SentenceTemplate>>> = {
  pt: [
    ({ plant }) => `Plantamos ${plant} entre as linhas de banana e o resultado surpreendeu.`,
    ({ place }) => `Aqui em ${place} a chuva voltou mais cedo este ano.`,
    ({ concept }) => `Estamos estudando ${concept} com o grupo do bairro toda quinta-feira.`,
    ({ plant }) => `Alguém tem sementes de ${plant} para trocar na próxima feira?`,
    () => `A cobertura morta segurou a umidade mesmo nas semanas mais secas.`,
    ({ plant, place }) => `O ${plant} que veio de ${place} se adaptou muito bem ao nosso solo.`,
    () => `Fizemos um mutirão para podar as árvores de serviço e picar a matéria orgânica.`,
    ({ concept }) => `Para quem está começando, ${concept} é um bom ponto de partida.`,
    () => `As abelhas nativas apareceram assim que o canteiro de flores floresceu.`,
    ({ plant }) => `Colhemos ${plant} suficiente para dividir com toda a vizinhança.`,
    () => `O composto ficou pronto em seis semanas, escuro e com cheiro de mata.`,
    ({ place }) => `Vamos receber visitas de escolas de ${place} no mês que vem.`,
  ],
  en: [
    ({ plant }) => `We planted ${plant} between the banana rows and the result surprised us.`,
    ({ place }) => `Here in ${place} the rains came back earlier this year.`,
    ({ concept }) => `We are studying ${concept} with the neighborhood group every Thursday.`,
    ({ plant }) => `Does anyone have ${plant} seeds to swap at the next market?`,
    () => `The mulch held moisture even during the driest weeks.`,
    ({ plant, place }) => `The ${plant} that came from ${place} adapted really well to our soil.`,
    () => `We organized a work day to prune the support trees and chop organic matter.`,
    ({ concept }) => `For anyone just starting out, ${concept} is a good entry point.`,
    () => `Native bees showed up as soon as the flower bed bloomed.`,
    ({ plant }) => `We harvested enough ${plant} to share with the whole neighborhood.`,
  ],
  es: [
    ({ plant }) => `Sembramos ${plant} entre las hileras de plátano y el resultado nos sorprendió.`,
    ({ place }) => `Aquí en ${place} las lluvias volvieron antes este año.`,
    ({ concept }) => `Estamos estudiando ${concept} con el grupo del barrio cada jueves.`,
    ({ plant }) => `¿Alguien tiene semillas de ${plant} para intercambiar en la próxima feria?`,
    () => `El acolchado mantuvo la humedad incluso en las semanas más secas.`,
    ({ plant, place }) => `El ${plant} que vino de ${place} se adaptó muy bien a nuestro suelo.`,
    () => `Hicimos una minga para podar los árboles de servicio y picar la materia orgánica.`,
    ({ concept }) => `Para quien está empezando, ${concept} es un buen punto de partida.`,
  ],
}

export const LIST_ITEMS: Readonly<Record<SupportedLanguage, NonEmpty<string>>> = {
  pt: [
    "Separar as sementes",
    "Preparar o composto",
    "Abrir os berços",
    "Cobrir o solo",
    "Irrigar ao entardecer",
  ],
  en: [
    "Sort the seeds",
    "Prepare the compost",
    "Dig the planting holes",
    "Cover the soil",
    "Water at dusk",
  ],
  es: [
    "Separar las semillas",
    "Preparar el compost",
    "Abrir los hoyos",
    "Cubrir el suelo",
    "Regar al atardecer",
  ],
}

export const HEADINGS: Readonly<Record<SupportedLanguage, NonEmpty<string>>> = {
  pt: ["Como fizemos", "O que aprendemos", "Próximos passos", "Materiais"],
  en: ["How we did it", "What we learned", "Next steps", "Materials"],
  es: ["Cómo lo hicimos", "Lo que aprendimos", "Próximos pasos", "Materiales"],
}

export const REJECTION_REASONS: NonEmpty<string> = [
  "Faltam fontes para essa informação.",
  "A edição remove conteúdo revisado recentemente.",
  "Duplicada de outra revisão pendente.",
]

export const MEDIA_CATEGORIES: NonEmpty<string> = [
  "plant",
  "harvest",
  "landscape",
  "people",
  "process",
]
