import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    tsconfig: "tsconfig.build.json",
    entry: [
      "src/index.ts",
      "src/Aead.ts",
      "src/Errors.ts",
      "src/Hmac.ts",
      "src/Kdf.ts",
      "src/KdfAdmission.ts",
      "src/Signature.ts",
      "src/WebCrypto.ts",
      "src/platform-node.ts",
      "src/platform-bun.ts",
      "src/platform-workerd.ts",
      "src/Portable.ts",
    ],
    dts: true,
    unbundle: true,
    deps: { neverBundle: [/\.wasm$/] },
    copy: [{ from: "src/internal/argon2.wasm", to: "dist/internal" }],
    plugins: [
      {
        // Match core: retain actual ESM namespaces and avoid synthetic helper exports.
        name: "preserve-public-namespaces",
        resolveId: {
          order: "pre",
          handler(source, importer) {
            if (
              importer !== undefined &&
              /\/src\/index(?:\.d)?\.ts$/.test(importer) &&
              /^\.\/[A-Z]\w*(?:\.ts)?$/.test(source)
            ) {
              return { id: source.replace(/(?:\.ts)?$/, ".mjs"), external: true };
            }
          },
        },
      },
    ],
    sourcemap: true,
  },
  test: {
    cache: false,
    silent: "passed-only",
    include: ["test/**/*.test.ts"],
  },
});
