import { describe, expect, it } from "@effect/vitest"

import { licenseName } from "./licenses"

describe("licenseName", () => {
  it("names licenses the way people cite them", () => {
    expect(
      [
        "https://creativecommons.org/licenses/by/4.0/",
        "http://creativecommons.org/licenses/by-nc-sa/3.0/legalcode",
        "https://creativecommons.org/publicdomain/zero/1.0/",
        "https://creativecommons.org/publicdomain/mark/1.0/",
        "https://www.example.org/terms",
        "not a url",
      ].map(licenseName),
    ).toEqual([
      "CC BY 4.0",
      "CC BY-NC-SA 3.0",
      "CC0 1.0",
      "Domínio público",
      "example.org",
      "not a url",
    ])
  })
})
