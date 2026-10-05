import { Cause, Schema } from "effect";

export class PersistenceMappingError extends Schema.TaggedError<PersistenceMappingError>()(
  "PersistenceMappingError",
  { operation: Schema.NonEmptyString, cause: Schema.Defect() },
) {}

export const isMappedConstraintConflict = (
  classify: (cause: unknown) => boolean,
  failure: unknown,
): boolean => {
  const seen = new Set<unknown>();
  const pending: Array<unknown> = [failure];

  for (let inspected = 0; inspected < 24 && pending.length > 0; inspected++) {
    const current = pending.shift();

    if (current === undefined || current === null || seen.has(current)) continue;
    seen.add(current);
    if (classify(current)) return true;
    if (Cause.isCause(current)) {
      for (const reason of current.reasons) {
        if (Cause.isFailReason(reason)) pending.push(reason.error);
        else if (Cause.isDieReason(reason)) pending.push(reason.defect);
      }
      continue;
    }
    if (typeof current !== "object") continue;
    const wrapped = current as { readonly cause?: unknown; readonly reason?: unknown };

    if (wrapped.cause !== undefined) pending.push(wrapped.cause);
    if (wrapped.reason !== undefined) pending.push(wrapped.reason);
  }

  return false;
};
