import type { Example, Inference, Mention } from "./link-inference-prompts.js"

/** Mentions name the article, possibly by a synonym, a regional name or an inflected form. */
export const mentionExamples: ReadonlyArray<Example<Mention>> = [
  {
    text: "Hoje colhi alfaces e tomates da horta para vender na feira.",
    extractions: [
      { quote: "alfaces", names: { pt: ["alface"], es: ["lechuga"], en: ["lettuce"] } },
      { quote: "tomates", names: { pt: ["tomate"], es: ["tomate"], en: ["tomato"] } },
    ],
  },
  {
    text: "Plantamos moranga e aipim usando técnicas de permacultura no sistema agroflorestal.",
    extractions: [
      {
        quote: "moranga",
        names: {
          pt: ["abóbora", "moranga"],
          es: ["calabaza", "zapallo"],
          en: ["pumpkin", "squash"],
        },
      },
      {
        quote: "aipim",
        names: { pt: ["mandioca", "macaxeira", "aipim"], es: ["yuca"], en: ["cassava"] },
      },
      {
        quote: "permacultura",
        names: { pt: ["permacultura"], es: ["permacultura"], en: ["permaculture"] },
      },
      {
        quote: "sistema agroflorestal",
        names: {
          pt: ["agrofloresta", "sistema agroflorestal"],
          es: ["agroforestería"],
          en: ["agroforestry"],
        },
      },
    ],
  },
  {
    text: "Zea mays was domesticated in Mexico; we sow it with beans and squash.",
    extractions: [
      { quote: "Zea mays", names: { pt: ["milho"], es: ["maíz"], en: ["maize", "corn"] } },
      { quote: "beans", names: { pt: ["feijão"], es: ["frijol"], en: ["bean"] } },
      {
        quote: "squash",
        names: { pt: ["abóbora"], es: ["calabaza"], en: ["squash", "pumpkin"] },
      },
    ],
  },
]

/**
 * Inferences link to what the text is about without naming it. Each needs a rationale a reader can
 * check against the quoted span.
 */
export const inferenceExamples: ReadonlyArray<Example<Inference>> = [
  {
    text: "Preparei pamonha fresquinha essa manhã.",
    extractions: [
      {
        quote: "pamonha",
        names: { pt: ["milho"], es: ["maíz"], en: ["maize", "corn"] },
        rationale: "Pamonha is a dish made from fresh corn.",
      },
    ],
  },
  {
    text: "Zea mays was domesticated in Mexico; we sow it with beans and squash.",
    extractions: [
      {
        quote: "we sow it with beans and squash",
        names: {
          pt: ["milpa", "consórcio de culturas"],
          es: ["milpa"],
          en: ["milpa", "intercropping"],
        },
        rationale:
          "Growing maize together with beans and squash is the milpa intercropping system.",
      },
    ],
  },
  {
    text: "En una reunión comunitaria se discutió convertir el terreno abandonado en una huerta. Necesitamos negociar con el municipio quién puede usar la tierra.",
    extractions: [
      {
        quote: "convertir el terreno abandonado en una huerta",
        names: {
          pt: ["agricultura urbana"],
          es: ["agricultura urbana"],
          en: ["urban agriculture"],
        },
        rationale: "Turning an abandoned municipal lot into a garden is urban agriculture.",
      },
      {
        quote: "negociar con el municipio quién puede usar la tierra",
        names: { pt: ["acesso à terra"], es: ["acceso a la tierra"], en: ["land access"] },
        rationale: "Negotiating who may use the land is about land access.",
      },
    ],
  },
]
