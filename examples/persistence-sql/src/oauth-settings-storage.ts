import { OAuth } from "@yielded/auth";
import * as Mapping from "@yielded/auth-persistence/OAuthPersistence";
import { Context, Effect, Layer } from "effect";

import { makeMappings, makeServices } from "../../shared/oauth/storage";
import { makeAccountsMapping } from "./oauth-lifecycle-storage";
import { moduleId } from "./oauth-settings-auth";
import { SettingsSessionsLive } from "./oauth-settings-sessions";

export const settingsStorage = (externalSubject: string) => {
  const storage = Layer.effectContext(
    Effect.gen(function* () {
      const base = yield* makeMappings({
        moduleId,
        subjectId: "settings-owner",
        provider: "github",
        issuer: "https://github.com/login/oauth",
        externalSubject,
        provisionOnce: true,
      });

      const mapping = yield* makeAccountsMapping();

      const accounts = yield* Mapping.makeOAuthAccountsServices({
        ...mapping,
        sessionInvalidation: "same-authority-immediate",
        // A valid application session may read only its own current login inventory.
        metadataAccess: ({ invocation, moduleId: requested, subjectId }) =>
          invocation._tag === "Authenticated" &&
          invocation.subjectId === subjectId &&
          requested === moduleId
            ? Mapping.sql`true`
            : Mapping.sql`false`,
      });

      return (yield* makeServices(base)).pipe(
        Context.add(OAuth.OAuthAccountsPersistence, accounts.oauthAccountsPersistence),
      );
    }),
  );

  return SettingsSessionsLive.pipe(Layer.provideMerge(storage));
};
