import { ProfileType } from "@gororobas/domain/common/enums"
import { ProfileSearchParams, ProfileCardData } from "@gororobas/domain/profiles/domain"
import { Effect, Result, Schema, Stream } from "effect"
import { Runtime, Subscription, type Update } from "foldkit"
import { Document, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import { defineView } from "foldkit/submodel"

import { GororobasApiClient } from "./api-client"

export const Model = Schema.Struct({
  text: Schema.String,
  type: Schema.String,
  profiles: Schema.Array(ProfileCardData),
  searchStatus: Schema.String,
})

export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ChangedText: { value: Schema.String },
  ChangedType: { value: Schema.String },
  CompletedSearch: { profiles: Schema.Array(ProfileCardData) },
  FailedSearch: { error: Schema.String },
})

export type Message = typeof Message.Type

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match(message, {
    ChangedText: ({ value }) => ({ model: modifyFields(model, { text: () => value }) }),
    ChangedType: ({ value }) => ({ model: modifyFields(model, { type: () => value }) }),
    CompletedSearch: ({ profiles }) => ({
      model: modifyFields(model, {
        profiles: () => profiles,
        searchStatus: () => `${profiles.length} profiles found`,
      }),
    }),
    FailedSearch: ({ error }) => ({
      model: modifyFields(model, { searchStatus: () => `Search failed: ${error}` }),
    }),
  })

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: { text: "", type: "", profiles: [], searchStatus: "Searching..." },
})

export const subscriptions = Subscription.make<Model, Message, GororobasApiClient>()((entry) => ({
  searchProfiles: entry(
    { query: ProfileSearchParams },
    {
      modelToDependencies: (model) => {
        const type = ProfileType.literals.find((candidate) => candidate === model.type)

        return {
          query: Schema.decodeSync(ProfileSearchParams)({
            text: model.text.trim() || undefined,
            ...(type === undefined ? {} : { type }),
          }),
        }
      },
      dependenciesToStream: ({ query }) =>
        Stream.fromEffect(
          Effect.gen(function* () {
            const api = yield* GororobasApiClient
            const result = yield* Effect.result(
              api.profiles.searchProfiles({ query }).pipe(Effect.mapError(String)),
            )
            return Result.match(result, {
              onSuccess: (profiles) => Message.CompletedSearch({ profiles }),
              onFailure: (error) => Message.FailedSearch({ error }),
            })
          }),
        ),
    },
  ),
}))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: "Profile search",
  body: h.main(
    [],
    [
      h.h1([], ["Profile search"]),
      h.label(
        [],
        [
          "Search profiles ",
          h.input([
            h.Type("search"),
            h.Value(model.text),
            h.Placeholder("Name, handle or location"),
            h.OnInput((value) => Message.ChangedText({ value })),
          ]),
        ],
      ),
      h.label(
        [],
        [
          "Type ",
          h.select(
            [h.Value(model.type), h.OnChange((value) => Message.ChangedType({ value }))],
            [
              h.option([h.Value("")], ["Any"]),
              ...ProfileType.literals.map((type) => h.option([h.Value(type)], [type])),
            ],
          ),
        ],
      ),
      h.p([], [model.searchStatus]),
      h.ul(
        [],
        model.profiles.map(({ handle, name, location, type }) =>
          h.li([], [`${name} (@${handle}) — ${type}${location === null ? "" : ` — ${location}`}`]),
        ),
      ),
    ],
  ),
})

export const submodelView = defineView<Model, Message>(
  (model: Model, h: HtmlBuilder<Message>) => view(model, h).body,
)
