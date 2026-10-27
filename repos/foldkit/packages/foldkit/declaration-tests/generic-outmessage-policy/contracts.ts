import { Context, type Effect } from 'effect'

/** Ordinary application service used when constructing the parent handler. */
export class SelectionStore extends Context.Service<
  SelectionStore,
  Readonly<{ record: (value: string) => Effect.Effect<void> }>
>()('GenericPolicy/SelectionStore') {}
