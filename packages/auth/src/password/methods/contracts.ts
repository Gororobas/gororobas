import { Schema } from "effect";

import { action } from "../../operations/actions";
import { Email } from "../../Schema";
import { PasswordCheckUnavailable, NewPasswordRejected } from "../errors";
import {
  PasswordActionRequired,
  PasswordMethodUnsupported,
  PasswordRejected,
  PasswordUnavailable,
} from "./errors";

/** Shared wire input; the server owns the authentication flow identifier. */
export const PasswordSignInInput = Schema.Struct({
  email: Schema.String.check(Schema.isMaxLength(320)).pipe(Schema.decodeTo(Email)),
  password: Schema.RedactedFromValue(Schema.String.check(Schema.isMaxLength(65536))),
});

type Completion =
  | { readonly _tag: "Authenticated"; readonly session: { readonly subjectId: string } }
  | { readonly _tag: "PendingAuthentication" };

/** Public password action, usable with sign-in-only and management installations. */
export const signIn = <S extends Schema.Codec<Completion, unknown, unknown, unknown>>(
  schemas: { readonly CompletionResult: S },
  options?: { readonly strategy?: string },
) =>
  action({
    payload: PasswordSignInInput,
    success: schemas.CompletionResult,
    error: Schema.Union([
      PasswordRejected,
      PasswordUnavailable,
      PasswordActionRequired,
      PasswordMethodUnsupported,
      NewPasswordRejected,
      PasswordCheckUnavailable,
    ]),
    mode: "mutation",
    credentials: true,
    method: "signIn",
    ...options,
    subject: {
      fromSuccess: (value) =>
        value._tag === "Authenticated" ? value.session.subjectId : undefined,
    },
  });
