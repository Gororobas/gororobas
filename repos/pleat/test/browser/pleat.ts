import * as Pleat from '@pleat/core'

/** The computed color of the element with `id`. */
const colorOf = (id: string): string => {
  const element = document.getElementById(id)
  if (element === null) {
    throw new Error(`No element #${id}.`)
  }
  return getComputedStyle(element).color
}

/** What this fixture puts on `globalThis`, for tests that drive Pleat from `page.evaluate`. */
export type PleatGlobal = Readonly<{ Pleat: typeof Pleat; colorOf: typeof colorOf }>

Object.assign(globalThis, { Pleat, colorOf })
