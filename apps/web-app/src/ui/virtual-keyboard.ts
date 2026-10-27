import { Effect, Option } from "effect"

const VIRTUAL_KEYBOARD_OFFSET = "--foldkit-virtual-keyboard-offset"
const VISUAL_VIEWPORT_HEIGHT = "--foldkit-visual-viewport-height"

/**
 * Keeps the mounted surface aligned with the visible portion of the viewport.
 *
 * Chromium on Android usually keeps fixed elements anchored to the layout
 * viewport while the virtual keyboard only resizes the visual viewport. The
 * custom properties written here let a surface move above that keyboard and
 * constrain its height while it is open.
 */
export const trackVirtualKeyboard = (element: Element) => {
  if (!(element instanceof HTMLElement)) {
    return Effect.void
  }

  return Effect.acquireRelease(
    Effect.sync(() => {
      const visualViewport = globalThis.visualViewport
      let maybeAnimationFrameId = Option.none<number>()

      const keepFocusedElementVisible = (): void => {
        const activeElement = globalThis.document.activeElement
        if (!(activeElement instanceof HTMLElement) || !element.contains(activeElement)) {
          return
        }

        Option.map(maybeAnimationFrameId, globalThis.cancelAnimationFrame)

        maybeAnimationFrameId = Option.some(
          globalThis.requestAnimationFrame(() => {
            activeElement.scrollIntoView({ block: "nearest" })
            maybeAnimationFrameId = Option.none()
          }),
        )
      }

      const updateViewportProperties = (): void => {
        const viewportHeight = visualViewport?.height ?? globalThis.innerHeight
        const keyboardOffset = Math.max(
          0,
          globalThis.innerHeight - viewportHeight - (visualViewport?.offsetTop ?? 0),
        )

        element.style.setProperty(VIRTUAL_KEYBOARD_OFFSET, `${String(keyboardOffset)}px`)
        element.style.setProperty(VISUAL_VIEWPORT_HEIGHT, `${String(viewportHeight)}px`)

        if (keyboardOffset > 0) {
          keepFocusedElementVisible()
        }
      }

      updateViewportProperties()
      globalThis.addEventListener("resize", updateViewportProperties)
      visualViewport?.addEventListener("resize", updateViewportProperties)
      visualViewport?.addEventListener("scroll", updateViewportProperties)
      element.addEventListener("focusin", keepFocusedElementVisible)

      return {
        updateViewportProperties,
        visualViewport,
        keepFocusedElementVisible,
        getMaybeAnimationFrameId: () => maybeAnimationFrameId,
      }
    }),
    ({
      updateViewportProperties,
      visualViewport,
      keepFocusedElementVisible,
      getMaybeAnimationFrameId,
    }) =>
      Effect.sync(() => {
        globalThis.removeEventListener("resize", updateViewportProperties)
        visualViewport?.removeEventListener("resize", updateViewportProperties)
        visualViewport?.removeEventListener("scroll", updateViewportProperties)
        element.removeEventListener("focusin", keepFocusedElementVisible)
        Option.map(getMaybeAnimationFrameId(), globalThis.cancelAnimationFrame)
        element.style.removeProperty(VIRTUAL_KEYBOARD_OFFSET)
        element.style.removeProperty(VISUAL_VIEWPORT_HEIGHT)
      }),
  )
}
