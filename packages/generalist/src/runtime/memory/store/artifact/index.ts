import { Effect, Queue, Stream, SynchronizedRef } from "effect"
import {
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
import type { Service as RunStoreService } from "../../../run/store.js"
import type { ArtifactPublication, MemoryState, StoredArtifact } from "../../state.js"

const missing = (artifact: string) => ArtifactNotFound.make({ artifact })
const artifactMapKey = (artifact: string, branch?: string): string => `${artifact}\0${branch ?? ""}`

const requireStored = (
  state: MemoryState,
  artifact: string,
  branch?: string,
): Effect.Effect<StoredArtifact, ArtifactNotFound | RuntimeUnavailable> => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const stored = state.artifacts.get(artifactMapKey(artifact, branch))
  return stored === undefined ? Effect.fail(missing(artifact)) : Effect.succeed(stored)
}

const ensureArtifact = (
  state: MemoryState,
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
  state: MemoryState,
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

const branchStored = (state: MemoryState, input: ArtifactAppend): Effect.Effect<StoredArtifact, ArtifactNotFound> => {
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

const forkArtifact = (state: MemoryState, input: ArtifactFork) =>
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

const append = (state: MemoryState, input: ArtifactAppend) =>
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
      update,
      { ...state, artifacts, artifactPublications: [...state.artifactPublications, publication] },
    ] as const
  })

const follow = (
  stateRef: SynchronizedRef.SynchronizedRef<MemoryState>,
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
export const publish = (input: { readonly state: MemoryState; readonly publication: ArtifactPublication }) =>
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

type ModifyState = <A, E>(
  transition: (state: MemoryState) => Effect.Effect<readonly [A, MemoryState], E>,
) => Effect.Effect<A, E | RuntimeUnavailable>

export const make = (input: {
  readonly stateRef: SynchronizedRef.SynchronizedRef<MemoryState>
  readonly modifyState: ModifyState
  readonly capacity: number
}): Pick<
  RunStoreService,
  | "ensureArtifact"
  | "artifactHead"
  | "artifactSnapshot"
  | "forkArtifact"
  | "appendArtifact"
  | "artifactUpdates"
  | "artifactRunIsFork"
> => ({
  ensureArtifact: (request) => input.modifyState((state) => ensureArtifact(state, request)),
  artifactHead: (request) =>
    SynchronizedRef.get(input.stateRef).pipe(
      Effect.flatMap((state) => requireStored(state, request.artifact, request.branch)),
      Effect.map((stored) => stored.head),
    ),
  artifactSnapshot: (request) =>
    SynchronizedRef.get(input.stateRef).pipe(Effect.flatMap((state) => snapshot(state, request))),
  forkArtifact: (request) => input.modifyState((state) => forkArtifact(state, request)),
  appendArtifact: (request) => input.modifyState((state) => append(state, request)),
  artifactUpdates: (request) => follow(input.stateRef, request, input.capacity),
  artifactRunIsFork: (runId) =>
    SynchronizedRef.get(input.stateRef).pipe(
      Effect.flatMap((state) => {
        const run = state.runs.get(runId)
        return run === undefined
          ? Effect.fail(RunNotFound.make({ runId }))
          : Effect.succeed(run.forkedFrom !== undefined)
      }),
    ),
})
