import { Schema } from "effect";

/** Invalid static composition; never a wire failure or an authentication rejection. */
export class OperationConfigurationError extends Schema.TaggedError<OperationConfigurationError>()(
  "OperationConfigurationError",
  {
    reason: Schema.Literals([
      "duplicate-operation",
      "invalid-action",
      "internal-exposure",
      "credential-handler",
      "reveal-configuration",
      "private-handler",
    ]),
    operation: Schema.String,
  },
) {}

/** Intentionally excludes the invalid value and parser details, which may contain secrets. */
export class InvalidOperationInput extends Schema.TaggedError<InvalidOperationInput>()(
  "InvalidOperationInput",
  {},
) {}

export class AuthenticationRequired extends Schema.TaggedError<AuthenticationRequired>()(
  "AuthenticationRequired",
  {},
) {}

export class OperationForbidden extends Schema.TaggedError<OperationForbidden>()(
  "OperationForbidden",
  {},
) {}

export class AssuranceRequired extends Schema.TaggedError<AssuranceRequired>()(
  "AssuranceRequired",
  {},
) {}

export class OperationPrivateOutputUnsupported extends Schema.TaggedError<OperationPrivateOutputUnsupported>()(
  "OperationPrivateOutputUnsupported",
  {},
) {}

export const OperationBoundaryError = Schema.Union([
  InvalidOperationInput,
  AuthenticationRequired,
  OperationForbidden,
  AssuranceRequired,
  OperationPrivateOutputUnsupported,
]);

export type OperationBoundaryError = typeof OperationBoundaryError.Type;
