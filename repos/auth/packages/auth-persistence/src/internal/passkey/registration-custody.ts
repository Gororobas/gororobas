/* oxlint-disable no-explicit-any -- existing mapped-row bridge; public adapters preserve table, ID, and Effect types. */

import type { PasskeyCeremony } from "@yielded/auth/Passkey";
import { Effect } from "effect";

import { CurrentPasskeyTransaction } from "./state";
import type { makePasskeyStateKernel } from "./state";

export const makePasskeyRegistrationCustodyKernel = (
  state: Pick<
    ReturnType<typeof makePasskeyStateKernel>,
    "ceremonyStorage" | "equal" | "handleKey" | "invariant"
  >,
) => {
  const { ceremonyStorage, equal, handleKey } = state;
  const invariant: (value: unknown) => asserts value = state.invariant;

  /** SQL-local writers have no external provisioning work. A definite terminal
   * rejection can release only its exact still-reserved handle; ambiguous owners
   * retain custody, and an accepted transaction no longer matches this reservation. */
  const releaseRegistrationCustody = Effect.fn("passkey.releaseRegistrationCustody")(function* (
    mapping: any,
    ceremony: PasskeyCeremony,
  ) {
    if (mapping.registration === undefined || ceremony.context._tag !== "Registration") return;
    const owner = yield* CurrentPasskeyTransaction;
    const handle = mapping.handle;
    const intent = mapping.intent;
    const hashed = handleKey(ceremony.profile.rpId, ceremony.context.userHandle);

    const held = (yield* owner.read(
      handle.table,
      equal(handle.table, { [handle.handleKey]: hashed }),
      { limit: 1 },
    )).rows[0];

    const row = (yield* owner.read(
      intent.table,
      equal(intent.table, {
        [intent.moduleId]: mapping.moduleId,
        [intent.flowId]: ceremony.flowId,
      }),
      { limit: 1 },
    )).rows[0];

    if (row === undefined || !intent.isPendingState(row[intent.state])) return;
    invariant(
      held !== undefined &&
        handle.isReservedState(held[handle.state]) &&
        held[handle.reservationId] === row[intent.reservationId] &&
        row[intent.handleKey] === hashed &&
        row[intent.commandId] === ceremony.commandId &&
        row[intent.ceremonySnapshot] === ceremonyStorage.encode(ceremony),
    );
    yield* owner.update(
      intent.table,
      { [intent.moduleId]: mapping.moduleId, [intent.flowId]: ceremony.flowId },
      { [intent.state]: intent.rejectedState, [intent.version]: owner.marker },
    );
    yield* owner.remove(handle.table, { [handle.handleKey]: hashed });
  });

  /** Keep the command/flow tombstone after retention, without retaining the
   * application registration payload or ceremony. Ambiguous custody is never scrubbed. */
  const scrubRegistrationIntent = Effect.fn("passkey.scrubRegistrationIntent")(function* (
    mapping: any,
    ceremony: PasskeyCeremony,
  ) {
    if (mapping.registration === undefined || ceremony.context._tag !== "Registration") return;
    const owner = yield* CurrentPasskeyTransaction;
    const intent = mapping.intent;
    const identity = { [intent.moduleId]: mapping.moduleId, [intent.flowId]: ceremony.flowId };

    const row = (yield* owner.read(intent.table, equal(intent.table, identity), { limit: 1 }))
      .rows[0];

    if (row === undefined) return;
    invariant(
      (row[intent.state] === intent.acceptedState || row[intent.state] === intent.rejectedState) &&
        row[intent.commandId] === ceremony.commandId &&
        row[intent.ceremonySnapshot] === ceremonyStorage.encode(ceremony),
    );
    yield* owner.update(intent.table, identity, {
      [intent.applicationSnapshot]: "",
      [intent.ceremonySnapshot]: "",
      [intent.version]: owner.marker,
    });
  });

  return { releaseRegistrationCustody, scrubRegistrationIntent };
};
