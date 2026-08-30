import { describe, expect, it } from "@effect/vitest"
import {
  Address,
  ExecutableManifest,
  Cursor,
  Errors,
  Message,
  Run,
  RunEvent,
  RunStore,
  RunTree,
  Runtime,
  Steering,
  RunExecutor,
  OperationResolution,
} from "../../src/runtime/index.js"

const encodedVersion = (manifest: typeof ExecutableManifest.ExecutableManifest.Encoded): "2" => manifest.version
const acceptResolutionConflict = (_error: Errors.OperationResolutionConflict): void => undefined

describe("tenetkit/runtime public surface", () => {
  it("exports package-root namespaces", () => {
    expect(Address.make).toBeDefined()
    expect(ExecutableManifest.ExecutableRef).toBeDefined()
    expect(Cursor.make).toBeDefined()
    expect(Message.make).toBeDefined()
    expect(Run.isTerminal).toBeDefined()
    expect(RunEvent.eventIdFor).toBeDefined()
    expect(RunEvent.SteeringDiscardReason).toBeDefined()
    expect(Steering.SteeringReceipt).toBeDefined()
    expect(Runtime.layerMemory).toBeDefined()
    expect(RunStore.layerMemory).toBeDefined()
    expect(RunExecutor.RunExecutor).toBeDefined()
    expect(RunTree.events).toBeDefined()
    expect(RunTree.watch).toBeDefined()
    expect(Run.ExecutionResult).toBeDefined()
    expect(Run.RunFailure).toBeDefined()
    expect(Errors.AddressNotFound).toBeDefined()
    expect(Errors.IdempotencyConflict).toBeDefined()
    expect(Errors.SteeringConflict).toBeDefined()
    expect(Errors.SubscriberLagged).toBeDefined()
    expect(Errors.OperationResolutionConflict).toBeDefined()
    expect(OperationResolution.ResolveOperationInput).toBeDefined()
    expect(encodedVersion).toBeTypeOf("function")
    expect(acceptResolutionConflict).toBeTypeOf("function")
    expect(Cursor.origin).toBe(-1)
  })
})
