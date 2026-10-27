import { Array, Number, Option, Predicate, Schema, pipe } from 'effect'
import { modifyFields } from 'foldkit/struct'

import { CartItem, Item } from './item'

export const Cart = Schema.Array(CartItem)

const hasItemId =
  (itemId: string) =>
  (cartItem: typeof CartItem.Type): boolean =>
    cartItem.item.id === itemId

const mapCartItem = (
  itemId: string,
  f: (cartItem: typeof CartItem.Type) => typeof CartItem.Type,
) =>
  Array.map<typeof Cart.Type, typeof CartItem.Type>(cartItem =>
    hasItemId(itemId)(cartItem) ? f(cartItem) : cartItem,
  )

export const addItem =
  (item: typeof Item.Type) =>
  (cart: typeof Cart.Type): typeof Cart.Type => {
    const existingCartItem = Array.findFirst(cart, hasItemId(item.id))

    return Option.match(existingCartItem, {
      onNone: () => [...cart, { item, quantity: 1 }],
      onSome: () =>
        mapCartItem(
          item.id,
          modifyFields({
            quantity: Number.increment,
          }),
        )(cart),
    })
  }

export const removeItem =
  (itemId: string) =>
  (cart: typeof Cart.Type): typeof Cart.Type =>
    Array.filter(cart, Predicate.not(hasItemId(itemId)))

export const changeQuantity = (itemId: string, quantity: number) =>
  quantity <= 0
    ? removeItem(itemId)
    : mapCartItem(
        itemId,
        modifyFields({
          quantity: () => quantity,
        }),
      )

export const incrementQuantity = (itemId: string) =>
  mapCartItem(
    itemId,
    modifyFields({
      quantity: Number.increment,
    }),
  )

export const decrementQuantity =
  (itemId: string) =>
  (cart: typeof Cart.Type): typeof Cart.Type =>
    changeQuantity(itemId, itemQuantity(itemId)(cart) - 1)(cart)

export const itemQuantity =
  (itemId: string) =>
  (cart: typeof Cart.Type): number =>
    pipe(
      cart,
      Array.findFirst<typeof CartItem.Type>(hasItemId(itemId)),
      Option.match({
        onNone: () => 0,
        onSome: ({ quantity }) => quantity,
      }),
    )

export const totalItems = (cart: typeof Cart.Type) =>
  Array.reduce(cart, 0, (total, { quantity }) => total + quantity)
