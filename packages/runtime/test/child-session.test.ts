import { describe, expect, it } from "vitest"
import { childSessionId, fanOutMemberSessionId } from "../src/child-session.js"

describe("child session identity", () => {
  it("gives each invocation of one parent its own session", () => {
    const parent = "run_abc"
    expect(childSessionId(parent, "title-1")).not.toBe(childSessionId(parent, "task-1"))
  })

  it("derives the same session for a replayed spawn", () => {
    expect(childSessionId("run_abc", "title-1")).toBe(childSessionId("run_abc", "title-1"))
  })

  it("never collides with its parent's session", () => {
    expect(childSessionId("thread:x", "title-1")).not.toBe("thread:x")
  })

  it("separates ids that would otherwise collide through concatenation", () => {
    expect(childSessionId("a:b", "c")).not.toBe(childSessionId("a", "b:c"))
    expect(fanOutMemberSessionId("f:1", "2")).not.toBe(fanOutMemberSessionId("f", "1:2"))
  })

  it("gives each fan-out member its own session", () => {
    expect(fanOutMemberSessionId("fan_1", "lane-a")).not.toBe(fanOutMemberSessionId("fan_1", "lane-b"))
  })
})
