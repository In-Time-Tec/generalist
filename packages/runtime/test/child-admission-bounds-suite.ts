import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { AgentEvent } from "@batonfx/core"
import { Address, ChildAdmission, Errors, Message, Runtime, RunStore } from "../src/index.js"
import { fanOutIdFor } from "../src/fan-out.js"
import {
  assistantAddress,
  assistantRef,
  completedResult,
  registrationsFor,
  researcherRef,
  textPrompt,
} from "./helpers.js"
import { provideScoped } from "./scoped-provide.js"

export interface ChildAdmissionBoundsSuiteOptions<StoreError, Extra = never> {
  readonly name: string
  readonly storeLayer: Layer.Layer<Runtime.Runtime | RunStore.RunStore | Extra, StoreError>
  readonly activate?: (runId: string) => Effect.Effect<void, never, Runtime.Runtime | RunStore.RunStore | Extra>
  readonly skip?: boolean
}

export const childAdmissionBoundsSuite = <StoreError, Extra = never>(
  options: ChildAdmissionBoundsSuiteOptions<StoreError, Extra>,
) => {
  const suite = options.skip === true ? describe.skip : describe
  const provide = <A, E>(effect: Effect.Effect<A, E, Runtime.Runtime | RunStore.RunStore | Extra>) =>
    provideScoped(options.storeLayer, effect)
  const activate = options.activate ?? (() => Effect.void)
  let sequence = 0
  const root = (policy: { readonly maxDepth: number; readonly maxSubagents: number }) =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const id = `${options.name}:bounds:${sequence++}`
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: id,
        idempotencyKey: id,
        prompt: textPrompt("root"),
        treePolicy: policy,
      })
      return { runtime, store, children: ChildAdmission.make(store), runId: receipt.runId, policy }
    })
  const admit = (
    children: ChildAdmission.Interface,
    parentRunId: string,
    key: string,
    prompt = key,
    selection = "researcher",
  ) => children.admit({ parentRunId, toolCallId: `call:${key}`, selection, prompt, key })
  const group = (runtime: Runtime.Interface, parentRunId: string, key: string, size: number) =>
    runtime.fanOut({
      parentRunId,
      idempotencyKey: key,
      members: Array.from({ length: size }, (_, index) => ({
        key: `${key}:${index}`,
        selection: "researcher",
        prompt: textPrompt(`${key}:${index}`),
      })),
      concurrency: Math.max(1, size),
      join: { _tag: "AllSettled" },
      remainder: "await",
    })

  suite(`bounded recursive child admission (${options.name})`, () => {
    it.live("enforces maxDepth 0, 1, and 2 at the exact boundary and persists ancestry", () =>
      provide(
        Effect.gen(function* () {
          for (const maxDepth of [0, 1, 2]) {
            const context = yield* root({ maxDepth, maxSubagents: 8 })
            const rootExecution = yield* context.store.loadExecution(context.runId)
            expect(rootExecution).toMatchObject({ rootRunId: context.runId, depth: 0, treePolicy: context.policy })
            let parent = context.runId
            for (let depth = 1; depth <= maxDepth; depth++) {
              const child = yield* admit(
                context.children,
                parent,
                `depth-${maxDepth}-${depth}`,
                undefined,
                depth === 1 ? "researcher" : "analyst",
              )
              const execution = yield* context.store.loadExecution(child.childRunId)
              expect(execution).toMatchObject({ rootRunId: context.runId, depth, treePolicy: context.policy })
              parent = child.childRunId
            }
            if (maxDepth < 2) {
              const failure = yield* admit(
                context.children,
                parent,
                `too-deep-${maxDepth}`,
                undefined,
                maxDepth === 0 ? "researcher" : "analyst",
              ).pipe(Effect.flip)
              expect(failure).toBeInstanceOf(Errors.ChildDepthExceeded)
              expect(failure).toMatchObject({
                parentRunId: parent,
                rootRunId: context.runId,
                parentDepth: maxDepth,
                depth: maxDepth + 1,
                limit: maxDepth,
              })
            }
          }
        }),
      ),
    )

    it.live("charges one lifetime per-parent limit across singleton and exact group paths without refunds", () =>
      provide(
        Effect.gen(function* () {
          const context = yield* root({ maxDepth: 2, maxSubagents: 3 })
          const first = yield* admit(context.children, context.runId, "single")
          yield* group(context.runtime, context.runId, "pair", 2)
          const claim = yield* context.store.claimExecution({ runId: first.childRunId, ownerId: "bounds" })
          yield* context.store.complete({ ...claim, result: completedResult("done") })
          const cancelled = yield* root({ maxDepth: 1, maxSubagents: 1 })
          const cancelledChild = yield* admit(cancelled.children, cancelled.runId, "cancelled")
          yield* cancelled.children.cancel({ parentRunId: cancelled.runId, childRunId: cancelledChild.childRunId })
          expect(yield* admit(cancelled.children, cancelled.runId, "after-cancel").pipe(Effect.flip)).toBeInstanceOf(
            Errors.ChildLimitExceeded,
          )
          const failure = yield* admit(context.children, context.runId, "after-terminal").pipe(Effect.flip)
          expect(failure).toBeInstanceOf(Errors.ChildLimitExceeded)
          expect(failure).toMatchObject({
            parentRunId: context.runId,
            rootRunId: context.runId,
            parentDepth: 0,
            depth: 1,
            requested: 1,
            current: 3,
            limit: 3,
          })
        }),
      ),
    )

    it.live("replays before charging and rejects a changed digest without consuming capacity", () =>
      provide(
        Effect.gen(function* () {
          const context = yield* root({ maxDepth: 1, maxSubagents: 2 })
          const first = yield* admit(context.children, context.runId, "stable", "same")
          const replay = yield* admit(context.children, context.runId, "stable", "same")
          expect(replay).toMatchObject({ childRunId: first.childRunId, duplicate: true })
          expect(yield* admit(context.children, context.runId, "stable", "different").pipe(Effect.flip)).toBeInstanceOf(
            Errors.IdempotencyConflict,
          )
          yield* admit(context.children, context.runId, "remaining")
          expect(yield* context.children.listDirect(context.runId)).toHaveLength(2)
        }),
      ),
    )

    it.live("never replays a singleton admission across parents", () =>
      provide(
        Effect.gen(function* () {
          const first = yield* root({ maxDepth: 1, maxSubagents: 1 })
          const second = yield* root({ maxDepth: 1, maxSubagents: 1 })
          const message = Message.make({
            id: "shared-child-message",
            to: Address.make("spawn:shared-parent-identity"),
            sessionId: "shared-child-session",
            prompt: textPrompt("same child work"),
            idempotencyKey: "shared-child-key",
            correlationId: "shared-correlation",
          })
          const spawn = (parentRunId: string) =>
            first.store.admitSpawn({
              parentRunId,
              invocationId: "shared-invocation",
              selection: "researcher",
              prompt: message.prompt,
              message,
            })
          const admitted = yield* spawn(first.runId)
          expect(yield* spawn(first.runId)).toMatchObject({ runId: admitted.runId, duplicate: true })
          expect(yield* spawn(second.runId).pipe(Effect.flip)).toBeInstanceOf(Errors.IdempotencyConflict)
          expect(yield* first.children.listDirect(first.runId)).toHaveLength(1)
          expect(yield* second.children.listDirect(second.runId)).toHaveLength(0)
          yield* admit(second.children, second.runId, "own-child")
          expect(yield* second.children.listDirect(second.runId)).toHaveLength(1)
        }),
      ),
    )

    it.live("rejects an oversized exact group all-or-nothing with no run or event mutation", () =>
      provide(
        Effect.gen(function* () {
          const context = yield* root({ maxDepth: 1, maxSubagents: 2 })
          yield* admit(context.children, context.runId, "existing")
          const beforeChildren = yield* context.children.listDirect(context.runId)
          const beforeEvents = yield* context.runtime.history({ runId: context.runId, cursor: -1, limit: 100 })
          const failure = yield* group(context.runtime, context.runId, "rejected-group", 2).pipe(Effect.flip)
          expect(failure).toBeInstanceOf(Errors.ChildLimitExceeded)
          expect(failure).toMatchObject({ depth: 1, requested: 2, current: 1, limit: 2 })
          expect(yield* context.children.listDirect(context.runId)).toEqual(beforeChildren)
          expect(yield* context.runtime.history({ runId: context.runId, cursor: -1, limit: 100 })).toEqual(beforeEvents)
          expect(
            yield* context.runtime.inspectFanOut(fanOutIdFor(context.runId, "rejected-group")).pipe(Effect.option),
          ).toMatchObject({ _tag: "None" })
          expect((yield* context.runtime.inspect(context.runId)).wait).toBeUndefined()
        }),
      ),
    )

    it.live("validates and detaches the root-pinned policy before any admission mutation", () =>
      provide(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const id = `${options.name}:bounds:policy:${sequence++}`
          const base = {
            to: assistantAddress,
            sessionId: id,
            idempotencyKey: id,
            prompt: textPrompt("root"),
          }
          const invalid = yield* runtime
            .send({ ...base, treePolicy: { maxDepth: -1, maxSubagents: 1 } })
            .pipe(Effect.flip)
          expect(invalid).toBeInstanceOf(Errors.TreePolicyInvalid)

          const policy = { maxDepth: 1, maxSubagents: 1 }
          const receipt = yield* runtime.send({ ...base, treePolicy: policy })
          policy.maxDepth = 10
          policy.maxSubagents = 10
          expect(yield* runtime.inspect(receipt.runId)).toMatchObject({
            depth: 0,
            treePolicy: { maxDepth: 1, maxSubagents: 1 },
          })
          const children = ChildAdmission.make(yield* RunStore.RunStore)
          yield* admit(children, receipt.runId, "first")
          expect(yield* admit(children, receipt.runId, "second").pipe(Effect.flip)).toMatchObject({
            _tag: "@batonfx/runtime/ChildLimitExceeded",
            depth: 1,
            current: 1,
            limit: 1,
          })
        }),
      ),
    )

    it.live("serializes concurrent singleton and group admission for the same parent", () =>
      provide(
        Effect.gen(function* () {
          const context = yield* root({ maxDepth: 1, maxSubagents: 4 })
          const exits = yield* Effect.all(
            [
              admit(context.children, context.runId, "concurrent-single").pipe(Effect.exit),
              group(context.runtime, context.runId, "concurrent-group", 4).pipe(Effect.exit),
            ],
            { concurrency: "unbounded" },
          )
          expect(exits.filter((exit) => exit._tag === "Success")).toHaveLength(1)
          expect(yield* context.children.listDirect(context.runId)).toHaveLength(exits[0]._tag === "Success" ? 1 : 4)
        }),
      ),
    )

    it.live("applies maxSubagents per parent rather than globally per depth", () =>
      provide(
        Effect.gen(function* () {
          const context = yield* root({ maxDepth: 2, maxSubagents: 4 })
          const siblings = yield* group(context.runtime, context.runId, "parents", 4)
          yield* Effect.forEach(
            siblings.childRunIds,
            (parentRunId, parent) =>
              Effect.forEach(Array.from({ length: 4 }), (_, child) =>
                admit(context.children, parentRunId, `branch-${parent}-${child}`, undefined, "analyst"),
              ),
            { concurrency: "unbounded" },
          )
          expect(yield* context.children.listDirect(context.runId)).toHaveLength(4)
          for (const parentRunId of siblings.childRunIds)
            expect(yield* context.children.listDirect(parentRunId)).toHaveLength(4)
        }),
      ),
    )

    it.live("applies the same policy atomically to initial and Program child entry paths", () =>
      provide(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const initialId = `${options.name}:bounds:initial:${sequence++}`
          const initialFailure = yield* runtime
            .start({
              executable: assistantRef,
              registrations: registrationsFor(assistantRef),
              sessionId: initialId,
              idempotencyKey: initialId,
              runId: initialId,
              prompt: "root",
              treePolicy: { maxDepth: 0, maxSubagents: 4 },
              initialChildren: [
                {
                  invocationId: "initial-child",
                  idempotencyKey: "initial-child",
                  selection: "researcher",
                  prompt: "child",
                  sessionId: `${initialId}:child`,
                },
              ],
            })
            .pipe(Effect.flip)
          expect(initialFailure).toBeInstanceOf(Errors.ChildDepthExceeded)
          expect((yield* runtime.inspect(initialId).pipe(Effect.option))._tag).toBe("None")

          const context = yield* root({ maxDepth: 0, maxSubagents: 4 })
          yield* activate(context.runId)
          const claim = yield* context.store.claimExecution({ runId: context.runId, ownerId: "program-bound" })
          const programInput = {
            ...claim,
            childRunId: `${context.runId}:program-child`,
            invocationId: "program-child",
            message: Message.make({
              id: "program-child",
              to: Address.make(`program-child:${context.runId}`),
              sessionId: `${context.runId}:program-child`,
              prompt: textPrompt("program child"),
              idempotencyKey: "program-child",
              correlationId: context.runId,
            }),
            executableRef: researcherRef.ref,
            executableManifest: researcherRef.manifest,
            registrations: registrationsFor(researcherRef),
          }
          expect(yield* store.admitProgramChild(programInput).pipe(Effect.flip)).toBeInstanceOf(
            Errors.ChildDepthExceeded,
          )
          expect(yield* context.children.listDirect(context.runId)).toHaveLength(0)

          const suspension = AgentEvent.AgentSuspended.make({
            token: programInput.childRunId,
            reason: "tool-wait",
            tool_call_id: "program-child",
            tool_name: "code_mode",
            tool_params: {},
            tool_call_batch: [],
          })
          expect(
            yield* store
              .admitProgramChildAndSuspend({
                ...programInput,
                wait: {
                  waitId: "program-child",
                  reason: { _tag: "ToolWait" },
                  status: "open",
                  openedAt: "2026-08-12T00:00:00.000Z",
                },
                suspension,
              })
              .pipe(Effect.flip),
          ).toBeInstanceOf(Errors.ChildDepthExceeded)
          expect(yield* context.children.listDirect(context.runId)).toHaveLength(0)
          expect(yield* runtime.inspect(context.runId)).not.toMatchObject({ status: "waiting" })
        }),
      ),
    )
  })
}
