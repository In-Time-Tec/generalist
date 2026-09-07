import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { ApprovalTokenInvalid } from "../../src/approvals.js"
import { InvalidOutput } from "../../src/core/agent/event.js"
import { ContextInvalid } from "../../src/core/context/session-projection.js"
import { InvalidRuleFile } from "../../src/core/policy/rule-store.js"
import { RunNotFound } from "../../src/runtime/errors.js"

describe("actionable errors", () => {
  it("rejects incomplete encoded errors instead of upgrading them", () => {
    const constructed = RunNotFound.make({ runId: "run-17" })
    const encoded = Schema.encodeSync(RunNotFound)(constructed)
    expect(Schema.decodeSync(RunNotFound)(encoded)).toEqual(constructed)
    expect(() =>
      Schema.decodeUnknownSync(RunNotFound)({
        _tag: "generalist/runtime/RunNotFound",
        runId: "run-17",
      }),
    ).toThrow()
  })

  it("keeps a declared message field and its hint separate", () => {
    const error = ApprovalTokenInvalid.make({ token: "t-1", message: "expired" })

    expect(error.message).toBe("expired")
  })

  it("renders the first bounded schema issue for errors without a declared message", () => {
    const invalidOutput = InvalidOutput.make({
      issues: [`Expected a value less than 0 at ["output"]["impossible"] ${"x".repeat(400)}`, "second issue"],
    })
    const contextInvalid = ContextInvalid.make({
      issues: [{ toolCallId: "call-17", reason: "unresolved" }],
    })
    const invalidRuleFile = InvalidRuleFile.make({
      path: "/rules.yaml",
      issues: "Expected allow, deny, or ask at [0].level",
    })

    expect(invalidOutput.message).toContain('issue=Expected a value less than 0 at ["output"]["impossible"]')
    expect(invalidOutput.message).not.toContain("second issue")
    expect(invalidOutput.message.length).toBeLessThan(450)
    expect(contextInvalid.message).toContain('issue={"toolCallId":"call-17","reason":"unresolved"}')
    expect(invalidRuleFile.message).toContain("issue=Expected allow, deny, or ask at [0].level")
  })
})
