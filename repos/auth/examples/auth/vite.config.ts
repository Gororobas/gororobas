import { defineConfig } from "vite-plus";

export default defineConfig({
  build: {
    outDir: "dist",
    lib: { entry: "src/oauth-client.ts", formats: ["es"], fileName: "oauth-client" },
  },
  run: {
    tasks: {
      "example:oauth-proxy": {
        command: "bun src/oauth-proxy.ts",
        cache: false,
        dependsOn: ["build"],
      },
      "example:slack": {
        command: "bun src/slack-app.ts",
        cache: false,
        dependsOn: ["build"],
      },
      "example:google": {
        command: "bun src/google-app.ts",
        cache: false,
        dependsOn: ["build"],
      },
      "example:gitlab": {
        command: "bun src/gitlab-app.ts",
        cache: false,
        dependsOn: ["build"],
      },
      "example:vercel": {
        command: "bun src/vercel-app.ts",
        cache: false,
        dependsOn: ["build"],
      },
      "example:huggingface": {
        command: "bun src/huggingface-app.ts",
        cache: false,
        dependsOn: ["build"],
      },
      "example:zoom": {
        command: "bun src/zoom-app.ts",
        cache: false,
        dependsOn: ["build"],
      },
      "example:line": {
        command: "bun src/line-app.ts",
        cache: false,
        dependsOn: ["build"],
      },
      "example:railway": {
        command: "bun src/railway-app.ts",
        cache: false,
        dependsOn: ["build"],
      },
      "example:x": {
        command: "bun src/x-app.ts",
        cache: false,
        dependsOn: ["build"],
      },
      "example:figma": {
        command: "bun src/figma-app.ts",
        cache: false,
        dependsOn: ["build"],
      },
      "example:atlassian": {
        command: "bun src/atlassian-app.ts",
        cache: false,
        dependsOn: ["build"],
      },
      "example:kick": {
        command: "bun src/kick-app.ts",
        cache: false,
        dependsOn: ["build"],
      },
      "example:apple": {
        command: "bun src/apple-app.ts",
        cache: false,
        dependsOn: ["build"],
      },
      "example:linear": {
        command: "bun src/linear-app.ts",
        cache: false,
        dependsOn: ["build"],
      },
      "example:dropbox": {
        command: "bun src/dropbox-app.ts",
        cache: false,
        dependsOn: ["build"],
      },
      "example:notion": {
        command: "bun src/notion-app.ts",
        cache: false,
        dependsOn: ["build"],
      },
      "example:microsoft": {
        command: "bun src/microsoft-app.ts",
        cache: false,
        dependsOn: ["build"],
      },
      "example:roblox": {
        command: "bun src/roblox-app.ts",
        cache: false,
        dependsOn: ["build"],
      },
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
  test: {
    cache: false,
    silent: "passed-only",
    include: ["test/**/*.test.ts"],
  },
});
