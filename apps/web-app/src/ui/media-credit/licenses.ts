import { msg } from "@lingui/core/macro"
import { Option } from "effect"

import type { Translator } from "../../lib/translations"

const CREATIVE_COMMONS_LICENSE = /^\/licenses\/([a-z-]+)\/(\d+(?:\.\d+)?)/
const CREATIVE_COMMONS_ZERO = /^\/publicdomain\/zero\/(\d+(?:\.\d+)?)/

/**
 * "CC BY-NC 4.0" for a Creative Commons license's URL, the way people cite it. Other licenses go
 * by their site's name, which is what readers would recognize.
 */
export const licenseName = (url: string, i18n: Translator): string =>
  Option.match(Option.fromNullishOr(URL.parse(url)), {
    onNone: () => url,
    onSome: ({ hostname, pathname }) => {
      if (!hostname.endsWith("creativecommons.org")) {
        return hostname.replace(/^www\./, "")
      }

      const license = CREATIVE_COMMONS_LICENSE.exec(pathname)
      if (license !== null) {
        return `CC ${license[1]?.toUpperCase()} ${license[2]}`
      }

      const zero = CREATIVE_COMMONS_ZERO.exec(pathname)
      if (zero !== null) {
        return `CC0 ${zero[1]}`
      }

      return pathname.startsWith("/publicdomain/mark")
        ? i18n._(msg`Public domain`)
        : "Creative Commons"
    },
  })
