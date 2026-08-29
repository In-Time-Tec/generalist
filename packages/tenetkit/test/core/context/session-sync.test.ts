import { describe, expect, it } from "@effect/vitest"
import { Effect, Ref, Schema } from "effect"
import { Chat, Prompt } from "effect/unstable/ai"
import { SessionSync } from "../../../src/core/index"
import { Json } from "../json.js"

const user = (text: string) => Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] })
const system = (text: string) => Prompt.makeMessage("system", { content: text })
const multiUser = (...texts: ReadonlyArray<string>) =>
  Prompt.makeMessage("user", { content: texts.map((text) => Prompt.makePart("text", { text })) })
const messageEquivalence = Schema.toEquivalence(Prompt.Message)

describe("SessionSync.diagnose", () => {
  it("reports full structural counts for a divergent projection", () => {
    const diagnostics = SessionSync.diagnose({
      sessionId: "session-a",
      durableEntryTags: ["Message", "Compaction"],
      projection: [user("shared"), user("durable-only")],
      transcript: [user("shared"), user("authoritative-only"), user("tail")],
    })
    expect(diagnostics.sessionId).toBe("session-a")
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

describe("SessionSync.coalesceAdjacentText", () => {
  it("merges consecutive same-options text parts into one", () => {
    const coalesced = SessionSync.coalesceAdjacentText(multiUser("PROMPT", "\n\nCONTEXT"))
    const content = Schema.decodeUnknownSync(Schema.Array(Prompt.Part))(coalesced.content)
    expect(content).toHaveLength(1)
    expect(content[0]).toEqual(Prompt.makePart("text", { text: "PROMPT\n\nCONTEXT" }))
  })

  it("leaves non-adjacent text parts separated by other parts untouched", () => {
    const message = Prompt.makeMessage("user", {
      content: [
        Prompt.makePart("text", { text: "a" }),
        Prompt.makePart("file", { mediaType: "image/png", data: new Uint8Array([1]) }),
        Prompt.makePart("text", { text: "b" }),
      ],
    })
    const coalesced = SessionSync.coalesceAdjacentText(message)
    const content = Schema.decodeUnknownSync(Schema.Array(Prompt.Part))(coalesced.content)
    expect(content.map((part) => part.type)).toEqual(["text", "file", "text"])
  })

  it("survives the provider-agnostic Chat export round-trip without dropping text", () =>
    Effect.gen(function* () {
      const original = multiUser("PROMPT", "\n\n<resolved-context>\nguidance\n</resolved-context>")
      const raw = yield* roundTrip(original)
      // The unmerged message loses every text part after the first through the lossy string export.
      expect(textOf(raw)).toBe("PROMPT")
      const coalesced = yield* roundTrip(SessionSync.coalesceAdjacentText(original))
      expect(textOf(coalesced)).toBe("PROMPT\n\n<resolved-context>\nguidance\n</resolved-context>")
    }).pipe(Effect.runPromise))
})

describe("SessionSync coalesced equivalence", () => {
  it("equates a multi-text-part message with its coalesced single-text form", () => {
    const multi = multiUser("a", "b")
    const merged = user("ab")
    expect(messageEquivalence(multi, merged)).toBe(false)
    expect(messageEquivalence(SessionSync.coalesceAdjacentText(multi), SessionSync.coalesceAdjacentText(merged))).toBe(
      true,
    )
  })

  it("equates file data represented by a URL or its string value", () => {
    const value = "data:image/png;base64,AQID"
    const withUrl = Prompt.makeMessage("user", {
      content: [Prompt.makePart("file", { mediaType: "image/png", data: new URL(value) })],
    })
    const withString = Prompt.makeMessage("user", {
      content: [Prompt.makePart("file", { mediaType: "image/png", data: value })],
    })

    expect(messageEquivalence(withUrl, withString)).toBe(false)
    expect(SessionSync.equivalentMessages(withUrl, withString)).toBe(true)
  })
})

const roundTrip = (message: Prompt.Message) =>
  Chat.fromPrompt(Prompt.make([message])).pipe(
    Effect.flatMap((chat) => chat.export),
    Effect.flatMap(Chat.fromExport),
    Effect.flatMap((chat) => Ref.get(chat.history)),
    Effect.flatMap((history) => Schema.decodeUnknownEffect(Prompt.Message)(history.content[0])),
  )

const textOf = (message: Prompt.Message): string =>
  Schema.is(Schema.String)(message.content)
    ? message.content
    : message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("")
