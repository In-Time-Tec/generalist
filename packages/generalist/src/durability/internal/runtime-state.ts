import { Effect, Function, Predicate, Record, Schema } from "effect"
import type {
  RuntimeSession,
  RuntimeState,
  StoredRun,
  StoredHostSession,
  TreeRoot,
  StoredArtifact,
} from "../../runtime/state/projection.js"
import { DurabilityFailure } from "../errors.js"
import { apply, freeze, isImmutable, type Patch, type State } from "./protocol.js"
import { RuntimeState as RuntimeSchema, type HydratedState, type CanonicalState } from "./runtime-state/schema.js"
import { normalize, restore, Value } from "./runtime-state/value.js"
import { detach, mapValues as makeMapValues } from "./runtime-state/cache.js"
import { make as makeExecutables } from "./runtime-state/executable.js"
import { make as makeProjection } from "./runtime-state/projection.js"
import type { Changes } from "./runtime-state/publications.js"

const Envelope = Schema.Struct({ version: Schema.Literal(1), data: Value })
const strict = { onExcessProperty: "error" } as const
const encodingFailure = (cause: unknown) =>
  DurabilityFailure.make({ reason: "encoding", message: `Cannot encode runtime state: ${String(cause)}` })
const corruptionFailure = (cause: unknown) =>
  DurabilityFailure.make({ reason: "corruption", message: `Invalid runtime state: ${String(cause)}` })

const mapValues = <K, A, B>(input: ReadonlyMap<K, A>, f: (value: A, key: K) => B): ReadonlyMap<K, B> => {
  const output = new Map<K, B>()
  for (const [key, value] of input) output.set(key, f(value, key))
  return output
}

const withSubscribers = <A, S>(value: A, subscribers: S) => ({ ...value, subscribers })

type HydratedTable = Exclude<HydratedState[keyof HydratedState], number>
type HydratedRow = HydratedTable extends ReadonlyMap<string, infer Row> ? Row : never
type MutableChanges = { [Key in keyof Changes]: Array<Changes[Key][number]> }
const projectTable = (
  field: HydratedTable,
  before: HydratedTable | undefined,
  retained: HydratedTable | undefined,
  copy: ReturnType<typeof detach>,
) => {
  if (field === before && retained !== undefined) return { values: retained, changed: [] }
  const values = new Map<string, HydratedRow>()
  const changed: Array<string> = []
  for (const [id, value] of field) {
    const unchanged = before?.get(id) === value
    values.set(id, unchanged && retained?.has(id) === true ? retained.get(id)! : copy(value))
    if (!unchanged) changed.push(id)
  }
  return { values, changed }
}

const makeAttachment = <A extends object, S>(originals: WeakMap<object, object>) => {
  const cached = new WeakMap<A, { readonly subscribers: S; readonly value: A & { subscribers: S } }>()
  return (record: A, subscribers: S) => {
    const previous = cached.get(record)
    if (previous?.subscribers === subscribers) return previous.value
    const value = withSubscribers(record, subscribers)
    originals.set(value, record)
    cached.set(record, { subscribers, value })
    return value
  }
}

const makeAttachments = (originals: WeakMap<object, object>) => ({
  run: makeAttachment<Omit<StoredRun, "subscribers">, StoredRun["subscribers"]>(originals),
  session: makeAttachment<Omit<StoredHostSession, "subscribers">, StoredHostSession["subscribers"]>(originals),
  tree: makeAttachment<Omit<TreeRoot, "subscribers">, TreeRoot["subscribers"]>(originals),
  artifact: makeAttachment<Omit<StoredArtifact, "subscribers">, StoredArtifact["subscribers"]>(originals),
  runs: makeMapValues<string, Omit<StoredRun, "subscribers">, StoredRun>(),
  sessions: makeMapValues<string, Omit<StoredHostSession, "subscribers">, StoredHostSession>(),
  trees: makeMapValues<string, Omit<TreeRoot, "subscribers">, TreeRoot>(),
  artifacts: makeMapValues<string, Omit<StoredArtifact, "subscribers">, StoredArtifact>(),
})

const uncachedAttachments: ReturnType<typeof makeAttachments> = {
  run: withSubscribers,
  session: withSubscribers,
  tree: withSubscribers,
  artifact: withSubscribers,
  runs: mapValues,
  sessions: mapValues,
  trees: mapValues,
  artifacts: mapValues,
}

const validateSession = (session: RuntimeSession): void => {
  if (session.entries.size !== session.order.length) throw new Error("Session order does not cover its entries")
  const seen = new Set<string>()
  for (const id of session.order) {
    const entry = session.entries.get(id)
    if (entry === undefined || entry.id !== id || seen.has(id))
      throw new Error("Session order has missing, duplicate, or mismatched entry identities")
    if (entry.parentId !== null && !seen.has(entry.parentId)) throw new Error("Session parent is missing or cyclic")
    seen.add(id)
  }
  if (session.leaf !== null && !seen.has(session.leaf)) throw new Error("Session leaf does not exist")
}

const attachState = (
  canonical: HydratedState,
  local: RuntimeState,
  attach: ReturnType<typeof makeAttachments> = uncachedAttachments,
): RuntimeState => ({
  ...canonical,
  closed: local.closed,
  nextSubscriberId: local.nextSubscriberId,
  subscriberQueueCapacity: local.subscriberQueueCapacity,
  publications: local.publications,
  artifactPublications: local.artifactPublications,
  runs: attach.runs(
    canonical.runs,
    (run, key) => attach.run(run, local.runs.get(key)?.subscribers ?? new Map()),
    local.runs,
  ),
  hostSessions: attach.sessions(
    canonical.hostSessions,
    (session, key) => attach.session(session, local.hostSessions.get(key)?.subscribers ?? new Map()),
    local.hostSessions,
  ),
  treeRoots: attach.trees(
    canonical.treeRoots,
    (root, key) => attach.tree(root, local.treeRoots.get(key)?.subscribers ?? new Map()),
    local.treeRoots,
  ),
  artifacts: attach.artifacts(
    canonical.artifacts,
    (artifact, key) => attach.artifact(artifact, local.artifacts.get(key)?.subscribers ?? new Map()),
    local.artifacts,
  ),
  scheduleClaims: mapValues(canonical.scheduleClaims, ({ schedule, ownerId, leaseExpiresAt }) => ({
    ...schedule,
    ownerId,
    leaseExpiresAt,
  })),
})

/** Domain codecs encode all recovery data before the lossless normalized JSON boundary. */
const encodeWith = (
  state: RuntimeState,
  schema: typeof RuntimeSchema,
  normalizeValue: typeof normalize,
  executables: ReturnType<typeof makeExecutables>,
): Effect.Effect<State, DurabilityFailure> =>
  Effect.gen(function* () {
    yield* Effect.try({
      try: () => {
        for (const session of state.sessions.values()) validateSession(session)
      },
      catch: encodingFailure,
    })
    const canonical = yield* Effect.try({ try: () => executables.encode(state), catch: encodingFailure })
    const encoded = yield* Schema.encodeEffect(schema)(canonical).pipe(Effect.mapError(encodingFailure))
    yield* Effect.try({ try: () => executables.validate(canonical), catch: encodingFailure })
    const data = yield* Effect.try({ try: () => normalizeValue(encoded), catch: encodingFailure })
    return { version: 1, data }
  })

export const encode = (state: RuntimeState): Effect.Effect<State, DurabilityFailure> =>
  encodeWith(state, RuntimeSchema, normalize, makeExecutables())

/** Fresh reconstruction uses only persisted data plus this process's subscriptions/lifecycle. */
const decodeWith = (
  persisted: State,
  local: RuntimeState,
  schema: typeof RuntimeSchema,
  restoreValue: typeof restore,
  copy: (state: HydratedState) => HydratedState,
  executables: ReturnType<typeof makeExecutables>,
  attach: ReturnType<typeof makeAttachments> = uncachedAttachments,
): Effect.Effect<RuntimeState, DurabilityFailure> =>
  Effect.gen(function* () {
    if (Object.keys(persisted).length === 0) return local
    const { version } = yield* Schema.decodeUnknownEffect(Schema.Struct({ version: Schema.Int }))(persisted).pipe(
      Effect.mapError(corruptionFailure),
    )
    if (version !== 1)
      return yield* DurabilityFailure.make({
        reason: "unsupported-version",
        message: `Unsupported runtime state version ${version}`,
      })
    const envelope = yield* Schema.decodeUnknownEffect(Envelope)(persisted, strict).pipe(
      Effect.mapError(corruptionFailure),
    )
    const restored = yield* Effect.try({ try: () => restoreValue(envelope.data), catch: corruptionFailure })
    const decoded = yield* Schema.decodeEffect(schema)(restored, strict).pipe(Effect.mapError(corruptionFailure))
    const canonical = copy(yield* Effect.try({ try: () => executables.decode(decoded), catch: corruptionFailure }))
    yield* Effect.try({
      try: () => {
        for (const session of canonical.sessions.values()) validateSession(session)
      },
      catch: corruptionFailure,
    })
    return attachState(canonical, local, attach)
  })

export const decode = Function.dual<
  (local: RuntimeState) => (persisted: State) => Effect.Effect<RuntimeState, DurabilityFailure>,
  (persisted: State, local: RuntimeState) => Effect.Effect<RuntimeState, DurabilityFailure>
>(
  2,
  (persisted: State, local: RuntimeState): Effect.Effect<RuntimeState, DurabilityFailure> =>
    decodeWith(persisted, local, RuntimeSchema, restore, Function.identity, makeExecutables()),
)
const object = (value: Schema.Json): value is State => Predicate.isObject(value) && !Array.isArray(value)
const array = (value: Schema.Json): value is ReadonlyArray<Schema.Json> => Array.isArray(value)
const equal = (left: Schema.Json, right: Schema.Json): boolean => {
  if (left === right) return true
  if (array(left) && array(right))
    return left.length === right.length && left.every((value, i) => equal(value, right[i]!))
  if (!object(left) || !object(right)) return false
  const keys = Object.keys(left)
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && equal(left[key]!, right[key]!))
  )
}

/** Only changed leaves are emitted; patch payloads share the already encoded next state. */
export const diff = Function.dual<
  (next: State) => (previous: State) => readonly Patch[],
  (previous: State, next: State) => readonly Patch[]
>(2, (previous: State, next: State): readonly Patch[] => diffStates(previous, next))

const diffStates = (previous: State, next: State, unchanged?: WeakMap<object, WeakSet<object>>): readonly Patch[] => {
  const patches: Array<Patch> = []
  const matching = (before: State, after: State) => {
    if (unchanged === undefined || !isImmutable(before) || !isImmutable(after)) return undefined
    const matches = unchanged.get(before) ?? new WeakSet<object>()
    unchanged.set(before, matches)
    return matches
  }
  const visit = (before: State, after: State, path: ReadonlyArray<string>): void => {
    const matches = matching(before, after)
    if (matches?.has(after) === true) return
    const count = patches.length
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
    if (patches.length === count) matches?.add(after)
  }
  visit(previous, next, [])
  return patches
}

export const make = () => {
  const originals = new WeakMap<object, object>()
  const projection = makeProjection({ originals, diff: diffStates })
  const attach = makeAttachments(originals)
  const copy = detach()
  const hostCopy = detach()
  const hostAttach = makeAttachments(new WeakMap())
  let installed: { readonly source: HydratedState; readonly view: HydratedState } | undefined
  const executables = makeExecutables(originals)
  let seed: State | undefined
  let current: { readonly source: State; readonly state: HydratedState; readonly canonical: CanonicalState } | undefined
  const sessions = new WeakMap<
    RuntimeSession["entries"],
    { readonly order: RuntimeSession["order"]; readonly leaf: RuntimeSession["leaf"] }
  >()
  const validateSessions = (state: Pick<RuntimeState, "sessions">) => {
    if (state.sessions === current?.state.sessions) return
    for (const session of state.sessions.values()) {
      const previous = sessions.get(session.entries)
      if (previous?.order === session.order && previous.leaf === session.leaf) continue
      validateSession(session)
      sessions.set(session.entries, { order: session.order, leaf: session.leaf })
    }
  }
  const canonical = (persisted: State, local: RuntimeState) =>
    Effect.gen(function* () {
      const source = Object.keys(persisted).length === 0 ? (seed ?? (seed = freeze(yield* encode(local)))) : persisted
      if (current?.source === source && isImmutable(source)) return current
      const { version } = yield* Schema.decodeUnknownEffect(Schema.Struct({ version: Schema.Int }))(source).pipe(
        Effect.mapError(corruptionFailure),
      )
      if (version !== 1)
        return yield* DurabilityFailure.make({
          reason: "unsupported-version",
          message: `Unsupported runtime state version ${version}`,
        })
      const decoded = yield* projection.decode(source).pipe(Effect.mapError(corruptionFailure))
      const state = yield* Effect.try({
        try: () => {
          const hydrated = executables.decode(decoded)
          validateSessions(hydrated)
          return hydrated
        },
        catch: corruptionFailure,
      })
      projection.accept()
      current = { source, state, canonical: decoded }
      return current
    })
  return {
    read: (persisted: State, local: RuntimeState) =>
      canonical(persisted, local).pipe(Effect.map(({ state }) => attachState(copy(state), local))),
    refresh: (persisted: State, local: RuntimeState) =>
      canonical(persisted, local).pipe(
        Effect.map(({ state }) => {
          const previous = installed?.source
          const view = { ...state }
          const changes: MutableChanges = {
            runs: [],
            sessions: [],
            artifacts: [],
          }
          const changedRows = (key: keyof HydratedState, ids: ReadonlyArray<string>) => {
            if (key === "runs")
              changes.runs.push(...ids.map((id) => ({ id, after: previous?.runs.get(id)?.lastSequence ?? -1 })))
            else if (key === "hostSessions")
              changes.sessions.push(
                ...ids.map((id) => ({ id, after: previous?.hostSessions.get(id)?.events.length ?? 0 })),
              )
            else if (key === "artifacts")
              changes.artifacts.push(
                ...ids.map((id) => ({ id, after: previous?.artifacts.get(id)?.updates.length ?? 0 })),
              )
          }
          for (const key of Record.keys(state)) {
            const field = state[key]
            if (Predicate.isNumber(field)) continue
            const before = previous?.[key]
            const retained = installed?.view[key]
            const projected = projectTable(
              field,
              Predicate.isNumber(before) ? undefined : before,
              Predicate.isNumber(retained) ? undefined : retained,
              hostCopy,
            )
            Reflect.set(view, key, projected.values)
            changedRows(key, projected.changed)
          }
          return {
            state: attachState(view, local, hostAttach),
            changes,
            accept: () => {
              installed = { source: state, view }
            },
          }
        }),
      ),
    prepare: <S extends Schema.Constraint & { readonly EncodingServices: never }, E, R>(
      persisted: State,
      local: RuntimeState,
      receiptSchema: S,
      transition: (state: RuntimeState) => Effect.Effect<readonly [S["Type"], RuntimeState], E, R>,
    ) =>
      Effect.gen(function* () {
        const base = yield* canonical(persisted, local)
        const state = attachState(base.state, local, attach)
        const [receipt, next] = yield* transition(state)
        const encoded = yield* Effect.try({
          try: () => executables.encode(next, { state, canonical: base.canonical }),
          catch: encodingFailure,
        })
        const prepared = yield* projection.encode(encoded, base.source).pipe(Effect.mapError(encodingFailure))
        yield* Effect.try({
          try: () => {
            executables.validate(prepared.state)
            validateSessions(prepared.state)
          },
          catch: encodingFailure,
        })
        let patches: ReadonlyArray<Patch> = prepared.patches
        if (Object.keys(persisted).length === 0)
          patches = diffStates(persisted, yield* apply(base.source, patches, "encoding"))
        return {
          receipt: freeze(yield* encodeCommandValue(receipt, receiptSchema)),
          patches,
        }
      }),
  }
}

/** Encode typed command inputs and receipts through their domain codecs.
 * Structural inspection fields and native Error stacks are not wire fields.
 * Persisted values are always decoded strictly; this is not an old-format reader.
 */
export const encodeCommandValue = Function.dual<
  <S extends Schema.Constraint & { readonly EncodingServices: never }>(
    schema: S,
  ) => (value: S["Type"]) => Effect.Effect<Schema.Json, DurabilityFailure>,
  <S extends Schema.Constraint & { readonly EncodingServices: never }>(
    value: S["Type"],
    schema: S,
  ) => Effect.Effect<Schema.Json, DurabilityFailure>
>(
  2,
  <S extends Schema.Constraint & { readonly EncodingServices: never }>(
    value: S["Type"],
    schema: S,
  ): Effect.Effect<Schema.Json, DurabilityFailure> =>
    Effect.gen(function* () {
      const encoded = yield* Schema.encodeEffect(schema)(value).pipe(Effect.mapError(encodingFailure))
      const normalized = yield* Effect.try({ try: () => normalize(encoded), catch: encodingFailure })
      return yield* Schema.decodeEffect(Value)(normalized, strict).pipe(Effect.mapError(encodingFailure))
    }),
)
export const decodeReceipt = Function.dual<
  <S extends Schema.Constraint & { readonly DecodingServices: never }>(
    schema: S,
  ) => (value: Schema.Json) => Effect.Effect<S["Type"], DurabilityFailure>,
  <S extends Schema.Constraint & { readonly DecodingServices: never }>(
    value: Schema.Json,
    schema: S,
  ) => Effect.Effect<S["Type"], DurabilityFailure>
>(
  2,
  <S extends Schema.Constraint & { readonly DecodingServices: never }>(
    value: Schema.Json,
    schema: S,
  ): Effect.Effect<S["Type"], DurabilityFailure> =>
    Effect.gen(function* () {
      const normalized = yield* Schema.decodeUnknownEffect(Value)(value, strict).pipe(
        Effect.mapError(corruptionFailure),
      )
      const restored = yield* Effect.try({ try: () => restore(normalized), catch: corruptionFailure })
      return yield* Schema.decodeEffect(schema)(restored, strict).pipe(Effect.mapError(corruptionFailure))
    }),
)
