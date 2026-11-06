import { defineConfig } from "@lingui/cli"
import { formatter } from "@lingui/format-po"

/** Lingui locales are `SupportedLanguage` codes; Intl gets regional tags from `src/lib/language.ts`. */
export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "pt", "es"],
  fallbackLocales: false,
  catalogs: [{ path: "<rootDir>/src/locales/{locale}/messages", include: ["<rootDir>/src"] }],
  // Line numbers would churn every catalog on unrelated edits.
  format: formatter({ lineNumbers: false }),
})
