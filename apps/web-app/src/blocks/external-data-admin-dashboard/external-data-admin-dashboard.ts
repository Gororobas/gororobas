import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import { ExternalDataObservationId } from "@gororobas/domain/common/ids"
import {
  ExternalDataObservationDetail,
  type ExternalDataObservationLogEntry,
  ExternalDataObservationLogPage,
  type ExternalDataProvider,
} from "@gororobas/domain/wiki/domain"
import { msg, plural } from "@lingui/core/macro"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, DateTime, Effect, Layer, Option, Schema } from "effect"
import { AsyncData, Block } from "foldkit"
import type { Html } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"

import { GororobasApiClient } from "../../api-client"
import {
  ObservationLogQuery,
  observationLogUrl,
  wikiArticleDebugUrl,
  wikiArticleUrl,
} from "../../app/route"
import { ClientFailure } from "../../lib/client-failure"
import { type LanguageInputs, intlTags } from "../../lib/language"
import { type Translator, translatorFor } from "../../lib/translations"
import { wikiKindLabels } from "../../lib/vocabulary"
import { AppButton } from "../../ui/app-button"
import { AppText } from "../../ui/app-text"
import { Chip } from "../../ui/chip"
import * as Icons from "../../ui/icons"
import { styledAttributes } from "../../ui/pleat-attributes"
import { ProviderMark } from "../../ui/provider-mark"
import { SectionCard } from "../../ui/section-card"
import { focusRingDeclarations } from "../../ui/styles/focus-ring"
import { pageColumnStyle } from "../../ui/styles/page-column"
import { emptyStateStyle } from "../../ui/styles/surfaces"
import {
  borderWidth,
  breakpoint,
  fontFamily,
  fontSize,
  fontWeight,
  radius,
  space,
  toneColors,
  tones,
} from "../../ui/theme"

// MODEL

const LogResult = AsyncData.Schema(ExternalDataObservationLogPage, ClientFailure)
const DetailResult = AsyncData.Schema(ExternalDataObservationDetail, ClientFailure)

const OpenObservation = Schema.Struct({
  id: ExternalDataObservationId,
  detailAsyncData: DetailResult.schema,
})

const Model = Schema.Struct({
  query: ObservationLogQuery,
  logAsyncData: LogResult.schema,
  /** One observation's stored responses at a time: they can weigh megabytes. */
  maybeOpenObservation: Schema.Option(OpenObservation),
})

type Model = typeof Model.Type

const Message = defineMessageUnion({
  SucceededLoadLog: { page: ExternalDataObservationLogPage },
  FailedLoadLog: { error: ClientFailure },
  ClickedShowResponse: { id: ExternalDataObservationId },
  ClickedHideResponse: {},
  SucceededLoadObservation: { detail: ExternalDataObservationDetail },
  FailedLoadObservation: { error: ClientFailure },
})

export const ExternalDataAdminDashboardKey = Symbol("ExternalDataAdminDashboard")

export const ExternalDataAdminDashboardBlock = Block.make("ExternalDataAdminDashboard", {
  key: ExternalDataAdminDashboardKey,
  Init: Schema.Tuple([ObservationLogQuery]),
  view: { kind: "Element", Inputs: Block.makeInputContract<LanguageInputs>() },
  effects: { services: [GororobasApiClient] },
  Model,
  Message,
})

const ExternalDataAdminDashboardComposition = ExternalDataAdminDashboardBlock.makeComposition()
type ViewBuilder = Block.ViewBuilderFor<typeof ExternalDataAdminDashboardComposition>

// COMMANDS

const LoadLog = ExternalDataAdminDashboardBlock.makeCommand("LoadLog", {
  args: { query: ObservationLogQuery },
  messages: [Message.SucceededLoadLog, Message.FailedLoadLog],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ query }) =>
      api.wiki
        .listExternalDataObservations({
          query: {
            ...Option.match(query.provider, {
              onNone: () => ({}),
              onSome: (provider) => ({ provider }),
            }),
            ...Option.match(query.outcome, {
              onNone: () => ({}),
              onSome: (outcome) => ({ outcome }),
            }),
            ...Option.match(query.wikiArticleId, {
              onNone: () => ({}),
              onSome: (wikiArticleId) => ({ wikiArticleId }),
            }),
            currentPage: query.currentPage,
          },
        })
        .pipe(
          Effect.match({
            onFailure: (error) => Message.FailedLoadLog({ error: { cause: error } }),
            onSuccess: (page) => Message.SucceededLoadLog({ page }),
          }),
        )
  },
})

const LoadObservation = ExternalDataAdminDashboardBlock.makeCommand("LoadObservation", {
  args: { id: ExternalDataObservationId },
  messages: [Message.SucceededLoadObservation, Message.FailedLoadObservation],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ id }) =>
      api.wiki.getExternalDataObservation({ params: { observationId: id } }).pipe(
        Effect.match({
          onFailure: (error) => Message.FailedLoadObservation({ error: { cause: error } }),
          onSuccess: (detail) => Message.SucceededLoadObservation({ detail }),
        }),
      )
  },
})

// INIT & UPDATE

const init = ExternalDataAdminDashboardComposition.makeInit((query: ObservationLogQuery) => ({
  model: { query, logAsyncData: LogResult.Loading(), maybeOpenObservation: Option.none() },
  commands: [LoadLog({ query })],
}))

const update = ExternalDataAdminDashboardComposition.makeUpdate({
  SucceededLoadLog: (model, { page }) => ({
    model: modifyFields(model, { logAsyncData: () => LogResult.Success({ data: page }) }),
  }),
  FailedLoadLog: (model, { error }) => ({
    model: modifyFields(model, { logAsyncData: () => LogResult.Failure({ error }) }),
  }),
  ClickedShowResponse: (model, { id }) => ({
    model: modifyFields(model, {
      maybeOpenObservation: () => Option.some({ id, detailAsyncData: DetailResult.Loading() }),
    }),
    commands: [LoadObservation({ id })],
  }),
  ClickedHideResponse: (model) => ({
    model: modifyFields(model, { maybeOpenObservation: () => Option.none() }),
  }),
  // A response that arrives after another observation was opened is dropped.
  SucceededLoadObservation: (model, { detail }) => ({
    model: modifyFields(model, {
      maybeOpenObservation: Option.map((open) =>
        open.id === detail.entry.id
          ? { ...open, detailAsyncData: DetailResult.Success({ data: detail }) }
          : open,
      ),
    }),
  }),
  FailedLoadObservation: (model, { error }) => ({
    model: modifyFields(model, {
      maybeOpenObservation: Option.map((open) => ({
        ...open,
        detailAsyncData: DetailResult.Failure({ error }),
      })),
    }),
  }),
})

// STYLES

const pageStyle = Style.make({
  display: "grid",
  rowGap: space[5],
  paddingBlock: space[6],
}).pipe(Style.when(breakpoint.md, { rowGap: space[6], paddingBlock: space[8] }))

const introStyle = Style.make({ display: "grid", rowGap: space[2] })

const tallyGridStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(16rem, 100%), 1fr))",
  gap: space[3],
})

const tallyStyle = Style.make({
  display: "grid",
  rowGap: space[1],
  padding: space[4],
  border: `${borderWidth.hairline} solid ${toneColors.border}`,
  borderRadius: radius.lg,
  backgroundColor: toneColors.backgroundCard,
})

const tallyHeaderStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[2],
  fontSize: fontSize.large,
  fontWeight: fontWeight.semibold,
})

const filterRowStyle = Style.make({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: space[2],
})

const filterGroupsStyle = Style.make({ display: "grid", rowGap: space[3] })

const entryListStyle = Style.make({ display: "grid", rowGap: space[3], padding: 0, margin: 0 })

const entryStyle = Style.make({
  display: "grid",
  rowGap: space[2],
  padding: space[4],
  border: `${borderWidth.hairline} solid ${toneColors.border}`,
  borderRadius: radius.lg,
  backgroundColor: toneColors.backgroundCard,
  listStyle: "none",
})

const entryHeaderStyle = Style.make({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  columnGap: space[3],
  rowGap: space[1],
})

const outcomeBadgeStyle = Style.make({
  display: "inline-flex",
  alignItems: "center",
  gap: space[1],
  paddingBlock: space[1],
  paddingInline: space[2],
  borderRadius: radius.full,
  fontSize: fontSize.caption,
  fontWeight: fontWeight.semibold,
})

const successBadgeStyle = Style.make({
  backgroundColor: tones.primary.ramp[400],
  color: tones.neutral.ramp[900],
})

const failureBadgeStyle = Style.make({
  backgroundColor: tones.destructive.ramp[400],
  color: tones.destructive.ramp[900],
})

const linkStyle = Style.make({
  color: tones.accent.shade[800],
  fontWeight: fontWeight.semibold,
  textDecorationLine: "underline",
  textDecorationColor: tones.accent.shade[300],
  textUnderlineOffset: "0.2em",
  borderRadius: radius.sm,
  outline: "none",
  overflowWrap: "anywhere",
}).pipe(
  Style.when(When.hover, { textDecorationColor: tones.accent.shade[700] }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

const detailListStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "max-content minmax(0, 1fr)",
  columnGap: space[4],
  rowGap: space[1],
  margin: 0,
  fontSize: fontSize.footnote,
})

const termStyle = Style.make({ color: tones.neutral.shade[700] })
const definitionStyle = Style.make({ margin: 0, minInlineSize: 0 })

const codeStyle = Style.make({
  fontFamily: fontFamily.code,
  fontSize: fontSize.caption,
  overflowWrap: "anywhere",
})

const errorStyle = Style.make({
  padding: space[3],
  borderRadius: radius.md,
  backgroundColor: tones.destructive.ramp[400],
  color: tones.destructive.ramp[900],
  fontFamily: fontFamily.code,
  fontSize: fontSize.caption,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
})

const responseStyle = Style.make({
  maxBlockSize: "32rem",
  overflow: "auto",
  margin: 0,
  padding: space[3],
  borderRadius: radius.md,
  backgroundColor: tones.neutral.shade[100],
  fontFamily: fontFamily.code,
  fontSize: fontSize.caption,
})

const actionsStyle = Style.make({ display: "flex", flexWrap: "wrap", gap: space[2] })

const paginationStyle = Style.make({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space[3],
})

// VIEW

const providerOptions: ReadonlyArray<typeof ExternalDataProvider.Type> = [
  "WIKIDATA",
  "GBIF",
  "GOOGLE_BOOKS",
]

const formatDateTime = (date: DateTime.Utc, language: SupportedLanguage): string =>
  new Intl.DateTimeFormat(intlTags[language], { dateStyle: "short", timeStyle: "medium" }).format(
    DateTime.toDate(date),
  )

const formatSize = (characters: number): string =>
  characters < 1024 ? `${characters} B` : `${(characters / 1024).toFixed(1)} KB`

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Json, { space: 2 }))
const encodeCompactJson = Schema.encodeSync(Schema.fromJsonString(Schema.Json))

const isForbidden = (error: ClientFailure): boolean =>
  Schema.is(Schema.TaggedStruct("UnauthorizedError", {}))(error.cause)

type LanguageState = Readonly<{ language: SupportedLanguage; i18n: Translator }>

const filters = (
  { language, i18n, query }: LanguageState & Readonly<{ query: ObservationLogQuery }>,
  h: ViewBuilder,
): Html => {
  const reset = { ...query, currentPage: 0 }

  return h.div(styledAttributes([], filterGroupsStyle), [
    h.div(styledAttributes([h.Role("group"), h.AriaLabel(i18n._(msg`Provider`))], filterRowStyle), [
      Chip.view(
        {
          label: i18n._(msg`All providers`),
          href: observationLogUrl(language, { ...reset, provider: Option.none() }),
          appearance: Option.isNone(query.provider) ? "selectedOption" : "option",
        },
        h,
      ),
      ...providerOptions.map((provider) =>
        Chip.view(
          {
            label: ProviderMark.names[provider],
            href: observationLogUrl(language, { ...reset, provider: Option.some(provider) }),
            appearance: Option.contains(query.provider, provider) ? "selectedOption" : "option",
          },
          h,
        ),
      ),
    ]),
    h.div(styledAttributes([h.Role("group"), h.AriaLabel(i18n._(msg`Outcome`))], filterRowStyle), [
      Chip.view(
        {
          label: i18n._(msg`All outcomes`),
          href: observationLogUrl(language, { ...reset, outcome: Option.none() }),
          appearance: Option.isNone(query.outcome) ? "selectedOption" : "option",
        },
        h,
      ),
      Chip.view(
        {
          label: i18n._(msg`Successes`),
          href: observationLogUrl(language, { ...reset, outcome: Option.some("Success") }),
          appearance: Option.contains(query.outcome, "Success") ? "selectedOption" : "option",
        },
        h,
      ),
      Chip.view(
        {
          label: i18n._(msg`Failures`),
          href: observationLogUrl(language, { ...reset, outcome: Option.some("Failure") }),
          appearance: Option.contains(query.outcome, "Failure") ? "selectedOption" : "option",
        },
        h,
      ),
      ...EffectArray.fromOption(
        Option.map(query.wikiArticleId, () =>
          Chip.view(
            {
              label: `${i18n._(msg`Only this article`)} ✕`,
              href: observationLogUrl(language, { ...reset, wikiArticleId: Option.none() }),
              appearance: "selectedOption",
            },
            h,
          ),
        ),
      ),
    ]),
  ])
}

const tallies = (
  { page, language, i18n }: LanguageState & Readonly<{ page: ExternalDataObservationLogPage }>,
  h: ViewBuilder,
): Html =>
  h.div(
    styledAttributes([], tallyGridStyle),
    page.tallies.map((tally) =>
      h.keyed("section")(
        tally.provider,
        styledAttributes([h.AriaLabel(ProviderMark.names[tally.provider])], tallyStyle),
        [
          h.div(styledAttributes([], tallyHeaderStyle), [
            ProviderMark.view(tally.provider),
            ...(ProviderMark.isWordmark[tally.provider]
              ? []
              : [ProviderMark.names[tally.provider]]),
          ]),
          AppText.view(
            {
              element: "p",
              children: [
                `${i18n._(msg`${plural(tally.successes, { one: "# success", other: "# successes" })}`)} · ${i18n._(msg`${plural(tally.failures, { one: "# failure", other: "# failures" })}`)}`,
              ],
            },
            h,
          ),
          AppText.view(
            {
              element: "p",
              appearance: "footnote",
              tone: tally.articlesFailing > 0 ? "destructive" : "neutral",
              children: [
                i18n._(
                  msg`${plural(tally.articlesFailing, {
                    one: "# article failed in its latest fetch",
                    other: "# articles failed in their latest fetch",
                  })}`,
                ),
              ],
            },
            h,
          ),
          ...EffectArray.fromOption(
            Option.map(Option.fromNullishOr(tally.lastObservedAt), (date) =>
              AppText.view(
                {
                  element: "p",
                  appearance: "footnote",
                  isMuted: true,
                  children: [i18n._(msg`Latest observation: ${formatDateTime(date, language)}`)],
                },
                h,
              ),
            ),
          ),
        ],
      ),
    ),
  )

const detail = (
  { term, children }: Readonly<{ term: string; children: ReadonlyArray<Html | string> }>,
  h: ViewBuilder,
): ReadonlyArray<Html> => [
  h.dt(styledAttributes([], termStyle), [term]),
  h.dd(styledAttributes([], definitionStyle), children),
]

const response = (
  {
    model,
    entry,
    i18n,
  }: Readonly<{ model: Model; entry: ExternalDataObservationLogEntry; i18n: Translator }>,
  h: ViewBuilder,
) =>
  Option.match(
    Option.filter(model.maybeOpenObservation, (open) => open.id === entry.id),
    {
      onNone: () => [
        AppButton.view(
          {
            children: [Icons.maximize({ size: "sm" }), i18n._(msg`See stored response`)],
            onClick: Message.ClickedShowResponse({ id: entry.id }),
            mode: "outline",
            tone: "neutral",
            size: "sm",
          },
          h,
        ),
      ],
      onSome: (open) => [
        AppButton.view(
          {
            children: [Icons.x({ size: "sm" }), i18n._(msg`Hide response`)],
            onClick: Message.ClickedHideResponse(),
            mode: "outline",
            tone: "neutral",
            size: "sm",
          },
          h,
        ),
        AsyncData.matchData(open.detailAsyncData, {
          onEmpty: () =>
            AppText.view(
              {
                element: "p",
                appearance: "footnote",
                attributes: [h.Role("status")],
                children: [i18n._(msg`Loading response…`)],
              },
              h,
            ),
          onFailure: () =>
            AppText.view(
              {
                element: "p",
                appearance: "footnote",
                tone: "destructive",
                children: [i18n._(msg`Couldn't load the response.`)],
              },
              h,
            ),
          onData: (loaded) =>
            h.pre(styledAttributes([], responseStyle), [encodeJson(loaded.outcome)]),
        }),
      ],
    },
  )

const entryView = (
  {
    model,
    language,
    i18n,
    entry,
  }: LanguageState &
    Readonly<{
      model: Model
      entry: ExternalDataObservationLogEntry
    }>,
  h: ViewBuilder,
): Html =>
  h.keyed("li")(entry.id, styledAttributes([], entryStyle), [
    h.div(styledAttributes([], entryHeaderStyle), [
      ProviderMark.view(entry.provider),
      h.span(
        styledAttributes(
          [],
          outcomeBadgeStyle,
          entry.outcome === "Success" ? successBadgeStyle : failureBadgeStyle,
        ),
        [entry.outcome === "Success" ? i18n._(msg`Success`) : i18n._(msg`Failure`)],
      ),
      h.a(
        styledAttributes(
          [
            h.Href(
              wikiArticleUrl(language, { kind: entry.article.kind, handle: entry.article.handle }),
            ),
          ],
          linkStyle,
        ),
        [entry.article.title ?? entry.article.handle],
      ),
      AppText.view(
        {
          element: "span",
          appearance: "footnote",
          isMuted: true,
          children: [
            `${i18n._(wikiKindLabels[entry.article.kind].singular)} · ${formatDateTime(entry.observedAt, language)}`,
          ],
        },
        h,
      ),
    ]),
    h.dl(styledAttributes([], detailListStyle), [
      ...detail(
        {
          term: i18n._(msg`Input`),
          children: [h.code(styledAttributes([], codeStyle), [encodeCompactJson(entry.inputs)])],
        },
        h,
      ),
      ...entry.sources.flatMap((source) =>
        detail(
          {
            term: source.externalId.startsWith("/") ? i18n._(msg`Request`) : source.externalId,
            children: [
              h.a(
                styledAttributes(
                  [
                    h.Href(source.sourceUrl),
                    h.Attribute("target", "_blank"),
                    h.Attribute("rel", "noopener noreferrer"),
                  ],
                  linkStyle,
                  codeStyle,
                ),
                [source.sourceUrl],
              ),
              ` · ${formatSize(source.payloadLength)}`,
            ],
          },
          h,
        ),
      ),
      ...detail(
        {
          term: i18n._(msg`Observation`),
          children: [h.code(styledAttributes([], codeStyle), [entry.id])],
        },
        h,
      ),
    ]),
    ...EffectArray.fromOption(
      Option.map(Option.fromNullishOr(entry.error), (error) =>
        AppText.view(
          {
            element: "p",
            attributes: styledAttributes([h.Role("note")], errorStyle),
            children: [
              error.isRetryable
                ? `${error.message}\n${i18n._(msg`(temporary: it will be retried)`)}`
                : error.message,
            ],
          },
          h,
        ),
      ),
    ),
    h.div(styledAttributes([], actionsStyle), [
      ...response({ model, entry, i18n }, h),
      ...(Option.contains(model.query.wikiArticleId, entry.article.id)
        ? []
        : [
            AppButton.view(
              {
                children: [Icons.filter({ size: "sm" }), i18n._(msg`Only this article`)],
                href: observationLogUrl(language, {
                  ...model.query,
                  wikiArticleId: Option.some(entry.article.id),
                  currentPage: 0,
                }),
                mode: "bleed",
                tone: "accent",
                size: "sm",
              },
              h,
            ),
          ]),
      ...(import.meta.env.DEV
        ? [
            AppButton.view(
              {
                children: [Icons.sledgehammer({ size: "sm" }), i18n._(msg`Debug article`)],
                href: wikiArticleDebugUrl(language, entry.article.id),
                mode: "bleed",
                tone: "neutral",
                size: "sm",
              },
              h,
            ),
          ]
        : []),
    ]),
  ])

const pagination = (
  {
    language,
    i18n,
    query,
    page,
  }: Readonly<{
    language: SupportedLanguage
    i18n: Translator
    query: ObservationLogQuery
    page: ExternalDataObservationLogPage
  }>,
  h: ViewBuilder,
): Html => {
  const pageCount = Math.max(1, Math.ceil(page.totalCount / page.pageSize))
  const currentPageNumber = query.currentPage + 1

  return h.nav(styledAttributes([h.AriaLabel(i18n._(msg`Pages`))], paginationStyle), [
    query.currentPage > 0
      ? AppButton.view(
          {
            children: [Icons.arrowLeft({ size: "sm" }), i18n._(msg`Newer`)],
            href: observationLogUrl(language, { ...query, currentPage: query.currentPage - 1 }),
            mode: "outline",
            size: "sm",
          },
          h,
        )
      : h.span([]),
    AppText.view(
      {
        element: "span",
        appearance: "footnote",
        isMuted: true,
        children: [i18n._(msg`Page ${currentPageNumber} of ${pageCount}`)],
      },
      h,
    ),
    query.currentPage + 1 < pageCount
      ? AppButton.view(
          {
            children: [i18n._(msg`Older`), Icons.arrowRight({ size: "sm" })],
            href: observationLogUrl(language, { ...query, currentPage: query.currentPage + 1 }),
            mode: "outline",
            size: "sm",
          },
          h,
        )
      : h.span([]),
  ])
}

const statusText = (text: string, h: ViewBuilder): Html =>
  AppText.view(
    {
      element: "p",
      attributes: styledAttributes([h.Role("status")], emptyStateStyle({ size: "compact" })),
      children: [text],
    },
    h,
  )

/** Read-only: every provider fetch, what it was asked and what it got back. */
const view = ExternalDataAdminDashboardComposition.makeView.withInputs<LanguageInputs>(
  // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- Foldkit's view signature: Model, view inputs and builder.
  (model, { language }, h) => {
    const i18n = translatorFor(language)

    return h.div(styledAttributes([], pageColumnStyle, pageStyle), [
      h.header(styledAttributes([], introStyle), [
        AppText.view(
          {
            element: "h1",
            appearance: "xxl",
            weight: "semibold",
            lineHeight: "tight",
            children: [i18n._(msg`External data`)],
          },
          h,
        ),
        AppText.view(
          {
            element: "p",
            isMuted: true,
            children: [
              i18n._(
                msg`Every fetch from Wikidata, GBIF and Google Books, newest first. Read-only.`,
              ),
            ],
          },
          h,
        ),
      ]),
      AsyncData.matchData(model.logAsyncData, {
        onEmpty: () => statusText(i18n._(msg`Loading observations…`), h),
        onFailure: (error) =>
          statusText(
            isForbidden(error)
              ? i18n._(msg`Only moderators and administrators can see this log.`)
              : i18n._(msg`Couldn't load the observations.`),
            h,
          ),
        onData: (page) =>
          h.div(styledAttributes([], pageStyle), [
            tallies({ page, language, i18n }, h),
            SectionCard.view(
              {
                title: i18n._(
                  msg`${plural(page.totalCount, { one: "# observation", other: "# observations" })}`,
                ),
                icon: Icons.history,
                children: [
                  filters({ language, i18n, query: model.query }, h),
                  EffectArray.match(page.entries, {
                    onEmpty: () => statusText(i18n._(msg`No observations with these filters.`), h),
                    onNonEmpty: (entries) =>
                      h.ul(
                        styledAttributes([], entryListStyle),
                        entries.map((entry) => entryView({ model, language, i18n, entry }, h)),
                      ),
                  }),
                  pagination({ language, i18n, query: model.query, page }, h),
                ],
              },
              h,
            ),
          ]),
      }),
    ])
  },
)

export const layer = ExternalDataAdminDashboardBlock.makeLayer(
  Effect.gen(function* () {
    return {
      children: [],
      init,
      update,
      view,
      EffectsLayer: Layer.mergeAll(LoadLog.layer, LoadObservation.layer),
    }
  }),
)
