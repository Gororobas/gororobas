import { CountryCode, SupportedLanguage } from "@gororobas/domain"
import { Effect, Schema } from "effect"
import { HttpServerRequest } from "effect/http"

/** Two-letter codes Cloudflare sends for unknown origins and Tor, which aren't countries. */
const NOT_COUNTRIES: ReadonlyArray<string> = ["XX", "T1"]

/**
 * The reader's language and the countries their request suggests, from `Accept-Language` and
 * Cloudflare's `CF-IPCountry`. Countries only rank results: people travel and use VPNs.
 */
export const requestLocale = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const tags = (request.headers["accept-language"] ?? "")
    .split(",")
    .map((entry) => entry.replace(/;.*/, "").trim())
    .filter((tag) => tag !== "" && tag !== "*")

  const language =
    tags.map((tag) => tag.replace(/-.*/, "").toLowerCase()).find(Schema.is(SupportedLanguage)) ??
    "pt"

  const ipCountry = request.headers["cf-ipcountry"]?.toUpperCase()

  const countries = [
    ...(ipCountry === undefined || NOT_COUNTRIES.includes(ipCountry) ? [] : [ipCountry]),
    ...tags.flatMap((tag) =>
      tag
        .split("-")
        .slice(1, 2)
        .map((region) => region.toUpperCase()),
    ),
  ].filter(Schema.is(CountryCode))

  return { language, countries }
})
