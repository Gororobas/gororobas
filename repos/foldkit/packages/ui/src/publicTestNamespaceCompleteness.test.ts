import { expect, it } from 'vitest'

import * as Animation from './animation/public.js'
import { WaitForAnimationSettled, WaitForPaint } from './animation/update.js'
import { FocusGrid } from './calendar/block.js'
import * as Calendar from './calendar/public.js'
import * as Combobox from './combobox/public.js'
import {
  Anchor,
  AttachPreventBlur,
  AttachSelectOnFocus,
  ClickItem,
  DetectMovementOrAnimationEnd,
  FocusInput,
  InertOthers,
  LockScroll,
  PortalBackdrop,
  RestoreInert,
  ScrollItemIntoView,
  UnlockScroll,
} from './combobox/shared.js'
import { FocusItem, ResolveKeyboardMove } from './dragAndDrop/block.js'
import * as DragAndDrop from './dragAndDrop/public.js'
import { WaitBeforeClosing, WaitBeforeOpening } from './hoverIntent/block.js'
import * as HoverIntent from './hoverIntent/public.js'
import * as Listbox from './listbox/public.js'
import {
  AnchorListbox,
  ClickListboxItem,
  DelayClearListboxSearch,
  DetectListboxMovementOrAnimationEnd,
  FocusListboxButton,
  FocusListboxItems,
  InertListboxOthers,
  LockListboxScroll,
  PortalListboxBackdrop,
  RestoreListboxInert,
  ScrollListboxItemIntoView,
  UnlockListboxScroll,
} from './listbox/shared.js'
import {
  AnchorPopover,
  DetectPopoverMovementOrAnimationEnd,
  FocusPopoverButton,
  FocusPopoverPanel,
  InertPopoverOthers,
  LockPopoverScroll,
  PortalPopoverBackdrop,
  RestorePopoverInert,
  UnlockPopoverScroll,
} from './popover/block.js'
import * as Popover from './popover/public.js'
import { AnchorTooltip, WaitBeforeShowing } from './tooltip/block.js'
import * as Tooltip from './tooltip/public.js'
import * as VirtualList from './virtualList/public.js'
import { ApplyScroll, ObserveVirtualList } from './virtualList/virtualList.js'

it('publishes every original Definition through its test namespace', () => {
  expect(Animation.test.WaitForPaint).toBe(WaitForPaint)
  expect(Animation.test.WaitForAnimationSettled).toBe(WaitForAnimationSettled)
  expect(Calendar.test.FocusGrid).toBe(FocusGrid)
  expect(Combobox.test.LockScroll).toBe(LockScroll)
  expect(Combobox.test.UnlockScroll).toBe(UnlockScroll)
  expect(Combobox.test.InertOthers).toBe(InertOthers)
  expect(Combobox.test.RestoreInert).toBe(RestoreInert)
  expect(Combobox.test.FocusInput).toBe(FocusInput)
  expect(Combobox.test.ScrollItemIntoView).toBe(ScrollItemIntoView)
  expect(Combobox.test.ClickItem).toBe(ClickItem)
  expect(Combobox.test.DetectMovementOrAnimationEnd).toBe(
    DetectMovementOrAnimationEnd,
  )
  expect(Combobox.test.Anchor).toBe(Anchor)
  expect(Combobox.test.AttachPreventBlur).toBe(AttachPreventBlur)
  expect(Combobox.test.AttachSelectOnFocus).toBe(AttachSelectOnFocus)
  expect(Combobox.test.PortalBackdrop).toBe(PortalBackdrop)
  expect(DragAndDrop.test.FocusItem).toBe(FocusItem)
  expect(DragAndDrop.test.ResolveKeyboardMove).toBe(ResolveKeyboardMove)
  expect(HoverIntent.test.WaitBeforeOpening).toBe(WaitBeforeOpening)
  expect(HoverIntent.test.WaitBeforeClosing).toBe(WaitBeforeClosing)
  expect(Listbox.test.LockListboxScroll).toBe(LockListboxScroll)
  expect(Listbox.test.UnlockListboxScroll).toBe(UnlockListboxScroll)
  expect(Listbox.test.InertListboxOthers).toBe(InertListboxOthers)
  expect(Listbox.test.RestoreListboxInert).toBe(RestoreListboxInert)
  expect(Listbox.test.FocusListboxButton).toBe(FocusListboxButton)
  expect(Listbox.test.FocusListboxItems).toBe(FocusListboxItems)
  expect(Listbox.test.ScrollListboxItemIntoView).toBe(ScrollListboxItemIntoView)
  expect(Listbox.test.ClickListboxItem).toBe(ClickListboxItem)
  expect(Listbox.test.DelayClearListboxSearch).toBe(DelayClearListboxSearch)
  expect(Listbox.test.DetectListboxMovementOrAnimationEnd).toBe(
    DetectListboxMovementOrAnimationEnd,
  )
  expect(Listbox.test.AnchorListbox).toBe(AnchorListbox)
  expect(Listbox.test.PortalListboxBackdrop).toBe(PortalListboxBackdrop)
  expect(Popover.test.LockPopoverScroll).toBe(LockPopoverScroll)
  expect(Popover.test.UnlockPopoverScroll).toBe(UnlockPopoverScroll)
  expect(Popover.test.InertPopoverOthers).toBe(InertPopoverOthers)
  expect(Popover.test.RestorePopoverInert).toBe(RestorePopoverInert)
  expect(Popover.test.FocusPopoverPanel).toBe(FocusPopoverPanel)
  expect(Popover.test.FocusPopoverButton).toBe(FocusPopoverButton)
  expect(Popover.test.DetectPopoverMovementOrAnimationEnd).toBe(
    DetectPopoverMovementOrAnimationEnd,
  )
  expect(Popover.test.AnchorPopover).toBe(AnchorPopover)
  expect(Popover.test.PortalPopoverBackdrop).toBe(PortalPopoverBackdrop)
  expect(Tooltip.test.WaitBeforeShowing).toBe(WaitBeforeShowing)
  expect(Tooltip.test.AnchorTooltip).toBe(AnchorTooltip)
  expect(VirtualList.test.ApplyScroll).toBe(ApplyScroll)
  expect(VirtualList.test.ObserveVirtualList).toBe(ObserveVirtualList)
})
