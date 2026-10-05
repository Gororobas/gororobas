import type { OperationHttpServer, Proofs } from "@yielded/auth";
import type { Effect, Layer } from "effect";
import type { HttpRouter } from "effect/http";
import { expectTypeOf } from "vite-plus/test";

import type { makeHttp, operationServer } from "./http-ingress.test";

export const httpIngressRequirements = () => {
  type Construction = Effect.Services<typeof operationServer>;
  type Invocation = Effect.Services<ReturnType<Effect.Success<typeof operationServer>["handle"]>>;
  type Http = ReturnType<typeof makeHttp>;
  type Routes = Layer.Services<ReturnType<Http["routes"]>>;
  type Callbacks = Layer.Services<ReturnType<Http["callbackRoutes"]>>;

  expectTypeOf<Construction>().toEqualTypeOf<
    OperationHttpServer.OperationHttpServerConfig | OperationHttpServer.OperationHttpInvocation
  >();
  expectTypeOf<
    Extract<Invocation, Proofs.ProofRequestContext>
  >().toEqualTypeOf<Proofs.ProofRequestContext>();
  expectTypeOf<
    Extract<Invocation, Proofs.HostIngressLimiter>
  >().toEqualTypeOf<Proofs.HostIngressLimiter>();
  expectTypeOf<Extract<Routes, Proofs.ProofRequestContext>>().toEqualTypeOf<never>();
  expectTypeOf<
    Extract<HttpRouter.Request.Only<"Requires", Routes>, Proofs.ProofRequestContext>
  >().toEqualTypeOf<never>();
  expectTypeOf<Extract<Callbacks, Proofs.ProofRequestContext>>().toEqualTypeOf<never>();
  expectTypeOf<
    Extract<HttpRouter.Request.Only<"Requires", Callbacks>, Proofs.ProofRequestContext>
  >().toEqualTypeOf<never>();
};
