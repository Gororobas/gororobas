import {
  Cause,
  Context,
  DateTime,
  Effect,
  Layer,
  Predicate,
  Schema,
  SchemaGetter,
  Scope,
  type Types,
} from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { reportAuthFailure } from "../internal/diagnostics";
import type { AuthInvocation } from "./context";
import {
  AuthCredentialCommandCollector,
  type AuthCredentialCommandSink,
  type AuthOperationResult,
  AuthRevealCommandCollectorService,
  snapshotCredentialCommands,
  validateCredentialCommands,
} from "./credentials";
import {
  InvalidOperationInput,
  OperationBoundaryError,
  OperationForbidden,
  AuthenticationRequired,
  OperationConfigurationError,
  OperationPrivateOutputUnsupported,
} from "./errors";
import {
  type AuthRevealCommandCollector,
  type AuthRevealKind,
  snapshotRevealCommands,
  snapshotRevealKinds,
} from "./reveals";

const operationDefect = Schema.Json.pipe(
  Schema.decodeTo(Schema.Unknown, {
    decode: SchemaGetter.transform(() => new globalThis.Error("Auth operation failed")),
    encode: SchemaGetter.transform(() => ({ message: "Auth operation failed" })),
  }),
);

/** Identifies an already reported defect without retaining its private cause. */
class ReportedOperationDefect extends globalThis.Error {
  constructor() {
    super("Auth operation failed");
  }
}

const operationFailure = Effect.fn("AuthOperation.failure")(function* <E>(
  stage: "local" | "rpc" | "success-projection" | "error-projection" | "private-output",
  cause: Cause.Cause<E>,
): Effect.fn.Return<never> {
  if (Cause.hasInterruptsOnly(cause)) {
    return yield* Effect.failCause(
      Cause.fromReasons<never>(cause.reasons.filter(Cause.isInterruptReason)),
    );
  }

  const unreported = Cause.fromReasons(
    cause.reasons.filter(
      (reason) => !(Cause.isDieReason(reason) && reason.defect instanceof ReportedOperationDefect),
    ),
  );

  yield* reportAuthFailure(stage, unreported);

  return yield* Effect.die(new ReportedOperationDefect());
});

const sanitizeOperationDefects =
  (stage: "local" | "rpc" | "private-output") =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.catchCause((cause) =>
        Cause.hasDies(cause) ? operationFailure(stage, cause) : Effect.failCause(cause),
      ),
    );

/** Reconstruct declared fields and class instances without replaying wire transformations. */
const projectType = <S extends Schema.Top>(
  schema: S,
  stage: "success-projection" | "error-projection",
) => {
  const codec = Schema.toCodecIso(schema);
  const encode = Schema.encodeEffect(codec);
  const decode = Schema.decodeEffect(codec);

  return (value: S["Type"]) =>
    encode(value).pipe(
      Effect.flatMap(decode),
      Effect.catchCause((cause) => operationFailure(stage, cause)),
    );
};

/** Equal operation names only satisfy handlers with the same decoded contract. */
export interface OperationHandler<Tag extends string, Payload, Success, Error> {
  readonly _tag: "effect-auth/OperationHandler";
  readonly operation: Tag;
  readonly contract: Types.Invariant<readonly [Payload, Success, Error]>;
}

export type OperationAccess = "any" | "authenticated" | "system";
export type OperationExposure = "public" | "internal";
/** Metadata documents the handler's durable guarantee; it does not implement deduplication. */
export type OperationReplay = "read-only" | "idempotent" | "single-use" | "non-idempotent";

interface OperationOptions<
  Payload extends Schema.Top,
  Success extends Schema.Top,
  Error extends Schema.Top,
  PolicyServices,
> {
  readonly payload: Payload;
  readonly success: Success;
  readonly error: Error;
  readonly access: OperationAccess;
  readonly exposure?: OperationExposure;
  readonly replay: OperationReplay;
  readonly authorize?: (
    payload: Payload["Type"],
    context: AuthInvocation,
  ) => Effect.Effect<void, Error["Type"] | OperationBoundaryError, PolicyServices>;
}

type OptionProperty<Options, Key extends PropertyKey> = Key extends keyof Options
  ? Options[Key]
  : never;

type CredentialRequirement<Credentials> = true extends Credentials
  ? AuthCredentialCommandCollector
  : never;
type RevealValue<Reveals> = Exclude<Reveals, undefined>;
type RevealRequirement<Reveals> = [RevealValue<Reveals>] extends [never]
  ? never
  : RevealValue<Reveals> extends ReadonlyArray<AuthRevealKind>
    ? AuthRevealCommandCollectorService
    : never;
declare const credentialCollectorProvenance: unique symbol;
declare const revealCollectorProvenance: unique symbol;

export interface CredentialCollectorProvenance {
  readonly [credentialCollectorProvenance]: never;
}

export interface RevealCollectorProvenance {
  readonly [revealCollectorProvenance]: never;
}

type PrivateCollectorProvenance = CredentialCollectorProvenance | RevealCollectorProvenance;

// These casts retain the public service identities at runtime while distinguishing
// their operation-owned requirements from identical requirements in policy/schema code.
const credentialCollector = AuthCredentialCommandCollector as unknown as Effect.Effect<
  AuthCredentialCommandSink,
  never,
  CredentialCollectorProvenance
>;

const revealCollector = AuthRevealCommandCollectorService as unknown as Effect.Effect<
  AuthRevealCommandCollector,
  never,
  RevealCollectorProvenance
>;

type PrivateRequirements<Credentials, Reveals> =
  | CredentialRequirement<Credentials>
  | RevealRequirement<Reveals>;
type ResolvedCollectorServices<Credentials, Reveals> =
  | ([Credentials] extends [true] ? CredentialRequirement<Credentials> : never)
  | ([Reveals] extends [ReadonlyArray<AuthRevealKind>] ? RevealRequirement<Reveals> : never);
type PrivateResolvedCall<Credentials, Reveals> = {
  readonly invocation: AuthInvocation;
} & ([CredentialRequirement<Credentials>] extends [never]
  ? {}
  : { readonly credentialCommandSink: AuthCredentialCommandSink }) &
  ([RevealRequirement<Reveals>] extends [never]
    ? {}
    : { readonly revealCommandCollector: AuthRevealCommandCollector });
type ResolverResult<Credentials, Reveals> = [PrivateRequirements<Credentials, Reveals>] extends [
  never,
]
  ? AuthInvocation
  : PrivateResolvedCall<Credentials, Reveals>;
type WithPrivateRequirements<Method, Credentials, Reveals> = Method extends (
  ...args: infer Args
) => Effect.Effect<infer A, infer E, infer R>
  ? (
      ...args: Args
    ) => Effect.Effect<
      A,
      E,
      Exclude<R, PrivateCollectorProvenance> | PrivateRequirements<Credentials, Reveals>
    >
  : never;

/**
 * Define a unary auth operation once. `authorize` runs after validation and access
 * checks, before the logical handler, on all supported invocation paths.
 */
const buildOperation = <
  const Tag extends string,
  Payload extends Schema.Top,
  Success extends Schema.Top,
  Error extends Schema.Top,
  PolicyServices = never,
  const Options extends OperationOptions<Payload, Success, Error, PolicyServices> & {
    /** Require private credential acceptance before the logical handler can mutate. */
    readonly credentials?: true;
    /** Required even when an exact-command replay returns only metadata. */
    readonly reveals?: ReadonlyArray<AuthRevealKind>;
  } = OperationOptions<Payload, Success, Error, PolicyServices>,
>(
  tag: Tag,
  input: OperationOptions<Payload, Success, Error, PolicyServices> & Options,
) => {
  type Credentials = OptionProperty<Options, "credentials">;
  type Reveals = OptionProperty<Options, "reveals">;
  const options = Object.freeze({ ...input });

  const reveals = (() => {
    try {
      if (options.reveals === undefined) return Object.freeze([] as AuthRevealKind[]);
      const captured = snapshotRevealKinds(options.reveals);

      if (captured.length === 0) throw new globalThis.Error();

      return captured;
    } catch {
      throw OperationConfigurationError.make({ reason: "reveal-configuration", operation: tag });
    }
  })();

  const hasReveals = reveals.length > 0;

  const rpc = Rpc.make(tag, {
    payload: options.payload,
    success: options.success,
    error: Schema.Union([options.error, OperationBoundaryError]),
    defect: operationDefect,
  });

  type Failure = Error["Type"] | OperationBoundaryError;
  type Handler<R = never> = (
    payload: Payload["Type"],
    context: AuthInvocation,
  ) => Effect.Effect<Success["Type"], Failure, R>;
  type CredentialHandler<R = never> = (
    payload: Payload["Type"],
    context: AuthInvocation,
  ) => Effect.Effect<AuthOperationResult<Success["Type"]>, Failure, R>;

  const HandlerService = Context.Service<
    OperationHandler<Tag, Payload["Type"], Success["Type"], Failure>,
    { readonly run: CredentialHandler }
  >(`effect-auth/operations/${tag}`);

  const decode = Schema.decodeEffect(options.payload);
  // oxlint-disable-next-line no-restricted-properties -- invokeUnknown is the explicit boundary for untyped local callers.
  const decodeUnknown = Schema.decodeUnknownEffect(options.payload);
  const validate = Schema.decodeEffect(Schema.toType(options.payload));
  const projectSuccess = projectType(options.success, "success-projection");
  const projectFailure = projectType(rpc.errorSchema, "error-projection");
  const fail = (error: Failure) => projectFailure(error).pipe(Effect.flatMap(Effect.fail));

  const execute = Effect.fn(`AuthOperation.${tag}`)(
    function* (context: AuthInvocation, payload: Payload["Type"]) {
      if (options.access === "authenticated" && context._tag !== "Authenticated") {
        return yield* AuthenticationRequired.make({});
      }
      if (options.access === "system" && context._tag !== "System") {
        return yield* OperationForbidden.make({});
      }
      let sink: AuthCredentialCommandSink | undefined;
      const reveal = hasReveals ? yield* revealCollector : undefined;

      if (hasReveals && options.credentials === true) {
        sink = yield* credentialCollector;
      }

      const collectors = hasReveals
        ? yield* Effect.try({
            try: () => {
              const collector = reveal;
              const accept = collector?.accept;

              if (
                collector === undefined ||
                !Predicate.isFunction(accept) ||
                (options.credentials === true && !Predicate.isFunction(sink))
              )
                throw new globalThis.Error();
              const supported = snapshotRevealKinds(collector.supportedKinds);

              if (!reveals.every((kind) => supported.includes(kind))) throw new globalThis.Error();

              return { sink, accept };
            },
            catch: () => OperationPrivateOutputUnsupported.make({}),
          })
        : undefined;

      if (options.authorize !== undefined) {
        yield* options.authorize(payload, context);
      }
      // The no-reveal branch deliberately retains its historical authorize-before-sink order.
      if (!hasReveals && options.credentials === true) {
        sink = yield* credentialCollector;
      }

      if (options.credentials === true && !Predicate.isFunction(sink)) {
        return yield* Effect.die(new globalThis.Error("Auth credential collector required"));
      }
      const handler = yield* HandlerService;
      const result = yield* handler.run(payload, context);

      if (collectors !== undefined) {
        const staged = yield* Effect.sync(() => {
          const value = result.value;
          const commands = snapshotCredentialCommands(result.credentialCommands);
          const privateCommands = snapshotRevealCommands(result.revealCommands, reveals);

          if (commands.length > 0 && options.credentials !== true)
            throw new globalThis.Error("Auth operation failed");

          return { value, commands, privateCommands };
        });

        const value = yield* projectSuccess(staged.value);
        const now = DateTime.toEpochMillis(yield* DateTime.now);

        if (
          staged.privateCommands.some(
            (command) => command.expiresAtMillis <= now || command.expiresAtMillis > now + 300_000,
          )
        )
          return yield* Effect.die(new globalThis.Error("Auth operation failed"));
        // These are two memory acceptances, not an atomic physical delivery.
        if (staged.commands.length > 0) {
          if (!Predicate.isFunction(sink))
            return yield* Effect.die(new globalThis.Error("Auth operation failed"));
          yield* sink(staged.commands);
        }
        if (staged.privateCommands.length > 0) {
          const accept = collectors.accept;

          yield* accept(staged.privateCommands);
        }

        return value;
      }

      // Projection excludes undeclared properties even on existing Schema.Class instances.
      const value = yield* projectSuccess(result.value);
      const commands = yield* validateCredentialCommands(result.credentialCommands);

      yield* Effect.sync(() => snapshotRevealCommands(result.revealCommands, reveals));

      if (commands.length > 0) {
        if (!Predicate.isFunction(sink))
          return yield* Effect.die(new globalThis.Error("Auth credential collector required"));
        yield* sink(commands);
      }

      return value;
    },
    Effect.catch(fail),
    (effect) => (hasReveals ? effect.pipe(sanitizeOperationDefects("private-output")) : effect),
  );

  const invoke = Effect.fn(`AuthOperation.${tag}.invoke`)(function* (
    context: AuthInvocation,
    input: Payload["Encoded"],
  ) {
    const payload = yield* decode(input).pipe(
      Effect.mapError(() => InvalidOperationInput.make({})),
    );

    return yield* execute(context, payload);
  }, sanitizeOperationDefects("local"));

  const invokeUnknown = Effect.fn(`AuthOperation.${tag}.invokeUnknown`)(function* (
    context: AuthInvocation,
    input: unknown,
  ) {
    const payload = yield* decodeUnknown(input).pipe(
      Effect.mapError(() => InvalidOperationInput.make({})),
    );

    return yield* execute(context, payload);
  }, sanitizeOperationDefects("local"));

  /** Validate decoded input without replaying its wire transformations. */
  const invokeDecoded = Effect.fn(`AuthOperation.${tag}.invokeDecoded`)(function* (
    context: AuthInvocation,
    input: Payload["Type"],
  ) {
    const payload = yield* validate(input).pipe(
      Effect.mapError(() => InvalidOperationInput.make({})),
    );

    return yield* execute(context, payload);
  }, sanitizeOperationDefects("local"));

  /** Capture shared services at construction. Omit Scope so the caller scope
   * remains. The assertion keeps that omission out of public requirements. */
  const installHandler = <R>(handler: CredentialHandler<R>) =>
    Layer.effect(
      HandlerService,
      Effect.gen(function* () {
        const services = Context.omit(Scope.Scope)(
          yield* Effect.context<R>(),
        ) as unknown as Context.Context<R>;

        return {
          run: (payload: Payload["Type"], context: AuthInvocation) =>
            handler(payload, context).pipe(Effect.provide(services)),
        };
      }),
    );

  const credentialHandlerLayer = <R>(handler: CredentialHandler<R>) => {
    if (options.credentials !== true)
      throw OperationConfigurationError.make({ reason: "credential-handler", operation: tag });

    return installHandler(handler);
  };

  const privateHandlerLayer = <R>(handler: CredentialHandler<R>) => {
    if (options.credentials !== true && !hasReveals)
      throw OperationConfigurationError.make({ reason: "private-handler", operation: tag });

    return installHandler(handler);
  };

  const handlerLayer = <R>(handler: Handler<R>) =>
    installHandler((payload, context) =>
      handler(payload, context).pipe(Effect.map((value) => ({ value, credentialCommands: [] }))),
    );

  type RpcOptions = Parameters<Rpc.ToHandlerFn<typeof rpc>>[1];

  function provideResolvedCollectors<A, E, R>(
    effect: Effect.Effect<A, E, R>,
    call:
      | {
          readonly credentialCommandSink?: AuthCredentialCommandSink;
          readonly revealCommandCollector?: AuthRevealCommandCollector;
        }
      | undefined,
  ): Effect.Effect<
    A,
    E,
    Exclude<R, PrivateCollectorProvenance | ResolvedCollectorServices<Credentials, Reveals>>
  >;
  function provideResolvedCollectors<A, E, R>(
    effect: Effect.Effect<A, E, R>,
    call:
      | {
          readonly credentialCommandSink?: AuthCredentialCommandSink;
          readonly revealCommandCollector?: AuthRevealCommandCollector;
        }
      | undefined,
  ) {
    if (hasReveals) {
      const withReveal = effect.pipe(
        Effect.provideService(
          AuthRevealCommandCollectorService,
          call?.revealCommandCollector as AuthRevealCommandCollector,
        ),
      );

      if (options.credentials === true) {
        return withReveal.pipe(
          Effect.provideService(
            AuthCredentialCommandCollector,
            call?.credentialCommandSink as AuthCredentialCommandSink,
          ),
        );
      }

      return withReveal;
    }
    if (options.credentials === true) {
      return effect.pipe(
        Effect.provideService(
          AuthCredentialCommandCollector,
          call?.credentialCommandSink as AuthCredentialCommandSink,
        ),
      );
    }

    return effect;
  }

  /**
   * RPC has decoded the payload already. Validate its Type without replaying its
   * transformations. The resolver runs once for each call, outside the wire payload.
   */
  const rpcHandler = <R>(
    resolveContext: (
      options: RpcOptions,
    ) => Effect.Effect<ResolverResult<Credentials, Reveals>, Failure, R>,
  ) =>
    Effect.fn(`AuthOperation.${tag}.rpc`)(
      function* (input: Payload["Type"], transport: RpcOptions) {
        const resolved = yield* resolveContext(transport).pipe(Effect.catch(fail));

        const call =
          "invocation" in resolved
            ? (resolved as {
                readonly invocation: AuthInvocation;
                readonly credentialCommandSink?: AuthCredentialCommandSink;
                readonly revealCommandCollector?: AuthRevealCommandCollector;
              })
            : undefined;

        const context = call === undefined ? (resolved as AuthInvocation) : call.invocation;

        return yield* provideResolvedCollectors(invokeDecoded(context, input), call);
      },
      // Fatal RPC defects bypass the operation's defect codec in the default server mode.
      sanitizeOperationDefects("rpc"),
    );

  const operation = Object.freeze({
    rpc,
    access: options.access,
    exposure: options.exposure ?? "internal",
    replay: options.replay,
    credentials: options.credentials === true,
    reveals,
    handlerLayer,
    credentialHandlerLayer,
    privateHandlerLayer,
    invoke,
    invokeUnknown,
    invokeDecoded,
    rpcHandler,
  });

  // Runtime configuration selects the matching request-local requirements above.
  return operation as Omit<typeof operation, "invoke" | "invokeUnknown" | "invokeDecoded"> & {
    readonly invoke: WithPrivateRequirements<typeof invoke, Credentials, Reveals>;
    readonly invokeUnknown: WithPrivateRequirements<typeof invokeUnknown, Credentials, Reveals>;
    readonly invokeDecoded: WithPrivateRequirements<typeof invokeDecoded, Credentials, Reveals>;
  };
};

/** Named operation contract keeps inferred consumer declarations portable and compact. */
type OperationImplementation<
  Tag extends string,
  Payload extends Schema.Top,
  Success extends Schema.Top,
  Error extends Schema.Top,
  PolicyServices = never,
  Options extends OperationOptions<Payload, Success, Error, PolicyServices> & {
    /** Require private credential acceptance before the logical handler can mutate. */
    readonly credentials?: true;
    /** Required even when an exact-command replay returns only metadata. */
    readonly reveals?: ReadonlyArray<AuthRevealKind>;
  } = OperationOptions<Payload, Success, Error, PolicyServices>,
> = ReturnType<typeof buildOperation<Tag, Payload, Success, Error, PolicyServices, Options>>;

export interface AuthOperation<
  Tag extends string,
  Payload extends Schema.Top,
  Success extends Schema.Top,
  Error extends Schema.Top,
  PolicyServices = never,
  Options extends OperationOptions<Payload, Success, Error, PolicyServices> & {
    /** Require private credential acceptance before the logical handler can mutate. */
    readonly credentials?: true;
    /** Required even when an exact-command replay returns only metadata. */
    readonly reveals?: ReadonlyArray<AuthRevealKind>;
  } = OperationOptions<Payload, Success, Error, PolicyServices>,
> {
  readonly rpc: OperationImplementation<
    Tag,
    Payload,
    Success,
    Error,
    PolicyServices,
    Options
  >["rpc"];
  readonly access: OperationImplementation<
    Tag,
    Payload,
    Success,
    Error,
    PolicyServices,
    Options
  >["access"];
  readonly exposure: OperationImplementation<
    Tag,
    Payload,
    Success,
    Error,
    PolicyServices,
    Options
  >["exposure"];
  readonly replay: OperationImplementation<
    Tag,
    Payload,
    Success,
    Error,
    PolicyServices,
    Options
  >["replay"];
  readonly credentials: OperationImplementation<
    Tag,
    Payload,
    Success,
    Error,
    PolicyServices,
    Options
  >["credentials"];
  readonly reveals: OperationImplementation<
    Tag,
    Payload,
    Success,
    Error,
    PolicyServices,
    Options
  >["reveals"];
  readonly handlerLayer: OperationImplementation<
    Tag,
    Payload,
    Success,
    Error,
    PolicyServices,
    Options
  >["handlerLayer"];
  readonly credentialHandlerLayer: OperationImplementation<
    Tag,
    Payload,
    Success,
    Error,
    PolicyServices,
    Options
  >["credentialHandlerLayer"];
  readonly privateHandlerLayer: OperationImplementation<
    Tag,
    Payload,
    Success,
    Error,
    PolicyServices,
    Options
  >["privateHandlerLayer"];
  readonly invoke: OperationImplementation<
    Tag,
    Payload,
    Success,
    Error,
    PolicyServices,
    Options
  >["invoke"];
  readonly invokeUnknown: OperationImplementation<
    Tag,
    Payload,
    Success,
    Error,
    PolicyServices,
    Options
  >["invokeUnknown"];
  readonly invokeDecoded: OperationImplementation<
    Tag,
    Payload,
    Success,
    Error,
    PolicyServices,
    Options
  >["invokeDecoded"];
  readonly rpcHandler: OperationImplementation<
    Tag,
    Payload,
    Success,
    Error,
    PolicyServices,
    Options
  >["rpcHandler"];
}

export const makeOperation: <
  const Tag extends string,
  Payload extends Schema.Top,
  Success extends Schema.Top,
  Error extends Schema.Top,
  PolicyServices = never,
  const Options extends OperationOptions<Payload, Success, Error, PolicyServices> & {
    /** Require private credential acceptance before the logical handler can mutate. */
    readonly credentials?: true;
    /** Required even when an exact-command replay returns only metadata. */
    readonly reveals?: ReadonlyArray<AuthRevealKind>;
  } = OperationOptions<Payload, Success, Error, PolicyServices>,
>(
  tag: Tag,
  options: OperationOptions<Payload, Success, Error, PolicyServices> & Options,
) => AuthOperation<Tag, Payload, Success, Error, PolicyServices, Options> = buildOperation;

export interface AnyOperation {
  readonly rpc: Rpc.Any;
  readonly exposure: OperationExposure;
}

/** Compose available contracts independently of their network exposure. */
export const operationGroup = <const Operations extends ReadonlyArray<AnyOperation>>(
  ...operations: Operations
): RpcGroup.RpcGroup<Operations[number]["rpc"]> => {
  const tags = new Set<string>();

  for (const operation of operations) {
    if (tags.has(operation.rpc._tag)) {
      throw OperationConfigurationError.make({
        reason: "duplicate-operation",
        operation: operation.rpc._tag,
      });
    }
    tags.add(operation.rpc._tag);
  }

  return RpcGroup.make(...operations.map((operation) => operation.rpc));
};

/** Explicitly select network operations; internal operations require an additional opt-in. */
export const remoteGroup = <const Operations extends ReadonlyArray<AnyOperation>>(
  operations: Operations,
  options?: { readonly allowInternal?: true },
): RpcGroup.RpcGroup<Operations[number]["rpc"]> => {
  for (const operation of operations) {
    if (operation.exposure === "internal" && options?.allowInternal !== true) {
      throw OperationConfigurationError.make({
        reason: "internal-exposure",
        operation: operation.rpc._tag,
      });
    }
  }

  return operationGroup(...operations);
};
