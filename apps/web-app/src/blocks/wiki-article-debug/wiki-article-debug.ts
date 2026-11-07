import { WikiArticleId } from "@gororobas/domain/common/ids"
import { msg } from "@lingui/core/macro"
import { Effect, Match, Option, Record, Result, Schema, Stream } from "effect"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"

import { GororobasApiClient } from "../../api-client"
import { observationLogUrl } from "../../app/route"
import type { LanguageInputs } from "../../lib/language"
import { translatorFor } from "../../lib/translations"
import { AppText } from "../../ui/app-text"

const DebugData = Schema.Record(Schema.String, Schema.Json)

const Model = Schema.Struct({
  wikiArticleId: WikiArticleId,
  maybeData: Schema.Option(DebugData),
  status: Schema.Union([
    Schema.TaggedStruct("Loading", {}),
    Schema.TaggedStruct("Loaded", {}),
    Schema.TaggedStruct("Failed", { error: Schema.String }),
  ]),
  reloadCount: Schema.Int,
})

const Message = defineMessageUnion({
  CompletedLoad: { data: DebugData },
  FailedLoad: { error: Schema.String },
  ClickedReload: {},
})

export const WikiArticleDebugKey = Symbol("WikiArticleDebug")

export const WikiArticleDebugBlock = Block.make("WikiArticleDebug", {
  key: WikiArticleDebugKey,
  Init: Schema.Tuple([WikiArticleId]),
  view: { kind: "Element", Inputs: Block.makeInputContract<LanguageInputs>() },
  effects: { services: [GororobasApiClient] },
  Model,
  Message,
})

const WikiArticleDebugComposition = WikiArticleDebugBlock.makeComposition()

const init = WikiArticleDebugComposition.makeInit((wikiArticleId: WikiArticleId) => ({
  model: {
    wikiArticleId,
    maybeData: Option.none(),
    status: { _tag: "Loading" },
    reloadCount: 0,
  },
}))

const update = WikiArticleDebugComposition.makeUpdate({
  CompletedLoad: (model, { data }) => ({
    model: modifyFields(model, {
      maybeData: () => Option.some(data),
      status: () => ({ _tag: "Loaded" }),
    }),
  }),
  FailedLoad: (model, { error }) => ({
    model: modifyFields(model, { status: () => ({ _tag: "Failed", error }) }),
  }),
  ClickedReload: (model) => ({
    model: modifyFields(model, {
      status: () => ({ _tag: "Loading" }),
      reloadCount: (count) => count + 1,
    }),
  }),
})

const subscriptions = WikiArticleDebugBlock.makeSubscriptions((entry) => ({
  article: entry(
    "LoadWikiArticleDebug",
    { wikiArticleId: WikiArticleId, reloadCount: Schema.Int },
    {
      messages: [Message.CompletedLoad, Message.FailedLoad],
      modelToDependencies: (model) => ({
        wikiArticleId: model.wikiArticleId,
        reloadCount: model.reloadCount,
      }),
      handler: function* () {
        const api = yield* GororobasApiClient

        return ({ wikiArticleId }) =>
          Stream.fromEffect(
            api.wiki.getWikiArticleDebug({ params: { wikiArticleId } }).pipe(
              Effect.mapError(String),
              Effect.result,
              Effect.map(
                Result.match({
                  onSuccess: (data) => Message.CompletedLoad({ data }),
                  onFailure: (error) => Message.FailedLoad({ error }),
                }),
              ),
            ),
          )
      },
    },
  ),
}))

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Json, { space: 2 }))

/** Local development view: contributor data, revisions, provider observations and stored projections. */
const view = WikiArticleDebugComposition.makeView.withInputs<LanguageInputs>(
  // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- Foldkit's view signature: Model, view inputs and builder.
  (model, { language }, h) => {
    const i18n = translatorFor(language)
    const { status } = model

    return h.main(
      [],
      [
        AppText.view(
          { element: "h1", attributes: [], children: [i18n._(msg`Article debugging`)] },
          h,
        ),
        AppText.view({ element: "p", attributes: [], children: [model.wikiArticleId] }, h),
        h.button([h.Type("button"), h.OnClick(Message.ClickedReload())], [i18n._(msg`Reload`)]),
        AppText.view(
          {
            element: "p",
            children: [
              h.a(
                [
                  h.Href(
                    observationLogUrl(language, {
                      wikiArticleId: Option.some(model.wikiArticleId),
                    }),
                  ),
                ],
                [i18n._(msg`External data observations for this article`)],
              ),
            ],
          },
          h,
        ),
        AppText.view(
          {
            element: "p",
            attributes: [h.Role("status")],
            children: [
              Match.value(status).pipe(
                Match.tagsExhaustive({
                  Loading: () => i18n._(msg`Loading the article's data…`),
                  Loaded: () => i18n._(msg`Article data loaded`),
                  Failed: ({ error }) => i18n._(msg`Couldn't load: ${error}`),
                }),
              ),
            ],
          },
          h,
        ),
        ...Option.match(model.maybeData, {
          onNone: () => [],
          onSome: (data) =>
            Record.toEntries(data).map(([name, value]) =>
              h.keyed("details")(name, [], [h.summary([], [name]), h.pre([], [encodeJson(value)])]),
            ),
        }),
      ],
    )
  },
)

export const layer = WikiArticleDebugBlock.makeLayer(
  Effect.gen(function* () {
    return {
      children: [],
      init,
      update,
      view,
      subscriptions,
      EffectsLayer: subscriptions.layer,
    }
  }),
)
