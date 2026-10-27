import type { WikiArticleKind } from "@gororobas/domain/wiki/domain"
import type { Html } from "foldkit/html"

import * as Icons from "./index"
import type { IconConfig } from "./reicon-generator"

/** Stands in for each kind of article where it has no photo, and marks it in browse tiles. */
export const wikiKindIcons: Readonly<Record<WikiArticleKind, (config?: IconConfig) => Html>> = {
  PLANT: Icons.leaf,
  PLANT_CULTIVAR: Icons.layers,
  CONCEPT: Icons.lightbulb,
  BOOK: Icons.book,
  FILM: Icons.video,
  ANIMAL: Icons.paw,
  TOOL: Icons.sledgehammer,
  RESOURCE: Icons.link,
  NOTEWORTHY_ENTITY: Icons.buildings,
  UNCATEGORIZED: Icons.box,
}
