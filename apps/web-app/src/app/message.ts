import { SupportedLanguage } from "@gororobas/domain/common/enums"
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { UrlRequest } from "foldkit/navigation"
import { Url } from "foldkit/url"

export const Message = defineMessageUnion({
  ClickedLink: { request: UrlRequest },
  ClickedSearchLink: {},
  PressedSearchShortcut: {},
  CompletedFocusSearchField: {},
  ChangedUrl: { url: Url },
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
  CompletedReadToday: { today: Schema.DateTimeUtc },
  CompletedReplaceUrl: {},
  CompletedLoadTranslations: { language: SupportedLanguage, requestNumber: Schema.Int },
  FailedLoadTranslations: { language: SupportedLanguage, requestNumber: Schema.Int },
  CompletedSaveLanguagePreference: {},
})
