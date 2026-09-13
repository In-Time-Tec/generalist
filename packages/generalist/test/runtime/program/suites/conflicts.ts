import { expect, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Pins } from "../../../../src/index.js"
import { ProgramReplayDivergence } from "../../../../src/core/program/capabilities.js"
import { DurabilityFailure } from "../../../../src/durability/errors.js"
import { ApprovalMismatch, OperationResolutionConflict } from "../../../../src/runtime/errors.js"
import * as Runtime from "../../../../src/runtime/engine.js"
import { RunStore } from "../../../../src/runtime/run/store.js"
import { RunExecutor } from "../../../../src/runtime/execution/run-executor.js"
import type { ReserveProgramOperationInput } from "../../../../src/runtime/program/store.js"
import { StaleClaim } from "../../../../src/runtime/run/ownership-errors.js"
import { registrationsFor } from "../../execution/fixtures.js"
import { objectRuntimeLayer, objectWorkerId } from "../../execution/object.js"
import { approvalProgramFixture, program, programAddress, programExecutable, programFixture } from "../fixture.js"

const options = {
  addresses: [
    { address: programAddress, executable: programExecutable, registrations: registrationsFor(programExecutable) },
  ],
}

const claimProgram = (label: string) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore
    const receipt = yield* runtime.send({
      to: programAddress,
      sessionId: `program-conflicts:${label}`,
      idempotencyKey: label,
      prompt: "run",
    })
    return yield* store.claimExecution({
      commandId: `program-conflicts:${label}:claim`,
      runId: receipt.runId,
      ownerId: objectWorkerId,
    })
  })

const fixture = programFixture()
layer(objectRuntimeLayer(options).pipe(Layer.provide(fixture.resolverLayer)))(
  "Program reservation conflict mapping",
  (it) => {
    it.effect("distinguishes explicit resolution receipt conflicts from a new domain resolution", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore
        const claim = yield* claimProgram("resolution")
        yield* store.reserveProgramOperation({
          ...claim,
          programPin: program.pinned.pin,
          budget: program.pinned.manifest.budget,
          operation: "uncertain",
          authoredOperation: "uncertain",
          kind: "tool",
          capability: "echo",
          inputDigest: Pins.digest("uncertain"),
          input: "uncertain",
          replay: "non-idempotent",
          reservation: { toolCalls: 1, activeSlots: 1 },
        })
        yield* store.startProgramOperation({ ...claim, operation: "uncertain" })
        yield* store.settleProgramOperation({
          ...claim,
          commandId: "program-conflicts:resolution:unknown",
          operation: "uncertain",
          outcome: { _tag: "Unknown" },
          releaseSlots: 1,
        })
        const input = {
          runId: claim.runId,
          operationId: "uncertain",
          idempotencyKey: "original-resolution",
          resolution: { _tag: "Succeeded" as const, value: "recovered" },
        }
        yield* store.resolveOperation(input)
        yield* store.resolveOperation(input)
        const history = yield* runtime.history({ runId: claim.runId, limit: 100 })
        const changed = { ...input, resolution: { _tag: "Succeeded" as const, value: "different" } }
        const commandConflict = yield* Effect.flip(store.resolveOperation(changed))
        expect(commandConflict).toBeInstanceOf(DurabilityFailure)
        expect(commandConflict).toMatchObject({ reason: "input-conflict" })
        const domainConflict = yield* Effect.flip(
          store.resolveOperation({ ...changed, idempotencyKey: "new-resolution" }),
        )
        expect(domainConflict).toBeInstanceOf(OperationResolutionConflict)
        expect(yield* store.getProgramOperation({ runId: claim.runId, operation: "uncertain" })).toMatchObject({
          status: "succeeded",
          result: "recovered",
          resolutionIdempotencyKey: input.idempotencyKey,
        })
        expect(yield* runtime.history({ runId: claim.runId, limit: 100 })).toEqual(history)
      }),
    )

    it.effect("preserves immutable receipts while classifying only retained reservation divergence", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore
        const claim = yield* claimProgram("reservation")
        const request: ReserveProgramOperationInput = {
          ...claim,
          programPin: program.pinned.pin,
          budget: program.pinned.manifest.budget,
          operation: "echo",
          authoredOperation: "echo",
          kind: "tool",
          capability: "echo",
          inputDigest: Pins.digest("original"),
          input: "original",
          replay: "non-idempotent",
          reservation: { toolCalls: 1, activeSlots: 1 },
        }
        const receipt = yield* store.reserveProgramOperation(request)
        yield* store.startProgramOperation({ ...claim, operation: request.operation })
        const history = yield* runtime.history({ runId: claim.runId, limit: 100 })
        expect(yield* store.reserveProgramOperation(request)).toEqual(receipt)
        expect(receipt.status).toBe("reserved")
        const changedDigest = Pins.digest("changed")
        const divergence = yield* Effect.flip(
          store.reserveProgramOperation({ ...request, inputDigest: changedDigest, input: "changed" }),
        )
        expect(divergence).toBeInstanceOf(ProgramReplayDivergence)
        expect(divergence).toMatchObject({
          operation: request.operation,
          expected: request.inputDigest,
          actual: changedDigest,
        })
        const metadataConflict = yield* Effect.flip(
          store.reserveProgramOperation({ ...request, reservation: { toolCalls: 2, activeSlots: 1 } }),
        )
        expect(metadataConflict).toBeInstanceOf(DurabilityFailure)
        expect(metadataConflict).toMatchObject({ reason: "input-conflict" })
        const stale = yield* Effect.flip(
          store.reserveProgramOperation({
            ...request,
            attemptFence: claim.attemptFence + 1,
            operation: "new-operation",
            authoredOperation: "new-operation",
          }),
        )
        expect(stale).toBeInstanceOf(StaleClaim)
        expect(yield* runtime.history({ runId: claim.runId, limit: 100 })).toEqual(history)
        expect(yield* store.getProgramOperation({ runId: claim.runId, operation: request.operation })).toMatchObject({
          status: "running",
          input: "original",
        })
        expect(yield* store.loadProgramState(claim.runId)).toMatchObject({ toolCalls: 1, activeSlots: 1 })
        const settlement = {
          ...claim,
          commandId: "program-conflicts:reservation:settle",
          operation: request.operation,
          outcome: { _tag: "Succeeded" as const, value: "original-result" },
          releaseSlots: 1,
        }
        const settled = yield* store.settleProgramOperation(settlement)
        expect(yield* store.settleProgramOperation(settlement)).toEqual(settled)
        const settlementConflict = yield* Effect.flip(
          store.settleProgramOperation({ ...settlement, outcome: { _tag: "Succeeded", value: "changed-result" } }),
        )
        expect(settlementConflict).toBeInstanceOf(DurabilityFailure)
        expect(settlementConflict).toMatchObject({ reason: "input-conflict" })
        expect(yield* store.getProgramOperation({ runId: claim.runId, operation: request.operation })).toEqual(settled)
      }),
    )
  },
)

const approvalFixture = approvalProgramFixture()
layer(objectRuntimeLayer(options).pipe(Layer.provide(approvalFixture.resolverLayer)))(
  "Program approval conflict mapping",
  (it) => {
    it.effect("maps a changed settled decision but preserves metadata-only protocol conflicts", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor
        const claim = yield* claimProgram("approval")
        yield* host.execute(claim)
        const response = {
          runId: claim.runId,
          approvalId: "approval:echo",
          commandId: "approval:echo:conflict",
          decision: { _tag: "Approved" as const },
        }
        yield* runtime.respondApproval(response)
        const history = yield* runtime.history({ runId: claim.runId, limit: 100 })
        yield* runtime.respondApproval(response)
        const decisionConflict = yield* Effect.flip(
          runtime.respondApproval({ ...response, decision: { _tag: "Denied" } }),
        )
        expect(decisionConflict).toBeInstanceOf(ApprovalMismatch)
        expect(decisionConflict).toMatchObject({
          mismatch: "decision",
          runId: claim.runId,
          approvalId: response.approvalId,
        })
        const metadataConflict = yield* Effect.flip(
          runtime.respondApproval({ ...response, operator: "different-operator" }),
        )
        expect(metadataConflict).toBeInstanceOf(DurabilityFailure)
        expect(metadataConflict).toMatchObject({ reason: "input-conflict" })
        expect(yield* runtime.history({ runId: claim.runId, limit: 100 })).toEqual(history)
        expect(approvalFixture.counts().executions).toBe(0)
      }),
    )
  },
)
