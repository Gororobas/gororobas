import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

const Message = defineMessageUnion({
  ClickedSave: {},
})

// ❌ Bad
const badMessage: typeof Message.Type = {
  _tag: 'ClickedSave',
}

// ✅ Good
const goodMessage = Message.ClickedSave()
