import { ExampleData } from "langextract"

// Vegetable-specific examples for LangExtract
const vegetableExamples: ExampleData[] = [
  {
    text: "Hoje colhi alface e tomate da horta para vender na feira.",
    extractions: [
      {
        extractionClass: "vegetable",
        extractionText: "alface",
        attributes: {
          vegetable_pt: ["alface"],
          vegetable_en: ["lettuce"],
          vegetable_es: ["lechuga"],
        },
      },
      {
        extractionClass: "vegetable",
        extractionText: "tomate",
        attributes: {
          vegetable_pt: ["tomate"],
          vegetable_en: ["tomato"],
          vegetable_es: ["tomate"],
        },
      },
    ],
  },
  {
    text: "Preparei pamonha fresquinha essa manhã.",
    extractions: [
      {
        extractionClass: "vegetable",
        extractionText: "pamonha",
        attributes: { vegetable_pt: ["milho"], vegetable_en: ["corn"], vegetable_es: ["maiz"] },
      },
    ],
  },
  {
    text: "Plantamos moranga e aipim usando técnicas de permacultura no sistema agroflorestal.",
    extractions: [
      {
        extractionClass: "vegetable",
        extractionText: "moranga",
        attributes: {
          vegetable_pt: ["abobora", "moranga"],
          vegetable_en: ["pumpkin", "squash"],
          vegetable_es: ["calabaza", "ayuama", "zapallo"],
        },
      },
      {
        extractionClass: "vegetable",
        extractionText: "aipim",
        attributes: {
          vegetable_pt: ["mandioca", "macaxeira", "aipim"],
          vegetable_en: ["cassava", "yuca"],
          vegetable_es: ["yuca", "cassava"],
        },
      },
    ],
  },
]

// Tag-specific examples for LangExtract
const tagExamples: ExampleData[] = [
  {
    text: "Hoje colhi alface e tomate da horta para vender na feira.",
    extractions: [
      {
        extractionClass: "tag",
        extractionText: "colhi",
        attributes: { tag: "colheita", status: "existing" },
      },
      {
        extractionClass: "tag",
        extractionText: "vender",
        attributes: { tag: "comercializacao", status: "existing" },
      },
    ],
  },
  {
    text: "Plantamos moranga e aipim usando técnicas de permacultura no sistema agroflorestal.",
    extractions: [
      {
        extractionClass: "tag",
        extractionText: "plantamos",
        attributes: { tag: "plantio", status: "existing" },
      },
      {
        extractionClass: "tag",
        extractionText: "permacultura",
        attributes: { tag: "permacultura", status: "existing" },
      },
      {
        extractionClass: "tag",
        extractionText: "sistema agroflorestal",
        attributes: {
          tag: "agrofloresta",
          name_pt: "Agrofloresta",
          name_en: "Forest Gardens",
          name_es: "Agroforestería",
          status: "suggested",
        },
      },
    ],
  },
  {
    text: "En una reunión comunitaria se discutió la propuesta de convertir el terreno abandonado en una granja urbana. Necesitamos abordar la tenencia de la tierra, negociar con el municipio y organizar jornadas de siembra voluntaria para demostrar su uso productivo.",
    extractions: [
      {
        extractionClass: "tag",
        extractionText: "granja urbana",
        attributes: { tag: "agricultura-urbana", status: "existing" },
      },
      {
        extractionClass: "tag",
        extractionText: "convertir el terreno abandonado en una granja urbana",
        attributes: {
          tag: "soberania-alimentar",
          name_pt: "Soberania Alimentar",
          name_en: "Food Sovereignty",
          name_es: "Soberanía Alimentaria",
          status: "suggested",
        },
      },
    ],
  },
]

export const langExtractExamples = {
  vegetables: vegetableExamples,
  tags: tagExamples,
}
