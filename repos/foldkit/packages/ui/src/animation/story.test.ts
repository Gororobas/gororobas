import * as Story from 'foldkit/story'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import {
  Message,
  OutMessage,
  WaitForAnimationSettled,
  WaitForPaint,
  AnimationBlock as block,
  init,
  update,
} from './block.js'

const INITIAL_TRANSITION_GENERATION = 0
const FIRST_TRANSITION_GENERATION = 1
const SECOND_TRANSITION_GENERATION = 2
const STALE_TRANSITION_GENERATION = -1

const resolveStaleSettle = Story.Command.resolve(
  WaitForAnimationSettled,
  Message.EndedAnimation({ generation: STALE_TRANSITION_GENERATION }),
)

const givenEnterAnimating = Story.steps(
  Story.given(init({ id: 'test' }).model),
  Story.message(Message.Showed()),
  Story.Command.resolve(
    WaitForPaint,
    Message.CompletedWaitForPaint({ generation: FIRST_TRANSITION_GENERATION }),
  ),
)

const givenLeaveAnimating = Story.steps(
  Story.given(init({ id: 'test', isShowing: true }).model),
  Story.message(Message.Hid()),
  Story.Command.resolve(
    WaitForPaint,
    Message.CompletedWaitForPaint({ generation: FIRST_TRANSITION_GENERATION }),
  ),
)

describe('Animation', () => {
  describe('init', () => {
    it('defaults isShowing to false', () => {
      expect(init({ id: 'test' }).model).toStrictEqual({
        id: 'test',
        isShowing: false,
        transitionState: 'Idle',
        transitionGeneration: INITIAL_TRANSITION_GENERATION,
      })
    })

    it('accepts a custom isShowing', () => {
      expect(init({ id: 'test', isShowing: true }).model).toStrictEqual({
        id: 'test',
        isShowing: true,
        transitionState: 'Idle',
        transitionGeneration: INITIAL_TRANSITION_GENERATION,
      })
    })
  })

  describe('update', () => {
    describe('Showed', () => {
      it('starts enter lifecycle when hidden', () => {
        Story.story(
          update,
          Story.given(init({ id: 'test' }).model),
          Story.message(Message.Showed()),
          Story.model(model => {
            expect(model.isShowing).toBe(true)
            expect(model.transitionState).toBe('EnterStart')
            expect(model.transitionGeneration).toBe(FIRST_TRANSITION_GENERATION)
          }),
          Story.Command.expectHas(
            WaitForPaint({ generation: FIRST_TRANSITION_GENERATION }),
          ),
          Story.Command.resolve(
            WaitForPaint,
            Message.CompletedWaitForPaint({
              generation: FIRST_TRANSITION_GENERATION,
            }),
          ),
          Story.model(model => {
            expect(model.transitionState).toBe('EnterAnimating')
          }),
          Story.Command.expectHas(
            WaitForAnimationSettled({
              id: 'test',
              generation: FIRST_TRANSITION_GENERATION,
            }),
          ),
          Story.Command.resolve(
            WaitForAnimationSettled,
            Message.EndedAnimation({ generation: FIRST_TRANSITION_GENERATION }),
          ),
          Story.model(model => {
            expect(model.transitionState).toBe('Idle')
          }),
          Story.expectNoOutMessage(),
        )
      })

      it('does nothing when already showing', () => {
        Story.story(
          update,
          Story.given(init({ id: 'test', isShowing: true }).model),
          Story.message(Message.Showed()),
          Story.model(model => {
            expect(model.isShowing).toBe(true)
            expect(model.transitionState).toBe('Idle')
          }),
          Story.Command.expectNone(),
          Story.expectNoOutMessage(),
        )
      })
    })

    describe('Hid', () => {
      it('starts leave lifecycle when showing', () => {
        Story.story(
          update,
          Story.given(init({ id: 'test', isShowing: true }).model),
          Story.message(Message.Hid()),
          Story.model(model => {
            expect(model.isShowing).toBe(false)
            expect(model.transitionState).toBe('LeaveStart')
            expect(model.transitionGeneration).toBe(FIRST_TRANSITION_GENERATION)
          }),
          Story.Command.expectHas(
            WaitForPaint({ generation: FIRST_TRANSITION_GENERATION }),
          ),
          Story.Command.resolve(
            WaitForPaint,
            Message.CompletedWaitForPaint({
              generation: FIRST_TRANSITION_GENERATION,
            }),
          ),
          Story.model(model => {
            expect(model.transitionState).toBe('LeaveAnimating')
          }),
          Story.Command.expectNone(),
          Story.expectOutMessage(
            OutMessage.StartedLeaveAnimating({
              generation: FIRST_TRANSITION_GENERATION,
            }),
          ),
          Story.message(
            Message.EndedAnimation({ generation: FIRST_TRANSITION_GENERATION }),
          ),
          Story.model(model => {
            expect(model.transitionState).toBe('Idle')
          }),
          Story.expectOutMessage(OutMessage.TransitionedOut()),
        )
      })

      it('does nothing when already hidden', () => {
        Story.story(
          update,
          Story.given(init({ id: 'test' }).model),
          Story.message(Message.Hid()),
          Story.model(model => {
            expect(model.isShowing).toBe(false)
          }),
          Story.Command.expectNone(),
          Story.expectNoOutMessage(),
        )
      })

      it('does nothing when already in LeaveAnimating', () => {
        Story.story(
          update,
          Story.given(init({ id: 'test', isShowing: true }).model),
          Story.message(Message.Hid()),
          Story.Command.expectHas(WaitForPaint),
          Story.Command.resolve(
            WaitForPaint,
            Message.CompletedWaitForPaint({
              generation: FIRST_TRANSITION_GENERATION,
            }),
          ),
          Story.model(model => {
            expect(model.transitionState).toBe('LeaveAnimating')
          }),
          Story.Command.expectNone(),
          Story.expectOutMessage(
            OutMessage.StartedLeaveAnimating({
              generation: FIRST_TRANSITION_GENERATION,
            }),
          ),
          Story.message(Message.Hid()),
          Story.model(model => {
            expect(model.transitionState).toBe('LeaveAnimating')
          }),
          Story.Command.expectNone(),
          Story.expectNoOutMessage(),
        )
      })
    })

    describe('CompletedWaitForPaint', () => {
      it('does nothing when Idle', () => {
        Story.story(
          update,
          Story.given(init({ id: 'test' }).model),
          Story.message(
            Message.CompletedWaitForPaint({
              generation: INITIAL_TRANSITION_GENERATION,
            }),
          ),
          Story.model(model => {
            expect(model.transitionState).toBe('Idle')
          }),
          Story.Command.expectNone(),
        )
      })
    })

    describe('EndedAnimation', () => {
      it('does nothing when Idle', () => {
        Story.story(
          update,
          Story.given(init({ id: 'test' }).model),
          Story.message(
            Message.EndedAnimation({
              generation: INITIAL_TRANSITION_GENERATION,
            }),
          ),
          Story.model(model => {
            expect(model.transitionState).toBe('Idle')
          }),
          Story.Command.expectNone(),
        )
      })
    })

    describe('stale results', () => {
      it('ignores an enter settlement after a leave starts', () => {
        Story.story(
          update,
          givenEnterAnimating,
          resolveStaleSettle,
          Story.message(Message.Hid()),
          Story.Command.resolve(
            WaitForPaint,
            Message.CompletedWaitForPaint({
              generation: SECOND_TRANSITION_GENERATION,
            }),
          ),
          Story.expectOutMessage(
            OutMessage.StartedLeaveAnimating({
              generation: SECOND_TRANSITION_GENERATION,
            }),
          ),
          Story.message(
            Message.EndedAnimation({ generation: FIRST_TRANSITION_GENERATION }),
          ),
          Story.model(model => {
            expect(model.transitionState).toBe('LeaveAnimating')
          }),
          Story.expectNoOutMessage(),
          Story.message(
            Message.EndedAnimation({
              generation: SECOND_TRANSITION_GENERATION,
            }),
          ),
          Story.model(model => {
            expect(model.transitionState).toBe('Idle')
          }),
          Story.expectOutMessage(OutMessage.TransitionedOut()),
        )
      })

      it('ignores a leave settlement after an enter starts', () => {
        Story.story(
          update,
          givenLeaveAnimating,
          Story.message(Message.Showed()),
          Story.Command.resolve(
            WaitForPaint,
            Message.CompletedWaitForPaint({
              generation: SECOND_TRANSITION_GENERATION,
            }),
          ),
          Story.model(model => {
            expect(model.transitionState).toBe('EnterAnimating')
          }),
          resolveStaleSettle,
          Story.message(
            Message.EndedAnimation({ generation: FIRST_TRANSITION_GENERATION }),
          ),
          Story.model(model => {
            expect(model.transitionState).toBe('EnterAnimating')
          }),
          Story.expectNoOutMessage(),
          Story.message(
            Message.EndedAnimation({
              generation: SECOND_TRANSITION_GENERATION,
            }),
          ),
          Story.model(model => {
            expect(model.transitionState).toBe('Idle')
          }),
          Story.expectNoOutMessage(),
        )
      })

      it('ignores an enter paint after a leave starts', () => {
        Story.story(
          update,
          Story.given(init({ id: 'test' }).model),
          Story.message(Message.Showed()),
          Story.Command.resolve(
            WaitForPaint,
            Message.CompletedWaitForPaint({
              generation: STALE_TRANSITION_GENERATION,
            }),
          ),
          Story.message(Message.Hid()),
          Story.Command.resolve(
            WaitForPaint,
            Message.CompletedWaitForPaint({
              generation: STALE_TRANSITION_GENERATION,
            }),
          ),
          Story.message(
            Message.CompletedWaitForPaint({
              generation: FIRST_TRANSITION_GENERATION,
            }),
          ),
          Story.model(model => {
            expect(model.transitionState).toBe('LeaveStart')
          }),
          Story.expectNoOutMessage(),
          Story.message(
            Message.CompletedWaitForPaint({
              generation: SECOND_TRANSITION_GENERATION,
            }),
          ),
          Story.model(model => {
            expect(model.transitionState).toBe('LeaveAnimating')
          }),
          Story.expectOutMessage(
            OutMessage.StartedLeaveAnimating({
              generation: SECOND_TRANSITION_GENERATION,
            }),
          ),
        )
      })
    })
  })

  describe('toggle', () => {
    it('shows a hidden animation', () => {
      const animationToggle = block.operations.requestToggle(
        init({ id: 'test' }).model,
      )

      expect(animationToggle.model.isShowing).toBe(true)
      expect(animationToggle.model.transitionState).toBe('EnterStart')
      expect(animationToggle.commands).toHaveLength(1)
    })

    it('hides a shown animation', () => {
      const animationToggle = block.operations.requestToggle(
        init({ id: 'test', isShowing: true }).model,
      )

      expect(animationToggle.model.isShowing).toBe(false)
      expect(animationToggle.model.transitionState).toBe('LeaveStart')
      expect(animationToggle.commands).toHaveLength(1)
    })
  })

  describe('programmatic capabilities', () => {
    it('shows a hidden Animation', () => {
      const animationShow = block.operations.requestShow(
        init({ id: 'test' }).model,
      )

      expect(animationShow.model.isShowing).toBe(true)
      expect(animationShow.model.transitionState).toBe('EnterStart')
      expect(animationShow.commands).toHaveLength(1)
    })

    it('hides a showing Animation', () => {
      const animationHide = block.operations.requestHide(
        init({ id: 'test', isShowing: true }).model,
      )

      expect(animationHide.model.isShowing).toBe(false)
      expect(animationHide.model.transitionState).toBe('LeaveStart')
      expect(animationHide.commands).toHaveLength(1)
    })

    it('requests the standard wait only while leave is animating', () => {
      const idleModel = init({ id: 'test' }).model
      const idleWait = block.operations.requestWaitForLeaveSettlement(idleModel)

      expect(idleWait).toEqual({ model: idleModel })

      const leaveStart = update(
        init({ id: 'test', isShowing: true }).model,
        Message.RequestedHide(),
      )
      const leaveAnimating = update(
        leaveStart.model,
        Message.CompletedWaitForPaint({
          generation: FIRST_TRANSITION_GENERATION,
        }),
      )
      const leaveWait = block.operations.requestWaitForLeaveSettlement(
        leaveAnimating.model,
      )

      expect(leaveWait.model).toBe(leaveAnimating.model)
      expect(
        leaveWait.commands?.map(({ name, args }) => ({ name, args })),
      ).toStrictEqual([
        {
          name: WaitForAnimationSettled.name,
          args: {
            id: 'test',
            generation: FIRST_TRANSITION_GENERATION,
          },
        },
      ])
    })

    it('emits TransitionedOut once when the standard wait is explicitly requested twice', () => {
      const leaveStart = update(
        init({ id: 'test', isShowing: true }).model,
        Message.RequestedHide(),
      )
      const leaveAnimating = update(
        leaveStart.model,
        Message.CompletedWaitForPaint({
          generation: FIRST_TRANSITION_GENERATION,
        }),
      )
      const duplicatePaint = update(
        leaveAnimating.model,
        Message.CompletedWaitForPaint({
          generation: FIRST_TRANSITION_GENERATION,
        }),
      )
      const firstWait = block.operations.requestWaitForLeaveSettlement(
        duplicatePaint.model,
      )
      const duplicateWait = block.operations.requestWaitForLeaveSettlement(
        firstWait.model,
      )
      const expectedWait = [
        {
          name: WaitForAnimationSettled.name,
          args: {
            id: 'test',
            generation: FIRST_TRANSITION_GENERATION,
          },
        },
      ]

      expect(duplicatePaint).toEqual({ model: leaveAnimating.model })
      expect(
        firstWait.commands?.map(({ name, args }) => ({ name, args })),
      ).toStrictEqual(expectedWait)
      expect(
        duplicateWait.commands?.map(({ name, args }) => ({ name, args })),
      ).toStrictEqual(expectedWait)

      const firstCompletion = update(
        duplicateWait.model,
        Message.EndedAnimation({ generation: FIRST_TRANSITION_GENERATION }),
      )

      expect(firstCompletion.outMessage).toEqual(OutMessage.TransitionedOut())

      const duplicateCompletion = update(
        firstCompletion.model,
        Message.EndedAnimation({ generation: FIRST_TRANSITION_GENERATION }),
      )

      expect(duplicateCompletion).toEqual({ model: firstCompletion.model })
    })

    it('resets a leaving Animation immediately without completing the transition', () => {
      const leaveStart = update(
        init({ id: 'test', isShowing: true }).model,
        Message.RequestedHide(),
      )
      const leaveAnimating = update(
        leaveStart.model,
        Message.CompletedWaitForPaint({
          generation: FIRST_TRANSITION_GENERATION,
        }),
      )

      const animationReset = block.operations.requestImmediateReset(
        leaveAnimating.model,
      )

      expect(animationReset).toEqual({
        model: {
          id: 'test',
          isShowing: false,
          transitionState: 'Idle',
          transitionGeneration: FIRST_TRANSITION_GENERATION,
        },
      })

      const staleSettlement = update(
        animationReset.model,
        Message.EndedAnimation({
          generation: FIRST_TRANSITION_GENERATION,
        }),
      )

      expect(staleSettlement).toEqual({ model: animationReset.model })
    })
  })
})
