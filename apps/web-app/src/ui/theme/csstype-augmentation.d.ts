import type {} from "csstype"

// NOTE: csstype 3.2 predates `corner-shape`. Pleat's declaration types come from csstype,
// so augmenting it here makes the property available to `Style.make` and `Global.rule`.
declare module "csstype" {
  interface StandardLonghandProperties<TLength, TTime> {
    cornerShape?:
      | "round"
      | "squircle"
      | "bevel"
      | "scoop"
      | "notch"
      | "square"
      | (string & Record<never, never>)
  }
}
