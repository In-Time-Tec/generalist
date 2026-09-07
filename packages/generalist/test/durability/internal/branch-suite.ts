import { BunCrypto } from "@effect/platform-bun"
/* oxlint-disable effecttsgo/strict-effect-provide -- Each durability test owns its scoped BunCrypto test-host Layer. */
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { ObjectStore } from "../../../src/durability/object-store.js"

import { activate, layerRunStore } from "../../../src/durability/index.js"
import {
  RunStore as RunStoreTag,
  type ExecutionClaim,
  type Service as RunStore,
} from "../../../src/runtime/run/store.js"
import { Address } from "../../../src/runtime/address.js"
import { Cursor } from "../../../src/runtime/cursor.js"

import { digest } from "../../../src/core/durable/canonical-json.js"
import { run as runProgram } from "../../../src/core/program/agent-program.js"
import { ProgramRunner } from "../../../src/core/program/runner.js"
import { make as makeProgramRunner } from "../../../src/runtime/program/runner.js"
import { program, programAddress, programExecutable, programFixture } from "../../runtime/program/fixture.js"
import { make as makeSimulator, type Client } from "../../../src/testing/durability/index.js"
import { registrationsFor } from "../../runtime/execution/fixtures.js"

export const register = ({
  makeRunStore,
  makeTest,
}: {
  readonly makeRunStore: typeof import("../../../src/runtime/state/store.js").makeRunStore
  readonly makeTest: typeof import("../../../src/runtime/executable/manifest.js").makeTest
}): void => {
  const executable = makeTest("branch-evidence", "1")
  const address = Address.make("agent:branch-evidence")
  const options = {
    environment: "test",
    tenant: "branch-evidence",
    partition: "shared",
    addresses: [
      { address, executable, registrations: registrationsFor(executable) },
      { address: programAddress, executable: programExecutable, registrations: registrationsFor(programExecutable) },
    ],
  }
  const open = (client: Client) => makeRunStore(options).pipe(Effect.provideService(ObjectStore, client.store))
  const openActive = (client: Client, workerId: string) =>
    Effect.gen(function* () {
      const context = yield* Layer.build(
        layerRunStore({ ...options, workerId }).pipe(Layer.provide(Layer.succeed(ObjectStore, client.store))),
      )
      yield* activate.pipe(Effect.provide(context))
      return yield* RunStoreTag.pipe(Effect.provide(context))
    })
  const admission = (key: string, isProgram = false) => ({
    message: {
      id: `message:${key}`,
      to: isProgram ? programAddress : address,
      sessionId: `session:${key}`,
      prompt: Prompt.make("retain accepted evidence"),
      idempotencyKey: key,
      correlationId: key,
      metadata: {},
    },
    executableRef: (isProgram ? programExecutable : executable).ref,
    executableManifest: (isProgram ? programExecutable : executable).manifest,
    registrations: registrationsFor(isProgram ? programExecutable : executable),
    budget: isProgram ? {} : { toolCalls: 3, children: 3 },
  })
  const history = (store: RunStore, runId: string) => store.history({ runId, cursor: Cursor.make(-1), limit: 200 })
  const call = Schema.decodeSync(Response.ToolCallPart("payment", Schema.Unknown))({
    type: "tool-call",
    id: "payment",
    name: "payment",
    params: { amount: 5 },
    providerExecuted: false,
  })

  const commitLeaf = (store: RunStore, claim: ExecutionClaim, label: string, parentId: string | null) =>
    Effect.gen(function* () {
      const operationKey = `${claim.runId}:model:${label}`
      const operation = yield* store.recordOperation({
        ...claim,
        operationKey,
        kind: "model",
        inputDigest: label,
        input: { label },
        replayPolicy: "never",
        attempt: 0,
      })
      yield* store.startOperation({ ...claim, operationId: operation.operationId, commandId: `model:${label}` })
      const response = { content: [Response.makePart("text", { text: label })], finishReason: "stop" as const }
      const unsigned = {
        operationId: operationKey,
        turn: 0,
        modelCallId: `call:${label}`,
        modelAttemptId: `attempt:${label}`,
        attempt: 0,
        sessionParentId: parentId,
        replayFromHistory: false,
        content: yield* Schema.encodeEffect(Schema.Array(Response.TextPart))(response.content),
        finishReason: "stop" as const,
        budgetCharge: 0,
      }
      const completed = yield* store.commitModelResponse({
        ...claim,
        operationId: operation.operationId,
        outcome: { _tag: "Succeeded", value: { ...unsigned, digest: digest(unsigned) } },
        event: {
          _tag: "ModelResponseCommitted",
          turn: 0,
          operationKey,
          modelCallId: `call:${label}`,
          modelAttemptId: `attempt:${label}`,
          attempt: 0,
          response,
          budgetCharge: 0,
          digest: digest(unsigned),
        },
      })
      const session = Option.getOrThrow(yield* store.claimedSessionStore(claim))
      return { sequence: completed.completedSequence!, leaf: yield* session.leaf }
    })

  /** INV-11: public RunStore commands over fresh production object-journal materializations. */
  describe("object branch evidence", () => {
    it.effect("A-B-A rewind retains incurred spend and an external receipt without reviving either prior writer", () =>
      Effect.gen(function* () {
        const bucket = yield* makeSimulator()
        const first = yield* openActive(bucket, "a")
        const run = yield* first.admitSend(admission("rewind"))
        const ownerA = yield* first.claimExecution({ runId: run.runId, ownerId: "a", commandId: "claim-a" })
        const a = yield* commitLeaf(first, ownerA, "A", null)
        const writerA = Option.getOrThrow(yield* first.claimedSessionStore(ownerA))
        yield* first.emitAgentEvent({
          ...ownerA,
          commandId: "payment-cost",
          event: { _tag: "ToolExecutionStarted", turn: 0, call },
        })
        const payment = yield* first.recordOperation({
          ...ownerA,
          operationKey: "external-payment",
          kind: "tool",
          inputDigest: "payment-5",
          input: { amount: 5 },
          replayPolicy: "never",
          attempt: 0,
        })
        yield* first.startOperation({ ...ownerA, operationId: payment.operationId, commandId: "payment-dispatch" })
        yield* first.completeOperation({
          ...ownerA,
          operationId: payment.operationId,
          outcome: { _tag: "Succeeded", value: { receipt: "paid-5" } },
        })
        yield* first.releaseExecution(ownerA)
        const second = yield* openActive(yield* bucket.connect, "b")
        const ownerB = yield* second.claimExecution({ runId: run.runId, ownerId: "b", commandId: "claim-b" })
        const b = yield* commitLeaf(second, ownerB, "B", a.leaf)
        const writerB = Option.getOrThrow(yield* second.claimedSessionStore(ownerB))
        const before = yield* history(second, run.runId)
        yield* second.rewind({
          runId: run.runId,
          toSequence: a.sequence,
          commandId: "archive-ab",
          branchRunId: "archive-ab",
        })
        const recovered = yield* openActive(yield* bucket.connect, "c")
        const reader = Option.getOrThrow(yield* recovered.sessionReader("session:rewind"))
        expect(yield* reader.leaf).toBe(a.leaf)
        expect((yield* reader.entry(b.leaf!))?.id).toBe(b.leaf)
        expect((yield* history(recovered, run.runId)).slice(0, before.length)).toEqual(before)
        expect((yield* recovered.snapshot(run.runId)).budget.toolCalls).toBe(2)
        expect(yield* recovered.getOperation({ runId: run.runId, operationId: payment.operationId })).toMatchObject({
          status: "succeeded",
          result: { receipt: "paid-5" },
          replayPolicy: "never",
        })
        for (const writer of [writerA, writerB]) {
          expect(
            yield* writer
              .append(
                { _tag: "Message", message: Prompt.make("stale").content[0]! },
                {
                  id: "stale",
                  expectedLeafId: a.leaf,
                },
              )
              .pipe(Effect.flip),
          ).toMatchObject({ reason: "conflict" })
        }
        yield* recovered.activate({ runId: run.runId, commandId: "activate-rewound-c" })
        const ownerC = yield* recovered.claimExecution({ runId: run.runId, ownerId: "c", commandId: "claim-c" })
        expect(BigInt(ownerC.session.epoch)).toBeGreaterThan(BigInt(ownerB.session.epoch))
        expect(ownerC.attemptFence).toBeGreaterThan(ownerB.attemptFence)
        const replay = yield* recovered.startOperation({
          ...ownerC,
          operationId: payment.operationId,
          commandId: "payment-replay",
        })
        expect(replay).toMatchObject({ status: "succeeded", result: { receipt: "paid-5" } })
      }).pipe(Effect.scoped, Effect.provide(BunCrypto.layer)),
    )

    it.effect(
      "fork reserves only current capacity and rewind cannot refund its reservation or duplicate inherited costs",
      () =>
        Effect.gen(function* () {
          const bucket = yield* makeSimulator()
          const store = yield* openActive(bucket, "budget")
          const run = yield* store.admitSend(admission("allocation"))
          const claim = yield* store.claimExecution({ runId: run.runId, ownerId: "budget", commandId: "budget-claim" })
          yield* store.emitAgentEvent({
            ...claim,
            commandId: "incurred-cost",
            event: { _tag: "ToolExecutionStarted", turn: 0, call },
          })
          yield* store.releaseExecution(claim)
          const atSequence = (yield* store.inspect(run.runId)).lastSequence
          expect(
            yield* store
              .fork({ runId: run.runId, atSequence, commandId: "missing-grant", newRunId: "missing-grant" })
              .pipe(Effect.flip),
          ).toMatchObject({ _tag: "generalist/core/RunBudgetInvalid" })
          yield* store.fork({
            runId: run.runId,
            atSequence,
            commandId: "allocated",
            newRunId: "allocated",
            budget: { toolCalls: 1, children: 0 },
          })
          expect((yield* store.snapshot("allocated")).budget.toolCalls).toBe(1)
          expect((yield* store.snapshot(run.runId)).budget.toolCalls).toBe(1)
          expect(
            yield* store
              .fork({
                runId: run.runId,
                atSequence,
                commandId: "overspend",
                newRunId: "overspend",
                budget: { toolCalls: 2, children: 0 },
              })
              .pipe(Effect.flip),
          ).toMatchObject({ _tag: "generalist/core/RunBudgetExhausted" })
          yield* store.rewind({
            runId: run.runId,
            toSequence: 0,
            commandId: "budget-archive",
            branchRunId: "budget-archive",
          })
          const recovered = yield* open(yield* bucket.connect)
          expect((yield* recovered.snapshot(run.runId)).budget.toolCalls).toBe(1)
          expect((yield* recovered.snapshot(run.runId)).budget.children).toBe(2)
          expect(
            (yield* history(recovered, run.runId)).filter(
              (event) => event._tag === "RunForked" && event.role === "source",
            ),
          ).toHaveLength(1)
        }).pipe(Effect.scoped, Effect.provide(BunCrypto.layer)),
    )

    it.effect(
      "Program forks replay retained outcomes while fresh rewind identities consume the separately reserved grant",
      () =>
        Effect.gen(function* () {
          const bucket = yield* makeSimulator()
          const store = yield* openActive(bucket, "source")
          const fixture = programFixture()
          const run = yield* store.admitSend(admission("program", true))
          const execute = (current: RunStore, runId: string, label: string) =>
            Effect.gen(function* () {
              yield* current.activate({ runId, commandId: `activate:${label}` })
              const claim = yield* current.claimExecution({ runId, ownerId: label, commandId: `claim:${label}` })
              const claimed = yield* current.loadExecution(runId)
              const output = yield* runProgram(program, claimed.message.prompt).pipe(
                Effect.provideService(
                  ProgramRunner,
                  makeProgramRunner({
                    claim,
                    claimed,
                    store: current,
                    executor: fixture.executor,
                    handlers: fixture.handlers,
                  }),
                ),
              )
              yield* current.releaseExecution(claim)
              return output
            })
          expect(yield* execute(store, run.runId, "source")).toBe("value:1|value:1")
          const echo = yield* store.getProgramOperation({ runId: run.runId, operation: "echo" })
          yield* store.fork({
            runId: run.runId,
            atSequence: echo!.completedSequence!,
            commandId: "program-fork",
            newRunId: "program-fork",
            budget: {},
            programBudget: { ...program.pinned.manifest.budget, toolCalls: 1, logBytes: 500, wallClockMillis: 30_000 },
          })
          const recovered = yield* openActive(yield* bucket.connect, "fork")
          expect(yield* execute(recovered, "program-fork", "fork")).toBe("value:1|value:1")
          expect(fixture.counts().toolCalls).toBe(1)
          expect(yield* recovered.loadProgramState(run.runId)).toMatchObject({ toolCalls: 2 })
          const before = yield* recovered.loadProgramState("program-fork")
          yield* recovered.rewind({
            runId: "program-fork",
            toSequence: 0,
            commandId: "program-archive",
            branchRunId: "program-archive",
          })
          const reopened = yield* openActive(yield* bucket.connect, "rewound")
          expect(yield* execute(reopened, "program-fork", "rewound")).toBe("value:2|value:2")
          expect(yield* reopened.getProgramOperation({ runId: "program-fork", operation: "echo" })).toMatchObject({
            status: "succeeded",
            result: "value:1",
          })
          expect(yield* reopened.loadProgramState("program-fork")).toMatchObject({
            toolCalls: 1,
            deadlineMillis: before!.deadlineMillis,
          })
          yield* reopened.rewind({
            runId: "program-fork",
            toSequence: 0,
            commandId: "program-archive-two",
            branchRunId: "program-archive-two",
          })
          const exhausted = yield* openActive(yield* bucket.connect, "exhausted")
          // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context -- The Program runner's asserted failure is intentionally untyped at this public recovery boundary.
          expect(yield* execute(exhausted, "program-fork", "exhausted").pipe(Effect.flip)).toMatchObject({
            dimension: "toolCalls",
            limit: 1,
          })
          expect(fixture.counts().toolCalls).toBe(2)
        }).pipe(Effect.scoped, Effect.provide(BunCrypto.layer)),
    )

    it.effect("forking a settled child reserves from the ancestor that received its unused allowance", () =>
      Effect.gen(function* () {
        const bucket = yield* makeSimulator()
        const store = yield* openActive(bucket, "parent")
        const parent = yield* store.admitSend(admission("ancestor"))
        const owner = yield* store.claimExecution({
          runId: parent.runId,
          ownerId: "parent",
          commandId: "ancestor-claim",
        })
        const childInput = admission("settled-child")
        const child = yield* store.admitProgramChild({
          ...owner,
          childRunId: "settled-child",
          invocationId: "child-invocation",
          message: childInput.message,
          executableRef: executable.ref,
          executableManifest: executable.manifest,
          registrations: childInput.registrations,
        })
        const childStore = yield* openActive(yield* bucket.connect, "child")
        const childOwner = yield* childStore.claimExecution({
          runId: child.runId,
          ownerId: "child",
          commandId: "child-claim",
        })
        yield* childStore.complete({
          ...childOwner,
          commandId: `${child.runId}:complete`,
          result: {
            text: "done",
            output: "done",
            turns: 0,
            session: { sessionId: childInput.message.sessionId, leafId: null },
          },
        })
        yield* childStore.releaseExecution(childOwner)
        yield* store.releaseExecution(owner)
        const atSequence = (yield* store.inspect(child.runId)).lastSequence
        yield* store.fork({
          runId: child.runId,
          atSequence,
          commandId: "child-fork",
          newRunId: "child-fork",
          budget: { toolCalls: 1, children: 0 },
        })
        const recovered = yield* open(yield* bucket.connect)
        expect((yield* recovered.snapshot(parent.runId)).budget.toolCalls).toBe(2)
        expect((yield* history(recovered, "child-fork")).findLast((event) => event._tag === "RunForked")).toMatchObject(
          {
            sourceRunId: child.runId,
            allocationRunId: parent.runId,
            role: "target",
          },
        )
        yield* recovered.fork({
          runId: parent.runId,
          atSequence: 0,
          commandId: "remaining-grant",
          newRunId: "remaining-grant",
          budget: { toolCalls: 2, children: 0 },
        })
        expect(
          yield* recovered
            .fork({
              runId: child.runId,
              atSequence,
              commandId: "stale-child-allowance",
              newRunId: "stale-child-allowance",
              budget: { toolCalls: 1, children: 0 },
            })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "generalist/core/RunBudgetExhausted" })
      }).pipe(Effect.scoped, Effect.provide(BunCrypto.layer)),
    )

    it.effect("settled-child rewind requires a new ancestor grant without erasing the earlier incurred cost", () =>
      Effect.gen(function* () {
        const bucket = yield* makeSimulator()
        const store = yield* openActive(bucket, "parent")
        const parent = yield* store.admitSend(admission("rewind-ancestor"))
        const owner = yield* store.claimExecution({
          runId: parent.runId,
          ownerId: "parent",
          commandId: "rewind-parent",
        })
        const childInput = admission("rewind-child")
        const child = yield* store.admitProgramChild({
          ...owner,
          childRunId: "rewind-child",
          invocationId: "rewind-invocation",
          message: childInput.message,
          executableRef: executable.ref,
          executableManifest: executable.manifest,
          registrations: childInput.registrations,
        })
        const childStore = yield* openActive(yield* bucket.connect, "child")
        const original = yield* childStore.claimExecution({
          runId: child.runId,
          ownerId: "child",
          commandId: "rewind-child",
        })
        yield* childStore.emitAgentEvent({
          ...original,
          commandId: "first-child-cost",
          event: { _tag: "ToolExecutionStarted", turn: 0, call },
        })
        yield* childStore.complete({
          ...original,
          result: {
            text: "done",
            output: "done",
            turns: 0,
            session: { sessionId: childInput.message.sessionId, leafId: null },
          },
          commandId: `${child.runId}:complete`,
        })
        yield* store.releaseExecution(owner)
        const before = yield* history(store, child.runId)
        expect(
          yield* store
            .rewind({
              runId: child.runId,
              toSequence: 0,
              commandId: "missing-reallocation",
              branchRunId: "missing-reallocation",
            })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "generalist/core/RunBudgetInvalid" })
        yield* store.rewind({
          runId: child.runId,
          toSequence: 0,
          commandId: "reallocated-history",
          branchRunId: "reallocated-history",
          budget: { toolCalls: 1, children: 0 },
        })
        const recovered = yield* openActive(yield* bucket.connect, "fresh")
        expect((yield* history(recovered, child.runId)).slice(0, before.length)).toEqual(before)
        expect((yield* recovered.snapshot(child.runId)).budget.toolCalls).toBe(1)
        expect((yield* recovered.snapshot(parent.runId)).budget.toolCalls).toBe(1)
        const fresh = yield* recovered.claimExecution({
          runId: child.runId,
          ownerId: "fresh",
          commandId: "reallocated-claim",
        })
        yield* recovered.emitAgentEvent({
          ...fresh,
          commandId: "new-child-cost",
          event: { _tag: "ToolExecutionStarted", turn: 1, call },
        })
        yield* recovered.rewind({
          runId: child.runId,
          toSequence: 0,
          commandId: "second-reallocated-history",
          branchRunId: "second-reallocated-history",
        })
        expect((yield* recovered.snapshot(child.runId)).budget.toolCalls).toBe(0)
        expect((yield* recovered.snapshot(parent.runId)).budget.toolCalls).toBe(1)
        expect(
          (yield* history(recovered, child.runId)).filter((event) => event._tag === "ToolExecutionStarted"),
        ).toHaveLength(2)
      }).pipe(Effect.scoped, Effect.provide(BunCrypto.layer)),
    )

    it.effect("Program forks share the source concurrency pool across independent owners", () =>
      Effect.gen(function* () {
        const bucket = yield* makeSimulator()
        const store = yield* openActive(bucket, "source")
        const run = yield* store.admitSend(admission("concurrency", true))
        const owner = yield* store.claimExecution({ runId: run.runId, ownerId: "source", commandId: "pool-source" })
        yield* store.reserveProgramOperation({
          ...owner,
          programPin: program.pinned.pin,
          budget: program.pinned.manifest.budget,
          operation: "holder",
          authoredOperation: "holder",
          kind: "step",
          capability: "hold",
          inputDigest: "hold",
          input: null,
          replay: "idempotent",
          reservation: { activeSlots: 1 },
        })
        yield* store.startProgramOperation({ ...owner, operation: "holder" })
        yield* store.releaseExecution(owner)
        yield* store.fork({
          runId: run.runId,
          atSequence: 0,
          commandId: "pool-fork",
          newRunId: "pool-fork",
          budget: {},
          programBudget: { ...program.pinned.manifest.budget, toolCalls: 1, logBytes: 100, wallClockMillis: 30_000 },
        })
        const independent = yield* openActive(yield* bucket.connect, "target")
        yield* independent.activate({ runId: "pool-fork", commandId: "activate-pool-fork" })
        const target = yield* independent.claimExecution({
          runId: "pool-fork",
          ownerId: "target",
          commandId: "pool-target",
        })
        const reservation = {
          ...target,
          programPin: program.pinned.pin,
          budget: program.pinned.manifest.budget,
          operation: "future",
          authoredOperation: "future",
          kind: "tool" as const,
          capability: "echo",
          inputDigest: "future",
          input: "value",
          replay: "non-idempotent" as const,
          reservation: { toolCalls: 1, activeSlots: 1 },
        }
        expect(yield* independent.reserveProgramOperation(reservation).pipe(Effect.flip)).toMatchObject({
          dimension: "concurrency",
          limit: 1,
        })
        const replacementStore = yield* openActive(yield* bucket.connect, "replacement")
        const replacement = yield* replacementStore.claimExecution({
          runId: run.runId,
          ownerId: "replacement",
          commandId: "pool-release",
        })
        yield* replacementStore.settleProgramOperation({
          commandId: "branch:replacement:settle",
          ...replacement,
          operation: "holder",
          outcome: { _tag: "Succeeded", value: "released" },
          releaseSlots: 1,
        })
        expect(yield* independent.reserveProgramOperation(reservation)).toMatchObject({ status: "reserved" })
        expect(yield* independent.loadProgramState("pool-fork")).toMatchObject({ toolCalls: 1, activeSlots: 1 })
      }).pipe(Effect.scoped, Effect.provide(BunCrypto.layer)),
    )
    it.effect("reopens a child fork as an independent root without stale event ancestry", () =>
      Effect.gen(function* () {
        const bucket = yield* makeSimulator()
        const store = yield* openActive(bucket, "parent")
        const parent = yield* store.admitSend(admission("root-fork-ancestry"))
        const owner = yield* store.claimExecution({
          runId: parent.runId,
          ownerId: "parent",
          commandId: "root-fork-ancestry-claim",
        })
        const childInput = admission("root-fork-child")
        const child = yield* store.admitProgramChild({
          ...owner,
          childRunId: "root-fork-child",
          invocationId: "root-fork-child-invocation",
          message: childInput.message,
          executableRef: childInput.executableRef,
          executableManifest: childInput.executableManifest,
          registrations: childInput.registrations,
        })
        yield* store.releaseExecution(owner)
        yield* store.fork({
          runId: child.runId,
          atSequence: 0,
          commandId: "root-fork-target",
          newRunId: "root-fork-target",
          budget: { toolCalls: 1, children: 0 },
        })

        const reopened = yield* open(yield* bucket.connect)
        const sourceEvents = yield* history(reopened, child.runId)
        const targetEvents = yield* history(reopened, "root-fork-target")
        const target = yield* reopened.loadExecution("root-fork-target")
        expect(target).toMatchObject({ runId: "root-fork-target", rootRunId: "root-fork-target", depth: 0 })
        expect(target.parentRunId).toBeUndefined()
        expect(sourceEvents.some((event) => event.parentRunId === parent.runId)).toBe(true)
        expect(targetEvents.every((event) => event.parentRunId === undefined)).toBe(true)
        expect(targetEvents.findLast((event) => event._tag === "RunForked" && event.role === "target")).toMatchObject({
          sourceRunId: child.runId,
          forkRunId: "root-fork-target",
        })
      }).pipe(Effect.scoped, Effect.provide(BunCrypto.layer)),
    )
  })
}
