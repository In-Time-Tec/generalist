import { expect, it } from "@effect/vitest"
import { Effect, SynchronizedRef } from "effect"
import { emptyState, type RuntimeState } from "../../../../../src/runtime/state/projection.js"
import { make } from "../../../../../src/runtime/state/store/host-session/index.js"
import type { HostSessionEvent } from "../../../../../src/runtime/session/host.js"

it.effect("bounds family event scans and continues through empty filtered pages", () =>
  Effect.gen(function* () {
    const initial = emptyState({ addressBindings: new Map(), subscriberQueueCapacity: 16 })
    const events: Array<HostSessionEvent> = Array.from({ length: 513 }, (_, cursor) => ({
      _tag: "Conversation",
      cursor,
      update: { previousLeafId: null, leafId: null, afterEntryId: null, entries: [] },
    }))
    const stateRef = yield* SynchronizedRef.make<RuntimeState>({
      ...initial,
      hostSessions: new Map([
        [
          "root",
          {
            session: { id: "root", createdAt: "2026-09-08T00:00:00.000Z", queue: [] },
            events,
            lastCursor: 512,
            subscribers: new Map(),
          },
        ],
      ]),
    })
    const store = make({
      stateRef,
      readState: SynchronizedRef.get(stateRef),
      modifyState: () => Effect.die("read-only"),
    })
    const first = yield* store.hostSessionFamily("root", { limit: 64 })
    expect(first).toEqual({ rootSessionId: "root", at: 512, sessions: [], nextBefore: 257 })
    const second = yield* store.hostSessionFamily("root", { at: first.at, before: first.nextBefore!, limit: 64 })
    expect(second).toEqual({ rootSessionId: "root", at: 512, sessions: [], nextBefore: 1 })
    expect(yield* store.hostSessionFamily("root", { at: first.at, before: second.nextBefore!, limit: 64 })).toEqual({
      rootSessionId: "root",
      at: 512,
      sessions: [],
      nextBefore: null,
    })
    for (const input of [
      { limit: 65 },
      { limit: 0 },
      { limit: 1, before: 1 },
      { limit: 1, at: 513 },
      { limit: 1, at: 2, before: 4 },
    ]) {
      expect(yield* store.hostSessionFamily("root", input).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/host/SessionPageInvalid",
      })
    }
    expect(yield* store.hostSessionFamily("missing", { limit: 1 }).pipe(Effect.flip)).toMatchObject({
      _tag: "generalist/host/SessionNotFound",
    })
  }),
)
