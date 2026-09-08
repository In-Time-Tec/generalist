import { describe, expect, it } from "@effect/vitest"
import { objectWorkerId } from "../../execution/object.js"
import { Effect, Layer } from "effect"
import { Address, ChildAdmission, Errors, Message, Runtime, RunStore } from "../../../../src/runtime/index.js"
import {
  assistantAddress,
  assistantRef,
  completedResult,
  registrationsFor,
  researcherRef,
  suspension,
  textPrompt,
} from "../../execution/fixtures.js"
import { provideScoped } from "../../execution/scoped-provide.js"

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
  const root = (policy: {
    readonly maxDepth: number
    readonly maxSessions: number
    readonly concurrency: { readonly agents: number; readonly tools: number }
  }) =>
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
    children: ChildAdmission.Service,
    parentRunId: string,
    key: string,
    prompt = key,
    selection = "researcher",
  ) => children.admit({ parentRunId, toolCallId: `call:${key}`, selection, prompt, key })
  const group = (runtime: Runtime.Service, parentRunId: string, key: string, size: number) =>
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
    it.live("promotes already admitted children after their parent completes", () =>
      provide(
        Effect.gen(function* () {
          const context = yield* root({ maxDepth: 1, maxSessions: 3, concurrency: { agents: 1, tools: 4 } })
          yield* activate(context.runId)
          const first = yield* admit(context.children, context.runId, "first-after-parent")
          const second = yield* admit(context.children, context.runId, "second-after-parent")
          const parentClaim = yield* context.store.claimExecution({
            runId: context.runId,
            ownerId: objectWorkerId,
            commandId: "finish-parent-claim",
          })
          yield* context.store.complete({
            ...parentClaim,
            commandId: "finish-parent",
            result: completedResult("parent done"),
          })
          const childClaim = yield* context.store.claimExecution({
            runId: first.childRunId,
            ownerId: objectWorkerId,
            commandId: "finish-child-claim",
          })
          yield* context.store.complete({
            ...childClaim,
            commandId: "finish-child",
            result: completedResult("child done"),
          })
          expect(yield* context.runtime.inspect(second.childRunId)).toMatchObject({ childReadiness: "ready" })
        }),
      ),
    )

    it.live("does not claim an Agent when its pinned Agent concurrency is zero", () =>
      provide(
        Effect.gen(function* () {
          const context = yield* root({ maxDepth: 2, maxSessions: 4, concurrency: { agents: 0, tools: 4 } })
          yield* activate(context.runId)
          expect(
            yield* context.store
              .claimExecution({ runId: context.runId, ownerId: objectWorkerId, commandId: "zero-agent-capacity" })
              .pipe(Effect.flip),
          ).toBeInstanceOf(Errors.RuntimeUnavailable)
        }),
      ),
    )

    it.live("releases a suspended parent's live Agent slot for its descendant", () =>
      provide(
        Effect.gen(function* () {
          const context = yield* root({ maxDepth: 2, maxSessions: 4, concurrency: { agents: 1, tools: 4 } })
          yield* activate(context.runId)
          const parent = yield* context.store.claimExecution({
            runId: context.runId,
            ownerId: objectWorkerId,
            commandId: "capacity-parent",
          })
          const child = yield* admit(context.children, context.runId, "capacity-descendant")
          expect(
            yield* context.store
              .claimExecution({ runId: child.childRunId, ownerId: objectWorkerId, commandId: "capacity-denied" })
              .pipe(Effect.flip),
          ).toBeInstanceOf(Errors.RuntimeUnavailable)
          yield* context.store.suspend({
            ...parent,
            waits: [
              {
                waitId: "capacity-wait",
                reason: { _tag: "ToolWait" },
                status: "open",
                openedAt: "2026-08-12T00:00:00.000Z",
              },
            ],
            suspension: suspension({
              waitId: "capacity-wait",
              token: child.childRunId,
              toolCallId: "capacity-tool",
              toolName: "run_child",
              toolParams: {},
            }),
          })
          expect(
            yield* context.store.claimExecution({
              runId: child.childRunId,
              ownerId: objectWorkerId,
              commandId: "capacity-admitted",
            }),
          ).toMatchObject({ runId: child.childRunId })
        }),
      ),
    )

    it.live("retains family Session reservations after settlement and rejects groups atomically", () =>
      provide(
        Effect.gen(function* () {
          const context = yield* root({ maxDepth: 2, maxSessions: 2, concurrency: { agents: 2, tools: 4 } })
          const child = yield* admit(context.children, context.runId, "retained-session")
          yield* context.children.cancel({ parentRunId: context.runId, childRunId: child.childRunId })
          const failure = yield* admit(context.children, context.runId, "exceeds-retained").pipe(Effect.flip)
          expect(failure).toMatchObject({
            _tag: "generalist/runtime/ChildLimitExceeded",
            current: 2,
            requested: 1,
            limit: 2,
          })
          expect((yield* admit(context.children, context.runId, "retained-session")).childRunId).toBe(child.childRunId)
          const other = yield* root({ maxDepth: 2, maxSessions: 2, concurrency: { agents: 2, tools: 4 } })
          expect(yield* group(other.runtime, other.runId, "too-many", 2).pipe(Effect.flip)).toMatchObject({
            _tag: "generalist/runtime/ChildLimitExceeded",
            current: 1,
            requested: 2,
            limit: 2,
          })
          expect(yield* other.children.listDirect(other.runId)).toHaveLength(0)
        }),
      ),
    )

    it.live("enforces maxDepth 0, 1, and 2 at the exact boundary and persists ancestry", () =>
      provide(
        Effect.gen(function* () {
          for (const maxDepth of [0, 1, 2]) {
            const context = yield* root({ maxDepth, maxSessions: 1024, concurrency: { agents: 8, tools: 1024 } })
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

    it.live("reuses one finite mutually recursive profile registry under a high tree policy", () =>
      provide(
        Effect.gen(function* () {
          const context = yield* root({ maxDepth: 1_024, maxSessions: 1024, concurrency: { agents: 1, tools: 1024 } })
          const rootExecution = yield* context.store.loadExecution(context.runId)
          expect(rootExecution.executableManifest.entries).toHaveLength(3)
          expect(rootExecution.executableManifest.profiles).toHaveLength(2)
          let parentRunId = context.runId
          for (let depth = 1; depth <= 32; depth++) {
            const selection = depth % 2 === 0 ? "analyst" : "researcher"
            const child = yield* admit(context.children, parentRunId, `recursive-${depth}`, undefined, selection)
            const execution = yield* context.store.loadExecution(child.childRunId)
            expect(execution).toMatchObject({
              rootRunId: context.runId,
              depth,
              executableRef: { executable: rootExecution.executableRef.executable },
            })
            expect(execution.executableManifest.entries).toHaveLength(3)
            expect(execution.executableManifest.profiles).toHaveLength(2)
            parentRunId = child.childRunId
          }
        }),
      ),
    )

    it.live("reuses active capacity after terminal and cancelled children settle", () =>
      provide(
        Effect.gen(function* () {
          const context = yield* root({ maxDepth: 2, maxSessions: 1024, concurrency: { agents: 1, tools: 1024 } })
          const first = yield* admit(context.children, context.runId, "single")
          const second = yield* admit(context.children, context.runId, "queued")
          expect(yield* context.runtime.inspect(first.childRunId)).toMatchObject({ childReadiness: "ready" })
          expect(yield* context.runtime.inspect(second.childRunId)).toMatchObject({ childReadiness: "queued" })
          const claim = yield* context.store.claimExecution({
            commandId: "runtime-child-suites-admission-bounds-ts-claim-1",
            runId: first.childRunId,
            ownerId: objectWorkerId,
          })
          yield* context.store.complete({
            commandId: "runtime-child-suites-admission-bounds-ts-store-1",
            ...claim,
            result: completedResult("done"),
          })
          expect(yield* context.runtime.inspect(second.childRunId)).toMatchObject({ childReadiness: "ready" })
          yield* context.children.cancel({ parentRunId: context.runId, childRunId: second.childRunId })
          const third = yield* admit(context.children, context.runId, "after-cancel")
          expect(yield* context.runtime.inspect(third.childRunId)).toMatchObject({ childReadiness: "ready" })
          const history = yield* context.runtime.history({ runId: context.runId, cursor: -1, limit: 100 })
          expect(
            history.filter(
              (event) =>
                event._tag === "ChildReadinessChanged" &&
                event.childRunId === second.childRunId &&
                event.readiness === "ready",
            ),
          ).toHaveLength(1)
        }),
      ),
    )

    it.live("replays before charging and rejects a changed digest without consuming capacity", () =>
      provide(
        Effect.gen(function* () {
          const context = yield* root({ maxDepth: 1, maxSessions: 1024, concurrency: { agents: 2, tools: 1024 } })
          const first = yield* admit(context.children, context.runId, "stable", "same")
          const replay = yield* admit(context.children, context.runId, "stable", "same")
          expect(first.duplicate).toBe(false)
          expect(replay).toEqual(first)
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
          const first = yield* root({ maxDepth: 1, maxSessions: 1024, concurrency: { agents: 1, tools: 1024 } })
          const second = yield* root({ maxDepth: 1, maxSessions: 1024, concurrency: { agents: 1, tools: 1024 } })
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
          expect(admitted.duplicate).toBe(false)
          expect(yield* spawn(first.runId)).toEqual(admitted)
          expect(yield* spawn(second.runId).pipe(Effect.flip)).toBeInstanceOf(Errors.IdempotencyConflict)
          expect(yield* first.children.listDirect(first.runId)).toHaveLength(1)
          expect(yield* second.children.listDirect(second.runId)).toHaveLength(0)
          yield* admit(second.children, second.runId, "own-child")
          expect(yield* second.children.listDirect(second.runId)).toHaveLength(1)
        }),
      ),
    )

    it.live("atomically queues a group beyond capacity and promotes in admission order", () =>
      provide(
        Effect.gen(function* () {
          const context = yield* root({ maxDepth: 1, maxSessions: 1024, concurrency: { agents: 4, tools: 1024 } })
          const receipt = yield* group(context.runtime, context.runId, "queued-group", 5)
          const inspection = yield* context.runtime.inspectFanOut(receipt.fanOutId)
          expect(inspection.members.map((member) => member.readiness)).toEqual([
            "ready",
            "ready",
            "ready",
            "ready",
            "queued",
          ])
          expect(
            yield* context.store
              .claimExecution({
                commandId: "runtime-child-suites-admission-bounds-ts-claim-2",
                runId: inspection.members[4]!.childRunId,
                ownerId: objectWorkerId,
              })
              .pipe(Effect.flip),
          ).toBeInstanceOf(Errors.RuntimeUnavailable)
          const first = yield* context.store.claimExecution({
            commandId: "runtime-child-suites-admission-bounds-ts-claim-3",
            runId: inspection.members[0]!.childRunId,
            ownerId: objectWorkerId,
          })
          yield* context.store.complete({
            commandId: "runtime-child-suites-admission-bounds-ts-store-2",
            ...first,
            result: completedResult("first"),
          })
          const promoted = yield* context.runtime.inspectFanOut(receipt.fanOutId)
          expect(promoted.members[4]).toMatchObject({ readiness: "ready", status: "running" })
          expect(
            yield* context.store.claimExecution({
              commandId: "runtime-child-suites-admission-bounds-ts-claim-4",
              runId: promoted.members[4]!.childRunId,
              ownerId: objectWorkerId,
            }),
          ).toMatchObject({ runId: promoted.members[4]!.childRunId })
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
            .send({ ...base, treePolicy: { maxDepth: -1, maxSessions: 1024, concurrency: { agents: 1, tools: 1024 } } })
            .pipe(Effect.flip)
          expect(invalid).toBeInstanceOf(Errors.TreePolicyInvalid)

          const policy = { maxDepth: 1, maxSessions: 1024, concurrency: { agents: 1, tools: 1024 } }
          const receipt = yield* runtime.send({ ...base, treePolicy: policy })
          policy.maxDepth = 10
          policy.concurrency.agents = 10
          expect(yield* runtime.inspect(receipt.runId)).toMatchObject({
            depth: 0,
            treePolicy: { maxDepth: 1, maxSessions: 1024, concurrency: { agents: 1, tools: 1024 } },
          })
          const children = ChildAdmission.make(yield* RunStore.RunStore)
          const first = yield* admit(children, receipt.runId, "first")
          const second = yield* admit(children, receipt.runId, "second")
          expect(yield* runtime.inspect(first.childRunId)).toMatchObject({ childReadiness: "ready" })
          expect(yield* runtime.inspect(second.childRunId)).toMatchObject({ childReadiness: "queued" })
        }),
      ),
    )

    it.live("serializes concurrent singleton and group admission for the same parent", () =>
      provide(
        Effect.gen(function* () {
          const context = yield* root({ maxDepth: 1, maxSessions: 1024, concurrency: { agents: 4, tools: 1024 } })
          const exits = yield* Effect.all(
            [
              admit(context.children, context.runId, "concurrent-single").pipe(Effect.exit),
              group(context.runtime, context.runId, "concurrent-group", 4).pipe(Effect.exit),
            ],
            { concurrency: "unbounded" },
          )
          expect(exits.filter((exit) => exit._tag === "Success")).toHaveLength(2)
          const direct = yield* context.children.listDirect(context.runId)
          expect(direct).toHaveLength(5)
          expect(direct.filter((child) => child.readiness === "ready")).toHaveLength(4)
          expect(direct.filter((child) => child.readiness === "queued")).toHaveLength(1)
        }),
      ),
    )

    it.live("retains each parent's children while bounding ready capacity across the family", () =>
      provide(
        Effect.gen(function* () {
          const context = yield* root({ maxDepth: 2, maxSessions: 1024, concurrency: { agents: 4, tools: 1024 } })
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
          for (const parentRunId of siblings.childRunIds) {
            const descendants = yield* context.children.listDirect(parentRunId)
            expect(descendants).toHaveLength(4)
            expect(descendants.every((child) => child.readiness === "queued")).toBe(true)
          }
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
            .startExecution({
              executable: assistantRef,
              registrations: registrationsFor(assistantRef),
              sessionId: initialId,
              idempotencyKey: initialId,
              runId: initialId,
              prompt: "root",
              treePolicy: { maxDepth: 0, maxSessions: 1024, concurrency: { agents: 4, tools: 1024 } },
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

          const context = yield* root({ maxDepth: 0, maxSessions: 1024, concurrency: { agents: 4, tools: 1024 } })
          yield* activate(context.runId)
          const claim = yield* context.store.claimExecution({
            commandId: "runtime-child-suites-admission-bounds-ts-claim-5",
            runId: context.runId,
            ownerId: objectWorkerId,
          })
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

          const suspended = suspension({
            waitId: "program-child",
            token: programInput.childRunId,
            toolCallId: "program-child",
            toolName: "code_mode",
            toolParams: {},
          })
          expect(
            yield* store
              .admitProgramChildAndSuspend({
                ...claim,
                children: [programInput],
                waits: [
                  {
                    waitId: "program-child",
                    reason: { _tag: "ToolWait" },
                    status: "open",
                    openedAt: "2026-08-12T00:00:00.000Z",
                  },
                ],
                suspension: suspended,
              })
              .pipe(Effect.flip),
          ).toBeInstanceOf(Errors.ChildDepthExceeded)
          expect(yield* context.children.listDirect(context.runId)).toHaveLength(0)
          expect(yield* runtime.inspect(context.runId)).not.toMatchObject({ status: "waiting" })
        }),
      ),
    )

    it.live("rolls back every Program child when a later atomic batch admission fails validation", () =>
      provide(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const context = yield* root({ maxDepth: 1, maxSessions: 1024, concurrency: { agents: 1, tools: 1024 } })
          yield* activate(context.runId)
          const claim = yield* context.store.claimExecution({
            commandId: "runtime-child-suites-admission-bounds-ts-claim-6",
            runId: context.runId,
            ownerId: objectWorkerId,
          })
          const programInput = (suffix: string) => ({
            childRunId: `${context.runId}:program-child:${suffix}`,
            invocationId: `program-child:${suffix}`,
            message: Message.make({
              id: `program-child:${suffix}`,
              to: Address.make(`program-child:${context.runId}`),
              sessionId: `${context.runId}:program-child`,
              prompt: textPrompt(`program child ${suffix}`),
              idempotencyKey: `program-child:${suffix}`,
              correlationId: context.runId,
            }),
            executableRef: researcherRef.ref,
            executableManifest: researcherRef.manifest,
            registrations: registrationsFor(researcherRef),
          })
          const first = programInput("first")
          const second = { ...programInput("second"), registrations: [] }
          const suspended = suspension({
            waitId: "program-batch",
            token: first.childRunId,
            toolCallId: "program-batch",
            toolName: "code_mode",
            toolParams: {},
          })
          const failure = yield* context.store
            .admitProgramChildAndSuspend({
              ...claim,
              children: [first, second],
              waits: [
                {
                  waitId: "program-batch",
                  reason: { _tag: "ToolWait" },
                  status: "open",
                  openedAt: "2026-08-12T00:00:00.000Z",
                },
              ],
              suspension: suspended,
            })
            .pipe(Effect.flip)
          expect(failure).toBeInstanceOf(Errors.RuntimeUnavailable)
          expect(yield* context.children.listDirect(context.runId)).toEqual([])
          expect((yield* runtime.inspect(first.childRunId).pipe(Effect.option))._tag).toBe("None")
          expect((yield* runtime.inspect(second.childRunId).pipe(Effect.option))._tag).toBe("None")
          expect(yield* runtime.inspect(context.runId)).not.toMatchObject({ status: "waiting" })
        }),
      ),
    )
  })
}
