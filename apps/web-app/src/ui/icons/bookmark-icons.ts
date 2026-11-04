import type { BookmarkState } from "@gororobas/domain/common/enums"
import type { WikiArticleKind } from "@gororobas/domain/wiki/domain"
import type { Html } from "foldkit/html"

import * as Icons from "./index"
import type { IconConfig } from "./reicon-generator"

type Icon = (config?: IconConfig) => Html

/** What being in the middle of it looks like for each kind: planting, reading, watching… */
const activeIcons: Readonly<Record<WikiArticleKind, Icon>> = {
  PLANT: Icons.sprout,
  PLANT_CULTIVAR: Icons.sprout,
  ANIMAL: Icons.paw,
  BOOK: Icons.bookOpen,
  FILM: Icons.playCircle,
  CONCEPT: Icons.lightbulb,
  PLACE: Icons.mapPoint,
  TOOL: Icons.sledgehammer,
  RESOURCE: Icons.glasses,
  NOTEWORTHY_ENTITY: Icons.handHeart,
  UNCATEGORIZED: Icons.clipboardCheck,
}

/** Marks a bookmark state, in the kind's own terms where they differ. */
export const bookmarkStateIcon = (kind: WikiArticleKind, state: BookmarkState): Icon =>
  ({
    INTERESTED: Icons.heart,
    ACTIVE: activeIcons[kind],
    PREVIOUSLY_ACTIVE: Icons.history,
    INDIFFERENT: Icons.closeCircle,
  })[state]
