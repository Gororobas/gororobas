import starlight from "@astrojs/starlight";
import yieldedTheme from "@yielded/starlight-theme";
import { defineConfig } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";

export default defineConfig({
  site: "https://yielded.dev",
  base: "/auth",
  integrations: [
    starlight({
      title: "Yielded Auth",
      description: "Composable authentication, sessions, and identity workflows for Effect.",
      favicon: "/favicon.svg",
      plugins: [yieldedTheme({ library: "auth" }), starlightLinksValidator()],
      sidebar: [
        {
          label: "Start",
          items: [
            { label: "Getting started", slug: "guide/getting-started" },
            { label: "Auth in an Effect application", slug: "guide/effect" },
            { label: "Examples", slug: "guide/examples" },
          ],
        },
        {
          label: "Build your application",
          items: [
            { label: "Database & backend choices", slug: "guide/storage" },
            { label: "HTTP integration", slug: "guide/http-and-client" },
            { label: "Effect Atom client", slug: "guide/client" },
            { label: "Desktop & mobile sign-in", slug: "guide/browser-login" },
            { label: "Sessions & protected routes", slug: "guide/sessions" },
            { label: "Rate limiting", slug: "guide/rate-limits" },
            { label: "How sign-in works", slug: "guide/authentication" },
          ],
        },
        {
          label: "Authentication",
          items: [
            { label: "Passwords", slug: "guide/passwords" },
            { label: "Email codes & magic links", slug: "guide/codes" },
            { label: "Email delivery", slug: "guide/email-delivery" },
            { label: "Phone codes", slug: "guide/phone" },
            { label: "Passkeys", slug: "guide/passkeys" },
            { label: "Two-factor authentication", slug: "guide/totp" },
          ],
        },
        {
          label: "OAuth providers",
          items: [
            { label: "OAuth setup", slug: "guide/oauth" },
            { label: "Enterprise OpenID", slug: "guide/enterprise-oidc" },
            { label: "Apple", slug: "guide/apple" },
            { label: "Atlassian", slug: "guide/atlassian" },
            { label: "Dropbox", slug: "guide/dropbox" },
            { label: "Figma", slug: "guide/figma" },
            { label: "GitHub", slug: "guide/github" },
            { label: "GitLab", slug: "guide/gitlab" },
            { label: "Google", slug: "guide/google" },
            { label: "Hugging Face", slug: "guide/huggingface" },
            { label: "Kick", slug: "guide/kick" },
            { label: "LINE", slug: "guide/line" },
            { label: "Linear", slug: "guide/linear" },
            { label: "Microsoft Entra ID", slug: "guide/microsoft" },
            { label: "Notion", slug: "guide/notion" },
            { label: "Railway", slug: "guide/railway" },
            { label: "Roblox", slug: "guide/roblox" },
            { label: "Slack", slug: "guide/slack" },
            { label: "Vercel", slug: "guide/vercel" },
            { label: "X", slug: "guide/x" },
            { label: "Zoom", slug: "guide/zoom" },
            { label: "Other OAuth / OIDC", link: "/guide/oauth/#other-providers" },
            { label: "MCP authorization", link: "/guide/oauth/#authorize-mcp-clients" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Public modules", slug: "reference/modules" },
            { label: "Adapters & persistence", slug: "reference/adapters" },
            { label: "Reusable cryptography", slug: "reference/crypto" },
            { label: "JOSE and typed JWTs", slug: "reference/jose" },
            { label: "Sessions", slug: "reference/sessions" },
            { label: "HTTP & action contracts", slug: "reference/http" },
            { label: "Client & Atom", slug: "reference/client" },
            { label: "OAuth", slug: "reference/oauth" },
            { label: "Native browser sign-in", slug: "reference/browser-login" },
            { label: "iOS passkeys", slug: "reference/passkey-react-native" },
          ],
        },
      ],
    }),
  ],
});
