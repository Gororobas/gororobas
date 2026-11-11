const OKLCH_PATTERN = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/

const encodeChannel = (linear: number): number => {
  const clamped = Math.min(1, Math.max(0, linear))
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055
}

const toHexByte = (channel: number): string =>
  Math.round(encodeChannel(channel) * 255)
    .toString(16)
    .padStart(2, "0")

/** Pencil only stores hex colors, so CSS `oklch()` ramps are converted (Björn Ottosson's Oklab matrices). */
export const colorToHex = (color: string): string => {
  const match = OKLCH_PATTERN.exec(color)
  if (match === null) {
    return color.toLowerCase()
  }

  const lightness = Number(match[1]) / 100
  const chroma = Number(match[2])
  const hue = (Number(match[3]) * Math.PI) / 180
  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3

  return `#${toHexByte(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)}${toHexByte(
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
  )}${toHexByte(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)}`
}
