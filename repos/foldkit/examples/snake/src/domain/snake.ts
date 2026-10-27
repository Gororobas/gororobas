import { Array, Schema } from 'effect'

import type { Direction } from './direction'
import * as Position from './position'

export const INITIAL_LENGTH = 3

export const Snake = Schema.NonEmptyArray(Position.Position)

export const create = (
  startPos: typeof Position.Position.Type,
): typeof Snake.Type =>
  Array.makeBy(INITIAL_LENGTH, i => ({
    x: startPos.x - i,
    y: startPos.y,
  }))

export const move = (
  snake: typeof Snake.Type,
  direction: typeof Direction.Type,
): typeof Snake.Type =>
  Array.matchLeft(snake, {
    onEmpty: () => snake,
    onNonEmpty: (head, tail) => {
      const newHead = Position.move(head, direction)
      return [newHead, head, ...Array.dropRight(tail, 1)]
    },
  })

export const grow = (
  snake: typeof Snake.Type,
  direction: typeof Direction.Type,
): typeof Snake.Type =>
  Array.matchLeft(snake, {
    onEmpty: () => snake,
    onNonEmpty: (head, tail) => {
      const newHead = Position.move(head, direction)
      return [newHead, head, ...tail]
    },
  })

export const hasCollision = (snake: typeof Snake.Type): boolean =>
  Array.matchLeft(snake, {
    onEmpty: () => false,
    onNonEmpty: (head, tail) =>
      Array.some(tail, segment => Position.equivalence(head, segment)),
  })

export const contains = (
  snake: typeof Snake.Type,
  pos: typeof Position.Position.Type,
): boolean => Array.some(snake, segment => Position.equivalence(segment, pos))
