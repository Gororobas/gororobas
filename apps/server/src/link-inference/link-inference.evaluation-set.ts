/**
 * Hand-labelled passages for measuring link inference against a real language model.
 * Keep labels strict: a mention is only labelled when the passage names the article; an inference
 * only when a reader would agree the passage is about it without naming it.
 */
import type { SupportedLanguage, WikiArticleKind } from "@gororobas/domain"

export const evaluationArticles = {
  milho: { kind: "PLANT", names: ["milho", "maíz", "maize", "corn", "Zea mays"] },
  feijao: { kind: "PLANT", names: ["feijão", "frijol", "bean", "Phaseolus vulgaris"] },
  abobora: { kind: "PLANT", names: ["abóbora", "moranga", "calabaza", "squash", "pumpkin"] },
  mandioca: { kind: "PLANT", names: ["mandioca", "aipim", "macaxeira", "yuca", "cassava"] },
  banana: { kind: "PLANT", names: ["banana", "bananeira", "plátano"] },
  tomate: { kind: "PLANT", names: ["tomate", "tomato"] },
  milpa: { kind: "CONCEPT", names: ["milpa", "três irmãs", "three sisters"] },
  agrofloresta: {
    kind: "CONCEPT",
    names: ["agrofloresta", "sistema agroflorestal", "agroforestería", "agroforestry"],
  },
  compostagem: { kind: "CONCEPT", names: ["compostagem", "compostaje", "composting"] },
  adubacaoVerde: {
    kind: "CONCEPT",
    names: ["adubação verde", "abono verde", "green manure", "cover crop"],
  },
  agriculturaUrbana: {
    kind: "CONCEPT",
    names: ["agricultura urbana", "urban agriculture", "horta urbana"],
  },
  acessoATerra: { kind: "CONCEPT", names: ["acesso à terra", "acceso a la tierra", "land access"] },
  sementesCrioulas: {
    kind: "CONCEPT",
    names: ["sementes crioulas", "semillas criollas", "heirloom seeds", "landrace seeds"],
  },
  galinha: { kind: "ANIMAL", names: ["galinha", "gallina", "chicken"] },
  minhoca: { kind: "ANIMAL", names: ["minhoca", "lombriz", "earthworm"] },
} satisfies Record<string, { kind: WikiArticleKind; names: ReadonlyArray<string> }>

export type EvaluationArticle = keyof typeof evaluationArticles

export interface EvaluationCase {
  readonly name: string
  readonly language: SupportedLanguage
  readonly paragraphs: ReadonlyArray<string>
  readonly mentions: ReadonlyArray<EvaluationArticle>
  readonly inferences: ReadonlyArray<EvaluationArticle>
}

export const evaluationCases: ReadonlyArray<EvaluationCase> = [
  {
    name: "regional names and plurals",
    language: "pt",
    paragraphs: ["Colhemos macaxeira e uns tomates maduros na horta do quintal."],
    mentions: ["mandioca", "tomate"],
    inferences: [],
  },
  {
    name: "dish implying its ingredient",
    language: "pt",
    paragraphs: ["Fizemos pamonha e curau para a festa junina da comunidade."],
    mentions: [],
    inferences: ["milho"],
  },
  {
    name: "three sisters without the name",
    language: "en",
    paragraphs: [
      "We sowed corn first, then climbing beans around each stalk and squash between the rows to shade the soil.",
    ],
    mentions: ["milho", "feijao", "abobora"],
    inferences: ["milpa"],
  },
  {
    name: "composting by description",
    language: "es",
    paragraphs: [
      "Juntamos las cáscaras de la cocina con hojas secas y lo dejamos descomponer unos meses; las lombrices hicieron el resto.",
    ],
    mentions: ["minhoca"],
    inferences: ["compostagem"],
  },
  {
    name: "scientific name",
    language: "pt",
    paragraphs: ["A Zea mays foi domesticada no México há cerca de nove mil anos."],
    mentions: ["milho"],
    inferences: [],
  },
  {
    name: "land access struggle",
    language: "pt",
    paragraphs: [
      "O assentamento ainda espera a regularização do lote pelo INCRA para poder plantar sem medo de despejo.",
    ],
    mentions: [],
    inferences: ["acessoATerra"],
  },
  {
    name: "urban garden",
    language: "es",
    paragraphs: [
      "En la azotea del edificio montamos cajones con tierra y ahora cosechamos tomates para todo el barrio.",
    ],
    mentions: ["tomate"],
    inferences: ["agriculturaUrbana"],
  },
  {
    name: "green manure",
    language: "en",
    paragraphs: [
      "Before planting the beds we grew a mix of legumes and cut them down to rot on the soil and feed it nitrogen.",
    ],
    mentions: [],
    inferences: ["adubacaoVerde"],
  },
  {
    name: "agroforestry named",
    language: "pt",
    paragraphs: [
      "No sistema agroflorestal, a bananeira cresce rápido e faz sombra para as mudas de cacau.",
    ],
    mentions: ["agrofloresta", "banana"],
    inferences: [],
  },
  {
    name: "seed saving",
    language: "pt",
    paragraphs: [
      "Guardamos as sementes do feijão que a avó plantava, passadas de geração em geração na família.",
      "As galinhas ciscam o quintal depois da colheita.",
    ],
    mentions: ["feijao", "galinha"],
    inferences: ["sementesCrioulas"],
  },
  {
    name: "unrelated announcement",
    language: "pt",
    paragraphs: ["A reunião de sábado mudou para as dez horas. Confirmem presença até amanhã."],
    mentions: [],
    inferences: [],
  },
  {
    name: "ingredients do not imply a farming system",
    language: "en",
    paragraphs: ["At the market I bought corn, beans and squash for dinner."],
    mentions: ["milho", "feijao", "abobora"],
    inferences: [],
  },
  {
    name: "named composting is not implicit",
    language: "es",
    paragraphs: ["Hacemos compostaje con las cáscaras y las hojas secas del patio."],
    mentions: ["compostagem"],
    inferences: [],
  },
  {
    name: "generic seeds do not imply heirlooms",
    language: "pt",
    paragraphs: ["Comprei sementes de tomate na loja e plantei ontem."],
    mentions: ["tomate"],
    inferences: [],
  },
  {
    name: "rural garden is not urban agriculture",
    language: "es",
    paragraphs: ["En nuestra finca rural cosechamos yuca lejos de la ciudad."],
    mentions: ["mandioca"],
    inferences: [],
  },
  {
    name: "trees and crops imply agroforestry",
    language: "en",
    paragraphs: [
      "We grow banana beneath timber trees in the same plot, managing both layers together for fruit, wood and shade.",
    ],
    mentions: ["banana"],
    inferences: ["agrofloresta"],
  },
  {
    name: "inference must use evidence across paragraphs",
    language: "es",
    paragraphs: [
      "Sembramos maíz en las primeras lluvias.",
      "Luego pusimos frijol trepador alrededor de sus tallos y calabaza para cubrir el suelo entre las filas.",
    ],
    mentions: ["milho", "feijao", "abobora"],
    inferences: ["milpa"],
  },
  {
    name: "repeated mentions count once",
    language: "pt",
    paragraphs: [
      "A mandioca cresceu bem.",
      "Colhemos mandioca e repartimos a mandioca com a vizinhança.",
    ],
    mentions: ["mandioca"],
    inferences: [],
  },
  {
    name: "unknown articles remain suggestions",
    language: "en",
    paragraphs: ["We harvested lettuce and radishes today."],
    mentions: [],
    inferences: [],
  },
  {
    name: "span offsets after emoji",
    language: "pt",
    paragraphs: ["🌱 Hoje colhemos macaxeiras e tomates para o almoço."],
    mentions: ["mandioca", "tomate"],
    inferences: [],
  },
]
