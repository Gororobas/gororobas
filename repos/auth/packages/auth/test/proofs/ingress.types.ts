import type { Auth, Proofs } from "@yielded/auth";
import type { Effect, Layer } from "effect";
import { expectTypeOf } from "vite-plus/test";

import type { app } from "./ingress.test";

// Shared construction must never absorb the trusted caller's invocation requirement.
export const proofIngressRequirements = () => {
  type RawEmail = Effect.Services<
    ReturnType<typeof app.strategies.email.operations.Request.invoke>
  >;
  type RawReset = Effect.Services<
    ReturnType<typeof app.strategies.password.operations.RequestReset.invoke>
  >;
  type Facade = Effect.Success<typeof app.make>;
  type EmailCall = Effect.Services<ReturnType<Facade["signIn"]>>;
  type ResetCall = Effect.Services<ReturnType<Facade["requestReset"]>>;
  type Construction = Layer.Services<typeof app.layer>;

  expectTypeOf<
    Extract<RawEmail, Proofs.HostIngressLimiter>
  >().toEqualTypeOf<Proofs.HostIngressLimiter>();
  expectTypeOf<
    Extract<RawReset, Proofs.HostIngressLimiter>
  >().toEqualTypeOf<Proofs.HostIngressLimiter>();
  expectTypeOf<
    Extract<RawEmail, Proofs.ProofRequestContext>
  >().toEqualTypeOf<Proofs.ProofRequestContext>();
  expectTypeOf<
    Extract<RawReset, Proofs.ProofRequestContext>
  >().toEqualTypeOf<Proofs.ProofRequestContext>();
  expectTypeOf<
    Extract<EmailCall, Proofs.ProofRequestContext>
  >().toEqualTypeOf<Proofs.ProofRequestContext>();
  expectTypeOf<
    Extract<ResetCall, Proofs.ProofRequestContext>
  >().toEqualTypeOf<Proofs.ProofRequestContext>();
  expectTypeOf<Extract<ResetCall, Proofs.HostIngressLimiter>>().toEqualTypeOf<never>();
  expectTypeOf<Extract<ResetCall, Auth.AuthRequest>>().toEqualTypeOf<Auth.AuthRequest>();
  expectTypeOf<Extract<Construction, Proofs.HostIngressLimiter>>().toEqualTypeOf<never>();
  expectTypeOf<Extract<Construction, Proofs.ProofRequestContext>>().toEqualTypeOf<never>();
};
