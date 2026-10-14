import { readFileSync } from "node:fs";

import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [
    {
      name: "yielded-brand-assets",
      generateBundle() {
        for (const mode of ["ink", "paper"])
          this.emitFile({
            type: "asset",
            fileName: `brand/auth-${mode}.svg`,
            source: readFileSync(
              new URL(`../../.github/assets/lockup-auth-${mode}.svg`, import.meta.url),
            ),
          });
      },
    },
  ],
  build: { rolldownOptions: { input: ["index.html", "oauth-settings.html"] } },
  run: {
    tasks: {
      "example:oauth-lifecycle": { command: "bun src/oauth-lifecycle.ts", cache: false },
      "start:oauth": { command: "vp build && bun src/oauth-settings-server.ts", cache: false },
      start: { command: "vp build && bun src/server.ts", cache: false },
      "start:pg": { command: "PERSISTENCE_DIALECT=pg vp run start", cache: false },
    },
  },
});
