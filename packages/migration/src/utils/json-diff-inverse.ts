/**
 * JSON diff inverse operations for backward reconstruction.
 * Based on json-diff-ts format.
 */
import { Array as Arr, Effect, Match, Schema } from "effect"

// ============ Types ============

export interface JsonDiffOperation {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test"
  path: string
  value?: any
  from?: string
}

export interface JsonDiff {
  ops: JsonDiffOperation[]
}

export interface InverseDiff {
  ops: JsonDiffOperation[]
}

class JsonDiffError extends Schema.TaggedError<JsonDiffError>()("JsonDiffError", {
  message: Schema.String,
}) {}

// ============ Inverse Operations ============

/**
 * Inverse a JSON diff operation.
 */
const inverseOperation = (op: JsonDiffOperation): JsonDiffOperation => {
  return Match.value(op.op).pipe(
    Match.when(
      "add",
      () =>
        // Adding can be inverted by removing
        ({
          op: "remove",
          path: op.path,
        }) as const,
    ),
    Match.when("remove", () => {
      // Removing can be inverted by adding back the original value
      if (op.value === undefined) {
        throw new JsonDiffError({ message: "Remove operation must have a value for inversion" })
      }
      return { op: "add" as const, path: op.path, value: op.value }
    }),
    Match.when("replace", () => {
      // Replace can be inverted by replacing with the old value
      if (op.value === undefined) {
        throw new JsonDiffError({ message: "Replace operation must have a value for inversion" })
      }
      return { op: "replace" as const, path: op.path, value: op.value }
    }),
    Match.when("move", () => {
      // Move can be inverted by moving back
      if (op.from === undefined) {
        throw new JsonDiffError({ message: "Move operation must have 'from' for inversion" })
      }
      return { op: "move" as const, path: op.from, from: op.path }
    }),
    Match.when("copy", () => {
      // Copy operations are not invertible in a meaningful way
      throw new JsonDiffError({ message: "Copy operations are not invertible" })
    }),
    Match.when("test", () => op),
    Match.exhaustive,
  )
}

/**
 * Extract the value at a JSON path from an object.
 */
const getValueAtPath = (obj: any, path: string): any => {
  const parts = path.split("/").filter(Boolean)
  return parts.reduce((current, part) => {
    if (current === null || current === undefined) {
      return undefined
    }

    if (Array.isArray(current)) {
      const index = parseInt(part, 10)
      if (isNaN(index)) {
        throw new JsonDiffError({ message: `Invalid array index in path: ${part}` })
      }
      current = current[index]
    } else {
      current = current[part]
    }
    return current
  }, obj)
}

/**
 * Set the value at a JSON path in an object.
 */
const setValueAtPath = (obj: any, path: string, value: any): void => {
  const parts = path.split("/").filter(Boolean)
  let current = obj

  current = parts.slice(0, -1).reduce((current, part) => {
    if (current === null || current === undefined) current = {}
    if (Array.isArray(current)) {
      const index = parseInt(part, 10)
      if (isNaN(index)) throw new JsonDiffError({ message: `Invalid array index in path: ${part}` })
      if (current[index] === null || current[index] === undefined) current[index] = {}
      return current[index]
    }
    if (current[part] === null || current[part] === undefined) current[part] = {}
    return current[part]
  }, obj)

  const lastPart = parts[parts.length - 1]
  if (Array.isArray(current)) {
    const index = parseInt(lastPart, 10)
    if (isNaN(index)) {
      throw new JsonDiffError({ message: `Invalid array index in path: ${lastPart}` })
    }
    current[index] = value
  } else {
    current[lastPart] = value
  }
}

/**
 * Remove the value at a JSON path from an object.
 */
const removeValueAtPath = (obj: any, path: string): void => {
  const parts = path.split("/").filter(Boolean)
  let current = obj

  current = parts.slice(0, -1).reduce((current, part) => current[part], obj)

  const lastPart = parts[parts.length - 1]
  if (Array.isArray(current)) {
    const index = parseInt(lastPart, 10)
    if (!isNaN(index)) {
      current.splice(index, 1)
    }
  } else {
    delete current[lastPart]
  }
}

/**
 * Apply a JSON diff to an object.
 */
export const applyDiff = (obj: any, diff: JsonDiff): any => {
  const result = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(
    Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(obj),
  ) // Deep clone

  Arr.forEach(diff.ops, (op) => {
    Match.value(op.op).pipe(
      Match.when("add", () => setValueAtPath(result, op.path, op.value)),
      Match.when("remove", () => removeValueAtPath(result, op.path)),
      Match.when("replace", () => setValueAtPath(result, op.path, op.value)),
      Match.when("move", () => {
        if (op.from === undefined)
          throw new JsonDiffError({ message: "Move operation must have 'from' path" })
        const value = getValueAtPath(result, op.from)
        removeValueAtPath(result, op.from)
        setValueAtPath(result, op.path, value)
      }),
      Match.when("copy", () => {
        if (op.from === undefined)
          throw new JsonDiffError({ message: "Copy operation must have 'from' path" })
        setValueAtPath(result, op.path, getValueAtPath(result, op.from))
      }),
      Match.when("test", () => undefined),
      Match.exhaustive,
    )
  })

  return result
}

/**
 * Create an inverse diff that can reverse the original diff.
 * For remove operations, we need to capture the value being removed.
 */
export const createInverseDiff = (obj: any, diff: JsonDiff): InverseDiff => {
  const inverseOps = diff.ops.map((op) => {
    // For remove operations, we need to capture the value being removed
    if (op.op === "remove") {
      const value = getValueAtPath(obj, op.path)
      return {
        op: "remove" as const,
        path: op.path,
        value,
      }
    } else {
      return inverseOperation(op)
    }
  })

  return { ops: inverseOps }
}

/**
 * Apply an inverse diff to walk backwards in time.
 */
export const applyInverseDiff = (currentState: any, originalDiff: JsonDiff): any => {
  const inverseDiff = createInverseDiff(currentState, originalDiff)
  return applyDiff(currentState, inverseDiff)
}

/**
 * Effect wrapper for applyInverseDiff.
 */
export const applyInverseDiffE = (currentState: any, originalDiff: JsonDiff) =>
  Effect.try({
    try: () => applyInverseDiff(currentState, originalDiff),
    catch: () => new JsonDiffError({ message: "Failed to apply inverse diff" }),
  })
