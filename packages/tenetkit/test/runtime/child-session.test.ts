import { describe, expect, it } from "vitest"
import { childSessionId, fanOutMemberSessionId } from "../../src/runtime/child-session.js"

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

  it("stays bounded when a real invocation carries an escaped operation key", () => {
    // The invocation a cell composes carries the operation key twice over, already escaped, and the
    // operation key carries the tool call. Escaping the whole of it again is what crossed the bound.
    const invocationId =
      "child-admit:run_mslng0c0_28qgmb38bdk%3Atool%3A0%3A0%3Aoracle-style%3Atypescript:" +
      "run_mslng0c0_28qgmb38bdk%253Atool%253A0%253A0%253Aoracle-style%253Atypescript%230:" +
      "run_mslng0c0_28qgmb38bdk%253Atool%253A0%253A0%253Aoracle-style%253Atypescript%25230%253AOracle"
    const sessionId = childSessionId({ parentRunId: "run_mslng0c0_28qgmb38bdk", invocationId })
    expect(sessionId.length).toBeLessThanOrEqual(256)
    expect(encodeURIComponent(sessionId).length).toBeLessThanOrEqual(255)
    expect(sessionId.startsWith("child:")).toBe(true)
  })

  it("keeps a fan-out member bounded for a long key", () => {
    const sessionId = fanOutMemberSessionId({ fanOutId: "run_abc", key: "k".repeat(400) })
    expect(sessionId.length).toBeLessThanOrEqual(256)
    expect(sessionId.startsWith("fanout:")).toBe(true)
  })

  it("stays bounded at every depth a delegation budget allows", () => {
    // A deeper child carries a longer invocation, because each level composes the level above it
    // into the key it admits under. A Session identity is a bounded key, so depth must not decide it.
    let runId = "run_0"
    let invocationId = "Oracle#0"
    const lengths: Array<number> = []
    for (let depth = 0; depth < 8; depth += 1) {
      invocationId = `child-admit:${encodeURIComponent(runId)}:${encodeURIComponent(invocationId)}#${depth}:Oracle`
      const sessionId = childSessionId({ parentRunId: runId, invocationId })
      lengths.push(sessionId.length)
      runId = `run_${depth + 1}`
    }
    expect(Math.max(...lengths)).toBeLessThanOrEqual(256)
  })
})
