import { Hooks, Passkey, Password } from "@yielded/auth";
import { layer as layerSimpleWebAuthnPasskeyProtocol } from "@yielded/auth-simplewebauthn/Server";
import { Layer } from "effect";

import { sessionConfiguration } from "../../shared/account/auth";
import { minimumPasswordLength } from "../../shared/account/contract";
import { HashingLive } from "../../shared/account/hashing";
import { CryptoLive } from "../../shared/crypto";
import { AppAuth } from "./auth";
import { EmailLive } from "./email";
import { AccountMethodsLive } from "./methods-live";
import { PasskeysLive } from "./passkeys";
import { PasswordMethodsLive } from "./password-methods";
import { PasswordsLive } from "./passwords";
import { ActionPoliciesLive } from "./policy";
import { ProofsLive } from "./proofs";
import { SessionsLive } from "./sessions";

// Application-owned implementations of the public ports. No persistence package or SQL driver.
export const PersistenceLive = Layer.mergeAll(
  PasswordsLive,
  ProofsLive,
  EmailLive,
  PasskeysLive,
  SessionsLive,
);

const SessionRuntime = AppAuth.sessions.layer(
  sessionConfiguration.policy(AppAuth.sessions.moduleId),
);

const AccountServicesLive = Layer.merge(ActionPoliciesLive, SessionRuntime).pipe(
  Layer.provideMerge(PersistenceLive),
);

// Reuse password registration/recovery planning. The public sign-in workflow is entirely ours.
const PasswordModuleLive = PasswordMethodsLive.pipe(
  Layer.provide(AppAuth.strategies.password.reset.emailLayer),
);

const WorkflowsLive = AccountMethodsLive.pipe(
  Layer.provideMerge(PasswordModuleLive),
  Layer.provideMerge(AccountServicesLive),
);

export const AuthLive = AppAuth.layer.pipe(
  Layer.provideMerge(WorkflowsLive),
  Layer.provide(
    Password.NewPasswordCheck.layer({
      ...Password.defaultPasswordPolicy,
      minimumCodePoints: minimumPasswordLength,
    }),
  ),
  Layer.provideMerge(HashingLive),
  Layer.provide(layerSimpleWebAuthnPasskeyProtocol),
  Layer.provide(
    Passkey.PasskeyConfig.layer({
      id: "localhost",
      name: "Yielded Auth · Example 04",
      origins: ["http://localhost:4184"],
      developmentLocalhost: true,
    }),
  ),
  Layer.provide([CryptoLive, Hooks.LifecycleHooks.empty]),
);
