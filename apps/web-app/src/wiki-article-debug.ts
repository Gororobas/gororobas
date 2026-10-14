import { WikiArticleId } from "@gororobas/domain/common/ids"
import { Effect, Option, Record, Result, Schema, Stream } from "effect"
import { Subscription, type Update } from "foldkit"
import { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { defineView } from "foldkit/submodel"

import { GororobasApiClient } from "./api-client"

const DebugData = Schema.Record(Schema.String, Schema.Json)

export const Model = Schema.Struct({
  wikiArticleId: Schema.Option(WikiArticleId),
  data: Schema.Option(DebugData),
  status: Schema.String,
  reload: Schema.Int,
})

export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  CompletedLoad: { wikiArticleId: WikiArticleId, data: DebugData },
  FailedLoad: { wikiArticleId: WikiArticleId, error: Schema.String },
  ClickedReload: {},
})

export type Message = typeof Message.Type

export const init = (wikiArticleId: Option.Option<WikiArticleId>): Model => ({
  wikiArticleId,
  data: Option.none(),
  status: "Loading article data…",
  reload: 0,
})

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match(message, {
    CompletedLoad: ({ wikiArticleId, data }) => ({
      model: Option.contains(model.wikiArticleId, wikiArticleId)
        ? { ...model, data: Option.some(data), status: "Article data loaded" }
        : model,
    }),
    FailedLoad: ({ wikiArticleId, error }) => ({
      model: Option.contains(model.wikiArticleId, wikiArticleId)
        ? { ...model, status: `Could not load article data: ${error}` }
        : model,
    }),
    ClickedReload: () => ({
      model: { ...model, status: "Loading article data…", reload: model.reload + 1 },
    }),
  })

export const subscriptions = Subscription.make<Model, Message, GororobasApiClient>()((entry) => ({
  loadArticle: entry(
    { wikiArticleId: Schema.Option(WikiArticleId), reload: Schema.Int },
    {
      modelToDependencies: (model) => ({
        wikiArticleId: model.wikiArticleId,
        reload: model.reload,
      }),
      dependenciesToStream: ({ wikiArticleId }) =>
        Option.match(wikiArticleId, {
          onNone: () => Stream.empty,
          onSome: (id) =>
            Stream.fromEffect(
              Effect.gen(function* () {
                const api = yield* GororobasApiClient
                const result = yield* api.wiki
                  .getWikiArticleDebug({ params: { wikiArticleId: id } })
                  .pipe(Effect.mapError(String), Effect.result)
                return Result.match(result, {
                  onSuccess: (data) => Message.CompletedLoad({ wikiArticleId: id, data }),
                  onFailure: (error) => Message.FailedLoad({ wikiArticleId: id, error }),
                })
              }),
            ),
        }),
    },
  ),
}))

export const submodelView = defineView<Model, Message>((model: Model, h: HtmlBuilder<Message>) =>
  h.main(
    [],
    [
      h.h1([], ["Wiki article debug"]),
      h.p([], [Option.getOrElse(model.wikiArticleId, () => "")]),
      h.p(
        [],
        [
          "Local development view: contributor data, revisions, provider observations and stored projections.",
        ],
      ),
      h.button([h.Type("button"), h.OnClick(Message.ClickedReload())], ["Reload stored data"]),
      h.p([], [model.status]),
      ...Option.match(model.data, {
        onNone: () => [],
        onSome: (data) =>
          Record.toEntries(data).map(([name, value]) =>
            h.keyed("details")(
              name,
              [],
              [
                h.summary([], [name]),
                h.pre(
                  [],
                  [Schema.encodeSync(Schema.fromJsonString(Schema.Json, { space: 2 }))(value)],
                ),
              ],
            ),
          ),
      }),
    ],
  ),
)
