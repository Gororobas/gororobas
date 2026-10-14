import { OidcStandardUserProfile } from "../shared/profile";

export const VercelUserProfile = OidcStandardUserProfile;
export type VercelUserProfile = typeof VercelUserProfile.Type;
