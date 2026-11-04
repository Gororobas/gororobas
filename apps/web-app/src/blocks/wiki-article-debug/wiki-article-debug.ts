import { WikiArticleId } from "@gororobas/domain/common/ids"
import { Effect, Option, Record, Result, Schema, Stream } from "effect"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"

import { GororobasApiClient } from "../../api-client"
import { AppText } from "../../ui/app-text"

const DebugData = Schema.Record(Schema.String, Schema.Json)

const Model = Schema.Struct({
  wikiArticleId: WikiArticleId,
  maybeData: Schema.Option(DebugData),
  status: Schema.String,
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
  view: { kind: "Element" },
  effects: { services: [GororobasApiClient] },
  Model,
  Message,
})

const WikiArticleDebugComposition = WikiArticleDebugBlock.makeComposition()

const init = WikiArticleDebugComposition.makeInit((wikiArticleId: WikiArticleId) => ({
  model: {
    wikiArticleId,
    maybeData: Option.none(),
    status: "Carregando dados do artigo…",
    reloadCount: 0,
  },
}))

const update = WikiArticleDebugComposition.makeUpdate({
  CompletedLoad: (model, { data }) => ({
    model: modifyFields(model, {
      maybeData: () => Option.some(data),
      status: () => "Dados do artigo carregados",
    }),
  }),
  FailedLoad: (model, { error }) => ({
    model: modifyFields(model, { status: () => `Não foi possível carregar: ${error}` }),
  }),
  ClickedReload: (model) => ({
    model: modifyFields(model, {
      status: () => "Carregando dados do artigo…",
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
const view = WikiArticleDebugComposition.makeView((model, h) =>
  h.main(
    [],
    [
      AppText.view({ element: "h1", attributes: [], children: ["Depuração do artigo"] }, h),
      AppText.view({ element: "p", attributes: [], children: [model.wikiArticleId] }, h),
      h.button([h.Type("button"), h.OnClick(Message.ClickedReload())], ["Recarregar"]),
      AppText.view({ element: "p", attributes: [h.Role("status")], children: [model.status] }, h),
      ...Option.match(model.maybeData, {
        onNone: () => [],
        onSome: (data) =>
          Record.toEntries(data).map(([name, value]) =>
            h.keyed("details")(name, [], [h.summary([], [name]), h.pre([], [encodeJson(value)])]),
          ),
      }),
    ],
  ),
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
