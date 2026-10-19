import { NodeFileSystem } from "@effect/platform-node"
import { Effect, FileSystem, Record, Schema } from "effect"
import type { Plugin } from "vite"

export const offlineShell = (): Plugin => ({
  name: "gororobas-offline-shell",
  apply: "build",
  async generateBundle(_, bundle) {
    const worker = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem

        const assets = [
          "/index.html",
          ...Record.keys(bundle)
            .filter((name) => !name.endsWith(".map"))
            .map((name) => `/${name}`),
        ]

        const template = yield* fileSystem.readFileString(
          new URL("./service-worker.js", import.meta.url).pathname,
        )
        const index = yield* fileSystem.readFileString(
          new URL("./index.html", import.meta.url).pathname,
        )

        const digest = yield* Effect.tryPromise(() =>
          crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(
              index +
                Record.values(bundle)
                  .map((file) => (file.type === "chunk" ? file.code : String(file.source)))
                  .join("\n"),
            ),
          ),
        )

        const revision = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        )
          .join("")
          .slice(0, 16)

        return template
          .replace(
            "__PRECACHE_ASSETS__",
            Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.String)))(assets),
          )
          .replace(
            "__PRECACHE_NAME__",
            Schema.encodeSync(Schema.fromJsonString(Schema.String))(`gororobas-shell-${revision}`),
          )
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )

    this.emitFile({ type: "asset", fileName: "service-worker.js", source: worker })
  },
})
