import { describe, expect, it } from "@effect/vitest"
import { Cause, Schema } from "effect"
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

    expect(pretty).toContain('runId="run-17"')
    expect(pretty).toContain(error.hint)
    expect(pretty.split("\n", 1)[0]).toBe(`generalist/runtime/RunNotFound (runId="run-17"). Hint: ${error.hint}: `)
  })
})
