import { expect, it } from "@effect/vitest"
import { Effect, Result } from "effect"
import { Prompt } from "effect/unstable/ai"
import { make as makeAgent } from "../../../core/agent/service.js"
import { durableIdentity } from "../../../runtime/executable/registered-agent.js"
import { make as makeAddress } from "../../../runtime/address.js"
import { defaultTreePolicy } from "../../../runtime/tree/policy.js"
import type { HostSessionsCapability, Options, Services } from "../contract.js"

type Provide<E> = <A, Error>(use: (services: Services) => Effect.Effect<A, Error>) => Effect.Effect<A, Error | E>

export const registerSessionQueue = <E, ClaimsError>({
  options,
  capability,
  provide,
}: {
  readonly options: Options<E, ClaimsError>
  readonly capability: HostSessionsCapability
  readonly provide: Provide<E>
}): void => {
  const { executable, registrations } = durableIdentity(makeAgent({ name: "session-queue" }))
  const selection = { executableRef: executable.ref, executableManifest: executable.manifest, registrations }
  const admittedSelection = { ...selection, treePolicy: defaultTreePolicy, budget: {} }

  it.effect("retains Session messages through stop and fences claims until explicit resume", () =>
    provide((services) =>
      Effect.gen(function* () {
        const { store } = services
        const sessionId = `session:messages:${options.name}:stop`
        yield* store.createHostSession({ id: sessionId, selection })
        yield* store.submitSessionInput({ sessionId, commandId: "initial", prompt: Prompt.make("first") })
        const runId = (yield* store.hostSession(sessionId)).activeRunId!
        const message = { sessionId, commandId: "follow-up", prompt: Prompt.make("follow up"), from: { user: "alice" } }
        const receipt = yield* store.messageSessionInput(message)
        expect((yield* store.pendingSteering({ runId, limit: 64 }))[0]).toMatchObject({ from: { user: "alice" } })
        yield* store.controlSession({ sessionId, commandId: "stop", action: "stop" })
        const stopped = yield* store.hostSession(sessionId)
        expect(stopped.lifecycle).toBe("stopped")
        expect(stopped.activeRunId).toBeUndefined()
        expect(stopped.queue.map((entry) => entry.id)).toEqual(["follow-up"])
        expect(yield* store.messageSessionInput(message)).toEqual(receipt)
        yield* store.messageSessionInput({ ...message, commandId: "while-stopped" })
        expect((yield* store.hostSessionRuns(sessionId)).length).toBe(1)
        yield* store.controlSession({ sessionId, commandId: "resume", action: "resume" })
        const resumed = yield* store.hostSession(sessionId)
        expect(resumed.lifecycle).toBeUndefined()
        expect(resumed.activeRunId).toBeDefined()
        expect(resumed.activeRunId).not.toBe(runId)
        yield* store.controlSession({ sessionId, commandId: "close", action: "close" })
        expect(
          yield* store.controlSession({ sessionId, commandId: "closed-resume", action: "resume" }).pipe(Effect.flip),
        ).toMatchObject({ _tag: "generalist/runtime/RuntimeUnavailable" })
        expect((yield* store.hostSession(sessionId)).lifecycle).toBe("closed")
      }),
    ),
  )

  it.effect("promotes Session inputs FIFO with immutable receipts and retained selection", () =>
    provide((services) =>
      Effect.gen(function* () {
        const { store } = services
        const sessionId = `session:queue:${options.name}:fifo`
        yield* store.createHostSession({ id: sessionId })
        const first = { sessionId, commandId: `${sessionId}:first`, prompt: Prompt.make("first"), selection }
        const receipt = yield* store.submitSessionInput(first)
        const initial = yield* store.hostSession(sessionId)
        expect(initial.queue).toEqual([])
        expect(initial.selection).toEqual(admittedSelection)
        expect(initial.activeRunId).toBeDefined()
        expect(yield* store.submitSessionInput(first)).toEqual(receipt)
        expect(
          yield* store.submitSessionInput({ ...first, prompt: Prompt.make("changed") }).pipe(Effect.flip),
        ).toMatchObject({ reason: "input-conflict" })
        const second = { sessionId, commandId: `${sessionId}:second`, prompt: Prompt.make("second") }
        const third = { sessionId, commandId: `${sessionId}:third`, prompt: Prompt.make("third") }
        yield* store.submitSessionInput(second)
        yield* store.submitSessionInput(third)
        expect(
          (yield* store.hostSession(sessionId)).queue.map(({ id, selection: selected }) => ({ id, selected })),
        ).toEqual([
          { id: second.commandId, selected: admittedSelection },
          { id: third.commandId, selected: admittedSelection },
        ])
        const runIds = [initial.activeRunId!]
        for (const pending of [second, third]) {
          const claim = yield* capability.claim(services, { runId: runIds.at(-1)!, commandId: pending.commandId })
          yield* store.complete({
            ...claim,
            commandId: `${pending.commandId}:complete`,
            result: { text: "done", output: "done", turns: 1, session: { sessionId, leafId: null } },
          })
          yield* store.releaseExecution(claim)
          const current = yield* store.hostSession(sessionId)
          expect(current.activeRunId).toBeDefined()
          expect(runIds).not.toContain(current.activeRunId)
          expect(yield* store.loadExecution(current.activeRunId!)).toMatchObject({
            message: { prompt: pending.prompt, correlationId: pending.commandId },
            executableRef: selection.executableRef,
            executableManifest: selection.executableManifest,
          })
          runIds.push(current.activeRunId!)
          expect(current.queue.some(({ id }) => id === pending.commandId)).toBe(false)
          expect(yield* store.submitSessionInput(pending)).toEqual({ id: pending.commandId, revision: 1 })
        }
        expect((yield* store.hostSessionRuns(sessionId)).map(({ runId }) => runId).toSorted()).toEqual(
          runIds.toSorted(),
        )
        expect((yield* store.hostSession(sessionId)).queue).toEqual([])
      }),
    ),
  )

  it.effect("serializes competing Session edits and removals and replays their original receipts", () =>
    provide(({ store }) =>
      Effect.gen(function* () {
        const sessionId = `session:queue:${options.name}:race`
        yield* store.createHostSession({ id: sessionId, selection })
        yield* store.submitSessionInput({ sessionId, commandId: `${sessionId}:active`, prompt: Prompt.make("active") })
        const submit = { sessionId, commandId: `${sessionId}:pending`, prompt: Prompt.make("pending") }
        const accepted = yield* store.submitSessionInput(submit)
        const edit = {
          sessionId,
          commandId: `${sessionId}:edit`,
          id: accepted.id,
          expectedRevision: 1,
          prompt: Prompt.make("edited"),
        }
        const remove = { sessionId, commandId: `${sessionId}:remove`, id: accepted.id, expectedRevision: 1 }
        const outcomes = yield* Effect.all(
          [store.updateSessionInput(edit).pipe(Effect.result), store.removeSessionInput(remove).pipe(Effect.result)],
          { concurrency: "unbounded" },
        )
        expect(outcomes.filter(Result.isSuccess)).toHaveLength(1)
        expect(outcomes.filter(Result.isFailure).map((result) => result.failure)).toEqual([
          expect.objectContaining({ reason: "revision" }),
        ])
        if (Result.isSuccess(outcomes[0])) {
          expect(yield* store.updateSessionInput(edit)).toEqual({ id: accepted.id, revision: 2 })
          const finalRemove = { ...remove, commandId: `${sessionId}:remove-edited`, expectedRevision: 2 }
          const removed = yield* store.removeSessionInput(finalRemove)
          expect(removed).toEqual({ id: accepted.id, revision: 3 })
          expect(yield* store.removeSessionInput(finalRemove)).toEqual(removed)
          expect(yield* store.updateSessionInput(edit)).toEqual({ id: accepted.id, revision: 2 })
        } else {
          expect(yield* store.removeSessionInput(remove)).toEqual({ id: accepted.id, revision: 2 })
        }
        expect(yield* store.submitSessionInput(submit)).toEqual(accepted)
        expect((yield* store.hostSession(sessionId)).queue).toEqual([])
      }),
    ),
  )

  for (const order of ["edit-first", "promotion-first", "concurrent"] as const) {
    it.effect(`orders a Session edit against promotion without duplicate admission (${order})`, () =>
      provide((services) =>
        Effect.gen(function* () {
          const { store } = services
          const sessionId = `session:queue:${options.name}:promotion:${order}`
          yield* store.createHostSession({ id: sessionId, selection })
          yield* store.submitSessionInput({
            sessionId,
            commandId: `${sessionId}:active`,
            prompt: Prompt.make("active"),
          })
          const activeRunId = (yield* store.hostSession(sessionId)).activeRunId!
          const claim = yield* capability.claim(services, { runId: activeRunId, commandId: `${sessionId}:claim` })
          const submit = { sessionId, commandId: `${sessionId}:pending`, prompt: Prompt.make("original") }
          const accepted = yield* store.submitSessionInput(submit)
          const edit = {
            sessionId,
            commandId: `${sessionId}:edit`,
            id: accepted.id,
            expectedRevision: 1,
            prompt: Prompt.make("edited before promotion"),
          }
          const complete = {
            ...claim,
            commandId: `${sessionId}:complete`,
            result: { text: "done", output: "done", turns: 1, session: { sessionId, leafId: null } },
          }
          const outcomes =
            order === "promotion-first"
              ? yield* Effect.all([store.complete(complete), store.updateSessionInput(edit).pipe(Effect.result)], {
                  concurrency: 1,
                }).pipe(Effect.map(([completed, edited]) => [edited, completed] as const))
              : yield* Effect.all([store.updateSessionInput(edit).pipe(Effect.result), store.complete(complete)], {
                  concurrency: order === "concurrent" ? "unbounded" : 1,
                })
          expect(outcomes[1]._tag).toBe("Completed")
          if (order === "edit-first") expect(Result.isSuccess(outcomes[0])).toBe(true)
          if (order === "promotion-first") expect(Result.isFailure(outcomes[0])).toBe(true)
          if (Result.isSuccess(outcomes[0])) {
            expect(outcomes[0].success).toEqual({ id: accepted.id, revision: 2 })
            expect(yield* store.updateSessionInput(edit)).toEqual(outcomes[0].success)
            expect(
              yield* store.updateSessionInput({ ...edit, prompt: Prompt.make("divergent retry") }).pipe(Effect.flip),
            ).toMatchObject({ reason: "input-conflict" })
          } else {
            expect(outcomes[0].failure).toMatchObject({ reason: "revision" })
            expect(yield* store.updateSessionInput(edit).pipe(Effect.flip)).toMatchObject({ reason: "revision" })
          }
          expect(yield* store.complete(complete)).toEqual(outcomes[1])
          yield* store.releaseExecution(claim)
          expect(yield* store.submitSessionInput(submit)).toEqual(accepted)
          const current = yield* store.hostSession(sessionId)
          expect(current.queue).toEqual([])
          expect(current.activeRunId).toBeDefined()
          expect(current.activeRunId).not.toBe(activeRunId)
          expect(yield* store.loadExecution(current.activeRunId!)).toMatchObject({
            message: {
              prompt: Result.isSuccess(outcomes[0]) ? edit.prompt : submit.prompt,
              correlationId: accepted.id,
            },
            executableRef: selection.executableRef,
          })
          expect((yield* store.hostSessionRuns(sessionId)).map(({ runId }) => runId).toSorted()).toEqual(
            [activeRunId, current.activeRunId!].toSorted(),
          )
        }),
      ),
    )
  }

  it.effect("bounds the Session queue by pending count and encoded bytes without partial admission", () =>
    provide(({ store }) =>
      Effect.gen(function* () {
        const sessionId = `session:queue:${options.name}:bounds`
        yield* store.createHostSession({ id: sessionId, selection })
        yield* store.submitSessionInput({ sessionId, commandId: `${sessionId}:active`, prompt: Prompt.make("active") })
        for (let index = 0; index < 64; index++) {
          yield* store.submitSessionInput({
            sessionId,
            commandId: `${sessionId}:${index}`,
            prompt: Prompt.make("pending"),
          })
        }
        const before = yield* store.hostSession(sessionId)
        expect(
          yield* store
            .submitSessionInput({ sessionId, commandId: `${sessionId}:overflow`, prompt: Prompt.make("overflow") })
            .pipe(Effect.flip),
        ).toMatchObject({ reason: "capacity" })
        expect(
          yield* store
            .updateSessionInput({
              sessionId,
              commandId: `${sessionId}:large`,
              id: before.queue[0]!.id,
              expectedRevision: 1,
              prompt: Prompt.make("x".repeat(1040000)),
            })
            .pipe(Effect.flip),
        ).toMatchObject({ reason: "capacity" })
        expect(yield* store.hostSession(sessionId)).toEqual(before)
        expect(yield* store.hostSessionRuns(sessionId)).toHaveLength(1)
      }),
    ),
  )

  it.effect("retains child collaboration and one sponsored continuation across fresh Layers", () =>
    provide((first) =>
      Effect.gen(function* () {
        const parent = makeAgent({
          name: "session-collaboration-parent",
          children: ["session-collaboration-child"],
          budget: { tokens: 20, toolCalls: 4, children: 4 },
        })
        const child = makeAgent({ name: "session-collaboration-child", budget: { tokens: 3, toolCalls: 1 } })
        const { executable: collaborationExecutable, registrations: collaborationRegistrations } = durableIdentity(
          parent,
          [parent, child],
        )
        const selected = {
          executableRef: collaborationExecutable.ref,
          executableManifest: collaborationExecutable.manifest,
          registrations: collaborationRegistrations,
        }
        const parentSessionId = `session:collaboration:${options.name}:parent`
        const childSessionId = `${parentSessionId}:child`
        yield* first.store.createHostSession({ id: parentSessionId, selection: selected })
        yield* first.store.submitSessionInput({
          sessionId: parentSessionId,
          commandId: `${parentSessionId}:start`,
          prompt: Prompt.make("coordinate"),
        })
        const parentRunId = (yield* first.store.hostSession(parentSessionId)).activeRunId
        if (parentRunId === undefined) return yield* Effect.die("collaboration parent was not admitted")
        const childReceipt = yield* first.runtime.spawn({
          parentRunId,
          invocationId: "session-collaboration-child",
          selection: child.name,
          prompt: "review",
          sessionId: childSessionId,
          idempotencyKey: `${childSessionId}:initial`,
        })
        const retained = yield* first.store.hostSession(childSessionId)
        expect(retained.retainedSession).toMatchObject({
          id: childSessionId,
          rootSessionId: parentSessionId,
          parentSessionId,
          parentRunId,
          initialRunId: childReceipt.runId,
          depth: 1,
        })
        expect(retained.sponsorRunId).toBe(parentRunId)
        expect((yield* first.store.hostSessionFamily(childSessionId, { limit: 64 })).sessions).toHaveLength(2)
        const before = yield* first.store.snapshot(parentRunId)
        return yield* provide((second) =>
          Effect.gen(function* () {
            const childClaim = yield* capability.claim(second, {
              runId: childReceipt.runId,
              commandId: "session-collaboration-child-claim",
            })
            yield* second.store.complete({
              ...childClaim,
              commandId: "session-collaboration-child-complete",
              result: {
                text: "reviewed",
                output: "reviewed",
                turns: 1,
                session: { sessionId: childSessionId, leafId: null },
              },
            })
            yield* second.store.releaseExecution(childClaim)
            const afterChild = yield* second.store.snapshot(parentRunId)
            expect(afterChild.budget.tokens).toBeGreaterThanOrEqual(before.budget.tokens ?? 0)
            const followup = {
              sessionId: childSessionId,
              commandId: `${childSessionId}:followup`,
              prompt: Prompt.make("check the regression"),
              from: { runId: parentRunId } as const,
            }
            const receipt = yield* second.store.messageSessionInput(followup)
            const continued = yield* second.store.hostSession(childSessionId)
            expect(continued.sponsorRunId).toBe(parentRunId)
            expect(continued.retainedSession).toEqual(retained.retainedSession)
            expect(continued.activeRunId).toBeDefined()
            if (continued.activeRunId === undefined) return yield* Effect.die("continuation was not admitted")
            const execution = yield* second.store.loadExecution(continued.activeRunId)
            expect(execution.parentRunId).toBe(parentRunId)
            expect(execution.message.to).toEqual(makeAddress(`spawn:${parentRunId}`))
            expect(yield* second.store.messageSessionInput(followup)).toEqual(receipt)
            expect(yield* second.store.hostSessionRuns(childSessionId)).toHaveLength(2)
            const continuationClaim = yield* capability.claim(second, {
              runId: continued.activeRunId,
              commandId: "session-collaboration-continuation-claim",
            })
            yield* second.store.complete({
              ...continuationClaim,
              commandId: "session-collaboration-continuation-complete",
              result: {
                text: "followed up",
                output: "followed up",
                turns: 1,
                session: { sessionId: childSessionId, leafId: null },
              },
            })
            yield* second.store.releaseExecution(continuationClaim)
            expect((yield* second.store.hostSession(childSessionId)).activeRunId).toBeUndefined()
          }),
        )
      }),
    ),
  )
}
