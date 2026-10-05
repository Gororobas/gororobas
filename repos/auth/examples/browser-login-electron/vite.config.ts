import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/main.ts", "src/preload.ts"],
    format: "cjs",
    platform: "node",
    target: "node24",
    outDir: "dist",
    dts: false,
    deps: { alwaysBundle: [/^(?!electron$)/], neverBundle: ["electron"] },
  },
  base: "./",
  build: { outDir: "dist/renderer", target: "chrome152" },
});
