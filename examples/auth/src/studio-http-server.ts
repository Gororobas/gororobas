import { Http, OperationHttpServer as HttpServer, Operations } from "@yielded/auth";
import { Database } from "@yielded/auth-persistence-drizzle/Postgres";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { StudioAuth } from "./studio-auth";
import { subject } from "./studio-passkey-schema";
import { MemberProfile, transport } from "./studio-transport";

export const memberLayer = MemberProfile.handlerLayer(
  Effect.fn(function* (_input, invocation) {
    const caller = yield* Operations.requireAuthenticated(invocation);
    const db = yield* Database;

    const [member] = yield* db
      .select()
      .from(subject)
      .where(eq(subject.id, caller.subjectId))
      .pipe(Effect.orDie);

    if (member === undefined) return yield* Effect.die(new Error("Missing current member"));

    return { memberId: caller.subjectId, organization: member.organization, name: member.name };
  }),
);

/** Localhost uses an explicit insecure cookie override; production uses HTTPS defaults. */
const http = Http.make(StudioAuth, {
  origin: "http://localhost:4179",
  cookie: { prefix: "studio-", secure: false },
  csrf: { header: "x-studio-csrf", value: "operation" },
  maximumBodyBytes: 300000,
});

export const studioHttp = HttpServer.make(transport).pipe(
  Effect.provide(http.operationLayer),
  Effect.map((server) => ({
    handle: (request: Request) => server.handle(request).pipe(Effect.provide(memberLayer)),
  })),
);
