import { ApplicationDefinition } from './definition'
import * as Room from './room'

const RoomBinding = ApplicationDefinition.makeBinding(Room.RoomBlock, {
  field: 'room',
  subscriptions: {
    when: { roomKeyPresses: model => model.route._tag === 'Room' },
  },
})
