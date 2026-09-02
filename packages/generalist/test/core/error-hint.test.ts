import { describe, expect, it } from "@effect/vitest"
import { Cause, Schema } from "effect"
import { ApprovalTokenInvalid } from "../../src/approvals.js"
import { RunNotFound } from "../../src/runtime/errors.js"

describe("actionable errors", () => {
  it("supplies hints to constructors and old encoded values", () => {
    const constructed = RunNotFound.make({ runId: "run-17" })
    const decoded = Schema.decodeSync(RunNotFound)({
      _tag: "generalist/runtime/RunNotFound",
      runId: "run-17",
    })

    expect(constructed.hint).toBe(decoded.hint)
    expect(decoded.hint).toContain("Check the Run ID")
  })

  it("renders one actionable paragraph through Cause.pretty", () => {
    const error = RunNotFound.make({ runId: "run-17" })
    const pretty = Cause.pretty(Cause.fail(error))

    expect(error.name).toBe("generalist/runtime/RunNotFound")
    expect(pretty.split("\n", 1)[0]).toBe(`generalist/runtime/RunNotFound: runId="run-17". Hint: ${error.hint}`)
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      _tag: "generalist/runtime/RunNotFound",
      runId: "run-17",
      hint: error.hint,
    })
  })

  it("keeps a declared message field and its hint separate", () => {
    const error = ApprovalTokenInvalid.make({ token: "t-1", message: "expired" })

    expect(error.message).toBe("expired")
    expect(Cause.pretty(Cause.fail(error)).split("\n", 1)[0]).toBe("generalist/approvals/ApprovalTokenInvalid: expired")
    expect(error.hint).toContain("token")
  })
})
