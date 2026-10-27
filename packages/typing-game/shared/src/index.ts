import { Schema } from 'effect'
import { Rpc, RpcGroup } from 'effect/rpc'

export const Waiting = Schema.TaggedStruct('Waiting', {})
export const GetReady = Schema.TaggedStruct('GetReady', {})
export const Countdown = Schema.TaggedStruct('Countdown', {
  secondsLeft: Schema.Number,
})
export const Playing = Schema.TaggedStruct('Playing', {
  secondsLeft: Schema.Number,
})
export const Finished = Schema.TaggedStruct('Finished', {})

export const GameStatus = Schema.Union([
  Waiting,
  GetReady,
  Countdown,
  Playing,
  Finished,
])

export const Player = Schema.Struct({
  id: Schema.String,
  username: Schema.String,
})

export const Game = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
})

export const GamePlayer = Schema.Struct({
  gameId: Schema.String,
  playerId: Schema.String,
})

export const PlayerProgress = Schema.Struct({
  playerId: Schema.String,
  gameId: Schema.String,
  userText: Schema.String,
  updatedAt: Schema.Number,
  charsTyped: Schema.Number,
})

export const PlayerScore = Schema.Struct({
  playerId: Schema.String,
  username: Schema.String,
  wpm: Schema.Number,
  accuracy: Schema.Number,
  charsTyped: Schema.Number,
  correctChars: Schema.Number,
})

export const Scoreboard = Schema.Array(PlayerScore)

export const Room = Schema.Struct({
  id: Schema.String,
  players: Schema.Array(Player),
  hostId: Schema.String,
  status: GameStatus,
  maybeGame: Schema.Option(Game),
  maybeScoreboard: Schema.Option(Scoreboard),
  createdAt: Schema.Number,
  usedGameTexts: Schema.Array(Schema.String),
})

export const RoomById = Schema.HashMap(Schema.String, Room)

export class RoomNotFoundError extends Schema.TaggedError<RoomNotFoundError>()(
  'RoomNotFoundError',
  {
    roomId: Schema.String,
  },
) {}

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  'UnauthorizedError',
  {
    message: Schema.String,
  },
) {}

export const RoomAndPlayer = Schema.Struct({ player: Player, room: Room })

export const RoomWithPlayerProgress = Schema.Struct({
  room: Room,
  maybePlayerProgress: Schema.Option(PlayerProgress),
})

export const createRoomRpc = Rpc.make('createRoom', {
  payload: Schema.Struct({ username: Schema.String }),
  success: RoomAndPlayer,
})

export const joinRoomRpc = Rpc.make('joinRoom', {
  payload: Schema.Struct({ username: Schema.String, roomId: Schema.String }),
  success: RoomAndPlayer,
  error: RoomNotFoundError,
})

export const getRoomByIdRpc = Rpc.make('getRoomById', {
  payload: Schema.Struct({ roomId: Schema.String }),
  success: Room,
  error: RoomNotFoundError,
})

export const subscribeToRoomRpc = Rpc.make('subscribeToRoom', {
  payload: Schema.Struct({ roomId: Schema.String, playerId: Schema.String }),
  success: RoomWithPlayerProgress,
  error: RoomNotFoundError,
  stream: true,
})

export const startGameRpc = Rpc.make('startGame', {
  payload: Schema.Struct({ roomId: Schema.String, playerId: Schema.String }),
  success: Schema.Void,
  error: Schema.Union([RoomNotFoundError, UnauthorizedError]),
})

export const updatePlayerProgressRpc = Rpc.make('updatePlayerProgress', {
  payload: Schema.Struct({
    playerId: Schema.String,
    gameId: Schema.String,
    userText: Schema.String,
    charsTyped: Schema.Number,
  }),
  success: Schema.Void,
})

export const RoomRpcs = RpcGroup.make(
  createRoomRpc,
  joinRoomRpc,
  getRoomByIdRpc,
  subscribeToRoomRpc,
  startGameRpc,
  updatePlayerProgressRpc,
)
export type RoomRpcs = typeof RoomRpcs
