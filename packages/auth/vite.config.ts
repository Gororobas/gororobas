import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    tsconfig: "tsconfig.build.json",
    entry: [
      "src/index.ts",
      "src/Contracts.ts",
      "src/Strategies.ts",
      "src/Auth.ts",
      "src/BrowserLogin.ts",
      "src/BrowserLoginContract.ts",
      "src/Persistence.ts",
      "src/AuthContract.ts",
      "src/Client.ts",
      "src/Http.ts",
      "src/OperationHttp.ts",
      "src/OperationHttpClient.ts",
      "src/OperationHttpServer.ts",
      "src/Atom.ts",
      "src/Hooks.ts",
      "src/Identity.ts",
      "src/OAuth.ts",
      "src/OAuthServer.ts",
      "src/Strava.ts",
      "src/Operations.ts",
      "src/Schema.ts",
      "src/WebCrypto.ts",
      "src/Sessions.ts",
      "src/SessionContract.ts",
      "src/Proofs.ts",
      "src/Password.ts",
      "src/Email.ts",
      "src/EmailDelivery.ts",
      "src/Passkey.ts",
      "src/PasskeyPassword.ts",
      "src/PhoneOtp.ts",
      "src/SmsDelivery.ts",
      "src/Twilio.ts",
      "src/Totp.ts",
      "src/PasskeyContract.ts",
      "src/TotpContract.ts",
    ],
    dts: true,
    // Preserve implementation boundaries so consumers can discard unused modules.
    unbundle: true,
    plugins: [
      {
        // Each target is also a pack entry. Keep native namespaces in JS and
        // declarations instead of materializing objects that retain every export.
        name: "preserve-public-namespaces",
        resolveId: {
          order: "pre",
          handler(source, importer) {
            if (
              importer !== undefined &&
              /\/src\/(?:index|Contracts|Strategies)(?:\.d)?\.ts$/.test(importer) &&
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
  test: { cache: false, silent: "passed-only", include: ["test/**/*.test.ts"] },
});
