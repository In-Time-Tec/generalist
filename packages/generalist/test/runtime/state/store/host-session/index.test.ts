import { expect, it } from "@effect/vitest"
import { Effect, SynchronizedRef } from "effect"
import { emptySession, emptyState, type RuntimeState } from "../../../../../src/runtime/state/projection.js"
import { make } from "../../../../../src/runtime/state/store/host-session/index.js"

it.effect("bounds canonical family traversal and excludes unrelated Sessions", () =>
  Effect.gen(function* () {
    const initial = emptyState({ addressBindings: new Map(), subscriberQueueCapacity: 16 })
    const hostSessions = new Map(initial.hostSessions)
    for (const id of ["root", "unrelated", ...Array.from({ length: 128 }, (_, index) => `child-${index}`)]) {
      hostSessions.set(id, {
        session: { id, createdAt: "2026-09-08T00:00:00.000Z", queue: [] },
        events: [],
        lastCursor: -1,
        subscribers: new Map(),
      })
    }
    const family = {
      rootSessionId: "root",
      parentSessionId: null,
      parentRunId: null,
      depth: 0,
      treePolicy: { maxDepth: 2, maxSessions: 256, concurrency: { agents: 1, tools: 1 } },
      budget: {},
      runIds: ["root-run"],
      childSessionIds: Array.from({ length: 127 }, (_, index) => `child-${index}`),
    }
    const state = { ...initial, hostSessions, sessions: new Map([["root", { ...emptySession(), family }]]) }
    const stateRef = yield* SynchronizedRef.make<RuntimeState>(state)
    const store = make({
      stateRef,
      readState: SynchronizedRef.get(stateRef),
      modifyState: () => Effect.die("read-only"),
    })
    const listed = yield* store.hostSessionFamily("root")
    expect(listed).toHaveLength(128)
    expect(listed.some((session) => session.id === "unrelated")).toBe(false)
    yield* SynchronizedRef.set(stateRef, {
      ...state,
      sessions: new Map([
        [
          "root",
          { ...emptySession(), family: { ...family, childSessionIds: [...family.childSessionIds, "child-127"] } },
        ],
      ]),
    })
    expect(yield* store.hostSessionFamily("root").pipe(Effect.flip)).toMatchObject({
      _tag: "generalist/host/SessionSnapshotTooLarge",
      limit: "sessions",
      maximum: 128,
    })
    expect(yield* store.hostSessionFamily("missing").pipe(Effect.flip)).toMatchObject({
      _tag: "generalist/host/SessionNotFound",
    })
  }),
)
