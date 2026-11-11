import type { ColorMode } from "../ui/theme/color-theme"
import { hortaColorTheme } from "../ui/theme/color-themes/horta"
import { primitivesTheme } from "../ui/theme/primitives"
import { colorToHex } from "./oklch"

/**
 * What the web app promises the design file: color roles per mode and the primitive scales.
 * The `.pen` file's variables mirror this; `design:check` fails when they drift.
 */
export type DesignVariable =
  | Readonly<{ type: "color"; value: Readonly<Record<"light" | "dark", string>> }>
  | Readonly<{ type: "number"; value: number }>
  | Readonly<{ type: "string"; value: string }>

type TokenReference = Readonly<{ path: ReadonlyArray<string> }>
type ColorValue = string | TokenReference

const REM_IN_PIXELS = 16

const modes = { light: hortaColorTheme.light, dark: hortaColorTheme.dark } as const

const kebabCase = (name: string): string =>
  name.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)

const isTokenReference = (value: unknown): value is TokenReference =>
  typeof value === "object" && value !== null && "path" in value

/** Roles alias ramp steps through tokens; a literal color passes through. */
const resolveColor = (mode: "light" | "dark", value: ColorValue): string => {
  if (!isTokenReference(value)) {
    return colorToHex(value)
  }
  const [tone, group, step] = value.path
  const ramp = (modes[mode] as Record<string, { ramp: Record<string, string> }>)[tone ?? ""]?.[
    group as "ramp"
  ]
  const resolved = ramp?.[step ?? ""]
  if (resolved === undefined) {
    throw new Error(`Cannot resolve color token ${value.path.join(".")}`)
  }
  return colorToHex(resolved)
}

const flattenRoles = (
  roles: Record<string, unknown>,
  prefix: ReadonlyArray<string>,
): ReadonlyArray<readonly [ReadonlyArray<string>, ColorValue]> =>
  Object.entries(roles).flatMap(([key, value]) =>
    typeof value === "object" && value !== null && !isTokenReference(value)
      ? flattenRoles(value as Record<string, unknown>, [...prefix, kebabCase(key)])
      : [[[...prefix, kebabCase(key)], value as ColorValue] as const],
  )

const colorVariables = (): ReadonlyArray<readonly [string, DesignVariable]> =>
  Object.keys(hortaColorTheme.light).flatMap((tone) =>
    flattenRoles(
      (hortaColorTheme.light as Record<string, Record<string, unknown>>)[tone] ?? {},
      [],
    ).map(([path, lightValue]) => {
      const darkRoles = flattenRoles(
        (hortaColorTheme.dark as Record<string, Record<string, unknown>>)[tone] ?? {},
        [],
      )
      const darkValue = darkRoles.find(([darkPath]) => darkPath.join("/") === path.join("/"))?.[1]
      if (darkValue === undefined) {
        throw new Error(`Tone ${tone} has no dark value for ${path.join("/")}`)
      }

      return [
        `tone/${tone}/${path.join("/")}`,
        {
          type: "color",
          value: {
            light: resolveColor("light", lightValue),
            dark: resolveColor("dark", darkValue),
          },
        },
      ] as const
    }),
  )

const rem = (value: string): number | undefined =>
  value === "0" ? 0 : value.endsWith("rem") ? Number.parseFloat(value) * REM_IN_PIXELS : undefined

/** Only literal scales are mirrored: radii are elliptical and size-relative, and line heights are fluid. */
const primitiveVariables = (): ReadonlyArray<readonly [string, DesignVariable]> =>
  primitivesTheme.declarations.flatMap(
    ([name, value]): ReadonlyArray<readonly [string, DesignVariable]> => {
      const [group, ...rest] = name.replace("--gororobas-", "").split("-")
      const key = rest.join("-")
      const pixels = rem(String(value))

      switch (group) {
        case "space":
        case "measure":
        case "control":
          return pixels === undefined
            ? []
            : [
                [
                  `${group === "control" ? "control-size" : group}/${key.replace(/^size-/, "")}`,
                  { type: "number", value: pixels },
                ],
              ]
        case "font":
          if (rest[0] === "size" && pixels !== undefined) {
            return [[`font-size/${rest.slice(1).join("-")}`, { type: "number", value: pixels }]]
          }

          if (rest[0] === "weight") {
            return [
              [`font-weight/${rest.slice(1).join("-")}`, { type: "number", value: Number(value) }],
            ]
          }

          return []
        default:
          return []
      }
    },
  )

export const designVariables = (): Readonly<Record<string, DesignVariable>> =>
  Object.fromEntries([...colorVariables(), ...primitiveVariables()])

export type { ColorMode }
