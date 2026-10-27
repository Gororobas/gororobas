import { Option, Schema } from "effect"

/** Names are canonical, singular and lowercase, so they can be looked up among existing articles. */
const Names = Schema.Struct({
  pt: Schema.Array(Schema.String),
  es: Schema.Array(Schema.String),
  en: Schema.Array(Schema.String),
}).annotate({
  description:
    "Canonical singular lowercase names of what the quote names or implies, in Portuguese (pt), Spanish (es) and English (en).",
})

const Quote = Schema.String.annotate({
  description: "The span, copied exactly as written in the text.",
})

export const Mention = Schema.Struct({ quote: Quote, names: Names })
export type Mention = typeof Mention.Type

/** The rationale comes before the names, so the model reasons before it commits to an answer. */
export const Inference = Schema.Struct({
  quote: Quote,
  rationale: Schema.String.annotate({
    description: "One short English sentence explaining what the quote implies, and why.",
  }),
  names: Names,
})

export type Inference = typeof Inference.Type

export const Mentions = Schema.Struct({ extractions: Schema.Array(Mention) })
export const Inferences = Schema.Struct({ extractions: Schema.Array(Inference) })

export interface Example<E> {
  readonly text: string
  readonly extractions: ReadonlyArray<E>
}

export const MENTION_INSTRUCTIONS = [
  "Extract every span that names a plant, animal, fungus, food, tool, farming practice or technique, ecosystem, concept, theme, book, film, person or organization.",
  "Include common, regional and scientific names, synonyms and plural or inflected forms, quoted exactly as written.",
  "Only extract what the text names. Never extract something the text merely implies.",
  "For each span, give the canonical singular lowercase names of what it names in Portuguese, Spanish and English.",
].join(" ")

export const INFERENCE_INSTRUCTIONS = [
  "Extract spans from which a reader can conclude the text is about a plant, animal, food, tool, farming practice or technique, ecosystem, concept or theme that the text does not name.",
  "Quote the shortest span that supports the conclusion, exactly as written. Never extract something the text names directly.",
  "For each span, explain in one short English sentence what it implies and why,",
  "then give the canonical singular lowercase names of what it implies in Portuguese, Spanish and English.",
].join(" ")

/** The schema a task's answers decode with, and its examples encode with. */
export type Answers<E> = Schema.Codec<{ readonly extractions: ReadonlyArray<E> }>

export const renderPrompt = <E>({
  instructions,
  answers,
  examples,
  context,
  text,
}: {
  readonly instructions: string
  readonly answers: Answers<E>
  readonly examples: ReadonlyArray<Example<E>>
  readonly context: Option.Option<string>
  readonly text: string
}) => {
  const encodeAnswer = Schema.encodeSync(Schema.fromJsonString(answers))

  return [
    instructions,
    ...Option.match(context, { onNone: () => [], onSome: (context) => ["", context] }),
    "",
    "Examples:",
    ...examples.flatMap((example) => [
      "",
      `Text: ${example.text}`,
      `Answer: ${encodeAnswer({ extractions: example.extractions })}`,
    ]),
    "",
    `Text: ${text}`,
    "Answer:",
  ].join("\n")
}
