import * as Alchemy from "alchemy";
import { adopt } from "alchemy/AdoptPolicy";
import * as Cloudflare from "alchemy/Cloudflare";
import { Effect } from "effect";

const docsAssets = {
  base: "/auth/",
  notFoundHandling: "404-page",
} satisfies Omit<Cloudflare.Workers.AssetsProps, "directory">;

export default Alchemy.Stack(
  "effect-auth",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    yield* Cloudflare.DNS.Record("YieldedDomain", {
      zoneId: "3156a752fbb91b819c563f6de807a621",
      name: "yielded.dev",
      type: "AAAA",
      content: "100::",
      proxied: true,
      comment: "Originless hostname for Yielded Worker routes",
    });

    yield* Cloudflare.Website.StaticSite("Docs", {
      name: "effect-auth-docs",
      command: "vp run docs:build",
      outdir: "docs/dist",
      domain: "effect-auth.com",
      routes: [{ pattern: "yielded.dev/auth*", zoneName: "yielded.dev" }],
      workersDev: false,
      dev: { command: "vp run docs:dev" },
      assets: docsAssets,
      // The home page and quick start include the root README's example.
      memo: { include: ["docs/**", "README.md", "package.json"], lockfile: true },
    });

    const legacyZone = yield* Cloudflare.Zone.Zone("LegacyDocsZone", {
      name: "effect-auth.com",
    }).pipe(adopt());

    yield* Cloudflare.Ruleset.Ruleset("LegacyDocsRedirect", {
      zone: legacyZone,
      phase: "http_request_dynamic_redirect",
      rules: [
        {
          action: "redirect",
          expression: 'http.host eq "effect-auth.com"',
          description: "Move auth documentation to yielded.dev/auth",
          actionParameters: {
            fromValue: {
              statusCode: 301,
              preserveQueryString: true,
              targetUrl: {
                expression: 'concat("https://yielded.dev/auth", http.request.uri.path)',
              },
            },
          },
        },
      ],
    });

    return { url: "https://yielded.dev/auth/" };
  }),
);
