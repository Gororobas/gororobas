import type { Handle, VegetableId, VegetableRow, VegetableTranslationRow } from "@gororobas/domain"
import { Effect, Option, Context } from "effect"

export class VegetablesRepository extends Context.Service<VegetablesRepository>()(
  "VegetablesRepository",
  {
    make: Effect.succeed({
      findById: (_id: VegetableId) => Effect.succeed(Option.none<VegetableRow>()),
      findByHandle: (_handle: Handle | string) => Effect.succeed(Option.none<VegetableRow>()),
      findAll: () => Effect.succeed([] as Array<VegetableRow>),
      findBySearchableName: (_pattern: string) =>
        Effect.succeed(Option.none<{ vegetableId: VegetableId; handle: string }>()),
      findTranslations: (_vegetableId: VegetableId) =>
        Effect.succeed([] as Array<VegetableTranslationRow>),
      getCrdt: (_vegetableId: VegetableId) => Effect.succeed(Option.none<unknown>()),
      insertCrdt: (_input: unknown) => Effect.void,
      updateCrdt: (_input: unknown) => Effect.void,
      insertRevision: (_input: unknown) => Effect.void,
      fetchRevision: (_id: unknown) => Effect.succeed(Option.none<unknown>()),
      updateRevision: (_input: unknown) => Effect.void,
      materialize: (_input: unknown) => Effect.void,
    }),
  },
) {}
