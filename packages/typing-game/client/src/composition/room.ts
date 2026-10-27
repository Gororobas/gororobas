import { ApplicationDefinition } from '../definition'
import { RoomBlock } from '../page'
import * as ApplicationRoute from '../route'

export const RoomBinding = ApplicationDefinition.makeBinding(RoomBlock, {
  field: 'maybeRoomInstance',
  key: 'roomId',
  childField: 'model',
  delivery: {
    when: (model, roomId) =>
      ApplicationRoute.isRoomRouteFor(model.route, roomId),
    toUpdateContext: (_model, roomId) => [{ roomId }],
  },
  subscriptions: {
    when: (model, roomId) =>
      ApplicationRoute.isRoomRouteFor(model.route, roomId),
  },
})
