import { Schema } from "effect"
import { canonicalize } from "../../../core/durable/canonical-json.js"
import type { OperationRecord } from "../../../runtime/operation/record.js"
import { operationKeyMapKey, operationMapKey, type RuntimeState } from "../../../runtime/state/projection.js"
import { Operation } from "./schema.js"
import { normalize } from "./value.js"

type Operations = RuntimeState["operations"]
const encodeRecord = Schema.encodeSync(Operation)
const comparable = (record: OperationRecord) => JSON.stringify(canonicalize(normalize(encodeRecord(record))))

const project = (input: Operations) => {
  const canonical = new Map<string, OperationRecord>()
  const byKey = new Map<string, OperationRecord>()
  for (const [key, record] of input) {
    const primaryKey = operationMapKey(record.runId, record.operationId)
    const lookupKey = operationKeyMapKey(record.runId, record.operationKey)
    if (key === primaryKey) {
      if (byKey.has(lookupKey)) throw new Error("Distinct operations claim the same lookup key")
      canonical.set(key, record)
      byKey.set(lookupKey, record)
    } else if (key !== lookupKey) throw new Error("Operation index has a mismatched identity")
  }
  for (const [key, record] of input) {
    if (canonical.has(key)) continue
    const primary = canonical.get(operationMapKey(record.runId, record.operationId))
    if (primary === undefined) throw new Error("Operation lookup key has no primary record")
    if (primary !== record && comparable(primary) !== comparable(record)) {
      throw new Error("Operation lookup key diverges from its primary record")
    }
  }
  const hydrated = new Map(canonical)
  for (const [key, record] of byKey) {
    if (canonical.has(key)) throw new Error("Operation lookup key collides with a primary identity")
    hydrated.set(key, record)
  }
  return { canonical: canonical.size === input.size ? input : canonical, hydrated }
}

export const make = () => {
  const decoded = new WeakMap<Operations, ReturnType<typeof project>>()
  const retained = (input: Operations) => {
    const previous = decoded.get(input)
    if (previous !== undefined) return previous
    const projected = project(input)
    decoded.set(input, projected)
    return projected
  }
  return {
    decode: (input: Operations): Operations => retained(input).hydrated,
    encode: (
      input: Operations,
      base?: { readonly hydrated: Operations; readonly canonical: Operations },
    ): Operations => (input === base?.hydrated ? retained(base.canonical).canonical : project(input).canonical),
  }
}
