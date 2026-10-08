import { Result, Schema, SchemaTransformation } from "effect"

const LanguageTag = Schema.String.check(
  Schema.isMaxLength(255),
  Schema.makeFilter((value) => Result.isSuccess(Result.try(() => new Intl.Locale(value))), {
    identifier: "ContentLanguage",
    title: "Content language",
    description: "A well-formed Unicode BCP 47 language tag.",
    arbitraryConstraint: { patterns: [{ source: "^[a-z]{2,3}(-[A-Z]{2})?$", flags: "" }] },
  }),
)

const NormalizedLanguageTag = LanguageTag.check(
  Schema.makeFilter((value) => Intl.getCanonicalLocales(value)[0] === value, {
    identifier: "NormalizedContentLanguage",
    title: "Normalized content language",
    description: "A canonical Unicode BCP 47 language tag.",
  }),
)

export const ContentLanguage = LanguageTag.pipe(
  Schema.decodeTo(
    NormalizedLanguageTag,
    SchemaTransformation.transform({
      decode: (value) => Intl.getCanonicalLocales(value)[0] ?? value,
      encode: (value) => value,
    }),
  ),
  Schema.brand("ContentLanguage"),
)

export type ContentLanguage = typeof ContentLanguage.Type
