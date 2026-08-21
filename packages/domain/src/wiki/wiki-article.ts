import { Schema } from "effect"

import { AnimalContributorEditableData } from "./animal.js"
import { ConceptContributorEditableData } from "./concept.js"
import { PlantContributorEditableData } from "./plant.js"
import { ToolContributorEditableData } from "./tool.js"
import { UnclassifiedContributorEditableData } from "./unclassified.js"

export const WikiArticleContributorEditableData = Schema.Union([
  AnimalContributorEditableData,
  ConceptContributorEditableData,
  PlantContributorEditableData,
  ToolContributorEditableData,
  UnclassifiedContributorEditableData,
])
