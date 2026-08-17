import { Function, Option } from 'effect'
import type { Map as MapInstance } from 'maplibre-gl'

const mapsByHostId = new Map<string, MapInstance>()

/** Stash a live Map instance against an id so Subscriptions and Commands
 *  can reach it without putting the (mutable, unfreezable) instance in the
 *  Model. Cleanup is paired in `OnMount`'s cleanup. */
export const setMap = (hostId: string, instance: MapInstance): void => {
  mapsByHostId.set(hostId, instance)
}

export const getMap = (hostId: string): Option.Option<MapInstance> =>
  Option.fromNullishOr(mapsByHostId.get(hostId))

export const removeMap = (hostId: string): void =>
  Option.match(getMap(hostId), {
    onNone: Function.constVoid,
    onSome: map => {
      map.remove()
      mapsByHostId.delete(hostId)
    },
  })
