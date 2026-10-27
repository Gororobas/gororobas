import { ApplicationDefinition } from './definition'
import * as Room from './room'
import { ApplicationRoute } from './route'

const RoomBinding = ApplicationDefinition.makeBinding(Room.RoomBlock, {
  field: 'room',
  presentWhen: model =>
    ApplicationRoute.match(model.route, {
      Home: () => false,
      Room: () => true,
    }),
})
