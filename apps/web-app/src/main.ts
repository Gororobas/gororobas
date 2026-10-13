import { GororobasApi } from "@gororobas/domain/apis"
import {
  AgroforestryStratum,
  EdiblePlantPart,
  PlantLifecycle,
  PlantUsage,
  PlantingMethod,
} from "@gororobas/domain/common/enums"
import {
  WikiArticleKind,
  WikiArticleQueriedCardData,
  WikiSearchParams,
} from "@gororobas/domain/wiki/domain"
import { Context, Effect, Layer, Result, Schema, Stream } from "effect"
import { FetchHttpClient } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import { Runtime, Subscription, type Update } from "foldkit"
import { Document, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"

const filterFields = [
  "kind",
  "plantUsage",
  "plantLifecycle",
  "plantingMethod",
  "stratum",
  "ediblePart",
] as const

type FilterField = (typeof filterFields)[number]

export const Model = Schema.Struct({
  text: Schema.String,
  kind: Schema.String,
  plantUsage: Schema.String,
  plantLifecycle: Schema.String,
  plantingMethod: Schema.String,
  stratum: Schema.String,
  ediblePart: Schema.String,
  articles: Schema.Array(WikiArticleQueriedCardData),
  searchStatus: Schema.String,
})

export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ChangedFilter: { field: Schema.Literals(filterFields), value: Schema.String },
  ChangedText: { value: Schema.String },
  CompletedSearch: { articles: Schema.Array(WikiArticleQueriedCardData) },
  FailedSearch: { error: Schema.String },
})

export type Message = typeof Message.Type

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match(message, {
    ChangedFilter: ({ field, value }) => ({
      model:
        field === "kind" && value !== "PLANT"
          ? {
              ...model,
              kind: value,
              plantUsage: "",
              plantLifecycle: "",
              plantingMethod: "",
              stratum: "",
              ediblePart: "",
            }
          : { ...model, [field]: value },
    }),
    ChangedText: ({ value }) => ({ model: modifyFields(model, { text: () => value }) }),
    CompletedSearch: ({ articles }) => ({
      model: modifyFields(model, {
        articles: () => articles,
        searchStatus: () => `${articles.length} articles found`,
      }),
    }),
    FailedSearch: ({ error }) => ({
      model: modifyFields(model, { searchStatus: () => `Search failed: ${error}` }),
    }),
  })

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: {
    text: "",
    kind: "",
    plantUsage: "",
    plantLifecycle: "",
    plantingMethod: "",
    stratum: "",
    ediblePart: "",
    articles: [],
    searchStatus: "Searching...",
  },
})

const makeGororobasApiClient = HttpApiClient.make(GororobasApi, { baseUrl: "/api" })

class GororobasApiClient extends Context.Service<
  GororobasApiClient,
  Effect.Success<typeof makeGororobasApiClient>
>()("GororobasApiClient") {}

export const resources = Layer.effect(
  GororobasApiClient,
  makeGororobasApiClient.pipe(Effect.provide(FetchHttpClient.layer)),
)

const searchParams = (model: Model) => {
  const text = model.text.trim() || undefined

  if (model.kind === "PLANT") {
    return Schema.decodeSync(WikiSearchParams)({
      kind: "PLANT",
      text,
      ...(isLiteral(PlantUsage.literals, model.plantUsage) ? { plantUsage: model.plantUsage } : {}),
      ...(isLiteral(PlantLifecycle.literals, model.plantLifecycle)
        ? { plantLifecycle: model.plantLifecycle }
        : {}),
      ...(isLiteral(PlantingMethod.literals, model.plantingMethod)
        ? { plantingMethod: model.plantingMethod }
        : {}),
      ...(isLiteral(AgroforestryStratum.literals, model.stratum) ? { stratum: model.stratum } : {}),
      ...(isLiteral(EdiblePlantPart.literals, model.ediblePart)
        ? { ediblePart: model.ediblePart }
        : {}),
    })
  }

  if (isLiteral(WikiArticleKind.literals, model.kind)) {
    return Schema.decodeSync(WikiSearchParams)({ kind: model.kind, text })
  }
  return Schema.decodeSync(WikiSearchParams)({ kind: undefined, text })
}

const isLiteral = <const Values extends ReadonlyArray<string>>(
  values: Values,
  value: string,
): value is Values[number] => values.some((candidate) => candidate === value)

export const subscriptions = Subscription.make<Model, Message, GororobasApiClient>()((entry) => ({
  searchWikiArticles: entry(
    { query: WikiSearchParams },
    {
      modelToDependencies: (model) => ({ query: searchParams(model) }),
      dependenciesToStream: ({ query }) =>
        Stream.fromEffect(
          Effect.gen(function* () {
            const api = yield* GororobasApiClient
            const result = yield* Effect.result(
              api.wiki.searchWikiArticles({ query }).pipe(Effect.mapError(String)),
            )
            return Result.match(result, {
              onSuccess: (articles) => Message.CompletedSearch({ articles }),
              onFailure: (error) => Message.FailedSearch({ error }),
            })
          }),
        ),
    },
  ),
}))

const select = ({
  h,
  field,
  label,
  current,
  values,
}: {
  h: HtmlBuilder<Message>
  field: FilterField
  label: string
  current: string
  values: ReadonlyArray<string>
}) =>
  h.label(
    [],
    [
      `${label} `,
      h.select(
        [h.Value(current), h.OnChange((value) => Message.ChangedFilter({ field, value }))],
        [
          h.option([h.Value("")], ["Any"]),
          ...values.map((value) => h.option([h.Value(value)], [value.replaceAll("_", " ")])),
        ],
      ),
    ],
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: "Wiki article search",
  body: h.main(
    [],
    [
      h.h1([], ["Wiki article search"]),
      h.label(
        [],
        [
          "Search text ",
          h.input([
            h.Type("search"),
            h.Value(model.text),
            h.Placeholder("Name or article text"),
            h.OnInput((value) => Message.ChangedText({ value })),
          ]),
        ],
      ),
      select({
        h,
        field: "kind",
        label: "Kind",
        current: model.kind,
        values: WikiArticleKind.literals,
      }),
      ...(model.kind === "PLANT"
        ? [
            select({
              h,
              field: "plantUsage",
              label: "Usage",
              current: model.plantUsage,
              values: PlantUsage.literals,
            }),
            select({
              h,
              field: "plantLifecycle",
              label: "Lifecycle",
              current: model.plantLifecycle,
              values: PlantLifecycle.literals,
            }),
            select({
              h,
              field: "plantingMethod",
              label: "Planting method",
              current: model.plantingMethod,
              values: PlantingMethod.literals,
            }),
            select({
              h,
              field: "stratum",
              label: "Stratum",
              current: model.stratum,
              values: AgroforestryStratum.literals,
            }),
            select({
              h,
              field: "ediblePart",
              label: "Edible part",
              current: model.ediblePart,
              values: EdiblePlantPart.literals,
            }),
          ]
        : []),
      h.p([], [model.searchStatus]),
      h.ul(
        [],
        model.articles.map((article) =>
          h.li([], [`${article.commonNames.map(({ name }) => name).join(", ")} (${article.kind})`]),
        ),
      ),
    ],
  ),
})
