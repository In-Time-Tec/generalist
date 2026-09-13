import { BunCrypto } from "@effect/platform-bun"
import { expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { make as makeAgent } from "../../src/core/agent/service.js"
import { activate, layerRunStore } from "../../src/durability/index.js"
import { make as makeJournal } from "../../src/durability/internal/journal.js"
import {
  inspectionReadLimits,
  readOnlyRuntimeState,
} from "../../src/durability/internal/inspection/read-only-runtime.js"
import { decode, diff, encode } from "../../src/durability/internal/runtime-state.js"
import {
  ObjectStore,
  ObjectStoreFailure,
  type Service as ObjectStoreService,
} from "../../src/durability/object-store.js"
import { durableIdentity } from "../../src/runtime/executable/registered-agent.js"
import { Inspection, layer as inspectionLayer } from "../../src/runtime/inspection.js"
import { projectInspectionRun, projectInspectionSession } from "../../src/runtime/state/inspection/projection.js"
import { RunStore, type Service as RunStoreService } from "../../src/runtime/run/store.js"
import { emptyState, type RuntimeState } from "../../src/runtime/state/projection.js"
import { make as makeSimulator, type Client } from "../../src/testing/durability/index.js"

const namespace = { environment: "test", tenant: "inspection", partition: "primary" }
const revision = "inspection-revision"
const privateMarker = "INSPECTION_PRIVATE_EXECUTABLE_MARKER"
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))
const partitionPrefix = (partition: string) =>
  `environments/${namespace.environment}/v1/tenants/${namespace.tenant}/partitions/${partition}/`
const commitKey = (partition: string, sequence: number) =>
  `${partitionPrefix(partition)}commits/${String(sequence).padStart(20, "0")}.json`
const agent = makeAgent({ name: "inspected-agent", instructions: privateMarker })
const identity = durableIdentity(agent, [], revision)
const selection = {
  executableRef: identity.executable.ref,
  executableManifest: identity.executable.manifest,
  registrations: identity.registrations,
}

const openStore = (client: Client, partition: string, workerId: string) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      layerRunStore({ ...namespace, partition, workerId, addresses: [] }).pipe(
        Layer.provide(Layer.succeed(ObjectStore, client.store)),
        Layer.provide(BunCrypto.layer),
      ),
    )
    yield* activate.pipe(Effect.provide(context))
    return Context.get(context, RunStore)
  })

const addSession = (store: RunStoreService, sessionId: string) =>
  Effect.gen(function* () {
    yield* store.createHostSession({ id: sessionId, title: `Session ${sessionId}`, selection })
    yield* store.submitSessionInput({
      sessionId,
      commandId: `command:${sessionId}`,
      prompt: Prompt.make(`Prompt ${sessionId}`),
      selection,
    })
    const session = yield* store.hostSession(sessionId)
    if (session.activeRunId === undefined) return yield* Effect.die(`Session ${sessionId} has no active Run`)
    return session.activeRunId
  })

const inspectionService = (store: ObjectStoreService, partition = namespace.partition) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      inspectionLayer({
        namespace: { ...namespace, partition },
        storage: Layer.merge(BunCrypto.layer, Layer.succeed(ObjectStore, store)),
      }),
    )
    return Context.get(context, Inspection)
  })

const mutateRuntimeState = (
  store: ObjectStoreService,
  partition: string,
  commandId: string,
  mutate: (state: RuntimeState) => RuntimeState,
) =>
  Effect.gen(function* () {
    const crypto = yield* Layer.build(BunCrypto.layer)
    return yield* Effect.gen(function* () {
      const journal = yield* makeJournal({ ...namespace, partition, snapshotEvery: 8 })
      yield* journal.commit({ id: commandId, input: null }, (persisted) =>
        Effect.gen(function* () {
          const state = yield* decode(
            persisted,
            emptyState({ addressBindings: new Map(), subscriberQueueCapacity: 64 }),
          )
          const next = yield* encode(mutate(state))
          return { patches: diff(persisted, next), receipt: null }
        }),
      )
    }).pipe(Effect.provideService(ObjectStore, store), Effect.provide(crypto))
  })

const loadRuntimeState = (store: ObjectStoreService, partition: string) =>
  Effect.gen(function* () {
    const crypto = yield* Layer.build(BunCrypto.layer)
    return yield* readOnlyRuntimeState({ ...namespace, partition }).pipe(
      Effect.provideService(ObjectStore, store),
      Effect.provide(crypto),
    )
  })

it.effect("reconstructs bounded public views without writes, dispatch, or executable services", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const bucket = yield* makeSimulator({ pageSize: 1 })
      const writer = yield* openStore(bucket, namespace.partition, "inspection-writer")
      const runIds: Array<string> = []
      for (const sessionId of ["a", "b", "c"]) runIds.push(yield* addSession(writer, sessionId))

      const calls = { create: 0, read: 0, list: 0, dispatch: 0 }
      const observed: ObjectStoreService = {
        ...bucket.store,
        create: (key, bytes) => {
          calls.create += 1
          return bucket.store.create(key, bytes)
        },
        read: (key, options) => {
          calls.read += 1
          return bucket.store.read(key, options)
        },
        list: (prefix, options) => {
          calls.list += 1
          return bucket.store.list(prefix, options)
        },
      }
      const inspection = yield* inspectionService(observed)
      expect(calls).toEqual({ create: 0, read: 0, list: 0, dispatch: 0 })

      const partition = yield* inspection.partition
      expect(partition).toMatchObject({
        status: "committed",
        namespace,
        runCount: 3,
        sessionCount: 3,
      })
      if (partition.status !== "committed") return yield* Effect.die("Expected a committed partition")
      expect(partition.cursor).toBeTypeOf("string")
      const run = yield* inspection.run(runIds[0]!)
      expect(run).toMatchObject({
        runId: runIds[0],
        sessionId: "a",
        rootRunId: runIds[0],
        agent: agent.name,
        revision,
        status: "running",
        durability: "durable",
      })
      const sessionView = yield* inspection.session("a")
      expect(sessionView).toMatchObject({
        sessionId: "a",
        title: "Session a",
        lifecycle: "active",
        queuedInputs: 0,
        runCount: 1,
      })
      expect(Object.keys(run).toSorted()).toEqual([
        "agent",
        "budget",
        "children",
        "depth",
        "durability",
        "lastSequence",
        "revision",
        "rootRunId",
        "runId",
        "sessionId",
        "status",
        "turn",
        "usage",
        "waits",
      ])
      expect(Object.keys(sessionView).toSorted()).toEqual([
        "activeRunId",
        "createdAt",
        "lifecycle",
        "queuedInputs",
        "runCount",
        "sessionId",
        "title",
      ])

      const loaded = yield* loadRuntimeState(bucket.store, namespace.partition)
      if (loaded.state === undefined) return yield* Effect.die("Expected reconstructed runtime state")
      const internalRun = loaded.state.runs.get(runIds[0]!)!
      const runWithPrivateFields = {
        ...internalRun,
        ownerEpoch: 17,
        checkpointPath: `/private/${privateMarker}`,
        novelPrivateField: privateMarker,
      }
      expect(encodeJson(yield* projectInspectionRun(loaded.state, runWithPrivateFields))).not.toContain(privateMarker)
      const hostSessions = new Map(loaded.state.hostSessions)
      const internalSession = hostSessions.get("a")!
      const sessionWithPrivateFields = {
        ...internalSession.session,
        providerResourceRef: privateMarker,
        signedUrl: `https://storage.test/?signature=${privateMarker}`,
      }
      hostSessions.set("a", { ...internalSession, session: sessionWithPrivateFields })
      expect(encodeJson(yield* projectInspectionSession({ ...loaded.state, hostSessions }, "a"))).not.toContain(
        privateMarker,
      )
      const first = yield* inspection.sessions({ limit: 1 })
      expect(first.items.map((item) => item.sessionId)).toEqual(["a"])
      if (first.cursor === undefined) return yield* Effect.die("Expected a middle-page cursor")
      const middle = yield* inspection.sessions({ limit: 1, cursor: first.cursor })
      expect(middle.items.map((item) => item.sessionId)).toEqual(["b"])
      if (middle.cursor === undefined) return yield* Effect.die("Expected a final-page cursor")
      const final = yield* inspection.sessions({ limit: 1, cursor: middle.cursor })
      expect(final.items.map((item) => item.sessionId)).toEqual(["c"])
      expect(final.cursor).toBeUndefined()
      expect((yield* inspection.runs({ limit: 200 })).items).toHaveLength(3)

      expect(encodeJson({ run, session: yield* inspection.session("a") })).not.toContain(privateMarker)
      expect(calls.create).toBe(0)
      expect(calls.dispatch).toBe(0)
      expect(calls.read).toBeGreaterThan(0)
      expect(calls.list).toBeGreaterThan(0)
    }),
  ),
)

it.effect(
  "reads a valid compacted snapshot larger than 32 MiB without writes",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const bucket = yield* makeSimulator()
        const partition = "large-snapshot"
        const entryCount = 44
        const value = "x".repeat(1_000_000)
        const crypto = yield* Layer.build(BunCrypto.layer)
        yield* Effect.gen(function* () {
          const journal = yield* makeJournal({
            ...namespace,
            partition,
            maxStateBytes: inspectionReadLimits.stateBytes,
            maxReplayBytes: inspectionReadLimits.stateBytes,
            snapshotEvery: entryCount,
          })
          for (let index = 0; index < entryCount; index++) {
            const key = `large-${index}`
            const encodedKey = `s:${key}`
            yield* journal.commit({ id: `large-state:${index}`, input: null }, (persisted) => {
              if (index === 0) {
                const state = {
                  ...emptyState({ addressBindings: new Map(), subscriberQueueCapacity: 1 }),
                  agentNames: new Map([[key, value]]),
                }
                return encode(state).pipe(Effect.map((next) => ({ patches: diff(persisted, next), receipt: null })))
              }
              return Effect.succeed({
                patches: [
                  {
                    op: "set" as const,
                    path: ["data", "fields", "agentNames", "entries", encodedKey],
                    value,
                  },
                  {
                    op: "set" as const,
                    path: ["data", "fields", "agentNames", "order", String(index)],
                    value: encodedKey,
                  },
                  {
                    op: "set" as const,
                    path: ["data", "fields", "agentNames", "length"],
                    value: index + 1,
                  },
                ],
                receipt: null,
              })
            })
          }
        }).pipe(Effect.provideService(ObjectStore, bucket.store), Effect.provide(crypto))

        const snapshots = yield* bucket.store.list(`${partitionPrefix(partition)}snapshots/`)
        expect(snapshots.keys).toHaveLength(1)
        const snapshot = yield* bucket.store.read(snapshots.keys[0]!, {
          maxBytes: inspectionReadLimits.snapshotBytes,
        })
        if (snapshot === undefined) return yield* Effect.die("Expected compacted snapshot bytes")
        expect(snapshot.bytes.length).toBeGreaterThan(32 * 1024 * 1024)

        const calls = { create: 0, read: 0, list: 0, readBytes: 0 }
        const observed: ObjectStoreService = {
          ...bucket.store,
          create: (key, bytes) => {
            calls.create += 1
            return bucket.store.create(key, bytes)
          },
          read: (key, options) => {
            calls.read += 1
            return bucket.store.read(key, options).pipe(
              Effect.tap((object) =>
                Effect.sync(() => {
                  calls.readBytes += object?.bytes.length ?? 0
                }),
              ),
            )
          },
          list: (prefix, options) => {
            calls.list += 1
            return bucket.store.list(prefix, options)
          },
        }
        const inspection = yield* inspectionService(observed, partition)
        expect(yield* inspection.partition).toEqual({
          status: "committed",
          namespace: { ...namespace, partition },
          cursor: String(entryCount - 1),
          runCount: 0,
          sessionCount: 0,
        })
        expect(calls.create).toBe(0)
        expect(calls.readBytes).toBeGreaterThan(32 * 1024 * 1024)
        expect(calls.readBytes).toBeLessThanOrEqual(inspectionReadLimits.providerBytes)
      }),
    ),
  30_000,
)

it.effect("rejects malformed, foreign, future, expired, and invalid-limit pagination", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const writer = yield* openStore(bucket, namespace.partition, "cursor-writer")
      yield* addSession(writer, "a")
      yield* addSession(writer, "b")
      const inspection = yield* inspectionService(bucket.store)
      const first = yield* inspection.sessions({ limit: 1 })
      const cursor = first.cursor!

      expect(yield* inspection.sessions({ limit: 1, cursor: "%" }).pipe(Effect.flip)).toMatchObject({
        reason: "malformed",
      })
      const foreign = encodeURIComponent(
        encodeJson({
          version: 1,
          namespace: { ...namespace, tenant: "other" },
          collection: "sessions",
          sequence: "4",
          offset: 1,
        }),
      )
      expect(yield* inspection.sessions({ limit: 1, cursor: foreign }).pipe(Effect.flip)).toMatchObject({
        reason: "wrong-namespace",
      })
      const future = encodeURIComponent(
        encodeJson({ version: 1, namespace, collection: "sessions", sequence: "99", offset: 1 }),
      )
      expect(yield* inspection.sessions({ limit: 1, cursor: future }).pipe(Effect.flip)).toMatchObject({
        reason: "future",
      })
      yield* addSession(writer, "c")
      expect(yield* inspection.sessions({ limit: 1, cursor }).pipe(Effect.flip)).toMatchObject({ reason: "expired" })

      for (const limit of [0, 201, 1.5, Number.NaN]) {
        expect(yield* inspection.sessions({ limit }).pipe(Effect.flip)).toMatchObject({
          _tag: "generalist/inspection/InspectionLimitInvalid",
          minimum: 1,
          maximum: 200,
        })
      }
    }),
  ),
)

it.effect("fixes every service to its authorized namespace", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const primary = yield* openStore(bucket, namespace.partition, "primary-writer")
      const primaryRunId = yield* addSession(primary, "primary-session")
      const foreign = yield* openStore(bucket, "foreign", "foreign-writer")
      yield* addSession(foreign, "foreign-first")
      const foreignRunId = yield* addSession(foreign, "foreign-session")
      const inspection = yield* inspectionService(bucket.store)

      expect((yield* inspection.run(primaryRunId)).sessionId).toBe("primary-session")
      expect(yield* inspection.run(foreignRunId).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/inspection/RunNotFound",
      })
      expect(yield* inspection.session("foreign-session").pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/inspection/SessionNotFound",
      })
    }),
  ),
)

it.effect("bounds oversized objects and provider requests while classifying unavailable storage", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      let lists = 0
      const endless: ObjectStoreService = {
        ...bucket.store,
        list: () => {
          lists += 1
          return Effect.succeed({ keys: [], cursor: `page-${lists}` })
        },
      }
      const bounded = yield* inspectionService(endless)
      expect(yield* bounded.partition.pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/inspection/InspectionUnavailable",
        operation: "list",
      })
      expect(lists).toBe(4_096)

      const oversizedPartition = "oversized-snapshot"
      const snapshotKey = `${partitionPrefix(oversizedPartition)}snapshots/${"0".repeat(20)}-${"0".repeat(64)}.json`
      let snapshotReadLimit = 0
      let creates = 0
      const oversized: ObjectStoreService = {
        capabilities: bucket.store.capabilities,
        create: (key) => {
          creates += 1
          return Effect.fail(
            ObjectStoreFailure.make({
              operation: "create",
              key,
              reason: "unavailable",
              message: "inspection attempted a write",
            }),
          )
        },
        list: (prefix) =>
          Effect.succeed({
            keys: prefix.endsWith("commits/") ? [commitKey(oversizedPartition, 0)] : [snapshotKey],
          }),
        read: (key, options) => {
          snapshotReadLimit = options.maxBytes
          return Effect.fail(
            ObjectStoreFailure.make({
              operation: "read",
              key,
              reason: "limit",
              message: "fixture exceeds the requested finite object bound",
            }),
          )
        },
      }
      const oversizedInspection = yield* inspectionService(oversized, oversizedPartition)
      expect(yield* oversizedInspection.partition.pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/inspection/InspectionUnavailable",
        operation: "read",
      })
      expect(snapshotReadLimit).toBe(inspectionReadLimits.snapshotBytes)
      expect(Number.isSafeInteger(inspectionReadLimits.providerBytes)).toBe(true)
      expect(inspectionReadLimits.providerBytes).toBeGreaterThan(inspectionReadLimits.snapshotBytes)
      expect(creates).toBe(0)

      const unavailable: ObjectStoreService = {
        ...bucket.store,
        list: (prefix) =>
          Effect.fail(
            ObjectStoreFailure.make({
              operation: "list",
              key: prefix,
              reason: "unavailable",
              message: "fixture unavailable",
            }),
          ),
      }
      const failed = yield* inspectionService(unavailable)
      expect(yield* failed.partition.pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/inspection/InspectionUnavailable",
        operation: "list",
      })
    }),
  ),
)

it.effect("classifies digest, schema, ordering, and reference corruption", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()

      const digestPartition = "digest-corruption"
      const digestWriter = yield* openStore(bucket, digestPartition, "digest-writer")
      const digestRunId = yield* addSession(digestWriter, "digest-session")
      const key = commitKey(digestPartition, 1)
      const object = yield* bucket.store.read(key, { maxBytes: 2 * 1024 * 1024 })
      if (object === undefined) return yield* Effect.die(`Missing fixture commit ${key}`)
      const text = new TextDecoder().decode(object.bytes)
      const corrupted = new TextEncoder().encode(
        text.replace(/"digest":"[0-9a-f]{64}"/, `"digest":"${"0".repeat(64)}"`),
      )
      yield* bucket.faults.corrupt(key, corrupted)
      const digestInspection = yield* inspectionService(bucket.store, digestPartition)
      expect(yield* digestInspection.run(digestRunId).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/inspection/InspectionCorrupt",
        reason: "digest",
      })

      const schemaPartition = "schema-corruption"
      const crypto = yield* Layer.build(BunCrypto.layer)
      yield* Effect.gen(function* () {
        const journal = yield* makeJournal({ ...namespace, partition: schemaPartition, snapshotEvery: 8 })
        yield* journal.commit({ id: "schema-corruption", input: null }, () =>
          Effect.succeed({
            patches: [
              { op: "set" as const, path: ["version"], value: 1 },
              { op: "set" as const, path: ["unexpected"], value: true },
            ],
            receipt: null,
          }),
        )
      }).pipe(Effect.provideService(ObjectStore, bucket.store), Effect.provide(crypto))
      const schemaInspection = yield* inspectionService(bucket.store, schemaPartition)
      expect(yield* schemaInspection.run("run_missing").pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/inspection/InspectionCorrupt",
        reason: "schema",
      })

      const orderingPartition = "ordering-corruption"
      const orderingWriter = yield* openStore(bucket, orderingPartition, "ordering-writer")
      const orderingRunId = yield* addSession(orderingWriter, "ordering-session")
      yield* mutateRuntimeState(bucket.store, orderingPartition, "ordering-corruption", (state) => {
        const runs = new Map(state.runs)
        const run = runs.get(orderingRunId)!
        runs.set(orderingRunId, { ...run, lastSequence: run.lastSequence + 1 })
        return { ...state, runs }
      })
      const orderingInspection = yield* inspectionService(bucket.store, orderingPartition)
      expect(yield* orderingInspection.run(orderingRunId).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/inspection/InspectionCorrupt",
        reason: "ordering",
      })

      const referencePartition = "reference-corruption"
      const referenceWriter = yield* openStore(bucket, referencePartition, "reference-writer")
      const referenceRunId = yield* addSession(referenceWriter, "reference-session")
      yield* mutateRuntimeState(bucket.store, referencePartition, "reference-corruption", (state) => {
        const runs = new Map(state.runs)
        const run = runs.get(referenceRunId)!
        runs.set(referenceRunId, { ...run, children: ["run_missing"] })
        return { ...state, runs }
      })
      const referenceInspection = yield* inspectionService(bucket.store, referencePartition)
      expect(yield* referenceInspection.run(referenceRunId).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/inspection/InspectionCorrupt",
        reason: "reference",
      })
    }),
  ),
)
