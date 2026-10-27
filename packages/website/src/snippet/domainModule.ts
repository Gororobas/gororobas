// domain/cart.ts
import { Array, Option, Schema } from 'effect'
import { modifyFields } from 'foldkit/struct'

import { CartItem, Item } from './item'

export const Cart = Schema.Array(CartItem)

export const addItem =
  (item: Item) =>
  (cart: typeof Cart.Type): typeof Cart.Type => {
    const existing = Array.findFirst(
      cart,
      cartItem => cartItem.item.id === item.id,
    )

    return Option.match(existing, {
      onNone: () => [...cart, { item, quantity: 1 }],
      onSome: () =>
        Array.map(cart, cartItem =>
          cartItem.item.id === item.id
            ? modifyFields(cartItem, { quantity: quantity => quantity + 1 })
            : cartItem,
        ),
    })
  }

export const removeItem =
  (itemId: string) =>
  (cart: typeof Cart.Type): typeof Cart.Type =>
    Array.filter(cart, cartItem => cartItem.item.id !== itemId)

export const totalItems = (cart: typeof Cart.Type): number =>
  Array.reduce(cart, 0, (total, { quantity }) => total + quantity)
