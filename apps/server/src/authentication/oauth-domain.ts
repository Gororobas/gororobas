import { AuthSubjectId, OAuthProvider } from "@gororobas/domain"
import { Schema } from "effect"

export const OAuthFlow = Schema.Struct({
  state: Schema.String,
  flowId: Schema.String,
  provider: OAuthProvider,
  bindingVerifier: Schema.String,
  nonce: Schema.String,
  pkceVerifier: Schema.String,
  linkAuthSubjectId: Schema.NullOr(AuthSubjectId),
  expiresAt: Schema.Int,
})
