import { expect, it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Agent, Approvals, Permissions } from "generalist"
import { Host, type SessionRunsPage } from "generalist/host"
import { ExecutableResolver, RunStore } from "generalist/runtime"
import { TestModel } from "generalist/testing"
import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../runtime/execution/object.js"

it.effect(
  "retains the canonical active Run and editable queue outside the recent window after reconstruction",
  () =>
    Effect.gen(function* () {
      const storage = makeObjectStorage()
      const services = () =>
        Layer.mergeAll(
          objectRuntimeLayer({ addresses: [] }, storage).pipe(Layer.provide(ExecutableResolver.layerStatic([]))),
          TestModel.layer([]),
          Permissions.layerAllowAll,
          Approvals.layerAutoApprove,
        )
      const original = yield* Effect.scoped(
        Effect.gen(function* () {
          const context = yield* Layer.build(services())
          return yield* Effect.gen(function* () {
            const agent = Agent.make({ name: "queued-history" })
            const host = yield* Host.make({ revision: "local", agents: { agent } })
            const session = yield* host.sessions.create({ id: "queued-history", agent: agent.name })
            yield* session.submit("active", { commandId: "queued-history:active" })
            const activeRunId = (yield* session.inspect).activeRunId!
            const ids = [activeRunId]
            for (let index = 0; index < 128; index++)
              ids.push((yield* host.runs.start(session.id, agent, `direct-${index}`)).id)
            const pending = yield* session.submit("pending", { commandId: "queued-history:pending" })
            const edited = yield* session.queue.update(pending.id, "edited", {
              commandId: "queued-history:edit",
              expectedRevision: pending.revision,
              agent: agent.name,
            })
            const store = yield* RunStore.RunStore
            const claim = yield* store.claimExecution({
              runId: activeRunId,
              ownerId: objectWorkerId,
              commandId: "queued-history:claim",
            })
            const writer = Option.getOrThrow(yield* store.claimedSessionStore(claim))
            const entryIds: Array<string> = []
            for (let index = 0; index < 270; index++)
              entryIds.push(
                (yield* writer.append(
                  {
                    _tag: "Message",
                    message: Prompt.makeMessage("user", {
                      content: [Prompt.makePart("text", { text: `history-${index}` })],
                    }),
                  },
                  { commandId: `queued-history:entry:${index}` },
                )).id,
              )
            const snapshot = yield* session.snapshot
            expect(snapshot.session.activeRunId).toBe(activeRunId)
            expect(snapshot.runs.map((run) => run.runId)).toEqual([activeRunId])
            expect(snapshot.session.queue).toHaveLength(1)
            expect(snapshot.session.queue[0]).toMatchObject({ id: pending.id, revision: edited.revision })
            expect(snapshot.session.queue).toEqual(yield* session.queue.list())
            const admissionPage = yield* host.sessions.runs(session.id, { at: snapshot.cursor, limit: 64 })
            expect(admissionPage.runs).toEqual([])
            expect(admissionPage.nextBefore).not.toBeNull()
            return { snapshot, ids, entryIds, pending, edited }
          }).pipe(Effect.provideContext(context))
        }),
      )
      yield* Effect.scoped(
        Effect.gen(function* () {
          const context = yield* Layer.build(services())
          yield* Effect.gen(function* () {
            const agent = Agent.make({ name: "queued-history" })
            const host = yield* Host.make({ revision: "local", agents: { agent } })
            const session = yield* host.sessions.get(original.snapshot.session.id)
            expect(yield* session.snapshot).toEqual(original.snapshot)
            expect(yield* session.submit("pending", { commandId: "queued-history:pending" })).toEqual(original.pending)
            expect(yield* session.queue.list()).toEqual(original.snapshot.session.queue)
            const ids: Array<string> = []
            let before: number | null = original.snapshot.cursor + 1
            while (before !== null) {
              const page: SessionRunsPage = yield* host.sessions.runs(session.id, {
                at: original.snapshot.cursor,
                before,
                limit: 31,
              })
              ids.unshift(...page.runs.map((run) => run.runId))
              before = page.nextBefore
            }
            expect(ids).toEqual(original.ids)
            expect(new Set(ids).size).toBe(129)
            const store = yield* RunStore.RunStore
            const claim = yield* store.claimExecution({
              runId: original.ids[0]!,
              ownerId: objectWorkerId,
              commandId: "queued-history:reclaim",
            })
            const writer = Option.getOrThrow(yield* store.claimedSessionStore(claim))
            yield* writer.setLeaf(original.entryIds[99]!, "queued-history:branch")
            const branch = yield* session.snapshot
            expect(branch.session).toEqual(original.snapshot.session)
            expect(branch.conversation.leafId).toBe(original.entryIds[99])
            expect(branch.runs.filter((run) => run.runId === branch.session.activeRunId)).toHaveLength(1)
            const entries: Array<string> = []
            let leafId = original.snapshot.conversation.leafId
            while (leafId !== null) {
              const page = yield* host.sessions.history(session.id, { leafId, limit: 32 })
              entries.unshift(...page.entries.map((entry) => entry.id))
              leafId = page.nextLeafId
            }
            expect(entries).toEqual(original.entryIds)
          }).pipe(Effect.provideContext(context))
        }),
      )
    }),
  120000,
)
