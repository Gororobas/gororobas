export {
  action,
  fromOperation,
  make,
  type ActionOptions,
  type ActionDefinitions,
  type ActionInput,
  type ActionSuccess,
  type ActionError,
  type AnyAuthAction,
  type AuthActions,
  type AnyAuthContract,
} from "./operations/actions";

export { signIn as passwordSignIn } from "./password/methods/contracts";
export { signIn as oauthSignIn, completeSignIn as oauthCompleteSignIn } from "./oauth/contracts";

export { httpGroup } from "./http/auth-contract";
