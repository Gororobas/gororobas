import { Effect, HashMap, Struct, SubscriptionRef } from 'effect'

import * as Shared from '@typing-game/shared'

export const getById = (roomById: typeof Shared.RoomById.Type, id: string) =>
  Effect.fromOption(HashMap.get(roomById, id)).pipe(
    Effect.mapError(() => new Shared.RoomNotFoundError({ roomId: id })),
  )

export const updateRoom =
  (
    roomByIdRef: SubscriptionRef.SubscriptionRef<typeof Shared.RoomById.Type>,
    roomId: string,
  ) =>
  (f: (room: typeof Shared.Room.Type) => typeof Shared.Room.Type) =>
    SubscriptionRef.updateEffect(roomByIdRef, roomById =>
      Effect.gen(function* () {
        const room = yield* getById(roomById, roomId)
        const updatedRoom = f(room)
        return HashMap.set(roomById, roomId, updatedRoom)
      }),
    )

export const updateRoomStatus =
  (
    roomByIdRef: SubscriptionRef.SubscriptionRef<typeof Shared.RoomById.Type>,
    roomId: string,
  ) =>
  (status: typeof Shared.GameStatus.Type) =>
    updateRoom(roomByIdRef, roomId)(Struct.evolve({ status: () => status }))
