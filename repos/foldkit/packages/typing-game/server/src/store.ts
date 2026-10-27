import { Context, HashMap, HashSet, Layer, Ref, SubscriptionRef } from 'effect'

import * as Shared from '@typing-game/shared'

type RoomId = string
type RoomById = HashMap.HashMap<RoomId, typeof Shared.Room.Type>

export class RoomByIdStore extends Context.Service<
  RoomByIdStore,
  SubscriptionRef.SubscriptionRef<RoomById>
>()('RoomByIdStore') {}

export const RoomByIdStoreLayer = Layer.effect(
  RoomByIdStore,
  SubscriptionRef.make(HashMap.empty<string, typeof Shared.Room.Type>()),
)

export type ProgressByGamePlayer = HashMap.HashMap<
  typeof Shared.GamePlayer.Type,
  typeof Shared.PlayerProgress.Type
>

export class ProgressByGamePlayerStore extends Context.Service<
  ProgressByGamePlayerStore,
  SubscriptionRef.SubscriptionRef<ProgressByGamePlayer>
>()('ProgressByGamePlayerStore') {}

export const ProgressByGamePlayerStoreLayer = Layer.effect(
  ProgressByGamePlayerStore,
  SubscriptionRef.make(
    HashMap.empty<
      typeof Shared.GamePlayer.Type,
      typeof Shared.PlayerProgress.Type
    >(),
  ),
)

type PlayerId = string
export type PendingCleanupPlayerIds = HashSet.HashSet<PlayerId>

export class PendingCleanupPlayerIdsStore extends Context.Service<
  PendingCleanupPlayerIdsStore,
  Ref.Ref<PendingCleanupPlayerIds>
>()('PendingCleanupPlayerIdsStore') {}

export const PendingCleanupPlayerIdsStoreLayer = Layer.effect(
  PendingCleanupPlayerIdsStore,
  Ref.make(HashSet.empty<string>()),
)
