export { type AuthApi, type AuthService, type Options, Service, make } from "./auth/Auth";
export { AuthenticationRequired } from "./operations/errors";
export { AuthConfigurationError } from "./auth/AuthConfigurationError";
export { type AuthMethod, makeAuthStrategy as makeStrategy } from "./auth/AuthStrategy";

export type {
  BindingOf,
  ClaimsCodec,
  StrategyBinding,
  StrategyDefinition,
  StrategyTypeLambda,
} from "./auth/definition";

export { AuthRequest } from "./auth/AuthRequest";
export type { SessionApi, SessionApiError } from "./auth/session";
export { RequestBindingConfig } from "./operations/RequestBindingConfig";
