import { Button } from "@foldkit/ui"
import { GororobasApi } from "@gororobas/domain/apis"
import { Context, Effect, Layer, Result, Schema, Stream } from "effect"
import { FetchHttpClient } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import { Runtime, Subscription, type Update } from "foldkit"
import { Document, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"

// MODEL

export const Model = Schema.Struct({
  count: Schema.Number,
  wikiSearchStatus: Schema.String,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ClickedDecrement: {},
  ClickedIncrement: {},
  ClickedReset: {},
  CompletedWikiSearch: { articleCount: Schema.Number },
  FailedWikiSearch: { error: Schema.String },
})

export type Message = typeof Message.Type

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedDecrement: () => ({
      model: modifyFields(model, { count: (count) => count - 1 }),
    }),
    ClickedIncrement: () => ({
      model: modifyFields(model, { count: (count) => count + 1 }),
    }),
    ClickedReset: () => ({ model: modifyFields(model, { count: () => 0 }) }),
    CompletedWikiSearch: ({ articleCount }) => ({
      model: modifyFields(model, {
        wikiSearchStatus: () => `Found ${articleCount} wiki articles`,
      }),
    }),
    FailedWikiSearch: ({ error }) => ({
      model: modifyFields(model, { wikiSearchStatus: () => `Wiki search failed: ${error}` }),
    }),
  })

// INIT

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: { count: 0, wikiSearchStatus: "Searching wiki articles..." },
})

const makeGororobasApiClient = HttpApiClient.make(GororobasApi, {
  baseUrl: "/api",
})

class GororobasApiClient extends Context.Service<
  GororobasApiClient,
  Effect.Success<typeof makeGororobasApiClient>
>()("GororobasApiClient") {}

export const resources = Layer.effect(
  GororobasApiClient,
  makeGororobasApiClient.pipe(Effect.provide(FetchHttpClient.layer)),
)

export const subscriptions = Subscription.make<Model, Message, GororobasApiClient>()((entry) => ({
  searchWikiArticles: entry(
    { isRunning: Schema.Boolean },
    {
      modelToDependencies: () => ({ isRunning: true }),
      dependenciesToStream: () =>
        Stream.fromEffect(
          Effect.gen(function* () {
            const api = yield* GororobasApiClient

            const result = yield* Effect.result(
              api.wiki.searchWikiArticles({ query: {} }).pipe(
                Effect.map((articles) => articles.length),
                Effect.mapError(String),
              ),
            )

            return Result.match(result, {
              onSuccess: (articleCount) => Message.CompletedWikiSearch({ articleCount }),
              onFailure: (error) => Message.FailedWikiSearch({ error }),
            })
          }),
        ),
    },
  ),
}))

// VIEW

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: `Counter: ${model.count}`,
  body: h.div(
    [],
    [
      h.p([], [model.count.toString()]),
      h.p([], [model.wikiSearchStatus]),
      h.div(
        [],
        [
          Button.view(
            {
              onClick: Message.ClickedDecrement(),
              toView: (attributes) => h.button([...attributes.button], ["-"]),
            },
            h,
          ),
          Button.view(
            {
              onClick: Message.ClickedReset(),
              toView: (attributes) => h.button([...attributes.button], ["Reset"]),
            },
            h,
          ),
          Button.view(
            {
              onClick: Message.ClickedIncrement(),
              toView: (attributes) => h.button([...attributes.button], ["+"]),
            },
            h,
          ),
        ],
      ),
    ],
  ),
})
