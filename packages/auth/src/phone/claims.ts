import { Context, type Effect, type Schema, type Types } from "effect";

import type { SubjectId } from "../Schema";
import type { PhoneCredentialSnapshot, PhoneOtpUnavailable } from "./models";

/** Application session claims, shared by sign-in and lifecycle operations in one namespace. */
export const makePhoneClaims = <
  const Id extends string,
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
>(
  moduleId: Id,
) =>
  Context.Service<
    {
      readonly moduleId: Id;
      readonly kind: "phone-claims";
      readonly claims: Types.Invariant<Claims["Type"]>;
    },
    {
      readonly resolve: (input: {
        readonly subjectId: SubjectId;
        readonly credential: PhoneCredentialSnapshot;
      }) => Effect.Effect<Claims["Type"], PhoneOtpUnavailable>;
    }
  >(`effect-auth/ClaimsForPhone/${moduleId.length}:${moduleId}`);
