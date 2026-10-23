import { PublicationKind } from "@gororobas/domain/common/enums"
import {
  ApiPublicationCardData,
  ApiPublicationSearchParams,
} from "@gororobas/domain/publications/domain"
import { DateTime, Effect, Result, Schema, Stream } from "effect"
import { Runtime, Subscription, type Update } from "foldkit"
import { Document, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import { defineView } from "foldkit/submodel"

import { GororobasApiClient } from "./api-client"

export const Model = Schema.Struct({
  text: Schema.String,
  kind: Schema.String,
  publications: Schema.Array(ApiPublicationCardData),
  searchStatus: Schema.String,
})

export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ChangedText: { value: Schema.String },
  ChangedKind: { value: Schema.String },
  CompletedSearch: { publications: Schema.Array(ApiPublicationCardData) },
  FailedSearch: { error: Schema.String },
})

export type Message = typeof Message.Type

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match(message, {
    ChangedText: ({ value }) => ({ model: modifyFields(model, { text: () => value }) }),
    ChangedKind: ({ value }) => ({ model: modifyFields(model, { kind: () => value }) }),
    CompletedSearch: ({ publications }) => ({
      model: modifyFields(model, {
        publications: () => publications,
        searchStatus: () => `${publications.length} publications found`,
      }),
    }),
    FailedSearch: ({ error }) => ({
      model: modifyFields(model, { searchStatus: () => `Search failed: ${error}` }),
    }),
  })

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: { text: "", kind: "", publications: [], searchStatus: "Searching..." },
})

export const subscriptions = Subscription.make<Model, Message, GororobasApiClient>()((entry) => ({
  searchPublications: entry(
    { query: ApiPublicationSearchParams },
    {
      modelToDependencies: (model) => {
        const kind = PublicationKind.literals.find((candidate) => candidate === model.kind)

        return {
          query: Schema.decodeSync(ApiPublicationSearchParams)({
            text: model.text.trim() || undefined,
            ...(kind === undefined ? {} : { kind }),
            pageSize: "20",
            currentPage: "0",
          }),
        }
      },
      dependenciesToStream: ({ query }) =>
        Stream.fromEffect(
          Effect.gen(function* () {
            const api = yield* GororobasApiClient
            const result = yield* Effect.result(
              api.publications.searchPublications({ query }).pipe(Effect.mapError(String)),
            )
            return Result.match(result, {
              onSuccess: (publications) => Message.CompletedSearch({ publications }),
              onFailure: (error) => Message.FailedSearch({ error }),
            })
          }),
        ),
    },
  ),
}))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: "Publication search",
  body: h.main(
    [],
    [
      h.h1([], ["Publication search"]),
      h.label(
        [],
        [
          "Search publications ",
          h.input([
            h.Type("search"),
            h.Value(model.text),
            h.Placeholder("Publication handle or text"),
            h.OnInput((value) => Message.ChangedText({ value })),
          ]),
        ],
      ),
      h.label(
        [],
        [
          "Kind ",
          h.select(
            [h.Value(model.kind), h.OnChange((value) => Message.ChangedKind({ value }))],
            [
              h.option([h.Value("")], ["Any"]),
              ...PublicationKind.literals.map((kind) => h.option([h.Value(kind)], [kind])),
            ],
          ),
        ],
      ),
      h.p([], [model.searchStatus]),
      h.ul(
        [],
        model.publications.map(({ handle, kind, publishedAt }) =>
          h.li(
            [],
            [
              `${handle} (${kind})${publishedAt === null ? "" : ` — ${DateTime.formatIso(publishedAt)}`}`,
            ],
          ),
        ),
      ),
    ],
  ),
})

export const submodelView = defineView<Model, Message>(
  (model: Model, h: HtmlBuilder<Message>) => view(model, h).body,
)
