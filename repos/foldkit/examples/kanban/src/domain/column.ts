import { Array, Match, Option, Schema, pipe } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { generateKeyBetween } from 'fractional-indexing'

import type { Card } from './card'
import { Card as CardSchema } from './card'

export const Column = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  cards: Schema.Array(CardSchema),
})

const generateSortKeyAtIndex = (
  cards: ReadonlyArray<typeof Card.Type>,
  targetIndex: number,
): string => {
  const maybeBefore = Array.get(cards, targetIndex - 1)
  const maybeAfter = Array.get(cards, targetIndex)
  return generateKeyBetween(
    Option.match(maybeBefore, {
      onNone: () => null,
      onSome: ({ sortKey }) => sortKey,
    }),
    Option.match(maybeAfter, {
      onNone: () => null,
      onSome: ({ sortKey }) => sortKey,
    }),
  )
}

export const removeCard = (
  column: typeof Column.Type,
  cardId: string,
): {
  readonly column: typeof Column.Type
  readonly maybeCard: Option.Option<typeof Card.Type>
} => {
  const maybeCard = Array.findFirst(column.cards, ({ id }) => id === cardId)
  return {
    column: modifyFields(column, {
      cards: () => Array.filter(column.cards, ({ id }) => id !== cardId),
    }),
    maybeCard,
  }
}

export const insertCard = (
  column: typeof Column.Type,
  card: typeof Card.Type,
  targetIndex: number,
): typeof Column.Type => {
  const sortKey = generateSortKeyAtIndex(column.cards, targetIndex)
  const updatedCard = modifyFields(card, { sortKey: () => sortKey })
  return modifyFields(column, {
    cards: () =>
      pipe(
        column.cards,
        Array.insertAt(targetIndex, updatedCard),
        Option.getOrElse(() => [...column.cards, updatedCard]),
      ),
  })
}

export const appendCard = (
  column: typeof Column.Type,
  card: typeof Card.Type,
): typeof Column.Type => {
  const sortKey = generateSortKeyAtIndex(column.cards, column.cards.length)
  return modifyFields(column, {
    cards: () => [
      ...column.cards,
      modifyFields(card, { sortKey: () => sortKey }),
    ],
  })
}

const findCard = (
  columns: ReadonlyArray<typeof Column.Type>,
  containerId: string,
  cardId: string,
): Option.Option<typeof Card.Type> =>
  pipe(
    columns,
    Array.findFirst(({ id }) => id === containerId),
    Option.flatMap(({ cards }) =>
      Array.findFirst(cards, ({ id }) => id === cardId),
    ),
  )

export const reorder = (
  columns: ReadonlyArray<typeof Column.Type>,
  itemId: string,
  fromContainerId: string,
  toContainerId: string,
  toIndex: number,
): ReadonlyArray<typeof Column.Type> => {
  if (fromContainerId === toContainerId) {
    return Array.map(columns, column => {
      if (column.id !== fromContainerId) {
        return column
      }
      const { column: withoutCard, maybeCard } = removeCard(column, itemId)
      return Option.match(maybeCard, {
        onNone: () => column,
        onSome: card => insertCard(withoutCard, card, toIndex),
      })
    })
  }

  return Option.match(findCard(columns, fromContainerId, itemId), {
    onNone: () => columns,
    onSome: card =>
      Array.map(columns, column =>
        Match.value(column.id).pipe(
          Match.when(fromContainerId, () => removeCard(column, itemId).column),
          Match.when(toContainerId, () => insertCard(column, card, toIndex)),
          Match.orElse(() => column),
        ),
      ),
  })
}
