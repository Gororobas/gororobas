import type { PreparedCommit } from "@yielded/auth/Hooks";
import type { LoginIdentifier } from "@yielded/auth/Identity";
import type {
  PasswordUnavailable,
  PasswordReplacement,
  PasswordRegistrationDecision,
  PreparePasswordCommit,
} from "@yielded/auth/Password";
import type { Effect } from "effect";

export interface PasswordRegistrationAuthority<Registration> {
  readonly register: <A>(
    input: {
      readonly moduleId: string;
      readonly requestId: string;
      readonly identifier: LoginIdentifier;
      readonly registration: Registration;
      readonly replacement: PasswordReplacement;
    },
    prepare: PreparePasswordCommit<PasswordRegistrationDecision, A>,
  ) => Effect.Effect<PreparedCommit<A>, PasswordUnavailable>;
}
