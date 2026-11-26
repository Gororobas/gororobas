/**
 * Reads the two Brilliant files the design lives in, as plain text:
 *
 * - `design/main.bl`, the canvas: one element per line, `<id> <type> … "<name>"`, children
 *   indented under their parents. Component masters carry `comp` right after their type.
 * - `design/Styles/gororobas.ds`, the design system: one token per line, either `name: value`
 *   or `name { $default: light, theme.dark: dark }`.
 *
 * Only what the drift check needs is read: element names, which elements are components, and
 * token values.
 */

export type DesignNode = Readonly<{ name: string; isComponent: boolean }>

/** A token's value per color mode; tokens that don't change with the mode repeat it. */
export type DesignToken = Readonly<{ light: string; dark: string }>

export type DesignFile = Readonly<{
  nodes: ReadonlyArray<DesignNode>
  tokens: Readonly<Record<string, DesignToken>>
}>

/** An element row: its 16-hex id, its type and properties, and its name as the last quoted string. */
const ELEMENT_ROW = /^\s*[0-9a-f]{16} (\S+)(.*)"((?:[^"\\]|\\.)*)"\s*$/

export const parseCanvas = (text: string): ReadonlyArray<DesignNode> =>
  text.split("\n").flatMap((line) => {
    const match = ELEMENT_ROW.exec(line)
    if (match === null) {
      return []
    }
    const [, , properties = "", name = ""] = match

    return [
      { name: name.replaceAll(String.raw`\"`, '"'), isComponent: /^ comp(\s|$)/.test(properties) },
    ]
  })

const SINGLE_VALUE = /^([\w.-]+):\s*(.+?)\s*$/
const PER_MODE = /^([\w.-]+)\s*\{(.*)\}\s*$/

export const parseDesignSystem = (text: string): Readonly<Record<string, DesignToken>> =>
  Object.fromEntries(
    text.split("\n").flatMap((rawLine): ReadonlyArray<readonly [string, DesignToken]> => {
      const line = rawLine.replace(/\/\/.*$/, "").trim()

      const perMode = PER_MODE.exec(line)

      if (perMode !== null) {
        const [, name = "", body = ""] = perMode
        const modes = Object.fromEntries(
          body.split(",").map((entry) => entry.split(":").map((part) => part.trim())),
        ) as Record<string, string | undefined>
        const light = modes["$default"]
        return light === undefined ? [] : [[name, { light, dark: modes["theme.dark"] ?? light }]]
      }

      const single = SINGLE_VALUE.exec(line)
      if (single !== null) {
        const [, name = "", value = ""] = single
        return [[name, { light: value, dark: value }]]
      }

      return []
    }),
  )
