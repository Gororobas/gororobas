import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    tsconfig: "tsconfig.build.json",
    entry: ["src/index.ts"],
    deps: { neverBundle: [/\.wasm$/] },
    copy: [{ from: "src/internal/argon2.wasm", to: "dist/internal" }],
    dts: true,
    unbundle: true,
    sourcemap: true,
  },
  test: { cache: false, silent: "passed-only", include: ["test/**/*.test.ts"] },
});
