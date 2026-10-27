/** @internal A pure OutMessage callback invoked within the active parent graph. */
export type RuntimeOutMessagePolicyFunction = (
  ...args: ReadonlyArray<any>
) => unknown

/** @internal An immutable OutMessage policy selected by a Composition. */
export type RuntimeOutMessagePolicy = Readonly<{
  fold?: RuntimeOutMessagePolicyFunction
  forward?: RuntimeOutMessagePolicyFunction
}>

type OperationGraphPolicies = ReadonlyMap<object, RuntimeOutMessagePolicy>

const policiesByOperationGraph = new WeakMap<
  ReadonlyArray<object>,
  OperationGraphPolicies
>()

/** @internal Records policies for one exact, frozen graph of original Bindings. */
export const registerOperationGraphOutMessagePolicies = (
  bindings: ReadonlyArray<object>,
  entries: ReadonlyArray<
    readonly [binding: object, policy: RuntimeOutMessagePolicy]
  >,
): void => {
  if (!Object.isFrozen(bindings)) {
    throw new Error(
      '[foldkit] Composition OutMessage policies require a frozen Binding graph.',
    )
  }

  if (policiesByOperationGraph.has(bindings)) {
    throw new Error(
      '[foldkit] OutMessage policies are already registered for this Composition graph.',
    )
  }

  const policies = new Map<object, RuntimeOutMessagePolicy>()

  for (const [binding, policy] of entries) {
    if (!bindings.includes(binding)) {
      throw new Error(
        '[foldkit] An OutMessage policy belongs to a Binding outside this Composition graph.',
      )
    }

    if (policies.has(binding)) {
      throw new Error(
        '[foldkit] A Composition cannot select multiple OutMessage policies for one child Binding.',
      )
    }

    policies.set(binding, policy)
  }

  policiesByOperationGraph.set(bindings, policies)
}

/** @internal Reads the OutMessage policies for an exact Composition graph. */
export const outMessagePoliciesOf = (
  bindings: ReadonlyArray<object>,
): OperationGraphPolicies | undefined => policiesByOperationGraph.get(bindings)
