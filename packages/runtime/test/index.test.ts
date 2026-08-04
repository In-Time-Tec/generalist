import { describe, expect, it } from "@effect/vitest"
import {
  Address,
  AgentRef,
  Cursor,
  Errors,
  Message,
  Run,
  RunEvent,
  RunStore,
  RunTree,
  Runtime,
  AgentHost,
} from "../src/index.js"

describe("@batonfx/runtime public surface", () => {
  it("exports package-root namespaces", () => {
    expect(typeof Address.make).toBe("function")
    expect(typeof AgentRef.make).toBe("function")
    expect(typeof Cursor.make).toBe("function")
    expect(typeof Message.make).toBe("function")
    expect(typeof Run.isTerminal).toBe("function")
    expect(typeof RunEvent.eventIdFor).toBe("function")
    expect(typeof Runtime.layerMemory).toBe("function")
    expect(typeof RunStore.layerMemory).toBe("function")
    expect(typeof AgentHost.AgentHost).toBe("function")
    expect(typeof RunTree.events).toBe("function")
    expect(Errors.AddressNotFound).toBeDefined()
    expect(Errors.IdempotencyConflict).toBeDefined()
    expect(Errors.SubscriberLagged).toBeDefined()
    expect(Cursor.origin).toBe(-1)
  })
})
