import { Auth, Password } from "@yielded/auth";

import { accountStrategies, sessionConfiguration } from "../../shared/account/auth";
import { emailProofPolicy } from "../../shared/account/contract";
import { AuthApi, Registration } from "./contract";
import { AccountStrategy } from "./methods";

export const AppAuth = Auth.make(AuthApi, {
  strategies: {
    ...accountStrategies,
    account: AccountStrategy,
    password: Password.make({
      registration: Registration,
      reset: Password.resetCode({ policy: emailProofPolicy }),
    }),
  },
  sessions: sessionConfiguration,
});
