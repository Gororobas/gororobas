import { Schema } from 'effect'
import { expect, test } from 'vitest'

import { VirtualList } from '@foldkit/ui'

import { UiComposition } from './composition'
import { ChatVirtualListBlock } from './demo/components'
import { init } from './init'
import { update } from './update'
test('chat scroll policy prepends after the child snapshot and preserves its row anchor Command', () => {
  const initial = init({ year: 2026, month: 10, day: 17 }).model
  const firstObserved = update(
    initial,
    Schema.decodeSync(UiComposition.Message)({
      _tag: 'GotVirtualListChatDemoMessage',
      placement: 'virtualListChatDemo',
      generation: 0,
      message: ChatVirtualListBlock.Message.ObservedContainerScroll({
        scrollTop: 40,
        scrollHeight: 2000,
        containerHeight: 400,
        anchor: VirtualList.ObservedAnchor.Row({
          key: '0',
          index: 0,
          viewportOffset: 6,
        }),
      }),
    }),
  )
  expect(firstObserved.model.virtualListChatDemo.scrollTop).toBe(40)
  expect(firstObserved.model.virtualListChatStartProximity._tag).toBe('Near')
  expect(firstObserved.model.virtualListChatMessages).toHaveLength(32)
  expect(firstObserved.model.virtualListChatMessages.at(0)?.id).toBe(-8)
  expect(firstObserved.model.virtualListChatDemo.pendingScroll).toMatchObject({
    _tag: 'Pending',
    request: {
      _tag: 'Anchor',
      anchor: { _tag: 'Row', key: '0', index: 0, viewportOffset: 6 },
    },
  })
  expect(firstObserved.commands).toHaveLength(1)
  expect(firstObserved.commands?.at(0)?.name).toBe(
    'virtualListChatDemo/ApplyScroll',
  )
  const remainedNear = update(
    firstObserved.model,
    Schema.decodeSync(UiComposition.Message)({
      _tag: 'GotVirtualListChatDemoMessage',
      placement: 'virtualListChatDemo',
      generation: 0,
      message: ChatVirtualListBlock.Message.ObservedContainerScroll({
        scrollTop: 20,
        scrollHeight: 2500,
        containerHeight: 400,
        anchor: VirtualList.ObservedAnchor.Row({
          key: '-8',
          index: 0,
          viewportOffset: 2,
        }),
      }),
    }),
  )
  expect(remainedNear.model.virtualListChatMessages).toHaveLength(32)
  expect(remainedNear.commands).toEqual([])
  const movedAway = update(
    remainedNear.model,
    Schema.decodeSync(UiComposition.Message)({
      _tag: 'GotVirtualListChatDemoMessage',
      placement: 'virtualListChatDemo',
      generation: 0,
      message: ChatVirtualListBlock.Message.ObservedContainerScroll({
        scrollTop: 120,
        scrollHeight: 2500,
        containerHeight: 400,
        anchor: VirtualList.ObservedAnchor.Row({
          key: '-6',
          index: 2,
          viewportOffset: 8,
        }),
      }),
    }),
  )
  const enteredNearAgain = update(
    movedAway.model,
    Schema.decodeSync(UiComposition.Message)({
      _tag: 'GotVirtualListChatDemoMessage',
      placement: 'virtualListChatDemo',
      generation: 0,
      message: ChatVirtualListBlock.Message.ObservedContainerScroll({
        scrollTop: 48,
        scrollHeight: 2500,
        containerHeight: 400,
        anchor: VirtualList.ObservedAnchor.Row({
          key: '-8',
          index: 0,
          viewportOffset: 4,
        }),
      }),
    }),
  )
  expect(movedAway.model.virtualListChatStartProximity._tag).toBe('Away')
  expect(enteredNearAgain.model.virtualListChatMessages).toHaveLength(40)
  expect(enteredNearAgain.commands).toHaveLength(1)
})
test('chat scroll policy ignores programmatic scroll completion', () => {
  const initial = init({ year: 2026, month: 10, day: 17 }).model
  const completed = update(
    initial,
    Schema.decodeSync(UiComposition.Message)({
      _tag: 'GotVirtualListChatDemoMessage',
      placement: 'virtualListChatDemo',
      generation: 0,
      message: ChatVirtualListBlock.Message.CompletedApplyScroll({
        version: initial.virtualListChatDemo.pendingScrollVersion,
        outcome: {
          _tag: 'Applied',
          scrollTop: 20,
          scrollHeight: 2000,
          containerHeight: 400,
          anchor: VirtualList.ObservedAnchor.Row({
            key: '0',
            index: 0,
            viewportOffset: 6,
          }),
        },
      }),
    }),
  )
  expect(completed.model.virtualListChatDemo.scrollTop).toBe(20)
  expect(completed.model.virtualListChatStartProximity._tag).toBe('Away')
  expect(completed.model.virtualListChatMessages).toHaveLength(24)
})
