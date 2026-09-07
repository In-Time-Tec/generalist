import type { ModifyState } from "../../../../durability/internal/runtime.js"
import { DurabilityFailure } from "../../../../durability/errors.js"
import { artifactAppendCommandId, commands } from "../../../../durability/internal/runtime-command-admission.js"
import { decodeReceipt } from "../../../../durability/internal/runtime-state.js"
import { Effect, Queue, Schema, Stream, SynchronizedRef } from "effect"
import {
  ArtifactAppendReceipt,
  ArtifactCrdtMismatch,
  ArtifactNotFound,
  ArtifactSubscriberLagged,
  ArtifactVersionConflict,
  ArtifactVersionNotFound,
  type ArtifactAppend,
  type ArtifactFork,
  type ArtifactHead,
  type ArtifactUpdate,
} from "../../../../core/artifact.js"
import { RunNotFound, RuntimeUnavailable } from "../../../errors.js"
import type { Receipt as JournalReceipt } from "../../../../durability/internal/protocol.js"
import type { Service as RunStoreService } from "../../../run/store.js"
import type { ArtifactPublication, RuntimeState, StoredArtifact } from "../../projection.js"

const CommandReceipt = Schema.Struct({
  value: Schema.Json,
  observations: Schema.Struct({
    commandId: Schema.String,
    occurredAtMillis: Schema.Finite,
    occurredAt: Schema.String,
  }),
})

const missing = (artifact: string) => ArtifactNotFound.make({ artifact })
const artifactMapKey = (artifact: string, branch?: string): string => `${artifact}\0${branch ?? ""}`

const requireStored = (
  state: RuntimeState,
  artifact: string,
  branch?: string,
): Effect.Effect<StoredArtifact, ArtifactNotFound | RuntimeUnavailable> => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const stored = state.artifacts.get(artifactMapKey(artifact, branch))
  return stored === undefined ? Effect.fail(missing(artifact)) : Effect.succeed(stored)
}

const ensureArtifact = (
  state: RuntimeState,
  input: {
    readonly artifact: string
    readonly crdt: string
    readonly snapshot: import("../../../../media/ref.js").Ref
  },
) =>
  Effect.gen(function* () {
    const key = artifactMapKey(input.artifact)
    const existing = state.artifacts.get(key)
    if (existing !== undefined) {
      if (existing.head.crdt !== input.crdt) {
        return yield* ArtifactCrdtMismatch.make({
          artifact: input.artifact,
          expected: existing.head.crdt,
          actual: input.crdt,
        })
      }
      return [existing.head, state] as const
    }
    const head: ArtifactHead = {
      artifact: input.artifact,
      crdt: input.crdt,
      version: 0,
      snapshot: input.snapshot,
    }
    const artifacts = new Map(state.artifacts)
    artifacts.set(key, { head, baseVersion: 0, baseSnapshot: input.snapshot, updates: [], subscribers: new Map() })
    return [head, { ...state, artifacts }] as const
  })

const snapshot = (
  state: RuntimeState,
  input: { readonly artifact: string; readonly version: number; readonly branch?: string },
) =>
  Effect.gen(function* () {
    const stored = yield* requireStored(state, input.artifact, input.branch)
    if (input.version === stored.baseVersion) {
      return { ...stored.head, version: input.version, snapshot: stored.baseSnapshot }
    }
    const update = stored.updates.find((candidate) => candidate.result === input.version)
    if (update === undefined) {
      return yield* ArtifactVersionNotFound.make({
        artifact: input.artifact,
        version: input.version,
        ...(input.branch === undefined ? undefined : { branch: input.branch }),
      })
    }
    return { ...stored.head, version: update.result, snapshot: update.snapshot }
  })

const branchStored = (state: RuntimeState, input: ArtifactAppend): Effect.Effect<StoredArtifact, ArtifactNotFound> => {
  const existing = state.artifacts.get(artifactMapKey(input.artifact, input.branch))
  if (existing !== undefined) return Effect.succeed(existing)
  const source = input.source
  if (input.branch === undefined || source === undefined) return Effect.fail(missing(input.artifact))
  return Effect.succeed({
    head: {
      artifact: input.artifact,
      crdt: input.crdt,
      version: source.version,
      snapshot: source.snapshot,
      branch: input.branch,
    },
    baseVersion: source.version,
    baseSnapshot: source.snapshot,
    updates: [],
    subscribers: new Map(),
  })
}

const forkArtifact = (state: RuntimeState, input: ArtifactFork) =>
  Effect.gen(function* () {
    const main = yield* requireStored(state, input.artifact)
    if (main.head.crdt !== input.crdt) {
      return yield* ArtifactCrdtMismatch.make({
        artifact: input.artifact,
        expected: main.head.crdt,
        actual: input.crdt,
      })
    }
    const key = artifactMapKey(input.artifact, input.branch)
    const existing = state.artifacts.get(key)
    if (existing !== undefined) return [existing.head, state] as const
    const source = yield* snapshot(state, {
      artifact: input.artifact,
      version: input.source.version,
      ...(input.source.branch === undefined ? undefined : { branch: input.source.branch }),
    })
    const stored: StoredArtifact = {
      head: {
        artifact: input.artifact,
        crdt: input.crdt,
        version: source.version,
        snapshot: source.snapshot,
        branch: input.branch,
      },
      baseVersion: source.version,
      baseSnapshot: source.snapshot,
      updates: [],
      subscribers: new Map(),
    }
    return [stored.head, { ...state, artifacts: new Map(state.artifacts).set(key, stored) }] as const
  })
const artifactAppendReceipt = (
  input: {
    readonly artifact: string
    readonly commandId: string
    readonly branch?: string
  },
  lookupReceipt: (commandId: string) => Effect.Effect<JournalReceipt | undefined, DurabilityFailure>,
) =>
  Effect.gen(function* () {
    const commandId = artifactAppendCommandId(input)
    const receipt = yield* lookupReceipt(commandId)
    if (receipt === undefined) return undefined
    const envelope = yield* Schema.decodeUnknownEffect(CommandReceipt, { onExcessProperty: "error" })(
      receipt.receipt,
    ).pipe(
      Effect.mapError((cause) =>
        DurabilityFailure.make({
          reason: "corruption",
          message: `Invalid Artifact command receipt envelope: ${String(cause)}`,
          commandId,
        }),
      ),
    )
    return yield* decodeReceipt(envelope.value, ArtifactAppendReceipt).pipe(
      Effect.mapError((cause) =>
        DurabilityFailure.make({
          reason: "corruption",
          message: `Invalid Artifact append receipt: ${cause.message}`,
          commandId,
        }),
      ),
    )
  })

const append = (state: RuntimeState, input: ArtifactAppend) =>
  Effect.gen(function* () {
    const main = yield* requireStored(state, input.artifact)
    if (main.head.crdt !== input.crdt) {
      return yield* ArtifactCrdtMismatch.make({
        artifact: input.artifact,
        expected: main.head.crdt,
        actual: input.crdt,
      })
    }
    const stored = yield* branchStored(state, input)
    if (stored.head.version !== input.expected) {
      return yield* ArtifactVersionConflict.make({
        artifact: input.artifact,
        expected: input.expected,
        actual: stored.head.version,
        ...(input.branch === undefined ? undefined : { branch: input.branch }),
      })
    }
    const result = input.expected + 1
    const update: ArtifactUpdate = {
      artifact: input.artifact,
      base: input.base,
      result,
      operation: input.operation,
      attribution: input.attribution,
      update: input.update,
      snapshot: input.snapshot,
      ...(input.branch === undefined ? undefined : { branch: input.branch }),
    }
    const key = artifactMapKey(input.artifact, input.branch)
    const next: StoredArtifact = {
      ...stored,
      head: { ...stored.head, version: result, snapshot: input.snapshot },
      updates: [...stored.updates, update],
    }
    const artifacts = new Map(state.artifacts).set(key, next)
    const publication: ArtifactPublication = { key, update, subscribers: stored.subscribers }
    return [
      { commandId: input.commandId, crdt: input.crdt, update },
      { ...state, artifacts, artifactPublications: [...state.artifactPublications, publication] },
    ] as const
  })

const follow = (
  stateRef: SynchronizedRef.SynchronizedRef<RuntimeState>,
  input: { readonly artifact: string; readonly version: number; readonly branch?: string },
  capacity: number,
) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const live = yield* Queue.dropping<ArtifactUpdate, ArtifactSubscriberLagged | RuntimeUnavailable>(capacity)
      const plan = yield* SynchronizedRef.modifyEffect(stateRef, (state) =>
        Effect.gen(function* () {
          const stored = yield* requireStored(state, input.artifact, input.branch)
          if (input.version < stored.baseVersion || input.version > stored.head.version) {
            return yield* ArtifactVersionNotFound.make({
              artifact: input.artifact,
              version: input.version,
              ...(input.branch === undefined ? undefined : { branch: input.branch }),
            })
          }
          const subscriberId = state.nextSubscriberId
          const subscribers = new Map(stored.subscribers).set(subscriberId, live)
          const key = artifactMapKey(input.artifact, input.branch)
          const artifacts = new Map(state.artifacts).set(key, { ...stored, subscribers })
          return [
            {
              replay: stored.updates.filter((update) => update.result > input.version),
              replayCutoff: stored.head.version,
              subscriberId,
              key,
            },
            { ...state, nextSubscriberId: subscriberId + 1, artifacts },
          ] as const
        }),
      )
      yield* Effect.addFinalizer(() =>
        SynchronizedRef.update(stateRef, (state) => {
          const stored = state.artifacts.get(plan.key)
          if (stored === undefined) return state
          const subscribers = new Map(stored.subscribers)
          subscribers.delete(plan.subscriberId)
          return { ...state, artifacts: new Map(state.artifacts).set(plan.key, { ...stored, subscribers }) }
        }).pipe(Effect.andThen(Queue.shutdown(live)), Effect.asVoid),
      )
      return Stream.concat(
        Stream.fromIterable(plan.replay),
        Stream.fromQueue(live).pipe(Stream.filter((update) => update.result > plan.replayCutoff)),
      )
    }),
  )

/** Publish one committed artifact update without blocking its producer. */
export const publish = (input: { readonly state: RuntimeState; readonly publication: ArtifactPublication }) =>
  Effect.gen(function* () {
    const artifacts = new Map(input.state.artifacts)
    let changed = false
    for (const [subscriberId, queue] of input.publication.subscribers) {
      const stored = artifacts.get(input.publication.key)
      if (stored?.subscribers.get(subscriberId) !== queue) continue
      if (yield* Queue.offer(queue, input.publication.update)) continue
      yield* Queue.fail(
        queue,
        ArtifactSubscriberLagged.make({
          artifact: input.publication.update.artifact,
          lastDeliveredVersion: input.publication.update.result - 1,
          ...(input.publication.update.branch === undefined ? undefined : { branch: input.publication.update.branch }),
        }),
      )
      const subscribers = new Map(stored.subscribers)
      subscribers.delete(subscriberId)
      artifacts.set(input.publication.key, { ...stored, subscribers })
      changed = true
    }
    return changed ? { ...input.state, artifacts } : input.state
  })

export const make = (input: {
  readonly stateRef: SynchronizedRef.SynchronizedRef<RuntimeState>
  readonly readState: Effect.Effect<RuntimeState, RuntimeUnavailable | DurabilityFailure>
  readonly modifyState: ModifyState
  readonly lookupReceipt: (commandId: string) => Effect.Effect<JournalReceipt | undefined, DurabilityFailure>
  readonly capacity: number
}): Pick<
  RunStoreService,
  | "ensureArtifact"
  | "artifactHead"
  | "artifactSnapshot"
  | "forkArtifact"
  | "appendArtifact"
  | "artifactAppendReceipt"
  | "artifactUpdates"
  | "artifactRunIsFork"
> => ({
  ensureArtifact: (request) =>
    input.modifyState(commands.ensureArtifact, [request], (state, [prepared]) => ensureArtifact(state, prepared)),
  artifactHead: (request) =>
    input.readState.pipe(
      Effect.flatMap((state) => requireStored(state, request.artifact, request.branch)),
      Effect.map((stored) => stored.head),
    ),
  artifactSnapshot: (request) => input.readState.pipe(Effect.flatMap((state) => snapshot(state, request))),
  forkArtifact: (request) =>
    input.modifyState(commands.forkArtifact, [request], (state, [prepared]) => forkArtifact(state, prepared)),
  appendArtifact: (request) =>
    input
      .modifyState(commands.appendArtifact, [request], (state, [prepared]) => append(state, prepared))
      .pipe(Effect.map((receipt) => receipt.update)),
  artifactAppendReceipt: (request) => artifactAppendReceipt(request, input.lookupReceipt),
  artifactUpdates: (request) =>
    Stream.unwrap(input.readState.pipe(Effect.as(follow(input.stateRef, request, input.capacity)))),
  artifactRunIsFork: (runId) =>
    input.readState.pipe(
      Effect.flatMap((state) => {
        const run = state.runs.get(runId)
        return run === undefined
          ? Effect.fail(RunNotFound.make({ runId }))
          : Effect.succeed(run.forkedFrom !== undefined)
      }),
    ),
})
