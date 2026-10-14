import { Schema } from "effect";

import { discoveryProfile } from "../shared/discovery";
import { makeOidcPreset, OidcPresetRegistration, type OidcPresetOptions } from "../shared/preset";
import { SlackUserProfile } from "./profile";

const Registration = Schema.Struct({
  ...OidcPresetRegistration.fields,
  team: Schema.optionalKey(Schema.NonEmptyString.check(Schema.isMaxLength(256))),
});

export type ProviderRegistration = typeof Registration.Type;
export type ProviderOptions = OidcPresetOptions<ProviderRegistration>;

/** Slack OpenID Connect with workspace claims and pinned discovery supplementation.
 * Give it a distinct callback. team is a consent hint; authorize workspace membership
 * against verified claims. */
export const provider = (options: ProviderOptions) =>
  makeOidcPreset(options, Registration, ({ team, ...registration }) => ({
    ...registration,
    protocol: "oidc",
    issuer: "https://slack.com",
    responseIssuerMode: "unsupported",
    profileSchema: SlackUserProfile,
    [discoveryProfile]: "slack",
    ...(team === undefined ? {} : { authorizationParameters: { team } }),
  }));
