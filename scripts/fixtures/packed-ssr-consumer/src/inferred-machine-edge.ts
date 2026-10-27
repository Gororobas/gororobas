import { Option, Schema } from 'effect'
import { define, to, when } from 'foldkit/experimental/machine'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'

const MachineState = defineTaggedUnion({
  Idle: {},
  Running: { label: Schema.String },
})

const MachineMessage = defineMessageUnion({ Started: {} })

export const startEdge = to<
  typeof MachineState.Type,
  typeof MachineMessage.Type,
  typeof MachineState.Idle.Type,
  typeof MachineMessage.Type,
  'Running'
>('Running', () => ({ model: MachineState.Running({ label: 'direct' }) }))

export const guardedStartEdge = when<
  typeof MachineState.Type,
  typeof MachineMessage.Type,
  typeof MachineState.Idle.Type,
  typeof MachineMessage.Type,
  Option.Option<number>,
  'Running'
>(
  state => Option.some(state._tag.length),
  'Running',
  () => ({ model: MachineState.Running({ label: 'guarded' }) }),
)

const MachineContext = Schema.Struct({
  canStart: Schema.Boolean,
  label: Schema.String,
})

export const contextualMachine = define({
  state: MachineState,
  message: MachineMessage,
  context: MachineContext,
})({
  initial: MachineState.Idle(),
  states: {
    Idle: {
      on: {
        Started: [
          when(
            (_state, _message, context) => context.canStart,
            'Running',
            ({ context }) => ({
              model: MachineState.Running({ label: context.label }),
            }),
          ),
        ],
      },
    },
  },
})
