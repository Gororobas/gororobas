import type { Effect } from 'effect'
import * as Server from 'foldkit/experimental/server'

import {
  ServerRootBlock,
  renderPure,
  renderRouted,
} from './program-server.accepted.js'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false
type Expect<Value extends true> = Value

type PureRender = Expect<
  Equal<
    ReturnType<typeof renderPure>,
    Effect.Effect<Server.RenderedApplication, Server.RenderError>
  >
>
type RoutedFlags = Expect<
  Equal<Parameters<typeof renderRouted>, [flags: { readonly status: string }]>
>

void Server.renderToString(ServerRootBlock, {}, { isHydratable: false })
void renderRouted({ status: 'Ready' })

export type Verified = PureRender | RoutedFlags
