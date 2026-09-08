import { expect, it } from "@effect/vitest"
import { Effect, Result } from "effect"
import { Prompt } from "effect/unstable/ai"
import { make as makeAgent } from "../../../core/agent/service.js"
import { durableIdentity } from "../../../runtime/executable/registered-agent.js"
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
        expect(initial.selection).toEqual(selection)
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
          { id: second.commandId, selected: selection },
          { id: third.commandId, selected: selection },
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
}
