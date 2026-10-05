import { Buffer } from "node:buffer";

import * as BrowserLogin from "@yielded/auth/BrowserLogin";
import { OperationHttpError } from "@yielded/auth/OperationHttp";
import type { NativeCredentials } from "@yielded/auth/OperationHttpClient";
import type { CredentialSlot } from "@yielded/auth/Operations";
import {
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Path,
  type Redacted,
  Schema,
  Semaphore,
} from "effect";
import { app, safeStorage } from "electron";

const recordSchema = BrowserLogin.VaultRecord;
const slots = recordSchema.fields.credentials.key.literals;

const recordJson = Schema.fromJsonString(recordSchema);
const failure = () => BrowserLogin.PlatformError.make({ reason: "storage" });

/** One writer per private application/environment path, protected by the host's
 * single-instance lock. Never reset an unreadable store: it may contain the
 * Exchanging fence. Writes fsync ciphertext, close, rename on the same filesystem,
 * then sync the parent on POSIX (the replaced file on Windows).
 */
export const layerVault = (options: { readonly path: string }) =>
  Layer.effect(
    BrowserLogin.Vault,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const checkEncryption = Effect.try({
        try: () =>
          process.type === "browser" &&
          app.isReady() &&
          app.hasSingleInstanceLock() &&
          safeStorage.isEncryptionAvailable() &&
          (process.platform !== "linux" ||
            ["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"].includes(
              safeStorage.getSelectedStorageBackend(),
            )),
        catch: failure,
      }).pipe(Effect.flatMap((available) => (available ? Effect.void : Effect.fail(failure()))));

      yield* checkEncryption;

      const destination = yield* Schema.decodeEffect(
        Schema.NonEmptyString.check(Schema.makeFilter((value) => path.isAbsolute(value))),
      )(options.path).pipe(Effect.mapError(failure));

      const directory = path.dirname(destination);

      yield* fs
        .makeDirectory(directory, { recursive: true, mode: 0o700 })
        .pipe(Effect.mapError(failure));
      const gate = yield* Semaphore.make(1);

      const readRecord = Effect.gen(function* () {
        yield* checkEncryption;

        const stat = yield* fs
          .stat(destination)
          .pipe(
            Effect.catchTag("PlatformError", (error) =>
              error.reason._tag === "NotFound" ? Effect.void : Effect.fail(error),
            ),
          );

        if (stat === undefined) return { credentials: {} } satisfies typeof recordSchema.Type;
        if (stat.type !== "File" || stat.size > 1048576) return yield* failure();
        const bytes = yield* fs.readFile(destination);

        const json = yield* Effect.try({
          try: () => safeStorage.decryptString(Buffer.from(bytes)),
          catch: failure,
        });

        return yield* Schema.decodeEffect(recordJson)(json, { onExcessProperty: "error" });
      }).pipe(Effect.mapError(failure));

      const writeRecord = Effect.fnUntraced(function* (record: typeof recordSchema.Type) {
        yield* checkEncryption;
        const json = yield* Schema.encodeEffect(recordJson)(record);

        const bytes = yield* Effect.try({
          try: () => safeStorage.encryptString(json),
          catch: failure,
        });

        yield* Effect.scoped(
          Effect.gen(function* () {
            const temporary = yield* fs.makeTempFileScoped({ directory, prefix: ".auth-" });

            yield* fs.chmod(temporary, 0o600);
            yield* Effect.scoped(
              Effect.gen(function* () {
                const file = yield* fs.open(temporary, { flag: "w", mode: 0o600 });

                yield* file.writeAll(bytes);
                yield* file.sync;
              }),
            );
            yield* fs.rename(temporary, destination);

            const committed = yield* fs.open(
              process.platform === "win32" ? destination : directory,
              { flag: process.platform === "win32" ? "r+" : "r" },
            );

            yield* committed.sync;
          }),
        );
      }, Effect.mapError(failure));

      const locked = <A, E>(effect: Effect.Effect<A, E>) =>
        gate.withPermits(1)(Effect.uninterruptible(effect));

      const read: NativeCredentials["read"] = locked(
        Effect.gen(function* () {
          const record = yield* readRecord;
          const now = DateTime.toEpochMillis(yield* DateTime.now);
          const credentials: Partial<Record<CredentialSlot, Redacted.Redacted<string>>> = {};

          for (const slot of slots) {
            const value = record.credentials[slot];

            if (value !== undefined && value.expiresAtMillis > now)
              credentials[slot] = value.credential;
          }

          return credentials;
        }),
      ).pipe(Effect.mapError(() => OperationHttpError.make({ reason: "credentials" })));

      const accept: NativeCredentials["accept"] = (commands) =>
        locked(
          Effect.gen(function* () {
            const record = yield* readRecord;
            const credentials = { ...record.credentials };

            for (const command of commands) {
              if (command._tag === "Clear") delete credentials[command.slot];
              else
                credentials[command.slot] = {
                  credential: command.credential,
                  expiresAtMillis: command.expiresAtMillis,
                };
            }
            yield* writeRecord({ ...record, credentials });
          }),
        ).pipe(Effect.mapError(() => OperationHttpError.make({ reason: "credentials" })));

      return BrowserLogin.Vault.of({
        read,
        accept,
        loadAttempt: locked(readRecord.pipe(Effect.map((record) => record.attempt))),
        saveAttempt: (attempt) =>
          locked(
            Effect.gen(function* () {
              const record = yield* readRecord;

              yield* writeRecord(
                attempt === undefined
                  ? { credentials: record.credentials }
                  : { ...record, attempt },
              );
            }),
          ),
      });
    }),
  );
