import { defineConfig } from "vitest/config"

import shared from "./vitest.shared.js"

export default defineConfig({
  test: {
    projects: [
      "packages/*",
      "linting",
      "!repos/**",
      {
        ...shared,
        test: {
          ...shared.test,
          name: "server-bdd",
          include: [
            "apps/server/test/*-feature.test.ts",
            "apps/server/test/impersonation.test.ts",
            "apps/server/test/profiles/service.test.ts",
            "apps/server/test/publications/repository.test.ts",
            "apps/server/test/publication-comments/repository.test.ts",
            "apps/server/test/publication-comments/service.test.ts",
            "apps/server/src/publication-comments/api-live.test.ts",
            "apps/server/src/translation/publication-comment-translation-workflow.test.ts",
            "apps/server/test/session-builders.test.ts",
          ],
        },
      },
    ],
  },
})
