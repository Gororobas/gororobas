# Authentication after an offline return

## Four architectures considered

| Design | Offline reopening | Reconnection | Assessment |
| --- | --- | --- | --- |
| Server-only stateful cookie (previous behavior) | Requires `getSession` and profile requests; a failed request becomes signed out. | Server validates each return. | Does not meet offline return requirements. |
| Local identity plus HttpOnly stateful cookie (implemented) | Restore a schema-checked subject ID and display name immediately, independently of credential expiry. Cache the public app shell. | Fresh server verification, then renewal when due, before authenticated API work. | Fits the existing auth contract and preserves server authority without storing bearer credentials in JavaScript. |
| Browser-verified signed credential | Verify a signature using a cached public key; also cache profile and app shell. | Recheck revocation and renew the credential before synchronization. | Yielded supports signed sessions, but an expired token still needs an explicit offline identity policy. Adds key distribution and a session-storage migration without improving this requirement. |
| Short-lived access token plus durable refresh grant | Restore a local identity while retaining a separate refresh credential. | Exchange the refresh grant before synchronization; require sign-in if revoked. | Useful for native clients or independent resource servers. This app already has a renewable HttpOnly cookie; a second credential lifecycle adds storage, rotation and revocation work. |

These are architecture comparisons grounded in the local auth implementation, not four visual prototypes. The UI remains plain HTML. Only the selected design is implemented.

References inspected: `repos/auth/packages/auth/src/auth/session.ts`, `sessions/configuration.ts`, `sessions/module.ts`, `operations/actions.ts`, and the beta.40–42 changelogs. Beta.42 retains the existing stateful session APIs. Both auth and persistence dependencies move together to beta.42. The request-body admission patch remains necessary and is reapplied to that version.

## Selected behavior

`SessionAccess` owns a small local identity record and serializes session checks and renewal within a tab. Local identity grants no server privileges. The credential stays in the browser's HttpOnly cookie, and roles remain server-authorized.

After an initial successful sign-in, the subject ID and profile name persist locally. On return, the account opens immediately while server validation runs separately. Connectivity events, focus, cross-tab storage events, and API calls trigger revalidation. Successful checks are reused for 30 seconds for ordinary API traffic. Transient failures keep the local identity and block authenticated API work until validation succeeds. No mutation is automatically retried.

The authoritative check calls `getSession({ fresh: true })`, bypassing Yielded's optional server-side session cache, followed by `renewSession()`. `SessionRenewalTooEarly` means the current session is valid and usable. Session absence, `SessionInvalid`, `AuthenticationRequired`, or `StaleAuthentication` clears the local identity; transport, timeout, conflict, and server-unavailable failures retain it for retry. An account switch blocks work for the original identity.

The current server policy allows a 30-day absolute session lifetime and a 7-day idle lifetime; renewal is eligible after one day. Renewal cannot resurrect a session whose idle or absolute deadline has already passed. A person returning after that deadline can still open their local account offline, but needs a new email sign-in before online work resumes.

Signing out clears the local identity immediately. If revocation cannot reach the server, a durable sign-out marker is settled before another sign-in or API request. This prevents reopening the still-present cookie from silently undoing an offline sign-out. Authentication storage never clears application data or outboxes.

## Future outbox integration

The data layer and an actual outbox are not implemented here. Future outbox entries must retain their owner's subject ID. Before each replay batch, call `SessionAccess.ensureReady(ownerSubjectId, true)` and proceed only on success. The explicit `true` forces fresh validation and renewal rather than relying on the 30-second check cache. On failure, leave the batch intact. After signing in again, release only the matching subject's queue. Enforce that owner on the server when applying changes too; cookies can change between a browser-side check and a request.

A semaphore coordinates renewal within a tab. Other tabs may race renewal; a conflict pauses work and the next check reads the shared browser cookie. Do not treat the local record or a successful browser-side check as authorization to apply a batch belonging to another account.

## Offline shell and verification

Production builds precache `index.html` and emitted application assets. Navigation uses that installed shell. API responses, credentials, and media are not cached. Development modules are intentionally not cached. Offline opening requires one prior successful shell installation on HTTPS or localhost; browser storage eviction removes offline availability.

The root quality gates include the web app's session tests. Tests cover offline reopening, concurrent validation, renewal eligibility, transient failure and recovery, definitive rejection, account ownership, deferred sign-out, and malformed local storage. Server auth integration tests exercise beta.42 with the retained admission patch.

Browser checks used the production build with seeded, in-memory servers:

1. Email-code sign-in and a full reload retained the named account.
2. Stopping the entire web origin still allowed full reloads of `/login` and `/search/profiles`; the account remained available and online requests paused.
3. Restoring the web origin allowed fresh session checks and returned the account to ready status.
4. Restarting the in-memory API removed its session records; the next browser reload returned to sign-in.

The browser outage check made the origin unreachable without changing the operating system's network settings. Unit tests separately exercise `navigator.onLine`-equivalent false values, transient renewal errors, and a sign-out from another tab while validation is in flight.
