import * as Schema from "effect/Schema";

import { OidcStandardUserProfile } from "../shared/profile";

/** Standard claims from verified Discord ID tokens merged with UserInfo. nickname
 * is the display name and preferred_username the username; neither is durable identity. */
export const DiscordUserProfile = Schema.Struct({ ...OidcStandardUserProfile.fields });

export type DiscordUserProfile = typeof DiscordUserProfile.Type;
