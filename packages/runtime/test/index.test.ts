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
  AgentHost,
  AgentResult,
  RunFailure,
  OperationResolution,
} from "../src/index.js"

const encodedVersion = (manifest: typeof ExecutableManifest.ExecutableManifest.Encoded): "1" => manifest.version
const acceptResolutionConflict = (_error: Errors.OperationResolutionConflict): void => undefined

describe("@batonfx/runtime public surface", () => {
  it("exports package-root namespaces", () => {
    expect(typeof Address.make).toBe("function")
    expect(ExecutableManifest.ExecutableRef).toBeDefined()
    expect(typeof Cursor.make).toBe("function")
    expect(typeof Message.make).toBe("function")
    expect(typeof Run.isTerminal).toBe("function")
    expect(typeof RunEvent.eventIdFor).toBe("function")
    expect(typeof Runtime.layerMemory).toBe("function")
    expect(typeof RunStore.layerMemory).toBe("function")
    expect(typeof AgentHost.AgentHost).toBe("function")
    expect(typeof RunTree.events).toBe("function")
    expect(AgentResult.AgentResult).toBeDefined()
    expect(RunFailure.RunFailure).toBeDefined()
    expect(Run.AgentResult).toBe(AgentResult.AgentResult)
    expect(Run.RunFailure).toBe(RunFailure.RunFailure)
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
