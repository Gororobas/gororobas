import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/cli.ts"],
    format: ["esm"],
    platform: "node",
    dts: false,
    sourcemap: true,
    deps: { onlyBundle: [/^effect$/, /^@effect\//] },
  },
});
