import { Schema } from "effect";

import { OidcStandardUserProfile } from "../shared/profile";

const identifier = Schema.String.check(Schema.isMaxLength(256));

/** Standard profile and workspace identifiers projected only from verified Slack
 * ID tokens. Workspace membership is application policy, not local identity. */
export const SlackUserProfile = Schema.Struct({
  ...OidcStandardUserProfile.fields,
  "https://slack.com/team_id": Schema.optionalKey(identifier),
  "https://slack.com/user_id": Schema.optionalKey(identifier),
});

export type SlackUserProfile = typeof SlackUserProfile.Type;
