import { WikiArticleId } from "@gororobas/domain/common/ids"
import { Effect, Option, Record, Result, Schema, Stream } from "effect"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"

import { GororobasApiClient } from "../../api-client"

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

const WikiArticleDebugDefinition = Block.makeDefinition("WikiArticleDebug", { Model, Message })
const WikiArticleDebugComposition = WikiArticleDebugDefinition.makeComposition()

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

const subscriptions = WikiArticleDebugDefinition.makeSubscriptions((entry) => ({
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
      h.h1([], ["Depuração do artigo"]),
      h.p([], [model.wikiArticleId]),
      h.button([h.Type("button"), h.OnClick(Message.ClickedReload())], ["Recarregar"]),
      h.p([h.Role("status")], [model.status]),
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

const prepare = () =>
  WikiArticleDebugComposition.prepareBlock({
    init,
    update,
    view,
    subscriptions,
    EffectsLayer: subscriptions.layer,
  })

export const WikiArticleDebugBlock: Block.FromAssemblyWithView<typeof Model, typeof prepare> =
  Block.assemble(prepare)
