import { make as makeRecovery } from "./journal-recovery.js"
import { make as makeStorage, transport, ownReceipt, type Loaded } from "./journal-storage.js"
import { canonicalize } from "../../core/durable/canonical-json.js"
import { Crypto, Effect, Result } from "effect"
import { DurabilityFailure } from "../errors.js"
import { ObjectStore, type ObjectStoreFailure } from "../object-store.js"
import {
  Command,
  Commit,
  Transition,
  apply,
  bytes,
  decode,
  failure,
  freeze,
  nextSequence,
  sequenceName,
  set,
  type Json,
  type Patch,
  type Receipt,
  type State,
} from "./protocol.js"
import { probe } from "./probe.js"
import { Identity, ensure } from "./discovery-marker.js"

export type { Json, Patch, State } from "./protocol.js"
export const defaultMaxStateBytes = 16 * 1024 * 1024
export const defaultMaxCommitBytes = 1024 * 1024
export const defaultMaxReplayBytes = 16 * 1024 * 1024
export const snapshotByteLimit = (input: { readonly maxStateBytes: number; readonly maxCommitBytes: number }): number =>
  input.maxStateBytes + input.maxCommitBytes + 4096
export interface Head {
  readonly sequence: string
  readonly digest: string
  /** SHA-256 of canonical logical state, independent from command and receipt history. */
  readonly stateDigest: string
  readonly state: State
}
export interface Options {
  readonly environment: string
  readonly tenant: string
  readonly partition: string
  readonly maxStateBytes?: number
  readonly maxCommitBytes?: number
  readonly snapshotEvery?: number
  readonly maxReplayBytes?: number
  /** Number of deterministic reevaluations after a competing command wins; zero disables retries. */
  readonly maxConflictRetries?: number
}
export interface Journal {
  readonly head: Effect.Effect<Omit<Head, "stateDigest">, DurabilityFailure>
  readonly read: Effect.Effect<Head, DurabilityFailure>
  /** Read one retained command receipt from canonical storage without mutating the journal. */
  readonly lookupReceipt: (commandId: string) => Effect.Effect<Receipt | undefined, DurabilityFailure>
  readonly commit: <E>(
    command: { readonly id: string; readonly input: Json },
    evaluate: (state: State) => Effect.Effect<
      {
        readonly patches: ReadonlyArray<Patch>
        readonly receipt: Json
      },
      E
    >,
  ) => Effect.Effect<Json, E | DurabilityFailure>
  readonly commitWithHead: <E>(
    command: typeof Command.Type,
    evaluate: (state: State) => Effect.Effect<typeof Transition.Type & { readonly reserveBytes?: number }, E>,
  ) => Effect.Effect<{ readonly receipt: Json; readonly head: Omit<Head, "stateDigest"> }, E | DurabilityFailure>
}

/**
 * One object-backed serialization protocol. No process-local lock or head hint is authoritative.
 * All committed slots and receipts are retained; bucket lifecycle deletion of this prefix is unsafe.
 * The callback is a deterministic reducer, never a place to perform external effects.
 */
export const make = (options: Options): Effect.Effect<Journal, DurabilityFailure, ObjectStore | Crypto.Crypto> =>
  Effect.gen(function* () {
    const store = yield* ObjectStore
    const crypto = yield* Crypto.Crypto
    if (
      !store.capabilities.conditionalCreate ||
      !store.capabilities.strongReadAfterWrite ||
      !store.capabilities.consistentListing
    ) {
      return yield* failure({
        reason: "configuration",
        message: "The provider does not satisfy the canonical object-store contract",
      })
    }
    const maxStateBytes = options.maxStateBytes ?? defaultMaxStateBytes
    const maxCommitBytes = options.maxCommitBytes ?? defaultMaxCommitBytes
    const maxSnapshotBytes = snapshotByteLimit({ maxStateBytes, maxCommitBytes })
    const snapshotEvery = options.snapshotEvery ?? 128
    const maxReplayBytes = options.maxReplayBytes ?? defaultMaxReplayBytes
    const maxConflictRetries = options.maxConflictRetries ?? 64
    for (const [name, value] of Object.entries({
      maxStateBytes,
      maxCommitBytes,
      maxSnapshotBytes,
      snapshotEvery,
      maxReplayBytes,
    })) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        return yield* failure({ reason: "configuration", message: `${name} must be a positive safe integer` })
      }
    }
    if (!Number.isSafeInteger(maxConflictRetries) || maxConflictRetries < 0) {
      return yield* failure({
        reason: "configuration",
        message: "maxConflictRetries must be a nonnegative safe integer",
      })
    }
    const identity = yield* decode(
      Identity,
      { environment: options.environment, tenant: options.tenant, partition: options.partition },
      "configuration",
    )
    const prefix = yield* Effect.try({
      try: () => {
        for (const value of Object.values(identity)) {
          if (value.length === 0) throw new Error("Partition identity components must be nonempty")
        }
        const encodeComponent = (value: string) => encodeURIComponent(value).replaceAll(".", "%2E")
        return `environments/${encodeComponent(identity.environment)}/v1/tenants/${encodeComponent(identity.tenant)}/partitions/${encodeComponent(identity.partition)}/`
      },
      catch: (cause) => failure({ reason: "configuration", message: String(cause) }),
    })
    let probed = false
    const commitsPrefix = `${prefix}commits/`
    const snapshotsPrefix = `${prefix}snapshots/`
    const commitKey = (sequence: string) => `${commitsPrefix}${sequenceName(sequence)}.json`
    const storage = makeStorage({ store, crypto, identity, commitsPrefix, maxStateBytes, maxCommitBytes })
    const { hash, sealCommit, readCommit, checkState, append } = storage
    const { load, publishSnapshot, remember } = makeRecovery({
      storage,
      store,
      identity,
      commitsPrefix,
      snapshotsPrefix,
      snapshotEvery,
      maxReplayBytes,
      maxSnapshotBytes,
    })
    const receiptFor = (loaded: Loaded, id: string, inputDigest: string) =>
      Effect.gen(function* () {
        const prior = ownReceipt(loaded, id)
        if (prior !== undefined && prior.inputDigest !== inputDigest) {
          return yield* failure({
            reason: "input-conflict",
            message: "The command identity already committed with different input",
            commandId: id,
          })
        }
        return prior
      })
    const reconcile = (
      key: string,
      outcome: Result.Result<"created" | "conflict", ObjectStoreFailure>,
      commandId: string,
    ) =>
      Effect.gen(function* () {
        const reconciled = yield* Effect.result(store.read(key, { maxBytes: maxCommitBytes }))
        if (Result.isFailure(reconciled) || reconciled.success === undefined) {
          let cause
          if (Result.isFailure(reconciled)) cause = reconciled.failure
          else if (Result.isFailure(outcome)) cause = outcome.failure
          const fields = {
            reason: "indeterminate" as const,
            message:
              "The attempted commit could not be resolved by direct read; retry this command identity before external execution",
            key,
            commandId,
          }
          if (cause !== undefined) Object.assign(fields, { cause })
          return yield* DurabilityFailure.make(fields)
        }
        return reconciled.success
      })
    const snapshotIfDue = (loaded: Loaded) =>
      Effect.gen(function* () {
        if (loaded.replayRecords >= snapshotEvery || loaded.replayBytes >= maxReplayBytes) {
          yield* Effect.result(publishSnapshot(loaded))
        }
      })
    const committedResult = (loaded: Loaded, receipt: Json) => freeze({ receipt, head: { ...loaded.head } })
    const commitWithHead: Journal["commitWithHead"] = (command, evaluate) =>
      Effect.gen(function* () {
        const validated = yield* decode(Command, command, "encoding")
        const inputDigest = yield* hash(yield* bytes(validated.input))
        let loaded = yield* load
        let conflicts = 0
        while (true) {
          const prior = yield* receiptFor(loaded, validated.id, inputDigest)
          if (prior !== undefined) return committedResult(loaded, prior.receipt)
          if (loaded.head.sequence === "-1") {
            yield* ensure(identity).pipe(Effect.provideService(ObjectStore, store))
          }
          if (!probed) {
            yield* probe(store, `${prefix}diagnostics`).pipe(Effect.mapError(transport))
            probed = true
          }
          // Failed post-commit snapshot publication cannot make an acknowledged command fail.
          // Before extending that head, however, publish its recovery boundary successfully.
          if (loaded.replayRecords >= snapshotEvery) {
            yield* publishSnapshot(loaded)
            loaded = Object.assign({}, loaded, { replayRecords: 0, replayBytes: 0 })
          }
          const evaluated = yield* evaluate(loaded.head.state)
          const decoded = yield* decode(
            Transition,
            { patches: evaluated.patches, receipt: evaluated.receipt },
            "encoding",
          )
          // Detach the reducer's output: later user mutation must not change attempted bytes or receipts.
          const transition = yield* decode(
            Transition,
            yield* Effect.try({
              try: () => canonicalize(decoded),
              catch: (cause) =>
                failure({ reason: "encoding", message: `Cannot detach canonical transition: ${String(cause)}` }),
            }),
            "encoding",
          )
          freeze(transition)
          const state = yield* apply(loaded.head.state, transition.patches, "encoding")
          const sequence = nextSequence(loaded.head.sequence)
          const record: Commit = {
            version: 1,
            kind: "commit",
            ...identity,
            sequence,
            parentDigest: loaded.head.digest,
            command: { id: validated.id, inputDigest },
            patches: transition.patches,
            receipt: transition.receipt,
          }
          const receipts = yield* set(
            loaded.receipts,
            validated.id,
            freeze({ inputDigest, sequence, receipt: transition.receipt }),
          )
          yield* checkState(state, receipts, evaluated.reserveBytes ?? 0)
          const sealed = yield* sealCommit(record)
          const key = commitKey(sequence)
          if (sealed.bytes.length > maxCommitBytes || sealed.bytes.length > maxReplayBytes) {
            return yield* failure({
              reason: "limit",
              message: "Commit exceeds the configured commit or replay byte limit",
              key,
              commandId: validated.id,
            })
          }
          if (loaded.replayBytes + sealed.bytes.length > maxReplayBytes) {
            yield* publishSnapshot(loaded)
            loaded = Object.assign({}, loaded, { replayRecords: 0, replayBytes: 0 })
          }
          const outcome = yield* Effect.result(store.create(key, sealed.bytes))
          if (Result.isSuccess(outcome) && outcome.success === "created") {
            sealed.accept()
            const committed: Loaded = {
              ...loaded,
              head: { sequence, digest: sealed.digest, state },
              receipts,
              replayRecords: loaded.replayRecords + 1,
              replayBytes: loaded.replayBytes + sealed.bytes.length,
            }
            yield* snapshotIfDue(committed)
            remember(committed)
            return committedResult(committed, transition.receipt)
          }
          // A failed PUT can have committed. A direct read of the exact attempted slot is the only
          // reconciliation evidence; do not issue another PUT when that evidence is unavailable.
          const reconciled = yield* reconcile(key, outcome, validated.id)
          const winner = yield* readCommit(sequence, reconciled)
          const advanced = yield* append(loaded, winner)
          remember(advanced)
          const receipt = yield* receiptFor(advanced, validated.id, inputDigest)
          if (receipt !== undefined) {
            yield* snapshotIfDue(advanced)
            return committedResult(advanced, receipt.receipt)
          }
          if (conflicts >= maxConflictRetries) {
            return yield* failure({
              reason: "contention",
              message: `The command exhausted ${maxConflictRetries} conflict retries`,
              key,
              commandId: validated.id,
            })
          }
          conflicts += 1
          // The winner proves this attempt did not commit. Reload all intervening winners and invoke
          // only the deterministic reducer again; never replay an external operation here.
          yield* Effect.yieldNow
          loaded = yield* load
        }
      }).pipe(Effect.scoped)
    const commit: Journal["commit"] = (command, evaluate) =>
      commitWithHead(command, evaluate).pipe(Effect.map((result) => result.receipt))
    let hashedState: { readonly state: State; readonly digest: string } | undefined
    return {
      head: load.pipe(
        Effect.map((loaded) => Object.freeze({ ...loaded.head })),
        Effect.scoped,
      ),
      read: load.pipe(
        Effect.flatMap((loaded) =>
          Effect.gen(function* () {
            const current =
              hashedState?.state === loaded.head.state
                ? hashedState
                : {
                    state: loaded.head.state,
                    digest: yield* hash(yield* bytes(loaded.head.state)),
                  }
            hashedState = current
            return Object.freeze({ ...loaded.head, stateDigest: current.digest })
          }),
        ),
        Effect.scoped,
      ),
      commit,
      commitWithHead,
      lookupReceipt: (commandId: string) => load.pipe(Effect.map((loaded) => ownReceipt(loaded, commandId))),
    }
  }).pipe(Effect.scoped)
