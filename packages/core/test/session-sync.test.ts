import { describe, expect, it } from "@effect/vitest"
import { Prompt } from "effect/unstable/ai"
import { SessionSync } from "../src/index"
import { Json } from "./json"

const user = (text: string) => Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] })
const system = (text: string) => Prompt.makeMessage("system", { content: text })

describe("SessionSync.diagnose", () => {
  it("reports full structural counts for a divergent projection", () => {
    const diagnostics = SessionSync.diagnose({
      sessionId: "session-a",
      ownerToken: "owner-1",
      durableEntryTags: ["Message", "Compaction"],
      projection: [user("shared"), user("durable-only")],
      transcript: [user("shared"), user("authoritative-only"), user("tail")],
    })
    expect(diagnostics.sessionId).toBe("session-a")
    expect(diagnostics.ownerToken).toBe("owner-1")
    expect(diagnostics.durableEntryCount).toBe(2)
    expect(diagnostics.durableMessageCount).toBe(2)
    expect(diagnostics.authoritativeMessageCount).toBe(3)
    expect(diagnostics.alignmentCount).toBe(0)
    expect(diagnostics.commonPrefixLength).toBe(1)
    expect(diagnostics.lastDurableEntryTag).toBe("Compaction")
    expect(diagnostics.firstDivergence?.index).toBe(1)
    expect(diagnostics.firstDivergence?.durableRole).toBe("user")
    expect(diagnostics.firstDivergence?.authoritativeRole).toBe("user")
    expect(diagnostics.firstDivergence?.durablePartTypes).toEqual(["text"])
    expect(diagnostics.firstDivergence?.authoritativePartTypes).toEqual(["text"])
    expect(diagnostics.firstDivergence?.durableDigest).toMatch(/^[0-9a-f]{8}$/)
    expect(diagnostics.firstDivergence?.durableDigest).not.toBe(diagnostics.firstDivergence?.authoritativeDigest)
  })

  it("never carries raw message text", () => {
    const diagnostics = SessionSync.diagnose({
      sessionId: "session-b",
      durableEntryTags: ["Message"],
      projection: [user("durable-secret-content")],
      transcript: [system("system-secret"), user("authoritative-secret-content")],
    })
    const encoded = Json.stringify(diagnostics)
    expect(encoded).not.toContain("secret")
    expect(diagnostics.ownerToken).toBeUndefined()
  })

  it("counts ambiguous alignments instead of divergence when the projection matches twice", () => {
    const repeated = system("repeat")
    const diagnostics = SessionSync.diagnose({
      sessionId: "session-c",
      durableEntryTags: ["Message"],
      projection: [repeated],
      transcript: [repeated, repeated],
    })
    expect(diagnostics.alignmentCount).toBe(2)
    expect(diagnostics.commonPrefixLength).toBe(1)
  })

  it("treats an empty projection as trivially aligned and reports the authoritative head", () => {
    const diagnostics = SessionSync.diagnose({
      sessionId: "session-d",
      durableEntryTags: [],
      projection: [],
      transcript: [user("head")],
    })
    expect(diagnostics.alignmentCount).toBe(1)
    expect(diagnostics.commonPrefixLength).toBe(0)
    expect(diagnostics.durableEntryCount).toBe(0)
    expect(diagnostics.firstDivergence?.durableRole).toBeUndefined()
    expect(diagnostics.firstDivergence?.authoritativeRole).toBe("user")
  })
})
