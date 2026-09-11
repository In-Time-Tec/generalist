import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { ApprovalTokenInvalid } from "../../src/approvals.js"
import { InvalidOutput, ToolNameCollision } from "../../src/core/agent/event.js"
import { ContextInvalid } from "../../src/core/context/session-projection.js"
import { InvalidRuleFile } from "../../src/core/policy/rule-store.js"
import { ProgramHandlerMismatch } from "../../src/core/program/errors.js"
import { AgentNameConflict, DuplicateAgent, RunNotFound, UnknownAgent } from "../../src/runtime/errors.js"

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

  it("keeps error.name equal to the tag when an error declares a name-shaped field", () => {
    const duplicate = DuplicateAgent.make({ agentName: "dup" })
    const unknown = UnknownAgent.make({ agentName: "unknown", runId: "run_1" })
    const conflict = AgentNameConflict.make({ scope: "scope", agentName: "conflict", existingRunId: "run_1" })
    const collision = ToolNameCollision.make({ toolName: "tool", origins: [{ _tag: "Static", agent: "agent" }] })
    const mismatch = ProgramHandlerMismatch.make({
      kind: "tool",
      handlerName: "handler",
      reason: "declared capability has no handler",
    })

    for (const error of [duplicate, unknown, conflict, collision, mismatch]) {
      expect(error.name).toBe(error._tag)
    }
    expect(duplicate.message).toContain('agentName="dup"')
    expect(collision.message).toContain('toolName="tool"')
    expect(mismatch.message).toContain('handlerName="handler"')

    const decoded = {
      duplicate: Schema.decodeUnknownSync(DuplicateAgent)(
        JSON.parse(JSON.stringify(Schema.encodeSync(DuplicateAgent)(duplicate))),
      ),
      unknown: Schema.decodeUnknownSync(UnknownAgent)(
        JSON.parse(JSON.stringify(Schema.encodeSync(UnknownAgent)(unknown))),
      ),
      conflict: Schema.decodeUnknownSync(AgentNameConflict)(
        JSON.parse(JSON.stringify(Schema.encodeSync(AgentNameConflict)(conflict))),
      ),
      collision: Schema.decodeUnknownSync(ToolNameCollision)(
        JSON.parse(JSON.stringify(Schema.encodeSync(ToolNameCollision)(collision))),
      ),
      mismatch: Schema.decodeUnknownSync(ProgramHandlerMismatch)(
        JSON.parse(JSON.stringify(Schema.encodeSync(ProgramHandlerMismatch)(mismatch))),
      ),
    }
    for (const error of Object.values(decoded)) expect(error.name).toBe(error._tag)

    const control = RunNotFound.make({ runId: "run_1" })
    expect(control.name).toBe(control._tag)
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
