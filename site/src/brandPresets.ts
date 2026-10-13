import type { BrandPreset } from './message.ts'

const TEAL = {
  50: '#f2f8f8',
  100: '#e2f0f0',
  200: '#c3e2e1',
  300: '#92cecd',
  400: '#56b3b2',
  500: '#009a9b',
  600: '#008282',
  700: '#006869',
  800: '#004f50',
  900: '#003535',
  950: '#001f1f',
}

const SQUARE = { sm: '0px', md: '2px', lg: '4px', full: '999px' }

const PRESETS: Readonly<Record<BrandPreset, unknown>> = {
  Valid: { brand: TEAL, radius: SQUARE },
  MissingHash: { brand: { ...TEAL, 600: '008282' }, radius: SQUARE },
  Injection: {
    brand: { ...TEAL, 600: 'teal; } body { display: none } .x {' },
    radius: SQUARE,
  },
  WrongKind: { brand: TEAL, radius: { ...SQUARE, md: 'round' } },
}

/** The JSON text for a brand preset, as a settings API might send it. */
export const brandPresetSource = (preset: BrandPreset): string =>
  JSON.stringify(PRESETS[preset], null, 2)
