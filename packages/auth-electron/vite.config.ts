import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    tsconfig: "tsconfig.build.json",
    entry: ["src/index.ts", "src/BrowserLogin.ts"],
    dts: true,
    unbundle: true,
    sourcemap: true,
  },
});
