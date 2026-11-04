---
"@yielded/auth": minor
---

Add Login with Discord through `Discord.provider`, an OpenID preset that merges UserInfo. Treat `null` standard UserInfo profile claims as absent and prefer `nickname` over `preferred_username` for OpenID display names.
