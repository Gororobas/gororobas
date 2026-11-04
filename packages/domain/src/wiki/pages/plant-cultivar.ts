import { Schema } from "effect"

import { OptionalColumn } from "../../common/primitives.js"
import { WikiPlantCultivarArticle } from "../kinds/plant-cultivar.js"
import { WikiPlantArticle } from "../kinds/plant.js"
import { WikiArticleQueriedCardData } from "../wiki-article.js"

/** The plant a cultivar varies from: its page links there, and reads inherited traits from it. */
export const WikiCultivarParentPlant = Schema.Struct({
  card: WikiArticleQueriedCardData,
  attributes: WikiPlantArticle.ProjectedAttributes,
})

export type WikiCultivarParentPlant = typeof WikiCultivarParentPlant.Type

export const WikiPlantCultivarPageData = Schema.Struct({
  ...WikiPlantCultivarArticle.QueriedPageData.fields,
  /** None while the parent plant isn't published. */
  parentPlant: OptionalColumn(WikiCultivarParentPlant),
})

export type WikiPlantCultivarPageData = typeof WikiPlantCultivarPageData.Type
