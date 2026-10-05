import { AuthContract } from "@yielded/auth";
import { Schema, SchemaGetter } from "effect";

import {
  accountActions,
  Claims as AccountClaims,
  RegisterInput as AccountRegisterInput,
  Registration as AccountRegistration,
} from "../../shared/account/contract";

export const Username = Schema.String.pipe(
  Schema.decodeTo(Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9_]{2,23}$/)), {
    decode: SchemaGetter.transform((value) => value.trim().toLowerCase()),
    encode: SchemaGetter.passthrough(),
  }),
);

export const Registration = Schema.Struct({ ...AccountRegistration.fields, username: Username });
export const Claims = Schema.Struct({ ...AccountClaims.fields, username: Username });

export const SignInInput = Schema.Struct({
  login: Schema.NonEmptyString.check(Schema.isMaxLength(320)),
  password: AccountRegisterInput.fields.newPassword,
});

export const RegisterInput = Schema.Struct({
  ...AccountRegisterInput.fields,
  registration: Registration,
});

// Only the username fields and the two application-owned methods differ.
export const AuthApi = AuthContract.make("customers", {
  claims: Claims,
  actions: (sessions) => {
    const actions = accountActions(sessions);

    return {
      ...actions,
      passwordSignIn: AuthContract.action({
        ...actions.passwordSignIn,
        payload: SignInInput,
        replay: "non-idempotent",
        strategy: "account",
      }),
      register: AuthContract.action({
        ...actions.register,
        payload: RegisterInput,
        strategy: "account",
      }),
    };
  },
});
