/** Values the platform provides about the viewport: notches, home indicators and the virtual
 *  keyboard. Foldkit's virtual keyboard tracking sets the two custom properties. */
export const viewport = {
  safeAreaTop: "env(safe-area-inset-top)",
  safeAreaBottom: "env(safe-area-inset-bottom)",
  /** How far the on-screen keyboard covers the layout viewport's bottom. */
  keyboardOffset: "var(--foldkit-virtual-keyboard-offset, 0px)",
  /** The visible height, shrinking while the on-screen keyboard is open. */
  visibleHeight: "var(--foldkit-visual-viewport-height, 100dvh)",
} as const
