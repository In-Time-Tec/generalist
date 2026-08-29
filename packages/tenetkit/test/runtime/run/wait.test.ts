import { expect, it } from "vitest"
import { decodeReason, encodeReason } from "../../../src/runtime/run/wait.js"
import { openWait, suspension } from "../execution/fixtures.js"

it("builds a wait for every reason", () => {
  expect(openWait({ waitId: "wait:1" })).toMatchObject({
    waitId: "wait:1",
    reason: { _tag: "ToolWait" },
    status: "open",
  })
  expect(openWait({ waitId: "gate", reason: "external" }).reason).toEqual({ _tag: "External" })
  expect(openWait({ waitId: "signal-me", reason: "signal" }).reason).toEqual({ _tag: "Signal", name: "signal-me" })
  expect(openWait({ waitId: "timer:1", reason: "timer" }).reason).toEqual({ _tag: "Timer" })
})

it("keeps a waitId that collides with a reason name a plain waitId", () => {
  for (const waitId of ["approval", "signal", "tool-wait", "timer", "external"] as const) {
    expect(openWait({ waitId }).waitId).toBe(waitId)
    expect(openWait({ waitId }).reason).toEqual({ _tag: "ToolWait" })
    expect(suspension({ waitId }).waits[0]?.token).toBe(waitId)
    expect(suspension({ waitId }).waits[0]?.reason).toBe("tool-wait")
  }
})

it("honors an explicit approval reason and an omitted reason", () => {
  expect(openWait({ waitId: "approval", reason: "approval" }).reason).toEqual({
    _tag: "Approval",
    request: { approvalId: "approval", operation: "approval", capability: "test", input: {} },
  })
  expect(openWait({ waitId: "approval" }).reason).toEqual({ _tag: "ToolWait" })
  expect(suspension({ waitId: "approval", reason: "approval" }).waits[0]?.reason).toBe("approval")
  expect(suspension({ waitId: "approval" }).waits[0]?.reason).toBe("tool-wait")
})

it("produces waits and suspensions that survive their persisted encodings", () => {
  for (const waitId of ["approval", "signal", "wait:ordinary"]) {
    const wait = openWait({ waitId, reason: "approval" })
    expect(encodeReason(wait.reason).length).toBeLessThan(512)
    expect(decodeReason(encodeReason(wait.reason))).toEqual(wait.reason)
  }
})
