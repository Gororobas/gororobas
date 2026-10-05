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
            { label: "GitHub", slug: "guide/github" },
            { label: "Google", slug: "guide/google" },
            { label: "Other OAuth / OIDC", link: "/guide/oauth/#other-providers" },
            { label: "MCP authorization", link: "/guide/oauth/#authorize-mcp-clients" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Public modules", slug: "reference/modules" },
            { label: "Adapters & persistence", slug: "reference/adapters" },
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
