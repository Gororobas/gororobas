import { Style } from '@pleat/core'

import { type Description, fromDescription } from '../../packages/core/test/universe.ts'

/** Builds each style in the page, in the given order, inserting its rules lazily the way a
 *  view does on first use. Returns the class names the page computed. */
const useAll = (descriptions: ReadonlyArray<Description>): ReadonlyArray<string> =>
  descriptions.map(description => Style.use(fromDescription(description)))

Object.assign(globalThis, { pleatFixture: { useAll } })
