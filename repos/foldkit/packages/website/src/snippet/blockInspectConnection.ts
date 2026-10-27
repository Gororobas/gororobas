import { Block } from 'foldkit'

import { ApplicationDefinition } from './definition'
import { Room } from './page'

const RoomBinding = ApplicationDefinition.makeBinding(Room.RoomBlock, {
  field: 'room',
})

const roomInspection = Block.inspectBinding(RoomBinding)

export const roomSubscriptions = roomInspection.subscriptions
export const roomManagedResources = roomInspection.managedResources
export const roomMounts = roomInspection.mounts
export const RoomEffectsLayer = roomInspection.EffectsLayer
