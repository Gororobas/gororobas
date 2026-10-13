import type { Preset } from './message.ts'

const PRESETS: Readonly<Record<Preset, unknown>> = {
  Valid: {
    title: 'Checkout conversion is up 4.2%',
    body: 'The new single-page checkout shipped Tuesday. Mobile drop-off fell the most.',
    surface: { tone: 'Accent', density: 'Roomy', isFeatured: true },
    action: { label: 'Open the funnel', tone: 'Primary' },
  },
  UnknownTone: {
    title: 'Weekly signups',
    body: 'Signups are flat week over week.',
    surface: { tone: 'Neon', density: 'Compact' },
  },
  Injection: {
    title: 'Totally normal card',
    body: 'Nothing to see here.',
    surface: { tone: 'Plain; } body { display: none } .x {', density: 'Roomy' },
  },
  Overlong: {
    title:
      'A title that keeps going well past the sixty characters the schema allows for a card',
    body: '',
    surface: { tone: 'Inverted', density: 'Roomy' },
    action: { label: 'Go', tone: 'Loud' },
  },
}

/** The JSON text for a preset, as a model might return it. */
export const presetSource = (preset: Preset): string =>
  JSON.stringify(PRESETS[preset], null, 2)
