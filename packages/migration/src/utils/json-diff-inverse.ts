/**
 * JSON diff inverse operations for backward reconstruction.
 * Based on json-diff-ts format.
 */
import { Effect } from "effect"

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

// ============ Inverse Operations ============

/**
 * Inverse a JSON diff operation.
 */
const inverseOperation = (op: JsonDiffOperation): JsonDiffOperation => {
  switch (op.op) {
    case "add":
      // Adding can be inverted by removing
      return {
        op: "remove",
        path: op.path,
      }

    case "remove":
      // Removing can be inverted by adding back the original value
      if (op.value === undefined) {
        throw new Error("Remove operation must have a value for inversion")
      }
      return {
        op: "add",
        path: op.path,
        value: op.value,
      }

    case "replace":
      // Replace can be inverted by replacing with the old value
      if (op.value === undefined) {
        throw new Error("Replace operation must have a value for inversion")
      }
      return {
        op: "replace",
        path: op.path,
        value: op.value,
      }

    case "move":
      // Move can be inverted by moving back
      if (op.from === undefined) {
        throw new Error("Move operation must have 'from' for inversion")
      }
      return {
        op: "move",
        path: op.from,
        from: op.path,
      }

    case "copy":
      // Copy operations are not invertible in a meaningful way
      // For our use case, we'll skip them
      throw new Error("Copy operations are not invertible")

    case "test":
      // Test operations are assertions, not modifications
      // They don't need inversion
      return op

    default:
      throw new Error(`Unknown operation type: ${(op as any).op}`)
  }
}

/**
 * Extract the value at a JSON path from an object.
 */
const getValueAtPath = (obj: any, path: string): any => {
  const parts = path.split("/").filter(Boolean)
  let current = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }

    if (Array.isArray(current)) {
      const index = parseInt(part, 10)
      if (isNaN(index)) {
        throw new Error(`Invalid array index in path: ${part}`)
      }
      current = current[index]
    } else {
      current = current[part]
    }
  }

  return current
}

/**
 * Set the value at a JSON path in an object.
 */
const setValueAtPath = (obj: any, path: string, value: any): void => {
  const parts = path.split("/").filter(Boolean)
  let current = obj

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]

    if (current === null || current === undefined) {
      current = {}
    }

    if (Array.isArray(current)) {
      const index = parseInt(part, 10)
      if (isNaN(index)) {
        throw new Error(`Invalid array index in path: ${part}`)
      }
      if (current[index] === null || current[index] === undefined) {
        current[index] = {}
      }
      current = current[index]
    } else {
      if (current[part] === null || current[part] === undefined) {
        current[part] = {}
      }
      current = current[part]
    }
  }

  const lastPart = parts[parts.length - 1]
  if (Array.isArray(current)) {
    const index = parseInt(lastPart, 10)
    if (isNaN(index)) {
      throw new Error(`Invalid array index in path: ${lastPart}`)
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

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    current = current[part]
  }

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
  const result = JSON.parse(JSON.stringify(obj)) // Deep clone

  for (const op of diff.ops) {
    switch (op.op) {
      case "add":
        setValueAtPath(result, op.path, op.value)
        break

      case "remove":
        removeValueAtPath(result, op.path)
        break

      case "replace":
        setValueAtPath(result, op.path, op.value)
        break

      case "move":
        if (op.from === undefined) {
          throw new Error("Move operation must have 'from' path")
        }
        const value = getValueAtPath(result, op.from)
        removeValueAtPath(result, op.from)
        setValueAtPath(result, op.path, value)
        break

      case "copy":
        if (op.from === undefined) {
          throw new Error("Copy operation must have 'from' path")
        }
        const copyValue = getValueAtPath(result, op.from)
        setValueAtPath(result, op.path, copyValue)
        break

      case "test":
        // Test operations are assertions - skip them
        break

      default:
        throw new Error(`Unknown operation type: ${(op as any).op}`)
    }
  }

  return result
}

/**
 * Create an inverse diff that can reverse the original diff.
 * For remove operations, we need to capture the value being removed.
 */
export const createInverseDiff = (obj: any, diff: JsonDiff): InverseDiff => {
  const inverseOps: JsonDiffOperation[] = []

  for (const op of diff.ops) {
    // For remove operations, we need to capture the value being removed
    if (op.op === "remove") {
      const value = getValueAtPath(obj, op.path)
      inverseOps.push({
        op: "remove",
        path: op.path,
        value,
      })
    } else {
      inverseOps.push(inverseOperation(op))
    }
  }

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
    catch: (error) => new Error("Failed to apply inverse diff: ", error),
  })
