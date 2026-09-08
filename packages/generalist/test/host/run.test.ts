import { expect, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { Agent, Approvals, Permissions } from "generalist"
import { Generalist, type Host } from "generalist/host"
import { ExecutableResolver } from "generalist/runtime"
import { TestModel } from "generalist/testing"
import { SessionFamilyPage } from "../../src/runtime/session/retained.js"
import { makeObjectStorage, objectRuntimeLayer } from "../runtime/execution/object.js"

it.effect("pages more than 128 retained child Sessions across fresh Hosts without membership drift", () => {
  const storage = makeObjectStorage()
  const agent = Agent.make({ name: "paged-reviewer", children: ["paged-reviewer"] })
  const withHost = <A, E>(body: (host: Host<readonly [typeof agent]>) => Effect.Effect<A, E>) =>
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(
          Layer.mergeAll(
            objectRuntimeLayer({ addresses: [] }, storage).pipe(Layer.provide(ExecutableResolver.layerStatic([]))),
            TestModel.layer([]),
            Permissions.layerAllowAll,
            Approvals.layerAutoApprove,
          ),
        )
        return yield* Effect.gen(function* () {
          return yield* body(yield* Generalist.create({ agents: [agent] as const }))
        }).pipe(Effect.provide(context))
      }),
    )
  return Effect.gen(function* () {
    const admitted = yield* withHost((host) =>
      Effect.gen(function* () {
        const session = yield* host.sessions.create({ id: "paged-family-root" })
        const unrelated = yield* host.sessions.create({ id: "unrelated-family-root" })
        yield* host.runs.start(unrelated.id, agent, "Unrelated work")
        const parent = yield* host.runs.start(session.id, agent, "Coordinate")
        const ids = [session.id]
        for (let index = 0; index < 140; index++) {
          const child = yield* parent.spawn(agent.name, "Review", { commandId: `review-${index}` })
          ids.push(child.session.id)
        }
        const first = yield* host.sessions.family(ids[1]!, { limit: 17 })
        const after = yield* parent.spawn(agent.name, "New work", { commandId: "after-page" })
        return { ids, first, parentId: parent.id, laterId: after.session.id }
      }),
    )
    yield* withHost((host) =>
      Effect.gen(function* () {
        const found = admitted.first.sessions.map((session) => session.id)
        let before = admitted.first.nextBefore
        let pages = 1
        while (before !== null) {
          const page = yield* host.sessions.family("paged-family-root", { at: admitted.first.at, before, limit: 17 })
          expect(Schema.is(SessionFamilyPage)(page)).toBe(true)
          expect(page.sessions.length).toBeLessThanOrEqual(17)
          expect(page.at).toBe(admitted.first.at)
          expect(page.nextBefore === null || page.nextBefore < before).toBe(true)
          found.push(...page.sessions.map((session) => session.id))
          before = page.nextBefore
          pages++
        }
        expect(pages).toBeGreaterThan(8)
        expect(new Set(found).size).toBe(found.length)
        expect(found.toSorted()).toEqual(admitted.ids.toSorted())
        expect(found).not.toContain(admitted.laterId)
        const latest = yield* host.sessions.family("paged-family-root", { limit: 64 })
        expect(latest.sessions.map((session) => session.id)).toContain(admitted.laterId)
        const retry = yield* (yield* host.runs.get(admitted.parentId)).spawn(agent.name, "Review", {
          commandId: "review-0",
        })
        expect(retry.session.id).toBe(admitted.ids[1])
        expect((yield* host.sessions.family("paged-family-root", { limit: 64 })).at).toBe(latest.at)
      }),
    )
  })
})
