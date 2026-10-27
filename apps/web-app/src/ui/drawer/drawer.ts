import { Dialog } from "@foldkit/ui"
import { Predicate } from "effect"
import { Effect, Layer, Match, Option, Queue, Schema, Stream } from "effect"
import { Block, Mount } from "foldkit"
import { type ChildAttribute, type Html, childAttributes } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { taggedStruct } from "foldkit/schema"
import { modifyFields } from "foldkit/struct"

import { trackVirtualKeyboard } from "../virtual-keyboard"

// MODEL

/** Direction in which the drawer is dismissed. */
export const DismissDirection = Schema.Literals(["Up", "Down", "Left", "Right"])
export type DismissDirection = typeof DismissDirection.Type

const Idle = taggedStruct("Idle")

const Pressed = taggedStruct("Pressed", {
  startClientX: Schema.Finite,
  startClientY: Schema.Finite,
  currentClientX: Schema.Finite,
  currentClientY: Schema.Finite,
  timeStamp: Schema.Finite,
  panelWidth: Schema.Finite,
  panelHeight: Schema.Finite,
})

const Swiping = taggedStruct("Swiping", {
  startClientX: Schema.Finite,
  startClientY: Schema.Finite,
  currentClientX: Schema.Finite,
  currentClientY: Schema.Finite,
  previousClientX: Schema.Finite,
  previousClientY: Schema.Finite,
  previousTimeStamp: Schema.Finite,
  velocity: Schema.Finite,
  panelSize: Schema.Finite,
})

const GestureState = Schema.Union([Idle, Pressed, Swiping])
type GestureState = typeof GestureState.Type

/** Schema for the drawer state. Modal lifecycle state is delegated to Dialog. */
export const Model = Schema.Struct({
  dialog: Dialog.DialogBlock.Model,
  dismissDirection: DismissDirection,
  isSwipeEnabled: Schema.Boolean,
  gestureState: GestureState,
})

export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  RequestedOpen: {},
  RequestedClose: {},
  InformedOfSwipeAvailability: { isSwipeEnabled: Schema.Boolean },
  PressedSwipeArea: {
    clientX: Schema.Finite,
    clientY: Schema.Finite,
    timeStamp: Schema.Finite,
    panelWidth: Schema.Finite,
    panelHeight: Schema.Finite,
  },
  MovedSwipePointer: {
    clientX: Schema.Finite,
    clientY: Schema.Finite,
    timeStamp: Schema.Finite,
  },
  ReleasedSwipePointer: {
    clientX: Schema.Finite,
    clientY: Schema.Finite,
    timeStamp: Schema.Finite,
  },
  CancelledSwipe: {},
  CompletedTrackVirtualKeyboard: {},
})

export type Message = typeof Message.Type

// OUT MESSAGE

export const OutMessage = defineMessageUnion({
  Opened: {},
  Closed: {},
})
export type OutMessage = typeof OutMessage.Type

const DrawerDefinition = Block.makeDefinition("Drawer", {
  Model,
  Message,
  OutMessage,
  ChildInitContext: Schema.Struct({
    id: Schema.String,
    isAnimated: Schema.optionalKey(Schema.Boolean),
    focusSelector: Schema.optionalKey(Schema.String),
  }),
})

const DialogBinding = DrawerDefinition.makeBinding(Dialog.DialogBlock, {
  field: "dialog",
  init: { contextToArgs: (config) => [config] },
}).withOutMessagePolicy({
  fold: DrawerDefinition.makeOutMessageFold(Dialog.DialogBlock, {
    Opened: () => DrawerDefinition.makeOutMessageStep(() => OutMessage.Opened()),
    Closed: () =>
      DrawerDefinition.makeStep((model) => ({
        model: modifyFields(model, { gestureState: () => Idle() }),
        outMessage: OutMessage.Closed(),
      })),
    CompletedClose: DrawerDefinition.makeNoopStep,
  }),
})

// INIT

/** Configuration for creating a drawer model. */
export type InitConfig = Readonly<{
  id: string
  dismissDirection?: DismissDirection
  isOpen?: boolean
  isAnimated?: boolean
  isSwipeEnabled?: boolean
  focusSelector?: string
}>

/** Creates a drawer model. Defaults to a downward-dismissed, swipeable drawer. */

/** Returns the unique id owned by the underlying dialog. */
export const id = (model: Model): string => model.dialog.id

// MOUNT

const DRAWER_PANEL_ATTRIBUTE = "foldkit-drawer-panel"

type SwipeMessage =
  | typeof Message.PressedSwipeArea.Type
  | typeof Message.MovedSwipePointer.Type
  | typeof Message.ReleasedSwipePointer.Type
  | typeof Message.CancelledSwipe.Type

/** Keeps the drawer viewport above an on-screen keyboard for its mounted lifetime. */
export const TrackVirtualKeyboard = DrawerDefinition.makeMount("TrackVirtualKeyboard", {
  messages: [Message.CompletedTrackVirtualKeyboard],
  handler: function* () {
    return ({ element }) =>
      trackVirtualKeyboard(element).pipe(Effect.as(Message.CompletedTrackVirtualKeyboard()))
  },
})

/** Tracks a pointer-captured swipe for the mounted swipe area. */
export const TrackDrawerSwipe = DrawerDefinition.makeMountStream("TrackDrawerSwipe", {
  messages: [
    Message.PressedSwipeArea,
    Message.MovedSwipePointer,
    Message.ReleasedSwipePointer,
    Message.CancelledSwipe,
  ],
  handler: function* () {
    return ({ element }) => {
      if (!(element instanceof HTMLElement)) {
        return Stream.empty
      }

      return Stream.callback<SwipeMessage>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            let maybeActivePointerId = Option.none<number>()

            const panelDimensions = () => {
              const panel = element.closest<HTMLElement>(`[data-${DRAWER_PANEL_ATTRIBUTE}]`)
              if (panel === null) {
                return { width: 0, height: 0 }
              }
              const rectangle = panel.getBoundingClientRect()
              return { width: rectangle.width, height: rectangle.height }
            }

            const handlePointerDown = (event: PointerEvent): void => {
              if (!event.isPrimary || event.button !== 0 || Option.isSome(maybeActivePointerId)) {
                return
              }
              maybeActivePointerId = Option.some(event.pointerId)
              element.setPointerCapture(event.pointerId)
              const dimensions = panelDimensions()

              Queue.offerUnsafe(
                queue,
                Message.PressedSwipeArea({
                  clientX: event.clientX,
                  clientY: event.clientY,
                  timeStamp: event.timeStamp,
                  panelWidth: dimensions.width,
                  panelHeight: dimensions.height,
                }),
              )
            }

            const handlePointerMove = (event: PointerEvent): void => {
              if (
                !Option.exists(maybeActivePointerId, (pointerId) => pointerId === event.pointerId)
              ) {
                return
              }

              Queue.offerUnsafe(
                queue,
                Message.MovedSwipePointer({
                  clientX: event.clientX,
                  clientY: event.clientY,
                  timeStamp: event.timeStamp,
                }),
              )
            }

            const handlePointerUp = (event: PointerEvent): void => {
              if (
                !Option.exists(maybeActivePointerId, (pointerId) => pointerId === event.pointerId)
              ) {
                return
              }

              maybeActivePointerId = Option.none()

              Queue.offerUnsafe(
                queue,
                Message.ReleasedSwipePointer({
                  clientX: event.clientX,
                  clientY: event.clientY,
                  timeStamp: event.timeStamp,
                }),
              )
            }

            const handlePointerCancel = (event: PointerEvent): void => {
              if (
                !Option.exists(maybeActivePointerId, (pointerId) => pointerId === event.pointerId)
              ) {
                return
              }

              maybeActivePointerId = Option.none()
              Queue.offerUnsafe(queue, Message.CancelledSwipe())
            }

            element.addEventListener("pointerdown", handlePointerDown)
            element.addEventListener("pointermove", handlePointerMove)
            element.addEventListener("pointerup", handlePointerUp)
            element.addEventListener("pointercancel", handlePointerCancel)
            element.addEventListener("lostpointercapture", handlePointerCancel)

            return {
              handlePointerDown,
              handlePointerMove,
              handlePointerUp,
              handlePointerCancel,
              getActivePointerId: () => maybeActivePointerId,
            }
          }),
          ({
            handlePointerDown,
            handlePointerMove,
            handlePointerUp,
            handlePointerCancel,
            getActivePointerId,
          }) =>
            Effect.sync(() => {
              const maybeActivePointerId = getActivePointerId()

              if (
                Option.isSome(maybeActivePointerId) &&
                element.hasPointerCapture(maybeActivePointerId.value)
              ) {
                element.releasePointerCapture(maybeActivePointerId.value)
              }

              element.removeEventListener("pointerdown", handlePointerDown)
              element.removeEventListener("pointermove", handlePointerMove)
              element.removeEventListener("pointerup", handlePointerUp)
              element.removeEventListener("pointercancel", handlePointerCancel)
              element.removeEventListener("lostpointercapture", handlePointerCancel)
            }),
        ).pipe(Effect.flatMap(() => Effect.never)),
      )
    }
  },
})

const DrawerComposition = DrawerDefinition.makeComposition({
  bindings: [DialogBinding],
  mounts: [TrackVirtualKeyboard, TrackDrawerSwipe],
})

// UPDATE

type Point = Readonly<{ clientX: number; clientY: number }>

type Movement = Readonly<{ direction: DismissDirection; start: Point; end: Point }>

/** How far the pointer moved toward dismissal; negative when it moved the other way. */
const directionalDistance = ({ direction, start, end }: Movement): number =>
  Match.value(direction).pipe(
    Match.withReturnType<number>(),
    Match.when("Up", () => start.clientY - end.clientY),
    Match.when("Down", () => end.clientY - start.clientY),
    Match.when("Left", () => start.clientX - end.clientX),
    Match.when("Right", () => end.clientX - start.clientX),
    Match.exhaustive,
  )

const crossAxisDistance = ({ direction, start, end }: Movement): number =>
  direction === "Up" || direction === "Down"
    ? Math.abs(end.clientX - start.clientX)
    : Math.abs(end.clientY - start.clientY)

const panelSizeForDirection = ({
  direction,
  panelWidth,
  panelHeight,
}: Readonly<{ direction: DismissDirection; panelWidth: number; panelHeight: number }>): number =>
  direction === "Up" || direction === "Down" ? panelHeight : panelWidth

const SWIPE_ACTIVATION_DISTANCE = 8
const SWIPE_DISMISS_FRACTION = 0.35
const SWIPE_DISMISS_VELOCITY = 0.5
const SWIPE_FAST_DISMISS_MINIMUM_DISTANCE = 24
const FALLBACK_DISMISS_DISTANCE = 120

type PointerSample = Point & Readonly<{ timeStamp: number }>

type SwipeSample = Readonly<{ swiping: typeof Swiping.Type; pointer: PointerSample }>

const nextSwipingState = (
  model: Model,
  { swiping, pointer: { clientX, clientY, timeStamp } }: SwipeSample,
): typeof Swiping.Type => {
  const elapsed = timeStamp - swiping.previousTimeStamp

  const distanceSincePrevious = directionalDistance({
    direction: model.dismissDirection,
    start: { clientX: swiping.previousClientX, clientY: swiping.previousClientY },
    end: { clientX: clientX, clientY: clientY },
  })

  const velocity = elapsed > 0 ? distanceSincePrevious / elapsed : swiping.velocity

  return Swiping({
    ...swiping,
    currentClientX: clientX,
    currentClientY: clientY,
    previousClientX: clientX,
    previousClientY: clientY,
    previousTimeStamp: timeStamp,
    velocity,
  })
}

const releasedSwipe = DrawerDefinition.makeStep((model, { swiping, pointer }: SwipeSample) => {
  const { clientX, clientY } = pointer
  const finalSwiping = nextSwipingState(model, { swiping, pointer })

  const distance = Math.max(
    0,
    directionalDistance({
      direction: model.dismissDirection,
      start: { clientX: finalSwiping.startClientX, clientY: finalSwiping.startClientY },
      end: { clientX: clientX, clientY: clientY },
    }),
  )

  const distanceThreshold =
    finalSwiping.panelSize > 0
      ? finalSwiping.panelSize * SWIPE_DISMISS_FRACTION
      : FALLBACK_DISMISS_DISTANCE
  const passedDistanceThreshold = distance >= distanceThreshold
  const passedVelocityThreshold =
    finalSwiping.velocity >= SWIPE_DISMISS_VELOCITY &&
    distance >= SWIPE_FAST_DISMISS_MINIMUM_DISTANCE
  const nextModel = modifyFields(model, { gestureState: () => Idle() })

  return passedDistanceThreshold || passedVelocityThreshold
    ? DialogBinding.requestClose()
    : { model: nextModel }
})

/** Processes a drawer message and returns the next Model, Commands, and OutMessage. */
export const update = DrawerComposition.makeUpdate({
  RequestedOpen: (model) => DialogBinding.requestOpen()(model),
  RequestedClose: (model) => DialogBinding.requestClose()(model),
  InformedOfSwipeAvailability: (model, { isSwipeEnabled }) => ({
    model: modifyFields(model, {
      isSwipeEnabled: () => isSwipeEnabled,
      ...(isSwipeEnabled ? {} : { gestureState: () => Idle() }),
    }),
  }),
  PressedSwipeArea: (model, { clientX, clientY, timeStamp, panelWidth, panelHeight }) =>
    model.isSwipeEnabled && model.dialog.isOpen && Predicate.isTagged(model.gestureState, "Idle")
      ? {
          model: modifyFields(model, {
            gestureState: () =>
              Pressed({
                startClientX: clientX,
                startClientY: clientY,
                currentClientX: clientX,
                currentClientY: clientY,
                timeStamp,
                panelWidth,
                panelHeight,
              }),
          }),
        }
      : { model: model },
  MovedSwipePointer: (model, { clientX, clientY, timeStamp }) =>
    Match.value(model.gestureState).pipe(
      Match.tag("Pressed", (pressed) => {
        const distance = directionalDistance({
          direction: model.dismissDirection,
          start: { clientX: pressed.startClientX, clientY: pressed.startClientY },
          end: { clientX: clientX, clientY: clientY },
        })

        const crossDistance = crossAxisDistance({
          direction: model.dismissDirection,
          start: { clientX: pressed.startClientX, clientY: pressed.startClientY },
          end: { clientX: clientX, clientY: clientY },
        })

        const hasResolvedAxis =
          Math.max(Math.abs(distance), crossDistance) >= SWIPE_ACTIVATION_DISTANCE

        if (hasResolvedAxis && (distance <= 0 || crossDistance > distance)) {
          return { model: modifyFields(model, { gestureState: () => Idle() }) }
        }
        if (distance < SWIPE_ACTIVATION_DISTANCE) {
          return { model: model }
        }

        const elapsed = timeStamp - pressed.timeStamp
        const velocity = elapsed > 0 ? distance / elapsed : 0

        return {
          model: modifyFields(model, {
            gestureState: () =>
              Swiping({
                startClientX: pressed.startClientX,
                startClientY: pressed.startClientY,
                currentClientX: clientX,
                currentClientY: clientY,
                previousClientX: clientX,
                previousClientY: clientY,
                previousTimeStamp: timeStamp,
                velocity,
                panelSize: panelSizeForDirection({
                  direction: model.dismissDirection,
                  panelWidth: pressed.panelWidth,
                  panelHeight: pressed.panelHeight,
                }),
              }),
          }),
        }
      }),
      Match.tag("Swiping", (swiping) => ({
        model: modifyFields(model, {
          gestureState: () =>
            nextSwipingState(model, { swiping, pointer: { clientX, clientY, timeStamp } }),
        }),
      })),
      Match.orElse(() => ({ model: model })),
    ),
  ReleasedSwipePointer: (model, { clientX, clientY, timeStamp }) =>
    Match.value(model.gestureState).pipe(
      Match.tag("Pressed", () =>
        DrawerDefinition.makeStep(() => ({
          model: modifyFields(model, { gestureState: () => Idle() }),
        }))(model),
      ),
      Match.tag("Swiping", (swiping) =>
        releasedSwipe(model, { swiping, pointer: { clientX, clientY, timeStamp } }),
      ),
      Match.orElse(() => DrawerDefinition.makeStep(() => ({ model: model }))(model)),
    ),
  CancelledSwipe: (model) => ({ model: modifyFields(model, { gestureState: () => Idle() }) }),
  CompletedTrackVirtualKeyboard: (model) => ({ model: model }),
})

/** Programmatically opens the drawer. */

/** Programmatically closes the drawer. */

/** Reflects whether swipe interaction is currently enabled. */

// VIEW

const swipeDistance = (model: Model): number =>
  Match.value(model.gestureState).pipe(
    Match.tag("Swiping", (swiping) =>
      Math.max(
        0,
        directionalDistance({
          direction: model.dismissDirection,
          start: { clientX: swiping.startClientX, clientY: swiping.startClientY },
          end: { clientX: swiping.currentClientX, clientY: swiping.currentClientY },
        }),
      ),
    ),
    Match.orElse(() => 0),
  )

const swipeTransform = (direction: DismissDirection, distance: number): string =>
  Match.value(direction).pipe(
    Match.withReturnType<string>(),
    Match.when("Up", () => `translateY(-${String(distance)}px)`),
    Match.when("Down", () => `translateY(${String(distance)}px)`),
    Match.when("Left", () => `translateX(-${String(distance)}px)`),
    Match.when("Right", () => `translateX(${String(distance)}px)`),
    Match.exhaustive,
  )

const directionAttributeValue = (direction: DismissDirection): string => direction.toLowerCase()

/** Attribute groups supplied to the consumer's drawer layout. */
export type RenderInfo = Readonly<{
  dialog: Dialog.RenderInfo["dialog"]
  backdrop: ReadonlyArray<ChildAttribute>
  viewport: ReadonlyArray<ChildAttribute<Mount.RequirementsOf<typeof TrackVirtualKeyboard>>>
  panel: ReadonlyArray<ChildAttribute>
  content: ReadonlyArray<ChildAttribute>
  swipeArea: ReadonlyArray<ChildAttribute<Mount.RequirementsOf<typeof TrackDrawerSwipe>>>
  title: ReadonlyArray<ChildAttribute>
  description: ReadonlyArray<ChildAttribute>
  initialFocus: ReadonlyArray<ChildAttribute>
  isVisible: boolean
  isSwiping: boolean
}>

/** Per-render inputs for Drawer.view. */
export type ViewInputs = Readonly<{
  toView: (render: RenderInfo) => Html
}>

/** Renders a headless drawer backed by Foldkit Dialog. */
export const view = DrawerComposition.makeView.withInputs<ViewInputs>(
  // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- Foldkit's view signature: Model, view inputs and builder.
  (model, viewInputs, h): Html => {
    const distance = swipeDistance(model)
    const isSwiping = Predicate.isTagged(model.gestureState, "Swiping")
    const panelSize = isSwiping ? model.gestureState.panelSize : 0
    const swipeProgress = panelSize > 0 ? Math.min(distance / panelSize, 1) : 0

    const viewportAttributes = childAttributes([
      h.DataAttribute("foldkit-drawer-viewport", ""),
      h.Style({ "pointer-events": "none" }),
      h.OnMount(TrackVirtualKeyboard()),
    ])

    const panelAttributes = childAttributes([
      h.DataAttribute(DRAWER_PANEL_ATTRIBUTE, ""),
      h.DataAttribute("swipe-direction", directionAttributeValue(model.dismissDirection)),
      h.Style({ "pointer-events": "auto" }),
      ...(isSwiping
        ? [
            h.DataAttribute("swiping", ""),
            h.Style({
              transform: swipeTransform(model.dismissDirection, distance),
              "transition-duration": "0ms",
              "--foldkit-drawer-swipe-progress": String(swipeProgress),
            }),
          ]
        : []),
    ])

    const backdropAttributes = childAttributes(
      isSwiping
        ? [
            h.DataAttribute("swiping", ""),
            h.Style({
              opacity: String(1 - swipeProgress),
              "transition-duration": "0ms",
            }),
          ]
        : [],
    )

    const contentAttributes = childAttributes([h.DataAttribute("foldkit-drawer-content", "")])

    const swipeAreaAttributes = childAttributes([
      h.DataAttribute("foldkit-drawer-swipe-area", ""),
      h.DataAttribute("swipe-direction", directionAttributeValue(model.dismissDirection)),
      ...(model.isSwipeEnabled
        ? [
            h.OnMount(TrackDrawerSwipe()),
            h.Style({
              "touch-action": "none",
              "user-select": "none",
              "-webkit-user-select": "none",
            }),
          ]
        : [h.DataAttribute("disabled", "")]),
    ])

    return h.block(
      DialogBinding.embedView({
        slotId: model.dialog.id,
        model: model.dialog,
        viewInputs: {
          toView: (dialogRender) =>
            viewInputs.toView({
              dialog: dialogRender.dialog,
              backdrop: [...dialogRender.backdrop, ...backdropAttributes],
              viewport: viewportAttributes,
              panel: [...dialogRender.panel, ...panelAttributes],
              content: contentAttributes,
              swipeArea: swipeAreaAttributes,
              title: dialogRender.title,
              description: dialogRender.description,
              initialFocus: dialogRender.initialFocus,
              isVisible: dialogRender.isVisible,
              isSwiping,
            }),
        },
      }),
    )
  },
)

const initialize = DrawerComposition.makeInit((config: InitConfig) => ({
  childInitContext: config,
  model: {
    dismissDirection: config.dismissDirection ?? "Down",
    isSwipeEnabled: config.isSwipeEnabled ?? true,
    gestureState: Idle(),
  },
}))

export const init = (config: InitConfig): Model => {
  const model = initialize(config).model
  return config.isOpen ? update(model, Message.RequestedOpen()).model : model
}
export const open = (model: Model) => update(model, Message.RequestedOpen())
export const close = (model: Model) => update(model, Message.RequestedClose())
export const reflectSwipeEnabled =
  (isSwipeEnabled: boolean) =>
  (model: Model): Model =>
    update(model, Message.InformedOfSwipeAvailability({ isSwipeEnabled })).model

const prepare = () =>
  DrawerComposition.prepareBlock({
    init: initialize,
    update,
    view,
    operations: {
      requestOpen: Message.RequestedOpen,
      requestClose: Message.RequestedClose,
      informSwipeAvailability: Message.InformedOfSwipeAvailability,
    },
    EffectsLayer: Layer.mergeAll(TrackVirtualKeyboard.layer, TrackDrawerSwipe.layer),
  })

export const DrawerBlock: Block.FromAssemblyWithViewAndOutMessage<typeof Model, typeof prepare> =
  Block.assemble(prepare)
