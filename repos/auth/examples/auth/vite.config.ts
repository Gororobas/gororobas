import { defineConfig } from "vite-plus";

export default defineConfig({
  build: {
    outDir: "dist",
    lib: { entry: "src/oauth-client.ts", formats: ["es"], fileName: "oauth-client" },
  },
  run: {
    tasks: {
      "example:github": {
        command: "bun src/github-app.ts",
        cache: false,
        dependsOn: ["build"],
      },
      "example:strava": {
        command: "bun src/strava-app.ts",
        cache: false,
        dependsOn: ["build"],
      },
      "example:strava-mcp": {
        command: "bun src/strava-mcp.ts",
        cache: false,
        dependsOn: ["build"],
      },
    },
  },
  test: { cache: false, silent: "passed-only", include: ["test/**/*.test.ts"] },
});
