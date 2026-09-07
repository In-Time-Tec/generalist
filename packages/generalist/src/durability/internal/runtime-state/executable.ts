import { Schema } from "effect"
import { validateRef } from "../../../core/durable/manifest/executable-manifest.js"
import { ExecutableRef, type ExecutableManifest, type PinnedExecutable } from "../../../runtime/executable/manifest.js"
import type { ExecutionCheckpoint } from "../../../runtime/execution/state.js"
import type { IdempotencyEntry, RuntimeState, StoredRun } from "../../../runtime/state/projection.js"
import type { CanonicalRun, CanonicalState, HydratedState } from "./schema.js"
import { mapValues } from "./cache.js"

type Catalog = ReadonlyMap<string, ExecutableManifest>
type CanonicalIdempotency = CanonicalState["idempotency"] extends ReadonlyMap<string, infer A> ? A : never
type EncodingBase = { readonly state: RuntimeState; readonly canonical: CanonicalState }

const changedValues = <A>(
  next: ReadonlyMap<string, A>,
  previous: ReadonlyMap<string, A> | undefined,
  visit: (value: A, key: string) => void,
) => {
  if (next === previous) return
  for (const [key, value] of next) if (previous?.get(key) !== value) visit(value, key)
}

export const make = (originals = new WeakMap<object, object>()) => {
  const encodeRuns = mapValues<string, StoredRun, CanonicalRun>()
  const encodeIdempotency = mapValues<string, IdempotencyEntry, CanonicalIdempotency>()
  const encodeAddresses = mapValues<string, PinnedExecutable, ExecutableRef>()
  const decodeRuns = mapValues<string, CanonicalRun, Omit<StoredRun, "subscribers">>()
  const decodeIdempotency = mapValues<string, CanonicalIdempotency, IdempotencyEntry>()
  const decodeAddresses = mapValues<string, ExecutableRef, PinnedExecutable>()
  const verified = new WeakMap<ExecutableManifest, { readonly pin: string; readonly targets: ReadonlySet<string> }>()
  const verify = (pin: string, manifest: ExecutableManifest, cacheable = true) => {
    const previous = cacheable ? verified.get(manifest) : undefined
    if (previous?.pin === pin) return previous.targets
    const ref = Schema.decodeSync(ExecutableRef)({ executable: pin, active: manifest.root })
    validateRef(ref, manifest)
    const targets = new Set(manifest.entries.map((entry) => entry.pin))
    if (cacheable) verified.set(manifest, { pin, targets })
    return targets
  }
  const contexts = new WeakMap<Catalog, (ref: ExecutableRef) => ExecutableManifest>()
  const context = (catalog: Catalog, cacheable = true) => {
    const existing = cacheable ? contexts.get(catalog) : undefined
    if (existing !== undefined) return existing
    const targets = new Map<string, ReadonlySet<string>>()
    for (const [pin, manifest] of catalog) targets.set(pin, verify(pin, manifest, cacheable))
    const resolve = (ref: ExecutableRef): ExecutableManifest => {
      const manifest = catalog.get(ref.executable)
      if (manifest === undefined) throw new Error(`Executable catalog is missing ${ref.executable}`)
      if (targets.get(ref.executable)?.has(ref.active) !== true) {
        throw new Error(`Active executable ${ref.active} is outside ${ref.executable}`)
      }
      return manifest
    }
    if (cacheable) contexts.set(catalog, resolve)
    return resolve
  }
  const checked = new WeakMap<object, Catalog>()
  const validateCheckpoint = (
    checkpoint: ExecutionCheckpoint | undefined,
    resolve: ReturnType<typeof context>,
    executable?: string,
  ) => {
    if (checkpoint === undefined || !("driverVersion" in checkpoint) || checkpoint.executable === undefined) return
    resolve(checkpoint.executable)
    if (executable !== undefined && checkpoint.executable.executable !== executable) {
      throw new Error("Checkpoint executable does not match its Run closure")
    }
  }
  const validateRun = (run: CanonicalRun, catalog: Catalog, resolve: ReturnType<typeof context>) => {
    if (checked.get(run) === catalog) return
    resolve(run.executableRef)
    validateCheckpoint(run.checkpoint, resolve, run.executableRef.executable)
    for (const checkpoint of run.checkpoints.values())
      validateCheckpoint(checkpoint, resolve, run.executableRef.executable)
    for (const event of run.events) {
      resolve(event.executableRef)
      if (event.executableRef.executable !== run.executableRef.executable) {
        throw new Error("Retained event executable does not match its Run closure")
      }
    }
    checked.set(run, catalog)
  }
  let validated: CanonicalState | undefined
  let receiptsByRun = new Map<string, Set<string>>()
  const indexReceipts = (entries: CanonicalState["idempotency"]) => {
    let receiptIndex = receiptsByRun
    if (entries !== validated?.idempotency) {
      receiptIndex = new Map(receiptsByRun)
      for (const [key, entry] of validated?.idempotency ?? []) {
        if (entries.get(key) === entry) continue
        const keys = new Set(receiptIndex.get(entry.receipt.runId))
        keys.delete(key)
        if (keys.size === 0) receiptIndex.delete(entry.receipt.runId)
        else receiptIndex.set(entry.receipt.runId, keys)
      }
      changedValues(entries, validated?.idempotency, (entry, key) => {
        const keys = new Set(receiptIndex.get(entry.receipt.runId))
        keys.add(key)
        receiptIndex.set(entry.receipt.runId, keys)
      })
    }
    return receiptIndex
  }
  const validateReferences = (state: CanonicalState, resolve: ReturnType<typeof context>) => {
    const catalog = state.executableCatalog
    const previous = validated?.executableCatalog === catalog ? validated : undefined
    const affectedReceipts = new Set<string>()
    const receiptIndex = indexReceipts(state.idempotency)
    changedValues(state.runs, previous?.runs, (run, key) => {
      validateRun(run, catalog, resolve)
      if (previous?.runs.get(key)?.executableRef.executable !== run.executableRef.executable) {
        for (const receipt of receiptIndex.get(key) ?? []) affectedReceipts.add(receipt)
      }
    })
    changedValues(state.operations, previous?.operations, (operation) => {
      validateCheckpoint(operation.checkpoint, resolve)
      checked.set(operation, catalog)
    })
    changedValues(state.hostSessions, previous?.hostSessions, (session) => {
      for (const entry of session.events) if (entry._tag === "Run") resolve(entry.event.executableRef)
      checked.set(session, catalog)
    })
    changedValues(state.treeRoots, previous?.treeRoots, (root) => {
      for (const entry of root.events) resolve(entry.event.executableRef)
      checked.set(root, catalog)
    })
    const validateReceipt = (entry: CanonicalIdempotency) => {
      resolve(entry.executable)
      const run = state.runs.get(entry.receipt.runId)
      if (run !== undefined && run.executableRef.executable !== entry.executable.executable) {
        throw new Error("Idempotency executable does not match its Run closure")
      }
    }
    changedValues(state.idempotency, previous?.idempotency, validateReceipt)
    for (const key of affectedReceipts) {
      const entry = state.idempotency.get(key)
      if (entry !== undefined) validateReceipt(entry)
    }
    changedValues(state.addressBindings, previous?.addressBindings, resolve)
    receiptsByRun = receiptIndex
    validated = state
  }
  const encodedRuns = new WeakMap<object, CanonicalRun>()
  const encodedIdempotency = new WeakMap<IdempotencyEntry, CanonicalIdempotency>()
  const hydratedRuns = new WeakMap<CanonicalRun, Omit<StoredRun, "subscribers">>()
  const hydratedIdempotency = new WeakMap<CanonicalIdempotency, IdempotencyEntry>()
  const pinned = new WeakMap<ExecutableRef, PinnedExecutable>()
  const hydratePinned = (ref: ExecutableRef, resolve: ReturnType<typeof context>) => {
    const manifest = resolve(ref)
    const existing = pinned.get(ref)
    if (existing?.manifest === manifest) return existing
    const executable = { ref, manifest }
    pinned.set(ref, executable)
    return executable
  }
  const collectCatalog = (state: RuntimeState, base: EncodingBase | undefined) => {
    const entries = new Map(state.executableCatalog)
    context(state.executableCatalog, state.executableCatalog === base?.canonical.executableCatalog)
    const add = (ref: ExecutableRef, manifest: ExecutableManifest) => {
      if (
        !verify(ref.executable, manifest, base?.canonical.executableCatalog.get(ref.executable) === manifest).has(
          ref.active,
        )
      ) {
        throw new Error(`Active executable ${ref.active} is outside ${ref.executable}`)
      }
      if (!entries.has(ref.executable)) entries.set(ref.executable, manifest)
    }
    const previous = base?.canonical.executableCatalog === state.executableCatalog ? base.state : undefined
    changedValues(state.runs, previous?.runs, (run) => add(run.executableRef, run.executableManifest))
    changedValues(state.idempotency, previous?.idempotency, (entry) =>
      add(entry.executable.ref, entry.executable.manifest),
    )
    changedValues(state.addressBindings, previous?.addressBindings, (executable) =>
      add(executable.ref, executable.manifest),
    )
    return entries.size === state.executableCatalog.size ? state.executableCatalog : entries
  }
  return {
    validate: (state: CanonicalState) => validateReferences(state, context(state.executableCatalog)),
    encode: (state: RuntimeState, base?: EncodingBase): CanonicalState => {
      const canonical: CanonicalState = {
        ...state,
        executableCatalog: collectCatalog(state, base),
        hostSessions:
          state.hostSessions === base?.state.hostSessions ? base.canonical.hostSessions : state.hostSessions,
        treeRoots: state.treeRoots === base?.state.treeRoots ? base.canonical.treeRoots : state.treeRoots,
        artifacts: state.artifacts === base?.state.artifacts ? base.canonical.artifacts : state.artifacts,
        runs:
          state.runs === base?.state.runs
            ? base.canonical.runs
            : encodeRuns(state.runs, (run, key) => {
                if (base?.state.runs.get(key) === run) return base.canonical.runs.get(key)!
                const previous = encodedRuns.get(run) ?? encodedRuns.get(originals.get(run) ?? run)
                if (previous !== undefined) return previous
                const { executableManifest: _manifest, subscribers: _subscribers, ...encoded } = run
                return encoded
              }),
        idempotency:
          state.idempotency === base?.state.idempotency
            ? base.canonical.idempotency
            : encodeIdempotency(state.idempotency, (entry, key) => {
                if (base?.state.idempotency.get(key) === entry) return base.canonical.idempotency.get(key)!
                const previous = encodedIdempotency.get(entry)
                if (previous !== undefined) return previous
                const encoded = { ...entry, executable: entry.executable.ref }
                return encoded
              }),
        addressBindings:
          state.addressBindings === base?.state.addressBindings
            ? base.canonical.addressBindings
            : encodeAddresses(state.addressBindings, (executable) => executable.ref),
        scheduleClaims:
          state.scheduleClaims === base?.state.scheduleClaims
            ? base.canonical.scheduleClaims
            : new Map(
                [...state.scheduleClaims].map(([key, claim]) => {
                  if (base?.state.scheduleClaims.get(key) === claim)
                    return [key, base.canonical.scheduleClaims.get(key)!] as const
                  const { ownerId, leaseExpiresAt, ...schedule } = claim
                  return [key, { schedule, ownerId, leaseExpiresAt }] as const
                }),
              ),
      }
      return canonical
    },
    decode: (state: CanonicalState): HydratedState => {
      const resolve = context(state.executableCatalog)
      validateReferences(state, resolve)
      return {
        ...state,
        runs: decodeRuns(
          state.runs,
          (run) => {
            const manifest = resolve(run.executableRef)
            const previous = hydratedRuns.get(run)
            if (previous?.executableManifest === manifest) return previous
            const hydrated = { ...run, executableManifest: manifest }
            encodedRuns.set(hydrated, run)
            hydratedRuns.set(run, hydrated)
            return hydrated
          },
          state.executableCatalog,
        ),
        idempotency: decodeIdempotency(
          state.idempotency,
          (entry) => {
            const executable = hydratePinned(entry.executable, resolve)
            const previous = hydratedIdempotency.get(entry)
            if (previous?.executable === executable) return previous
            const hydrated = { ...entry, executable }
            encodedIdempotency.set(hydrated, entry)
            hydratedIdempotency.set(entry, hydrated)
            return hydrated
          },
          state.executableCatalog,
        ),
        addressBindings: decodeAddresses(
          state.addressBindings,
          (ref) => hydratePinned(ref, resolve),
          state.executableCatalog,
        ),
      }
    },
  }
}
