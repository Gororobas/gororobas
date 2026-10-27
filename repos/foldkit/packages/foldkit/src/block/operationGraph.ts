import { outMessagePoliciesOf } from './outMessagePolicyRuntime.js'

let currentChildBindings: ReadonlyArray<object> | undefined

/** @internal Reads a Binding's policy from the active exact Composition graph. */
export const activeBindingOutMessagePolicy = (
  binding: object,
  placement: string,
) => {
  const policy =
    currentChildBindings === undefined
      ? undefined
      : outMessagePoliciesOf(currentChildBindings)?.get(binding)

  if (policy === undefined) {
    throw new Error(
      `[foldkit] Binding "${placement}" has no OutMessage policy in the active Composition graph.`,
    )
  }

  return policy
}

/** @internal Runs a synchronous Block operation with its direct child graph active. */
export const withOperationGraph = <Value>(
  bindings: ReadonlyArray<object>,
  operation: () => Value,
): Value => {
  const previousChildBindings = currentChildBindings
  currentChildBindings = bindings

  try {
    return operation()
  } finally {
    currentChildBindings = previousChildBindings
  }
}

/** @internal Rejects a bound operation outside its exact registered parent graph. */
export const assertRegisteredBinding = (
  binding: object,
  placement: string,
): void => {
  if (
    currentChildBindings === undefined ||
    !currentChildBindings.includes(binding)
  ) {
    throw new Error(
      `[foldkit] The child binding at placement "${placement}" is not registered in the current Block graph.`,
    )
  }
}

/** @internal Checks whether a Binding belongs to the active exact graph. */
export const isRegisteredBinding = (binding: object): boolean =>
  currentChildBindings !== undefined && currentChildBindings.includes(binding)

/** @internal Requires initialization to execute within an exact registered graph. */
export const assertRegisteredInitialization = (
  binding: object,
  placement: string,
): void => {
  if (currentChildBindings === undefined) {
    throw new Error(
      `[foldkit] Initializing child Binding "${placement}" requires its registered Composition.`,
    )
  }
  assertRegisteredBinding(binding, placement)
}
