import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    tsconfig: "tsconfig.build.json",
    entry: ["src/Browser.ts", "src/Server.ts"],
    dts: true,
    unbundle: true,
    sourcemap: true,
  },
  test: { cache: false, silent: "passed-only", include: ["test/**/*.test.ts"] },
});
