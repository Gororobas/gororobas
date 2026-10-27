import { ApplicationDefinition } from './definition'
import * as Home from './home'
import * as Room from './room'

export const HomeBinding = ApplicationDefinition.makeBinding(Home.HomeBlock, {
  field: 'home',
})

export const RoomBinding = ApplicationDefinition.makeBinding(Room.RoomBlock, {
  field: 'room',
})

const foldHomeOutMessage = ApplicationDefinition.makeOutMessageFold(
  Home.HomeBlock,
  {
    SelectedRoom: ({ roomId }) => RoomBinding.requestOpen(roomId),
  },
)

const foldRoomOutMessage = ApplicationDefinition.makeOutMessageFold(
  Room.RoomBlock,
  {
    SavedRoom: ({ roomId }) => HomeBinding.informRoomSaved(roomId),
  },
)

export const HomeBindingWithOutMessagePolicy = HomeBinding.withOutMessagePolicy(
  {
    fold: foldHomeOutMessage,
  },
)

export const RoomBindingWithOutMessagePolicy = RoomBinding.withOutMessagePolicy(
  {
    fold: foldRoomOutMessage,
  },
)

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [HomeBindingWithOutMessagePolicy, RoomBindingWithOutMessagePolicy],
})
