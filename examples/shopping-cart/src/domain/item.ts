import { Schema } from 'effect'

export const Item = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  price: Schema.Number,
})

export const CartItem = Schema.Struct({
  item: Item,
  quantity: Schema.Number,
})
