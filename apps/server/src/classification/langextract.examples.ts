import { ExampleData } from "langextract"

// Wiki-article examples for LangExtract
const wikiArticleExamples: ExampleData[] = [
  {
    text: "Hoje colhi alface e tomate da horta para vender na feira.",
    extractions: [
      {
        extractionClass: "wiki_article",
        extractionText: "alface",
        attributes: {
          wiki_article_pt: ["alface"],
          wiki_article_en: ["lettuce"],
          wiki_article_es: ["lechuga"],
        },
      },
      {
        extractionClass: "wiki_article",
        extractionText: "tomate",
        attributes: {
          wiki_article_pt: ["tomate"],
          wiki_article_en: ["tomato"],
          wiki_article_es: ["tomate"],
        },
      },
    ],
  },
  {
    text: "Preparei pamonha fresquinha essa manhã.",
    extractions: [
      {
        extractionClass: "wiki_article",
        extractionText: "pamonha",
        attributes: {
          wiki_article_pt: ["milho"],
          wiki_article_en: ["corn"],
          wiki_article_es: ["maiz"],
        },
      },
    ],
  },
  {
    text: "Plantamos moranga e aipim usando técnicas de permacultura no sistema agroflorestal.",
    extractions: [
      {
        extractionClass: "wiki_article",
        extractionText: "moranga",
        attributes: {
          wiki_article_pt: ["abobora", "moranga"],
          wiki_article_en: ["pumpkin", "squash"],
          wiki_article_es: ["calabaza", "ayuama", "zapallo"],
        },
      },
      {
        extractionClass: "wiki_article",
        extractionText: "aipim",
        attributes: {
          wiki_article_pt: ["mandioca", "macaxeira", "aipim"],
          wiki_article_en: ["cassava", "yuca"],
          wiki_article_es: ["yuca", "cassava"],
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
  wikiArticles: wikiArticleExamples,
  tags: tagExamples,
}
