import { Effect, Schema } from "effect"
import type { CanonicalState } from "./runtime-state/schema.js"
import { DurabilityFailure } from "../errors.js"
import type { Patch, State } from "./protocol.js"
import { RuntimeState as RuntimeSchema } from "./runtime-state/schema.js"
import { normalize, restore, Value } from "./runtime-state/value.js"

const Envelope = Schema.Struct({ version: Schema.Literal(1), data: Value })
const strict = { onExcessProperty: "error" } as const
const encodingFailure = (cause: unknown) => new DurabilityFailure({ reason: "encoding", message: `Cannot encode runtime state: ${String(cause)}` })
const corruptionFailure = (cause: unknown) => new DurabilityFailure({ reason: "corruption", message: `Invalid runtime state: ${String(cause)}` })

const mapValues = <K, A, B>(input: ReadonlyMap<K, A>, f: (value: A, key: K) => B): ReadonlyMap<K, B> => {
  const output = new Map<K, B>()
  for (const [key, value] of input) output.set(key, f(value, key))
  return output
}


const validateSession = (session: RuntimeSession): void => {
  if (session.entries.size !== session.order.length) throw new Error("Session order does not cover its entries")
  const seen = new Set<string>()
  for (const id of session.order) {
    const entry = session.entries.get(id)
    if (entry === undefined || entry.id !== id || seen.has(id)) throw new Error("Session order has missing, duplicate, or mismatched entry identities")
    if (entry.parentId !== null && !seen.has(entry.parentId)) throw new Error("Session parent is missing or cyclic")
    seen.add(id)
  }
  if (session.leaf !== null && !seen.has(session.leaf)) throw new Error("Session leaf does not exist")
}

/** Domain codecs encode all recovery data before the lossless normalized JSON boundary. */
export const encode = (state: RuntimeState): Effect.Effect<State, DurabilityFailure> => Effect.try({
  try: () => {
    for (const session of state.sessions.values()) validateSession(session)
    const canonical: CanonicalState = {
      ...state,
      scheduleClaims: mapValues(state.scheduleClaims, (claim) => {
        const { ownerId, leaseExpiresAt, ...schedule } = claim
        return { schedule, ownerId, leaseExpiresAt }
      }),
    }
    // Schema intentionally omits the enumerated process-local fields/subscribers.
    const data = normalize(Schema.encodeSync(RuntimeSchema)(canonical))
    return Schema.decodeUnknownSync(Envelope, strict)({ version: 1, data })
  },
  catch: encodingFailure,
})

/** Fresh reconstruction uses only persisted data plus this process's subscriptions/lifecycle. */
export const decode = (persisted: State, local: RuntimeState): Effect.Effect<RuntimeState, DurabilityFailure> => Effect.try({
  try: () => {
    // The journal's genesis is the only representation with no runtime state yet.
    if (Object.keys(persisted).length === 0) return local
    const { version } = Schema.decodeUnknownSync(Schema.Struct({ version: Schema.Int }))(persisted)
    if (version !== 1) throw new DurabilityFailure({ reason: "unsupported-version", message: `Unsupported runtime state version ${version}` })
    const envelope = Schema.decodeUnknownSync(Envelope, strict)(persisted)
    const canonical = Schema.decodeUnknownSync(RuntimeSchema, strict)(restore(envelope.data))
    for (const session of canonical.sessions.values()) validateSession(session)
    return {
      ...canonical,
      closed: local.closed,
      nextSubscriberId: local.nextSubscriberId,
      subscriberQueueCapacity: local.subscriberQueueCapacity,
      publications: local.publications,
      artifactPublications: local.artifactPublications,
      runs: mapValues(canonical.runs, (run, key) => ({ ...run, subscribers: local.runs.get(key)?.subscribers ?? new Map() })),
      hostSessions: mapValues(canonical.hostSessions, (session, key) => ({ ...session, subscribers: local.hostSessions.get(key)?.subscribers ?? new Map() })),
      treeRoots: mapValues(canonical.treeRoots, (root, key) => ({ ...root, subscribers: local.treeRoots.get(key)?.subscribers ?? new Map() })),
      artifacts: mapValues(canonical.artifacts, (artifact, key) => ({ ...artifact, subscribers: local.artifacts.get(key)?.subscribers ?? new Map() })),
      scheduleClaims: mapValues(canonical.scheduleClaims, ({ schedule, ownerId, leaseExpiresAt }) => ({ ...schedule, ownerId, leaseExpiresAt })),
    }
  },
  catch: (cause) => cause instanceof DurabilityFailure ? cause : corruptionFailure(cause),
})

const object = (value: Schema.Json): value is State => value !== null && typeof value === "object" && !Array.isArray(value)
const equal = (left: Schema.Json, right: Schema.Json): boolean => {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, i) => equal(value, right[i]!))
  if (!object(left) || !object(right)) return false
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && equal(left[key]!, right[key]!))
}

/** Only changed leaves are emitted; patch payloads share the already encoded next state. */
export const diff = (previous: State, next: State): readonly Patch[] => {
  const patches: Array<Patch> = []
  const visit = (before: State, after: State, path: ReadonlyArray<string>): void => {
    for (const key of Object.keys(before)) {
      if (!Object.hasOwn(after, key)) patches.push({ op: "remove", path: [...path, key] })
    }
    for (const key of Object.keys(after)) {
      const value = after[key]!
      const childPath = [...path, key]
      if (!Object.hasOwn(before, key)) patches.push({ op: "set", path: childPath, value })
      else {
        const old = before[key]!
        if (old === value) continue
        if (object(old) && object(value)) visit(old, value, childPath)
        else if (!equal(old, value)) patches.push({ op: "set", path: childPath, value })
      }
    }
  }
  visit(previous, next, [])
  return patches
}

/** Encode typed command inputs and receipts through their domain codecs.
 * Structural inspection fields and native Error stacks are not wire fields.
 * Persisted values are always decoded strictly; this is not an old-format reader.
 */
export const encodeCommandValue = <S extends Schema.Constraint & { readonly EncodingServices: never }>(
  value: S["Type"],
  schema: S,
): Effect.Effect<Schema.Json, DurabilityFailure> => Effect.try({
  try: () => Schema.decodeUnknownSync(Value, strict)(normalize(Schema.encodeSync(schema)(value))),
  catch: encodingFailure,
})
export const decodeReceipt = <S extends Schema.Constraint & { readonly DecodingServices: never }>(
  value: Schema.Json,
  schema: S,
): Effect.Effect<S["Type"], DurabilityFailure> => Effect.try({
  try: () => Schema.decodeUnknownSync(schema, strict)(restore(Schema.decodeUnknownSync(Value, strict)(value))),
  catch: corruptionFailure,
})
