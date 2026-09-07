import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { freeze } from "../../../../src/durability/internal/protocol.js"
import { diff, encode } from "../../../../src/durability/internal/runtime-state.js"
import { make } from "../../../../src/durability/internal/runtime-state/executable.js"
import { make as makeProjection } from "../../../../src/durability/internal/runtime-state/projection.js"
import { emptyState } from "../../../../src/runtime/state/projection.js"

it.effect("restores canonical table identity for unchanged subscriber attachments", () =>
  Effect.gen(function* () {
    const local = emptyState({ addressBindings: new Map(), subscriberQueueCapacity: 8 })
    const projection = makeProjection({ originals: new WeakMap(), diff })
    const canonical = yield* projection.decode(freeze(yield* encode(local)))
    const executables = make()
    const attached = {
      ...local,
      hostSessions: new Map(local.hostSessions),
      treeRoots: new Map(local.treeRoots),
      artifacts: new Map(local.artifacts),
    }
    const unchanged = executables.encode(attached, { state: attached, canonical })
    for (const key of ["hostSessions", "treeRoots", "artifacts"] as const) {
      expect(attached[key]).not.toBe(canonical[key])
      expect(unchanged[key]).toBe(canonical[key])
    }
    const updated = {
      ...attached,
      hostSessions: new Map(attached.hostSessions),
      treeRoots: new Map(attached.treeRoots),
      artifacts: new Map(attached.artifacts),
    }
    const changed = executables.encode(updated, { state: attached, canonical })
    for (const key of ["hostSessions", "treeRoots", "artifacts"] as const) expect(changed[key]).toBe(updated[key])
  }),
)
