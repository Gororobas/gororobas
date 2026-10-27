import { Scene } from 'foldkit'

import { Menu } from '@foldkit/ui'

const ChordMenuBlock = Menu.create()

Scene.Command.resolve(
  Menu.test.FocusMenuItems,
  ChordMenuBlock.Message.CompletedFocusMenuItems(),
)

Scene.Mount.resolve(
  Menu.test.AnchorMenu,
  ChordMenuBlock.Message.CompletedAnchorMenu(),
)
