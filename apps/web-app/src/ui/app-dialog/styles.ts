import { Color, Style, When } from "@pleat/core"

import { blur } from "../theme"
import { duration, radius, scrim, space, toneColors } from "../theme"

/** Holds while a `<dialog>` is shown. Layout on a dialog itself, such as `display: flex`,
 *  must sit under it: an atom beats the browser's `dialog:not([open]) { display: none }`,
 *  so an unconditional `display` leaves a closed dialog covering the page. */
export const dialogOpen = When.pseudo(":is([open])")

/** The `<dialog>` element of every modal and drawer: no chrome of its own, painted like a
 *  card. Panels inside it carry the layout. */
export const dialogSurfaceStyle = Style.make({
  border: 0,
  padding: 0,
  backgroundColor: toneColors.backgroundCard,
  color: toneColors.foreground,
})

/** The dimmed layer behind modals and drawers. Fades with Foldkit's transition states. */
export const dialogBackdropStyle = Style.make({
  position: "fixed",
  inset: 0,
  backgroundColor: scrim,
  backdropFilter: blur.dialog,
  transitionProperty: "opacity",
  transitionDuration: duration.moderate,
}).pipe(Style.when(When.closed, { opacity: 0 }))

/** The grab bar at the top of a bottom drawer. */
export const drawerHandleStyle = Style.make({
  inlineSize: space[10],
  blockSize: "0.375rem",
  borderRadius: radius.full,
  backgroundColor: Color.alpha(toneColors.foregroundMuted, 0.6),
})
