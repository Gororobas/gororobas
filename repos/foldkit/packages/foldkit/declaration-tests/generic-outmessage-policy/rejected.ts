import { Effect, Layer } from 'effect'
import { type Command, Runtime, type Update } from 'foldkit'

import { CityFeature, initial, pendingProgram, selected } from './consumer.js'

// @ts-expect-error The completed generic operation retains the literal Item union.
CityFeature.block.operations.select(initial.model, { value: 'Paris' })

// @ts-expect-error The inferred parent OutMessage retains the literal Item union.
CityFeature.OutMessage.ChoseItem({ value: 'Paris' })

// @ts-expect-error The Command authored inside the unresolved generic retains Item.
CityFeature.RecordSelection({ value: 'Paris' })

// @ts-expect-error The selected policy invokes HistoryBinding, which must be registered.
CityFeature.Definition.makeComposition({
  bindings: [CityFeature.SelectionBinding],
})

// @ts-expect-error A child OutMessage still needs its selected policy.
CityFeature.Definition.makeComposition({
  bindings: [CityFeature.UnselectedBinding, CityFeature.HistoryBinding],
})

// @ts-expect-error A policy-produced parent OutMessage cannot be erased from the operation.
export const erasedOutMessage: Update.Return<
  typeof CityFeature.Model.Type,
  typeof CityFeature.Composition.Message.Type,
  Command.HandlerOf<typeof CityFeature.RecordSelection>
> = selected

// @ts-expect-error Replacing the Layer must preserve the policy Command handler.
CityFeature.block.replaceEffectsLayer(Layer.empty)

// @ts-expect-error The ordinary Store remains required through the parent policy and root Binding.
Runtime.run(pendingProgram)

for (const command of selected.commands ?? []) {
  // @ts-expect-error A policy Command still needs its runtime handler service.
  Effect.runPromise(command.effect)
}
