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
      {
        extractionClass: "wiki_article",
        extractionText: "permacultura",
        attributes: {
          wiki_article_pt: ["permacultura"],
          wiki_article_en: ["permaculture"],
          wiki_article_es: ["permacultura"],
        },
      },
      {
        extractionClass: "wiki_article",
        extractionText: "sistema agroflorestal",
        attributes: {
          wiki_article_pt: ["agrofloresta", "sistema agroflorestal"],
          wiki_article_en: ["agroforestry"],
          wiki_article_es: ["agroforesteria"],
        },
      },
    ],
  },
  {
    text: "En una reunión comunitaria se discutió la propuesta de convertir el terreno abandonado en una granja urbana. Necesitamos abordar la tenencia de la tierra, negociar con el municipio y organizar jornadas de siembra voluntaria para demostrar su uso productivo.",
    extractions: [
      {
        extractionClass: "wiki_article",
        extractionText: "granja urbana",
        attributes: {
          wiki_article_pt: ["agricultura urbana"],
          wiki_article_en: ["urban agriculture"],
          wiki_article_es: ["agricultura urbana"],
        },
      },
      {
        extractionClass: "wiki_article",
        extractionText: "tenencia de la tierra",
        attributes: {
          wiki_article_pt: ["acesso a terra"],
          wiki_article_en: ["land access"],
          wiki_article_es: ["acceso a la tierra", "tenencia de la tierra"],
        },
      },
    ],
  },
]

export const langExtractExamples = {
  wikiArticles: wikiArticleExamples,
}
