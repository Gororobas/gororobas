import { PopoverBlock } from "@foldkit/ui"
import { type AnchorConfig, layer as PopoverLayer } from "@foldkit/ui/popover"
import { Style, When } from "@pleat/core"
import { Effect, Layer, Schema } from "effect"
import { Block, Update } from "foldkit"
import type { Html } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"

import * as AppDrawer from "../app-drawer/view"
import { popoverBackdropStyle, popoverPanelStyle } from "../app-popover/styles"
import { DrawerBlock, layer as DrawerLayer } from "../drawer"
import { styledAttributes } from "../pleat-attributes"
import { breakpoint, type Tone, toneStyle } from "../theme"

/**
 * Wide screens with a precise pointer open the content in a popover by its trigger; phones,
 * tablets and touch screens in a bottom drawer. The content is the same in both: only how it
 * opens differs.
 */
const precisePointer = When.all(breakpoint.md, When.media("(hover: hover) and (pointer: fine)"))

const drawerOnlyStyle = Style.make({ display: "contents" }).pipe(
  Style.when(precisePointer, { display: "none" }),
)
const popoverOnlyStyle = Style.make({ display: "none" }).pipe(
  Style.when(precisePointer, { display: "contents" }),
)

// MODEL

const Model = Schema.Struct({
  /** Tells a parent's keyed instances apart. */
  id: Schema.String,
  popover: PopoverBlock.Model,
  drawer: DrawerBlock.Model,
})

export type Model = typeof Model.Type

const Message = defineMessageUnion({
  ClickedDrawerTrigger: {},
})

/** What a parent can ask through its Binding's `requestClose`, such as once a choice is made. */
const InMessage = defineMessageUnion({
  RequestedClose: {},
})

/** Configuration for creating a popover drawer. */
export type InitConfig = Readonly<{
  /** Unique on the page: the popover and drawer derive their ids from it. */
  id: string
}>

export type ViewInputs = Readonly<{
  /** Heads the drawer, and names the popover for assistive technology. */
  title: string
  trigger: Readonly<{
    children: ReadonlyArray<Html | string>
    /** Built with `styledClassName`: view inputs carry plain values. */
    className: string
    ariaLabel?: string
    isDisabled?: boolean
  }>
  /**
   * Renders the content. A function, so Foldkit scopes the caller's handlers (such as an option's
   * `OnClick`) to the caller rather than to this block.
   */
  toContent: () => ReadonlyArray<Html>
  anchor?: AnchorConfig
  /** The popover panel's own styles, such as a width that fits its content, from `styledClassName`. */
  panelClassName?: string
  drawerSize?: AppDrawer.AppDrawerSize
  tone?: Tone
}>

export const PopoverDrawerKey = Symbol("PopoverDrawer")

export const PopoverDrawerBlock = Block.make("PopoverDrawer", {
  key: PopoverDrawerKey,
  Init: Block.makeInputContract<readonly [config: InitConfig]>(),
  view: { kind: "Element", Inputs: Block.makeInputContract<ViewInputs>() },
  ChildInitContext: Schema.Struct({ id: Schema.String }),
  InMessage,
  Model,
  Message,
})

const PopoverBinding = PopoverDrawerBlock.makeBinding(PopoverBlock, {
  field: "popover",
  init: { contextToArgs: ({ id }) => [{ id: `${id}-popover`, isAnimated: true }] },
}).withOutMessagePolicy({
  fold: PopoverDrawerBlock.makeOutMessageFold(PopoverBlock, {
    Opened: PopoverDrawerBlock.makeNoopStep,
    Closed: PopoverDrawerBlock.makeNoopStep,
  }),
})

const DrawerBinding = PopoverDrawerBlock.makeBinding(DrawerBlock, {
  field: "drawer",
  init: { contextToArgs: ({ id }) => [{ id: `${id}-drawer`, isAnimated: true }] },
}).withOutMessagePolicy({
  fold: PopoverDrawerBlock.makeOutMessageFold(DrawerBlock, {
    Opened: PopoverDrawerBlock.makeNoopStep,
    Closed: PopoverDrawerBlock.makeNoopStep,
  }),
})

const PopoverDrawerComposition = PopoverDrawerBlock.makeComposition({
  bindings: [PopoverBinding, DrawerBinding],
})

// UPDATE

const init = PopoverDrawerComposition.makeInit((config: InitConfig) => ({
  childInitContext: { id: config.id },
  model: { id: config.id },
}))

const update = PopoverDrawerComposition.makeUpdate({
  ClickedDrawerTrigger: DrawerBinding.requestOpen(),
})

const inMessageUpdate = PopoverDrawerComposition.makeInMessageUpdate({
  RequestedClose: (model) =>
    Update.combineSteps([PopoverBinding.requestClose(), DrawerBinding.requestClose()])(model),
})

// VIEW

const view = PopoverDrawerComposition.makeView.withInputs<ViewInputs>(
  // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- Foldkit's view signature: Model, view inputs and builder.
  (model, viewInputs, h): Html => {
    const { trigger } = viewInputs
    const isDisabled = trigger.isDisabled ?? false

    const triggerAttributes = [
      h.Class(trigger.className),
      h.Type("button"),
      h.Disabled(isDisabled),
      ...(trigger.ariaLabel === undefined ? [] : [h.AriaLabel(trigger.ariaLabel)]),
    ]

    return h.div(
      [],
      [
        h.div(styledAttributes([], drawerOnlyStyle), [
          h.button(
            styledAttributes([
              ...triggerAttributes,
              h.AriaHasPopup("dialog"),
              h.AriaExpanded(model.drawer.dialog.isOpen),
              h.OnClick(Message.ClickedDrawerTrigger()),
            ]),
            trigger.children,
          ),
          h.block(
            DrawerBinding.embedView({
              slotId: model.drawer.dialog.id,
              model: model.drawer,
              viewInputs: {
                toView: (render, drawerBuilder) =>
                  AppDrawer.view(
                    {
                      render,
                      title: viewInputs.title,
                      size: viewInputs.drawerSize ?? "narrow",
                      ...(viewInputs.tone === undefined ? {} : { tone: viewInputs.tone }),
                      children: viewInputs.toContent(),
                    },
                    drawerBuilder,
                  ),
              },
            }),
          ),
        ]),
        h.div(styledAttributes([], popoverOnlyStyle), [
          h.block(
            PopoverBinding.embedView({
              slotId: model.popover.id,
              model: model.popover,
              viewInputs: {
                anchor: viewInputs.anchor ?? { placement: "bottom-start", gap: 6, padding: 8 },
                ariaLabel: viewInputs.title,
                isDisabled,
                toView: ({ button, panel, backdrop, isVisible }) =>
                  h.div(
                    [],
                    [
                      h.button(
                        // The trigger's own name, when it has one, describes it better than the title.
                        styledAttributes([...button, ...triggerAttributes]),
                        trigger.children,
                      ),
                      ...(isVisible
                        ? [
                            h.div(styledAttributes(backdrop, popoverBackdropStyle)),
                            h.div(
                              styledAttributes(
                                [
                                  ...panel,
                                  ...(viewInputs.panelClassName === undefined
                                    ? []
                                    : [h.Class(viewInputs.panelClassName)]),
                                ],
                                popoverPanelStyle,
                                ...(viewInputs.tone === undefined
                                  ? []
                                  : [toneStyle(viewInputs.tone)]),
                              ),
                              viewInputs.toContent(),
                            ),
                          ]
                        : []),
                    ],
                  ),
              },
            }),
          ),
        ]),
      ],
    )
  },
)

export const layer = PopoverDrawerBlock.makeLayer(
  Effect.gen(function* () {
    const popover = yield* PopoverBinding
    const drawer = yield* DrawerBinding

    return {
      children: [popover, drawer],
      init,
      update,
      inMessageUpdate,
      view,
    }
  }),
).pipe(Layer.provide(Layer.mergeAll(PopoverLayer, DrawerLayer)))
