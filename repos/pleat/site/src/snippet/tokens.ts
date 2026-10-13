import { Global, Theme, Token, When } from '@pleat/core'

export const tokens = Token.make({
  color: {
    canvas: Token.color,
    ink: Token.color,
    accent: Token.color,
  },
  space: { 2: Token.length, 4: Token.length },
})

export const light = Theme.make(tokens, {
  color: {
    canvas: 'oklch(98% 0.01 80)',
    ink: 'oklch(24% 0.02 50)',
    accent: 'oklch(52% 0.16 34)',
  },
  space: { 2: '0.5rem', 4: '1rem' },
})

export const dark = Theme.extend(light, tokens, {
  color: {
    canvas: 'oklch(18% 0.02 272)',
    ink: 'oklch(93% 0.01 80)',
  },
})

// Light everywhere, dark when the Model says so or the system asks
// for it.
Global.theme(light)
Global.theme(dark, { selector: ':root:has([data-theme="Dark"])' })
Global.theme(dark, {
  selector: ':root:has([data-theme="System"])',
  when: When.dark,
})
