import { it } from "@effect/vitest";
import * as ReactNativePasskey from "@yielded/auth-react-native";
import { PasskeyAuthenticationStarted } from "@yielded/auth/Passkey";
import { Cause, Effect, Exit, Fiber, Logger } from "effect";
import { Platform } from "react-native";
import { Passkey } from "react-native-passkey";
import { afterEach, expect, vi } from "vite-plus/test";

vi.mock("react-native", () => ({
  NativeModules: {},
  Platform: {
    OS: "ios",
    get Version() {
      return "26.5";
    },
    select: (options: { readonly ios: string }) => options.ios,
  },
}));
// Execute the installed peer's ESM implementation, including its real unlinked
// NativeModules proxy. Its CJS entry's require() cannot use Vitest's RN host mock.
vi.mock("react-native-passkey", () =>
  vi.importActual<{ readonly Passkey: typeof Passkey }>("react-native-passkey/lib/module/index.js"),
);

const started = PasskeyAuthenticationStarted.make({
  flowId: PasskeyAuthenticationStarted.fields.flowId.make("diagnostic-flow"),
  expiresAtMillis: 8640000000000000,
  options: {
    challenge: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    rpId: "example.com",
    timeout: 300000,
    userVerification: "required",
    allowCredentials: [],
  },
});

const input = { started, mediation: "required" as const };
const logs: Array<string> = [];

const logger = Logger.make((entry) =>
  logs.push(JSON.stringify(Logger.formatStructured.log(entry))),
);

const logging = Logger.layer([logger]);

afterEach(() => {
  vi.restoreAllMocks();
  logs.length = 0;
});

// Regression in 05f4266: unexpected native failures were redacted without any
// diagnostic. Static checks and the HTTP reporter test cannot observe this boundary.
it.effect(
  "reports the installed peer's missing-module failure once and leaves expected cancellation quiet",
  () =>
    Effect.gen(function* () {
      const native = yield* ReactNativePasskey.make();

      expect((yield* native.capabilities).supported).toBe(true);
      expect(yield* Effect.flip(native.authenticate(input))).toMatchObject({
        _tag: "PasskeyReactNativeUnavailable",
      });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain("Auth passkey-react-native failed");
      expect(logs[0]).not.toContain("doesn't seem to be linked");

      const get = vi.spyOn(Passkey, "get");

      get.mockRejectedValueOnce({ error: "UserCancelled", message: "private-native-marker" });
      expect(yield* Effect.flip(native.authenticate(input))).toMatchObject({
        _tag: "PasskeyReactNativeNotCompleted",
        reason: "cancelled",
      });
      expect(logs).toHaveLength(1);

      get.mockRejectedValueOnce({ error: "BadConfiguration", message: "private-native-marker" });
      expect(yield* Effect.flip(native.authenticate(input))).toMatchObject({
        _tag: "PasskeyReactNativeUnavailable",
      });
      expect(logs).toHaveLength(2);
      expect(logs.join(" ")).not.toContain("private-native-marker");
    }).pipe(Effect.provide(logging)),
);

it.effect(
  "reports environment and response defects once without treating schema rejection as a defect",
  () =>
    Effect.gen(function* () {
      const native = yield* ReactNativePasskey.make();

      const version = vi.spyOn(Platform, "Version", "get").mockImplementation(() => {
        throw new Error("private-environment-marker");
      });

      expect(yield* Effect.flip(native.capabilities)).toMatchObject({
        _tag: "PasskeyReactNativeUnavailable",
      });
      expect(logs).toHaveLength(1);
      version.mockRestore();

      const get = vi.spyOn(Passkey, "get");

      get.mockResolvedValueOnce({
        id: "AQ",
        get response(): never {
          throw new Error("private-response-marker");
        },
      });
      expect(yield* Effect.flip(native.authenticate(input))).toMatchObject({
        _tag: "PasskeyReactNativeInvalidResponse",
      });
      expect(logs).toHaveLength(2);
      get.mockResolvedValueOnce({
        id: "AQ",
        response: { clientDataJSON: "invalid!", signature: "AQ", authenticatorData: "AQ" },
      });
      expect(yield* Effect.flip(native.authenticate(input))).toMatchObject({
        _tag: "PasskeyReactNativeInvalidResponse",
      });
      expect(logs).toHaveLength(2);
      expect(logs.join(" ")).not.toContain("private-");
    }).pipe(Effect.provide(logging)),
);

it.effect("leaves late settlement to guard cleanup after the caller's reporting scope ends", () =>
  Effect.gen(function* () {
    const native = yield* ReactNativePasskey.make();
    let rejectNative: (reason: unknown) => void = () => {};
    let entered = false;

    const get = vi.spyOn(Passkey, "get").mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectNative = reject;
          entered = true;
        }),
    );

    const fiber = yield* native.authenticate(input).pipe(Effect.forkChild);

    yield* Effect.yieldNow;
    expect(entered).toBe(true);
    yield* Fiber.interrupt(fiber);
    const exit = yield* Fiber.await(fiber);

    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true);
    expect(yield* Effect.flip(native.authenticate(input))).toMatchObject({
      _tag: "PasskeyReactNativeBusy",
    });
    rejectNative({ error: "UnknownError", message: "private-late-marker" });
    yield* Effect.promise(() => Promise.resolve());
    expect(logs).toHaveLength(0);
    get.mockRestore();
    expect(yield* Effect.flip(native.authenticate(input))).toMatchObject({
      _tag: "PasskeyReactNativeUnavailable",
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).not.toContain("private-late-marker");
  }).pipe(Effect.provide(logging)),
);
