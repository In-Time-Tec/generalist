import { describe, expect, it } from "vitest"
import { RunStore as GenericRunStore, Runtime as GenericRuntime } from "../../src/runtime/index.js"
import { RunStore, Runtime } from "../../src/runtime/sqlite-bun.js"

describe("Bun SQLite package boundary", () => {
  it("keeps SQLite layers out of the generic Runtime entry", () => {
    expect("layerSqlite" in GenericRuntime).toBe(false)
    expect("layerSqlite" in GenericRunStore).toBe(false)
  })

  it("exposes Runtime and RunStore layers from the explicit entry", () => {
    expect(Runtime.layerSqlite).toBeTypeOf("function")
    expect(RunStore.layerSqlite).toBeTypeOf("function")
  })
})
