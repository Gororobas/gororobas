import { Schema } from "effect"

import { WikiAnimalArticle } from "./kinds/animal.js"
import { WikiBookArticle } from "./kinds/book.js"
import { WikiConceptArticle } from "./kinds/concept.js"
import { WikiFilmArticle } from "./kinds/film.js"
import { WikiNoteworthyEntityArticle } from "./kinds/noteworthy-entity.js"
import { WikiPlantArticle } from "./kinds/plant.js"
import { WikiResourceArticle } from "./kinds/resource.js"
import { WikiToolArticle } from "./kinds/tool.js"
import { WikiUncategorizedArticle } from "./kinds/uncategorized.js"
import { WikiPlacePageData } from "./pages/place.js"
import { WikiPlantCultivarPageData } from "./pages/plant-cultivar.js"

/**
 * A language-specific article returned by the read APIs. Kinds whose pages show what lives in
 * other articles define their page data in `./pages/`.
 */
export const WikiArticleQueriedPageData = Schema.Union([
  WikiAnimalArticle.QueriedPageData,
  WikiBookArticle.QueriedPageData,
  WikiConceptArticle.QueriedPageData,
  WikiFilmArticle.QueriedPageData,
  WikiNoteworthyEntityArticle.QueriedPageData,
  WikiPlantArticle.QueriedPageData,
  WikiPlantCultivarPageData,
  WikiResourceArticle.QueriedPageData,
  WikiPlacePageData,
  WikiToolArticle.QueriedPageData,
  WikiUncategorizedArticle.QueriedPageData,
]).pipe(Schema.toTaggedUnion("kind"))

export type WikiArticleQueriedPageData = typeof WikiArticleQueriedPageData.Type
