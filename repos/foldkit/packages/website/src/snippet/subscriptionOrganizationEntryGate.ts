import { ApplicationDefinition } from './definition'
import * as Room from './room'

export const RoomBinding = ApplicationDefinition.makeBinding(Room.RoomBlock, {
  field: 'room',
  subscriptions: {
    when: { roomKeyboard: ({ route }) => route._tag === 'Room' },
  },
})
