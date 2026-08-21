import { Schema } from "effect"

export class FeatureParseError extends Schema.TaggedError<FeatureParseError>()(
  "FeatureParseError",
  {
    path: Schema.String,
    message: Schema.String,
  },
) {}

export class StepMatchError extends Schema.TaggedError<StepMatchError>()("StepMatchError", {
  pattern: Schema.String,
  text: Schema.String,
  feature: Schema.String,
}) {}

export class StepParamsDecodeError extends Schema.TaggedError<StepParamsDecodeError>()(
  "StepParamsDecodeError",
  {
    step: Schema.String,
    params: Schema.Unknown,
    error: Schema.Unknown,
  },
) {}

export class ScenarioNotFoundError extends Schema.TaggedError<ScenarioNotFoundError>()(
  "ScenarioNotFoundError",
  {
    scenario: Schema.String,
    feature: Schema.String,
    availableScenarios: Schema.Array(Schema.String),
  },
) {}

export class ScenarioOutlineExamplesError extends Schema.TaggedError<ScenarioOutlineExamplesError>()(
  "ScenarioOutlineExamplesError",
  {
    scenario: Schema.String,
    feature: Schema.String,
  },
) {}

export class PatternMismatchError extends Schema.TaggedError<PatternMismatchError>()(
  "PatternMismatchError",
  {
    pattern: Schema.String,
    featureText: Schema.String,
    suggestion: Schema.Option(Schema.String),
  },
) {}

export class StepCountMismatchError extends Schema.TaggedError<StepCountMismatchError>()(
  "StepCountMismatchError",
  {
    feature: Schema.String,
    scenario: Schema.String,
    expectedCount: Schema.Int,
    actualCount: Schema.Int,
    featureSteps: Schema.Array(Schema.String),
    providedPatterns: Schema.Array(Schema.String),
  },
) {
  get message() {
    return [
      `Step count mismatch in "${this.scenario}"`,
      ``,
      `Feature file has ${this.expectedCount} steps:`,
      ...this.featureSteps.map((s, i) => `  ${i + 1}. ${s}`),
      ``,
      `But you provided ${this.actualCount} step handlers:`,
      ...this.providedPatterns.map((p, i) => `  ${i + 1}. ${p}`),
      ``,
      this.expectedCount > this.actualCount
        ? `Missing ${this.expectedCount - this.actualCount} handler(s) for steps ${this.actualCount + 1}-${this.expectedCount}`
        : `${this.actualCount - this.expectedCount} extra handler(s) provided`,
    ].join("\n")
  }
}

export class StepValidationError extends Schema.TaggedError<StepValidationError>()(
  "StepValidationError",
  {
    scenario: Schema.String,
    mismatches: Schema.Array(
      Schema.Struct({
        index: Schema.Int,
        featureStep: Schema.String,
        providedPattern: Schema.String,
        reason: Schema.String,
      }),
    ),
    featureSteps: Schema.Array(Schema.String),
    providedPatterns: Schema.Array(Schema.String),
  },
) {
  get message() {
    const mismatchDetails = this.mismatches
      .map(
        (m) =>
          `  Step ${m.index + 1}:\n` +
          `    Feature:  "${m.featureStep}"\n` +
          `    Handler:  "${m.providedPattern}"\n` +
          `    Problem:  ${m.reason}`,
      )
      .join("\n\n")

    return [
      `Step validation failed in "${this.scenario}"`,
      ``,
      `Mismatches found:`,
      mismatchDetails,
      ``,
      `All feature steps:`,
      ...this.featureSteps.map((s, i) => `  ${i + 1}. ${s}`),
      ``,
      `All provided handlers:`,
      ...this.providedPatterns.map((p, i) => `  ${i + 1}. ${p}`),
    ].join("\n")
  }
}
