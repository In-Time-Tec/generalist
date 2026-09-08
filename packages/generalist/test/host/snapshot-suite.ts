import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Option, Schema, Stream, type Types } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { Agent, Approvals, Permissions } from "generalist"
import { Generalist, type SessionRunsInput, type SessionRunsPage } from "generalist/host"
import { ExecutableResolver, RunStore, Runtime } from "generalist/runtime"
import { HostSessionSnapshot } from "../../src/runtime/session/host.js"
import { applyConversationUpdate } from "../../src/runtime/session/conversation.js"
import { TestModel } from "generalist/testing"
import { objectRuntimeLayer, objectWorkerId } from "../runtime/execution/object.js"

export const register = ({
  makeObjectStorage,
}: {
  readonly makeObjectStorage: typeof import("../runtime/execution/object.js").makeObjectStorage
}): void => {
  it.effect(
    "reopens native conversation identities, excludes instructions, and publishes branch replacement without a Run event",
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
              const agent = Agent.make({ name: "conversation-original" })
              const host = yield* Generalist.create({ agents: [agent] })
              const session = yield* host.sessions.create({ id: "conversation-session" })
              const run = yield* host.runs.start(session.id, agent, "original question")
              const store = yield* RunStore.RunStore
              const claim = yield* store.claimExecution({
                runId: run.id,
                ownerId: objectWorkerId,
                commandId: "conversation:claim",
              })
              const writer = Option.getOrThrow(yield* store.claimedSessionStore(claim))
              yield* writer.append(
                { _tag: "Message", message: Prompt.makeMessage("system", { content: "DO_NOT_EXPOSE_SYSTEM" }) },
                { commandId: "conversation:system" },
              )
              yield* writer.append(
                { _tag: "Memory", items: ["DO_NOT_EXPOSE_MEMORY"] },
                { commandId: "conversation:memory" },
              )
              yield* writer.append(
                { _tag: "Skill", name: "private", body: "DO_NOT_EXPOSE_SKILL" },
                { commandId: "conversation:skill" },
              )
              const user = yield* writer.append(
                {
                  _tag: "Message",
                  message: Prompt.makeMessage("user", {
                    content: [Prompt.makePart("text", { text: "original question" })],
                  }),
                },
                { commandId: "conversation:user" },
              )
              const call = yield* writer.append(
                {
                  _tag: "ModelResponse",
                  content: [
                    Response.makePart("tool-call", {
                      id: "search-1",
                      name: "search",
                      params: { query: "original question" },
                      providerExecuted: false,
                    }),
                  ],
                },
                { commandId: "conversation:call" },
              )
              const result = yield* writer.append(
                {
                  _tag: "ToolResult",
                  part: Prompt.makePart("tool-result", {
                    id: "search-1",
                    name: "search",
                    result: { answer: "source" },
                    isFailure: false,
                    providerExecuted: false,
                  }),
                },
                { commandId: "conversation:result" },
              )
              const answer = yield* writer.append(
                { _tag: "ModelResponse", content: [Response.makePart("text", { text: "committed answer" })] },
                { commandId: "conversation:answer" },
              )
              const beforeCompletion = yield* host.sessions.snapshot(session.id)
              expect(beforeCompletion.runs[0]?.status).toBe("running")
              expect(beforeCompletion.conversation.entries.map((entry) => entry.id)).toEqual([
                user.id,
                call.id,
                result.id,
                answer.id,
              ])
              expect(beforeCompletion.conversation.leafId).toBe(answer.id)
              const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(HostSessionSnapshot))(beforeCompletion)
              expect(encoded).not.toContain("DO_NOT_EXPOSE")
              const committedEvents = yield* (yield* Runtime.Runtime).sessionEvents({ sessionId: session.id }).pipe(
                Stream.takeUntil((entry) => entry.cursor === beforeCompletion.cursor),
                Stream.runCollect,
              )
              expect(
                committedEvents
                  .filter((entry) => entry._tag === "Conversation")
                  .flatMap((entry) => entry.update.entries)
                  .map((entry) => entry.id),
              ).toEqual([user.id, call.id, result.id, answer.id])
              yield* store.complete({
                ...claim,
                commandId: "conversation:complete",
                result: {
                  text: "committed answer",
                  output: "committed answer",
                  turns: 1,
                  session: { sessionId: session.id, leafId: answer.id },
                },
              })
              const completed = yield* host.sessions.snapshot(session.id)
              expect(completed.conversation).toEqual(beforeCompletion.conversation)
              expect(completed.runs[0]?.status).toBe("succeeded")
              return { snapshot: completed, userId: user.id }
            }).pipe(Effect.provideContext(context))
          }),
        )
        yield* Effect.scoped(
          Effect.gen(function* () {
            const context = yield* Layer.build(services())
            yield* Effect.gen(function* () {
              const agent = Agent.make({ name: "conversation-reopened" })
              const host = yield* Generalist.create({ agents: [agent] })
              const reopened = yield* host.sessions.snapshot(original.snapshot.session.id)
              expect(reopened.conversation).toEqual(original.snapshot.conversation)
              const run = yield* host.runs.start(reopened.session.id, agent, "branch question")
              const store = yield* RunStore.RunStore
              const claim = yield* store.claimExecution({
                runId: run.id,
                ownerId: objectWorkerId,
                commandId: "conversation:branch-claim",
              })
              const writer = Option.getOrThrow(yield* store.claimedSessionStore(claim))
              const before = yield* host.sessions.snapshot(reopened.session.id)
              const history = yield* store.history({ runId: run.id, cursor: -1, limit: 100 })
              yield* writer.setLeaf(original.userId, "conversation:branch")
              const after = yield* host.sessions.snapshot(reopened.session.id)
              expect(after.conversation.entries.map((entry) => entry.id)).toEqual([original.userId])
              expect(after.conversation.leafId).toBe(original.userId)
              expect(after.cursor).toBe(before.cursor + 1)
              expect(yield* store.history({ runId: run.id, cursor: -1, limit: 100 })).toEqual(history)
              const updates = yield* (yield* Runtime.Runtime)
                .sessionEvents({ sessionId: reopened.session.id, cursor: before.cursor })
                .pipe(Stream.take(1), Stream.runCollect)
              expect(updates[0]).toEqual({
                _tag: "Conversation",
                cursor: after.cursor,
                update: {
                  previousLeafId: before.conversation.leafId,
                  leafId: original.userId,
                  afterEntryId: null,
                  entries: after.conversation.entries,
                  reset: true,
                },
              })
            }).pipe(Effect.provideContext(context))
          }),
        )
      }),
  )

  it.effect(
    "reconstructs and pages long immutable history after subscriber lag and branch replacement",
    () =>
      Effect.gen(function* () {
        const storage = makeObjectStorage()
        const services = () =>
          Layer.mergeAll(
            objectRuntimeLayer({ addresses: [], subscriberQueueCapacity: 2 }, storage).pipe(
              Layer.provide(ExecutableResolver.layerStatic([])),
            ),
            TestModel.layer([]),
            Permissions.layerAllowAll,
            Approvals.layerAutoApprove,
          )
        const original = yield* Effect.scoped(
          Effect.gen(function* () {
            const context = yield* Layer.build(services())
            return yield* Effect.gen(function* () {
              const agent = Agent.make({ name: "history-recovery" })
              const host = yield* Generalist.create({ agents: [agent] })
              const session = yield* host.sessions.create({ id: "history-recovery" })
              const runIds: Array<string> = []
              for (let index = 0; index < 129; index++)
                runIds.push((yield* host.runs.start(session.id, agent, `input-${index}`)).id)
              const store = yield* RunStore.RunStore
              const runId = runIds[0]!
              const claim = yield* store.claimExecution({
                runId,
                ownerId: objectWorkerId,
                commandId: "history-recovery:claim",
              })
              const writer = Option.getOrThrow(yield* store.claimedSessionStore(claim))
              const entryIds: Array<string> = []
              for (let index = 0; index < 150; index++)
                entryIds.push(
                  (yield* writer.append(
                    {
                      _tag: "Message",
                      message: Prompt.makeMessage("user", {
                        content: [Prompt.makePart("text", { text: `entry-${index}` })],
                      }),
                    },
                    { commandId: `history-recovery:entry:${index}` },
                  )).id,
                )
              for (let turn = 0; turn < 270; turn++)
                yield* store.emitAgentEvent({
                  ...claim,
                  commandId: `history-recovery:turn:${turn}`,
                  event: { _tag: "TurnStarted", turn },
                })
              const snapshot = yield* host.sessions.snapshot(session.id)
              expect(snapshot.runs.map((run) => run.runId)).toEqual([runId])
              return { runId, runIds, entryIds, snapshot }
            }).pipe(Effect.provideContext(context))
          }),
        )
        yield* Effect.scoped(
          Effect.gen(function* () {
            const context = yield* Layer.build(services())
            yield* Effect.gen(function* () {
              const agent = Agent.make({ name: "history-recovery" })
              const host = yield* Generalist.create({ agents: [agent] })
              const sessionId = original.snapshot.session.id
              const reopened = yield* host.sessions.snapshot(sessionId)
              expect(reopened).toEqual(original.snapshot)
              expect(reopened.conversation.entries).toHaveLength(64)
              const ids: Array<string> = []
              let before: number | undefined
              while (true) {
                const request: Types.Mutable<SessionRunsInput> = {
                  at: reopened.cursor,
                  limit: 17,
                }
                if (before !== undefined) request.before = before
                const page = yield* host.sessions.runs(sessionId, request)
                ids.unshift(...page.runs.map((run) => run.runId))
                if (page.nextBefore === null) break
                before = page.nextBefore
              }
              expect(ids).toEqual(original.runIds)
              expect(new Set(ids).size).toBe(129)
              const store = yield* RunStore.RunStore
              const runtime = yield* Runtime.Runtime
              const claim = yield* store.claimExecution({
                runId: original.runId,
                ownerId: objectWorkerId,
                commandId: "history-recovery:reclaim",
              })
              const writer = Option.getOrThrow(yield* store.claimedSessionStore(claim))
              const current = yield* host.sessions.snapshot(sessionId)
              const entered = yield* Deferred.make<void>()
              const release = yield* Deferred.make<void>()
              const lagging = yield* runtime.sessionEvents({ sessionId, cursor: current.cursor }).pipe(
                Stream.tap(() => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))),
                Stream.runDrain,
                Effect.flip,
                Effect.forkChild({ startImmediately: true }),
              )
              yield* writer.append(
                {
                  _tag: "Message",
                  message: Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: "lag-start" })] }),
                },
                { commandId: "history-recovery:lag-start" },
              )
              yield* Deferred.await(entered)
              for (let index = 0; index < 5; index++)
                yield* writer.append(
                  {
                    _tag: "Message",
                    message: Prompt.makeMessage("user", {
                      content: [Prompt.makePart("text", { text: `lag-${index}` })],
                    }),
                  },
                  { commandId: `history-recovery:lag:${index}` },
                )
              yield* Deferred.succeed(release, undefined)
              expect(yield* Fiber.join(lagging)).toMatchObject({ _tag: "generalist/host/SessionSubscriberLagged" })
              const beforeBranch = yield* host.sessions.snapshot(sessionId)
              yield* writer.setLeaf(original.entryIds[74]!, "history-recovery:branch")
              const branch = yield* host.sessions.snapshot(sessionId)
              const updates = yield* runtime
                .sessionEvents({ sessionId, cursor: beforeBranch.cursor })
                .pipe(Stream.take(1), Stream.runCollect)
              const update = updates[0]!
              expect(update._tag).toBe("Conversation")
              if (update._tag !== "Conversation") return
              expect(
                Option.getOrThrow(
                  applyConversationUpdate({ conversation: beforeBranch.conversation, update: update.update }),
                ),
              ).toEqual(branch.conversation)
              for (const view of [original.snapshot.conversation, branch.conversation]) {
                const entries: Array<string> = []
                let leafId = view.leafId
                while (leafId !== null) {
                  const page = yield* host.sessions.history(sessionId, { leafId, limit: 13 })
                  entries.unshift(...page.entries.map((entry) => entry.id))
                  leafId = page.nextLeafId
                }
                const expected =
                  view.leafId === original.snapshot.conversation.leafId
                    ? original.entryIds
                    : original.entryIds.slice(0, 75)
                expect(entries).toEqual(expected)
                expect(new Set(entries).size).toBe(entries.length)
              }
              expect(yield* writer.path(original.snapshot.conversation.leafId!)).toHaveLength(150)
            }).pipe(Effect.provideContext(context))
          }),
        )
      }),
    120000,
  )

  it.effect("reopens a committed Session snapshot and replays a racing admission strictly after its cursor", () =>
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
            const agent = Agent.make({ name: "snapshot-original" })
            const host = yield* Generalist.create({ agents: [agent] })
            const session = yield* host.sessions.create({ id: "snapshot-session", title: "Existing work" })
            const run = yield* host.runs.start(session.id, agent, "existing input")
            const snapshot = yield* host.sessions.snapshot(session.id)
            expect(snapshot).toMatchObject({
              version: 1,
              session: yield* session.inspect,
              runs: [{ runId: run.id }],
            })
            return snapshot
          }).pipe(Effect.provideContext(context))
        }),
      )
      yield* Effect.scoped(
        Effect.gen(function* () {
          const context = yield* Layer.build(services())
          return yield* Effect.gen(function* () {
            const agent = Agent.make({ name: "snapshot-reopened" })
            const host = yield* Generalist.create({ agents: [agent] })
            const reopened = yield* host.sessions.snapshot(original.session.id)
            expect(reopened).toEqual(original)
            const raced = yield* host.runs.start(original.session.id, agent, "racing input")
            const events = yield* host.events.subscribe(original.session.id, reopened.cursor)
            const next = yield* events.pipe(Stream.take(1), Stream.runCollect)
            expect(next).toHaveLength(1)
            expect(next[0]).toMatchObject({ _tag: "RunStarted", runId: raced.id })
            expect(next[0]?.cursor).not.toBe(reopened.cursor)
            const fresh = yield* host.sessions.snapshot(original.session.id)
            expect(fresh.runs.map((run) => run.runId)).toEqual([...original.runs.map((run) => run.runId), raced.id])
            const canonical = yield* (yield* Runtime.Runtime)
              .sessionEvents({ sessionId: original.session.id, cursor: reopened.cursor })
              .pipe(Stream.take(1), Stream.runCollect)
            expect(fresh.cursor).toBe(canonical[0]?.cursor)
            expect(fresh.cursor).toBe(next[0]!.cursor)
            expect(fresh.session.activeRunId).toBe(original.session.activeRunId)
            expect(fresh.runs.find((run) => run.runId === raced.id)?.status).toBe("queued")
          }).pipe(Effect.provideContext(context))
        }),
      )
    }),
  )

  it.effect("defers large conversation content without truncating committed native entries", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const storage = makeObjectStorage()
        const services = Layer.mergeAll(
          objectRuntimeLayer({ addresses: [] }, storage).pipe(Layer.provide(ExecutableResolver.layerStatic([]))),
          TestModel.layer([]),
          Permissions.layerAllowAll,
          Approvals.layerAutoApprove,
        )
        const context = yield* Layer.build(services)
        yield* Effect.gen(function* () {
          const agent = Agent.make({ name: "conversation-bytes" })
          const host = yield* Generalist.create({ agents: [agent] })
          const session = yield* host.sessions.create({ id: "conversation-bytes" })
          const run = yield* host.runs.start(session.id, agent, "bounded conversation")
          const store = yield* RunStore.RunStore
          const claim = yield* store.claimExecution({
            runId: run.id,
            ownerId: objectWorkerId,
            commandId: "conversation-bytes:claim",
          })
          const writer = Option.getOrThrow(yield* store.claimedSessionStore(claim))
          for (let index = 0; index < 12; index++)
            yield* writer.append(
              {
                _tag: "Message",
                message: Prompt.makeMessage("user", {
                  content: [Prompt.makePart("text", { text: "x".repeat(100000) })],
                }),
              },
              { commandId: `conversation-bytes:${index}` },
            )
          const snapshot = yield* host.sessions.snapshot(session.id)
          expect(snapshot.conversation.entries).toHaveLength(12)
          expect(
            snapshot.conversation.entries.every(
              (entry) => entry.contentDeferred === true && entry.messages.length === 0,
            ),
          ).toBe(true)
          for (const reference of snapshot.conversation.entries) {
            const entry = yield* host.sessions.entry(session.id, reference.id)
            expect(entry.contentDeferred).toBeUndefined()
            expect(entry.messages[0]?.content[0]).toMatchObject({ type: "text", text: "x".repeat(100000) })
          }
          const path = yield* writer.path()
          expect(path).toHaveLength(12)
          expect(
            path.every(
              (entry) =>
                entry._tag === "Message" &&
                entry.message.role === "user" &&
                entry.message.content.some((part) => part.type === "text" && part.text.length === 100000),
            ),
          ).toBe(true)
        }).pipe(Effect.provideContext(context))
      }),
    ),
  )

  it.effect(
    "pages beyond the former Session snapshot limit without missing or duplicating admitted Runs",
    () =>
      Effect.gen(function* () {
        const storage = makeObjectStorage()
        const services = Layer.mergeAll(
          objectRuntimeLayer({ addresses: [] }, storage).pipe(Layer.provide(ExecutableResolver.layerStatic([]))),
          TestModel.layer([]),
          Permissions.layerAllowAll,
          Approvals.layerAutoApprove,
        )
        const context = yield* Layer.build(services)
        yield* Effect.gen(function* () {
          const agent = Agent.make({ name: "snapshot-bounded" })
          const host = yield* Generalist.create({ agents: [agent] })
          const session = yield* host.sessions.create({ id: "snapshot-bounded" })
          for (let index = 0; index < 129; index++) yield* host.runs.start(session.id, agent, `input-${index}`)
          const snapshot = yield* host.sessions.snapshot(session.id)
          expect(snapshot.runs).toHaveLength(33)
          const ids: Array<string> = []
          let before: number | null = snapshot.cursor + 1
          while (before !== null) {
            const page: SessionRunsPage = yield* host.sessions.runs(session.id, {
              at: snapshot.cursor,
              before,
              limit: 32,
            })
            ids.unshift(...page.runs.map((run) => run.runId))
            before = page.nextBefore
          }
          expect(ids).toHaveLength(129)
          expect(new Set(ids).size).toBe(129)
          expect(ids).toEqual((yield* host.runs.list(session.id)).map((run) => run.runId))
          expect(yield* host.runs.list(session.id)).toHaveLength(129)
        }).pipe(Effect.provideContext(context))
      }),
    120000,
  )
}
