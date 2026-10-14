import { GororobasApi } from "@gororobas/domain/apis"
import {
  AgroforestryStratum,
  EdiblePlantPart,
  PlantLifecycle,
  PlantUsage,
  PlantingMethod,
  SupportedLanguage,
  AnimalRole,
  NoteworthyEntityType,
  ResourceFormat,
  ToolUsage,
} from "@gororobas/domain/common/enums"
import {
  WikiArticleKind,
  WikiArticleQueriedCardData,
  WikiSearchParams,
} from "@gororobas/domain/wiki/domain"
import { Context, Effect, Layer, Option, Result, Schema, Stream } from "effect"
import { FetchHttpClient } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import { Runtime, Subscription, type Update } from "foldkit"
import { Document, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"

const filterFields = [
  "kind",
  "language",
  "developmentCycleMin",
  "developmentCycleMax",
  "heightMin",
  "heightMax",
  "temperatureMin",
  "temperatureMax",
  "publicationDateMin",
  "publicationDateMax",
  "pageCountMin",
  "pageCountMax",
  "releaseDateMin",
  "releaseDateMax",
  "foundedDateMin",
  "foundedDateMax",
  "dissolvedDateMin",
  "dissolvedDateMax",
] as const

type FilterField = (typeof filterFields)[number]

const languageLabels: Record<SupportedLanguage, string> = {
  pt: "Português",
  es: "Español",
  en: "English",
}

export const Model = Schema.Struct({
  text: Schema.String,
  kind: Schema.String,
  language: SupportedLanguage,
  developmentCycleMin: Schema.String,
  developmentCycleMax: Schema.String,
  heightMin: Schema.String,
  heightMax: Schema.String,
  temperatureMin: Schema.String,
  temperatureMax: Schema.String,
  publicationDateMin: Schema.String,
  publicationDateMax: Schema.String,
  pageCountMin: Schema.String,
  pageCountMax: Schema.String,
  releaseDateMin: Schema.String,
  releaseDateMax: Schema.String,
  foundedDateMin: Schema.String,
  foundedDateMax: Schema.String,
  dissolvedDateMin: Schema.String,
  dissolvedDateMax: Schema.String,
  plantUsages: Schema.Array(Schema.String),
  plantLifecycles: Schema.Array(Schema.String),
  plantingMethods: Schema.Array(Schema.String),
  strata: Schema.Array(Schema.String),
  edibleParts: Schema.Array(Schema.String),
  entityTypes: Schema.Array(Schema.String),
  animalRoles: Schema.Array(Schema.String),
  toolUsages: Schema.Array(Schema.String),
  resourceFormats: Schema.Array(Schema.String),
  articles: Schema.Array(WikiArticleQueriedCardData),
  searchStatus: Schema.String,
})

export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ChangedFilter: { field: Schema.Literals(filterFields), value: Schema.String },
  ToggledOption: {
    field: Schema.Literals([
      "plantUsages",
      "plantLifecycles",
      "plantingMethods",
      "strata",
      "edibleParts",
      "entityTypes",
      "animalRoles",
      "toolUsages",
      "resourceFormats",
    ]),
    value: Schema.String,
  },
  ChangedText: { value: Schema.String },
  CompletedSearch: { articles: Schema.Array(WikiArticleQueriedCardData) },
  FailedSearch: { error: Schema.String },
})

export type Message = typeof Message.Type

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match(message, {
    ChangedFilter: ({ field, value }) => ({
      model: { ...model, [field]: value },
    }),
    ToggledOption: ({ field, value }) => ({
      model: {
        ...model,
        [field]: model[field].includes(value)
          ? model[field].filter((candidate) => candidate !== value)
          : [...model[field], value],
      },
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
    language: "pt",
    developmentCycleMin: "",
    developmentCycleMax: "",
    heightMin: "",
    heightMax: "",
    temperatureMin: "",
    temperatureMax: "",
    publicationDateMin: "",
    publicationDateMax: "",
    pageCountMin: "",
    pageCountMax: "",
    releaseDateMin: "",
    releaseDateMax: "",
    foundedDateMin: "",
    foundedDateMax: "",
    dissolvedDateMin: "",
    dissolvedDateMax: "",
    plantUsages: [],
    plantLifecycles: [],
    plantingMethods: [],
    strata: [],
    edibleParts: [],
    entityTypes: [],
    animalRoles: [],
    toolUsages: [],
    resourceFormats: [],
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

const decodeSearchParams = (
  params: typeof WikiSearchParams.Encoded,
  fallback: WikiSearchParams,
): WikiSearchParams =>
  Option.getOrElse(Schema.decodeOption(WikiSearchParams)(params), () => fallback)

const searchParams = (model: Model) => {
  const text = model.text.trim() || undefined

  const number = (field: FilterField) => {
    if (model[field].trim() === "") return undefined
    const value = Number(model[field])
    return Number.isFinite(value) ? value : undefined
  }

  const date = (field: FilterField) => (model[field] === "" ? undefined : `${model[field]}[UTC]`)

  const selected = <const Values extends ReadonlyArray<string>>(
    values: ReadonlyArray<string>,
    options: Values,
  ): ReadonlyArray<Values[number]> =>
    values.filter((value): value is Values[number] => isLiteral(options, value))

  if (model.kind === "PLANT") {
    const fallback = Schema.decodeSync(WikiSearchParams)({
      kind: "PLANT",
      language: model.language,
      text,
    })

    return decodeSearchParams(
      {
        kind: "PLANT",
        language: model.language,
        text,
        plantUsages: selected(model.plantUsages, PlantUsage.literals),
        plantLifecycles: selected(model.plantLifecycles, PlantLifecycle.literals),
        plantingMethods: selected(model.plantingMethods, PlantingMethod.literals),
        strata: selected(model.strata, AgroforestryStratum.literals),
        edibleParts: selected(model.edibleParts, EdiblePlantPart.literals),
        developmentCycleMin: number("developmentCycleMin"),
        developmentCycleMax: number("developmentCycleMax"),
        heightMin: number("heightMin"),
        heightMax: number("heightMax"),
        temperatureMin: number("temperatureMin"),
        temperatureMax: number("temperatureMax"),
      },
      fallback,
    )
  }

  if (isLiteral(WikiArticleKind.literals, model.kind)) {
    const common = { kind: model.kind, language: model.language, text }
    const fallback = Schema.decodeSync(WikiSearchParams)(common)

    if (model.kind === "BOOK") {
      return decodeSearchParams(
        {
          ...common,
          publicationDateMin: date("publicationDateMin"),
          publicationDateMax: date("publicationDateMax"),
          pageCountMin: number("pageCountMin"),
          pageCountMax: number("pageCountMax"),
        },
        fallback,
      )
    }

    if (model.kind === "FILM") {
      return decodeSearchParams(
        {
          ...common,
          releaseDateMin: date("releaseDateMin"),
          releaseDateMax: date("releaseDateMax"),
        },
        fallback,
      )
    }

    if (model.kind === "NOTEWORTHY_ENTITY") {
      return decodeSearchParams(
        {
          ...common,
          entityTypes: selected(model.entityTypes, NoteworthyEntityType.literals),
          foundedDateMin: date("foundedDateMin"),
          foundedDateMax: date("foundedDateMax"),
          dissolvedDateMin: date("dissolvedDateMin"),
          dissolvedDateMax: date("dissolvedDateMax"),
        },
        fallback,
      )
    }

    if (model.kind === "ANIMAL") {
      return decodeSearchParams(
        {
          ...common,
          animalRoles: selected(model.animalRoles, AnimalRole.literals),
        },
        fallback,
      )
    }

    if (model.kind === "TOOL") {
      return decodeSearchParams(
        {
          ...common,
          toolUsages: selected(model.toolUsages, ToolUsage.literals),
        },
        fallback,
      )
    }

    if (model.kind === "RESOURCE") {
      return decodeSearchParams(
        {
          ...common,
          resourceFormats: selected(model.resourceFormats, ResourceFormat.literals),
        },
        fallback,
      )
    }

    return fallback
  }

  return decodeSearchParams(
    { kind: undefined, language: model.language, text },
    Schema.decodeSync(WikiSearchParams)({ kind: undefined, language: model.language, text }),
  )
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
  labels,
}: {
  h: HtmlBuilder<Message>
  field: FilterField
  label: string
  current: string
  values: ReadonlyArray<string>
  labels?: Readonly<Record<string, string>>
}) =>
  h.label(
    [],
    [
      `${label} `,
      h.select(
        [h.Value(current), h.OnChange((value) => Message.ChangedFilter({ field, value }))],
        [
          h.option([h.Value("")], ["Any"]),
          ...values.map((value) =>
            h.option([h.Value(value)], [labels?.[value] ?? value.replaceAll("_", " ")]),
          ),
        ],
      ),
    ],
  )

type OptionField =
  | "plantUsages"
  | "plantLifecycles"
  | "plantingMethods"
  | "strata"
  | "edibleParts"
  | "entityTypes"
  | "animalRoles"
  | "toolUsages"
  | "resourceFormats"

const optionGroup = ({
  h,
  model,
  field,
  label,
  values,
}: {
  h: HtmlBuilder<Message>
  model: Model
  field: OptionField
  label: string
  values: ReadonlyArray<string>
}) =>
  h.fieldset(
    [],
    [
      h.legend([], [label]),
      ...values.map((value) =>
        h.label(
          [],
          [
            h.input([
              h.Type("checkbox"),
              h.Checked(model[field].includes(value)),
              h.OnClick(Message.ToggledOption({ field, value })),
            ]),
            ` ${value.replaceAll("_", " ")}`,
          ],
        ),
      ),
    ],
  )

const rangeInput = ({
  h,
  model,
  field,
  label,
  type,
}: {
  h: HtmlBuilder<Message>
  model: Model
  field: FilterField
  label: string
  type: "number" | "date"
}) =>
  h.label(
    [],
    [
      `${label} `,
      h.input([
        h.Type(type),
        h.Value(model[field]),
        ...(type === "number"
          ? [
              h.Attribute("step", field.startsWith("temperature") ? "any" : "1"),
              h.Attribute("min", field.startsWith("temperature") ? "-50" : "0"),
            ]
          : []),
        h.OnInput((value) => Message.ChangedFilter({ field, value })),
      ]),
    ],
  )

const range = ({
  h,
  model,
  label,
  min,
  max,
  type,
}: {
  h: HtmlBuilder<Message>
  model: Model
  label: string
  min: FilterField
  max: FilterField
  type: "number" | "date"
}) =>
  h.fieldset(
    [],
    [
      h.legend([], [label]),
      rangeInput({ h, model, field: min, label: "Min", type }),
      rangeInput({ h, model, field: max, label: "Max", type }),
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
      select({
        h,
        field: "language",
        label: "Locale",
        current: model.language,
        values: SupportedLanguage.literals,
        labels: languageLabels,
      }),
      ...(model.kind === "PLANT"
        ? [
            optionGroup({
              h,
              model,
              field: "plantUsages",
              label: "Usage (match any)",
              values: PlantUsage.literals,
            }),
            optionGroup({
              h,
              model,
              field: "plantLifecycles",
              label: "Lifecycle (match any)",
              values: PlantLifecycle.literals,
            }),
            optionGroup({
              h,
              model,
              field: "plantingMethods",
              label: "Planting method (match any)",
              values: PlantingMethod.literals,
            }),
            optionGroup({
              h,
              model,
              field: "strata",
              label: "Stratum (match any)",
              values: AgroforestryStratum.literals,
            }),
            optionGroup({
              h,
              model,
              field: "edibleParts",
              label: "Edible part (match any)",
              values: EdiblePlantPart.literals,
            }),
            range({
              h,
              model,
              label: "Development cycle (days)",
              min: "developmentCycleMin",
              max: "developmentCycleMax",
              type: "number",
            }),
            range({
              h,
              model,
              label: "Height (cm)",
              min: "heightMin",
              max: "heightMax",
              type: "number",
            }),
            range({
              h,
              model,
              label: "Temperature (°C)",
              min: "temperatureMin",
              max: "temperatureMax",
              type: "number",
            }),
          ]
        : model.kind === "BOOK"
          ? [
              range({
                h,
                model,
                label: "Publication date",
                min: "publicationDateMin",
                max: "publicationDateMax",
                type: "date",
              }),
              range({
                h,
                model,
                label: "Page count",
                min: "pageCountMin",
                max: "pageCountMax",
                type: "number",
              }),
            ]
          : model.kind === "FILM"
            ? [
                range({
                  h,
                  model,
                  label: "Release date",
                  min: "releaseDateMin",
                  max: "releaseDateMax",
                  type: "date",
                }),
              ]
            : model.kind === "NOTEWORTHY_ENTITY"
              ? [
                  optionGroup({
                    h,
                    model,
                    field: "entityTypes",
                    label: "Entity type (match any)",
                    values: NoteworthyEntityType.literals,
                  }),
                  range({
                    h,
                    model,
                    label: "Founded",
                    min: "foundedDateMin",
                    max: "foundedDateMax",
                    type: "date",
                  }),
                  range({
                    h,
                    model,
                    label: "Dissolved",
                    min: "dissolvedDateMin",
                    max: "dissolvedDateMax",
                    type: "date",
                  }),
                ]
              : model.kind === "ANIMAL"
                ? [
                    optionGroup({
                      h,
                      model,
                      field: "animalRoles",
                      label: "Roles (match any)",
                      values: AnimalRole.literals,
                    }),
                  ]
                : model.kind === "TOOL"
                  ? [
                      optionGroup({
                        h,
                        model,
                        field: "toolUsages",
                        label: "Usage (match any)",
                        values: ToolUsage.literals,
                      }),
                    ]
                  : model.kind === "RESOURCE"
                    ? [
                        optionGroup({
                          h,
                          model,
                          field: "resourceFormats",
                          label: "Format (match any)",
                          values: ResourceFormat.literals,
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
