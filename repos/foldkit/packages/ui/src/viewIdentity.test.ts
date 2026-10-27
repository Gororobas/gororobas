import type { Html } from 'foldkit/html'
import * as Scene from 'foldkit/scene'
import { describe, expect, it } from 'vitest'

import * as Animation from './animation/block.js'

describe('view identity branding', () => {
  it('stamps a rendered vnode with the owning ui module identity', () => {
    const model = Animation.init({ id: 'sanity', isShowing: true }).model

    let renderedVNode!: Html
    Scene.scene(
      {
        update: Animation.update,
        view: (currentModel, h) => {
          renderedVNode = Animation.view(
            currentModel,
            { toView: () => h.div([]) },
            h,
          )
          return renderedVNode
        },
      },
      Scene.given(model),
    )

    expect(renderedVNode?.identity).toMatch(/^src\/animation\/block\.ts#/)
  })
})
