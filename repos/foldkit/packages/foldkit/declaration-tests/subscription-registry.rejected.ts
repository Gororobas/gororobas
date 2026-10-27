import { Stream } from 'effect'

import {
  DeclarationSubscriptionRegistryDefinition,
  Message,
  mixedSubscriptions,
} from './subscription-registry.accepted.js'

// @ts-expect-error Mixed attached and host-owned subscriptions have no aggregate layer.
mixedSubscriptions.layer

DeclarationSubscriptionRegistryDefinition.makeSubscriptions(entry => ({
  // @ts-expect-error Definition.makeSubscriptions reserves layer for its aggregate Layer.
  layer: entry('Conflicting', {
    messages: [Message.Ticked],
    handler: function* () {
      return () => Stream.empty
    },
  }),
}))
