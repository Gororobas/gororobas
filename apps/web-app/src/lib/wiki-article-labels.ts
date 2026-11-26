import type { BookmarkState } from "@gororobas/domain/common/enums"
import type { WikiArticleQueriedCardData } from "@gororobas/domain/wiki/domain"
import { msg, select } from "@lingui/core/macro"
import { Option } from "effect"

import type { Translator } from "./translations"
import { bookmarkVocabularies, wikiKindLabels } from "./vocabulary"
import { nameParts } from "./wiki-article-names"

/** "Variety of Corn" when a cultivar's plant is known, otherwise the kind's name. */
export const kindLabel = (article: WikiArticleQueriedCardData, i18n: Translator): string => {
  const kind = i18n._(wikiKindLabels[article.kind].singular)

  return Option.match(article.parentPlantName, {
    onNone: () => kind,
    onSome: (parentName) => {
      const { name, gender } = nameParts({ commonNames: [parentName], handle: parentName.name })
      return i18n._(msg`${select(gender, { other: `${kind} of ${name}` })}`)
    },
  })
}

/** How the reader saved the article, such as "Want to plant it", when they did. */
export const bookmarkLabel = (
  {
    article,
    maybeBookmarkState,
  }: Readonly<{
    article: WikiArticleQueriedCardData
    maybeBookmarkState: Option.Option<BookmarkState>
  }>,
  i18n: Translator,
): Option.Option<string> =>
  Option.map(maybeBookmarkState, (state) =>
    i18n._(bookmarkVocabularies[article.kind].states[state]),
  )
