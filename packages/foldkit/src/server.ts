/** Server and static rendering with Pleat styles.
 *
 *  ```ts
 *  // entry.server.ts
 *  import { renderDocument as withPleat } from '@pleat/foldkit/server'
 *
 *  export const renderDocument = withPleat({ head: '<link rel="icon" href="/icon.svg">' })
 *  ```
 *
 *  @packageDocumentation */

import { Server } from 'foldkit/experimental'

import { Sheet } from '@pleat/core'

/** Options for {@link renderDocument}. */
export type DocumentOptions = Server.DocumentOptions &
  Readonly<{
    /** Put only the rules a page uses in its `<style>`, instead of every rule. Defaults to
     *  `true`: each page ships the CSS it needs inline, and the browser inserts the rest as
     *  views use it. */
    isCritical?: boolean
  }>

/** A Foldkit `renderDocument` that adds Pleat's `<style data-pleat>` to every page's head,
 *  ahead of `head` and the app's stylesheets, so Pleat's cascade layer order comes first.
 *  Export it from the server entry in place of `Server.renderDocument`. */
export const renderDocument =
  (options: DocumentOptions = {}): Server.DocumentRenderer =>
  (application, assets) => {
    const { isCritical = true, ...documentOptions } = options
    const style = Sheet.styleTag(isCritical ? application.html : undefined)
    return Server.renderDocument(application, assets, {
      ...documentOptions,
      head: `${style}${documentOptions.head ?? ''}`,
    })
  }

/** The `<style data-pleat>` element for a page, for documents a custom renderer builds. Put
 *  it before every other stylesheet. */
export const styleTag = (html?: string): string => Sheet.styleTag(html)
