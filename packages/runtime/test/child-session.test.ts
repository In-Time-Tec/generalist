import { describe, expect, it } from "vitest"
import { childSessionId, fanOutMemberSessionId } from "../src/child-session.js"

describe("child session identity", () => {
  it("gives each invocation of one parent its own session", () => {
    const parent = "run_abc"
    expect(childSessionId({ parentRunId: parent, invocationId: "title-1" })).not.toBe(
      childSessionId({ parentRunId: parent, invocationId: "task-1" }),
    )
  })

  it("derives the same session for a replayed spawn", () => {
    expect(childSessionId({ parentRunId: "run_abc", invocationId: "title-1" })).toBe(
      childSessionId({ parentRunId: "run_abc", invocationId: "title-1" }),
    )
  })

  it("never collides with its parent's session", () => {
    expect(childSessionId({ parentRunId: "thread:x", invocationId: "title-1" })).not.toBe("thread:x")
  })

  it("separates ids that would otherwise collide through concatenation", () => {
    expect(childSessionId({ parentRunId: "a:b", invocationId: "c" })).not.toBe(
      childSessionId({ parentRunId: "a", invocationId: "b:c" }),
    )
    expect(fanOutMemberSessionId({ fanOutId: "f:1", key: "2" })).not.toBe(
      fanOutMemberSessionId({ fanOutId: "f", key: "1:2" }),
    )
  })

  it("gives each fan-out member its own session", () => {
    expect(fanOutMemberSessionId({ fanOutId: "fan_1", key: "lane-a" })).not.toBe(
      fanOutMemberSessionId({ fanOutId: "fan_1", key: "lane-b" }),
    )
  })
})
