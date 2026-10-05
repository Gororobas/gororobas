import { Atom as AuthAtom, Client } from "@yielded/auth";
import type { PasskeyBrowser } from "@yielded/auth-simplewebauthn/Browser";
import type { Layer } from "effect";
import type { KeyValueStore } from "effect/persistence";

import { makeAccountClient } from "./client";
import { AuthApi, emailProofPolicy } from "./contract";

export const makeClient = (
  options: Client.ClientOptions,
  storage: Layer.Layer<KeyValueStore.KeyValueStore>,
  browser?: Layer.Layer<PasskeyBrowser>,
) =>
  makeAccountClient(
    (runtime) => {
      const auth = AuthAtom.make(Client.make(AuthApi, options), { runtime });

      return {
        auth,
        register: (input, get) =>
          get.setResult(auth.register, {
            requestId: input.requestId,
            email: input.email,
            newPassword: input.password,
            registration: { displayName: input.displayName.trim() },
          }),
        signIn: ({ login, password }, get) =>
          get.setResult(auth.passwordSignIn, { email: login, password }),
      };
    },
    emailProofPolicy,
    storage,
    browser,
  );
