import { Auth, Operations } from "@yielded/auth";
import { Context, Effect, Layer } from "effect";

import { PasswordFailure, RegisterResult } from "../../shared/account/contract";
import { AuthApi, RegisterInput, SignInInput } from "./contract";

/** The application's public workflows. Replace either function by providing this service. */
export class AccountMethods extends Context.Service<
  AccountMethods,
  {
    readonly register: (
      input: typeof RegisterInput.Type,
    ) => Effect.Effect<typeof RegisterResult.Type, typeof PasswordFailure.Type>;
    readonly signIn: (
      input: typeof SignInInput.Type,
    ) => Effect.Effect<
      Operations.AuthOperationResult<typeof AuthApi.sessions.CompletionResult.Type>,
      typeof PasswordFailure.Type
    >;
  }
>()("customers/AccountMethods") {}

const Register = Operations.makeOperation("customers/account/register", {
  payload: RegisterInput,
  success: RegisterResult,
  error: PasswordFailure,
  access: "any",
  exposure: "public",
  replay: "idempotent",
});

const SignIn = Operations.makeOperation("customers/account/sign-in", {
  payload: SignInInput,
  success: AuthApi.sessions.CompletionResult,
  error: PasswordFailure,
  access: "any",
  exposure: "public",
  replay: "non-idempotent",
  credentials: true,
});

export const AccountStrategy = Auth.makeStrategy(
  { register: Register.invoke, signIn: SignIn.invoke },
  Layer.merge(
    Register.handlerLayer(
      Effect.fn("Account.register")(function* (input) {
        return yield* (yield* AccountMethods).register(input);
      }),
    ),
    SignIn.credentialHandlerLayer(
      Effect.fn("Account.signIn")(function* (input) {
        return yield* (yield* AccountMethods).signIn(input);
      }),
    ),
  ),
  { completion: true },
);
