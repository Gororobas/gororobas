import {
  ParentMessage,
  RawCompletionBlock,
  SilentParentBlock,
  parentModel,
  parentUpdate,
} from './strict-routing.accepted.js'

const message = ParentMessage.ClickedReset()
const direct = parentUpdate(parentModel, message)
const curried = parentUpdate(message)(parentModel)
const raw = RawCompletionBlock.update(parentModel, message)

void direct
void curried
void raw
void SilentParentBlock
