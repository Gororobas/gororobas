import { Config, Effect } from "effect"

import { LangExtractService } from "./langextract-service.js"
import { langExtractExamples } from "./langextract.examples.js"
import { resolveWikiArticleExtraction } from "./resolve-extractions.js"

const WIKI_ARTICLE_EXTRACTION_PROMPT =
  "Extract wiki articles, including plants, animals, tools, practices, concepts and themes (such as permaculture, harvesting or land access), and other knowledge entities. Map regional names to canonical names and return lowercase, slugified names in PT (wiki_article_pt), ES (wiki_article_es), and EN (wiki_article_en)."

export const extractWikiArticles = Effect.fn("extractWikiArticles")(function* (html: string) {
  const langextract = yield* LangExtractService
  const resolutionConcurrency = yield* Config.Number("CLASSIFICATION_RESOLUTION_CONCURRENCY").pipe(
    Config.withDefault(5),
  )

  const result = yield* langextract.extract(html, {
    promptDescription: WIKI_ARTICLE_EXTRACTION_PROMPT,
    examples: langExtractExamples.wikiArticles,
  })

  return yield* Effect.forEach(result.extractions ?? [], resolveWikiArticleExtraction, {
    concurrency: resolutionConcurrency,
  })
})
