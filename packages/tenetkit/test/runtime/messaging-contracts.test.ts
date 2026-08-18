import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Address, AgentDirectory, Mailbox } from "../../src/runtime/index.js"

const entry = (input: {
  readonly runId: string
  readonly parentRunId?: string
  readonly sessionId?: string
}): AgentDirectory.DirectoryEntry => ({
  address: AgentDirectory.runAddress(input.runId),
  runId: input.runId,
  rootRunId: "root",
  sessionId: input.sessionId ?? "session",
  status: "running",
  ...(input.parentRunId === undefined ? {} : { parentRunId: input.parentRunId }),
})

describe("agent directory addresses", () => {
  it.effect("round-trips a Run id that contains address punctuation", () =>
    Effect.gen(function* () {
      const runId = "run:with:colons and spaces"
      const target = yield* AgentDirectory.parseAddress(AgentDirectory.runAddress(runId))
      expect(target).toEqual({ _tag: "Run", runId })
    }),
  )

  it.effect("round-trips a session id that contains address punctuation", () =>
    Effect.gen(function* () {
      const sessionId = "thread:a:b"
      const target = yield* AgentDirectory.parseAddress(AgentDirectory.sessionAddress(sessionId))
      expect(target).toEqual({ _tag: "Session", sessionId })
    }),
  )

  it.effect("round-trips a name whose scope contains a colon", () =>
    Effect.gen(function* () {
      const address = AgentDirectory.nameAddress({
        scope: "run:parent:1",
        name: AgentDirectory.makeName("reviewer"),
      })
      expect(yield* AgentDirectory.parseAddress(address)).toEqual({
        _tag: "Name",
        scope: "run:parent:1",
        name: "reviewer",
      })
    }),
  )

  it.effect("rejects an address with no known shape", () =>
    Effect.gen(function* () {
      const error = yield* AgentDirectory.parseAddress(Address.make("mystery:thing")).pipe(Effect.flip)
      expect(error._tag).toBe("tenetkit/runtime/AddressInvalid")
    }),
  )

  it("rejects a name that is not a safe identifier", () => {
    expect(() => AgentDirectory.makeName("Not Valid")).toThrow()
    expect(() => AgentDirectory.makeName("")).toThrow()
    expect(AgentDirectory.makeName("reviewer-2")).toBe("reviewer-2")
  })

  it("scopes a root Run to itself and a child to its parent", () => {
    expect(AgentDirectory.nameScope({ runId: "run_1" })).toBe("root:run_1")
    expect(AgentDirectory.nameScope({ runId: "run_2", parentRunId: "run_1" })).toBe("run_1")
  })
})

describe("relationship derivation", () => {
  const parent = entry({ runId: "parent" })
  const child = entry({ runId: "child", parentRunId: "parent" })
  const sibling = entry({ runId: "sibling", parentRunId: "parent" })
  const outsider = entry({ runId: "outsider" })

  it("derives every built-in relationship from durable parentage only", () => {
    expect(AgentDirectory.relationship(parent, parent)).toBe("self")
    expect(AgentDirectory.relationship(child, parent)).toBe("parent")
    expect(AgentDirectory.relationship(parent, child)).toBe("child")
    expect(AgentDirectory.relationship(child, sibling)).toBe("sibling")
  })

  it("derives nothing for two unrelated roots", () => {
    // Two root Runs share no parent, so neither may address the other without host policy.
    expect(AgentDirectory.relationship(parent, outsider)).toBeUndefined()
    expect(AgentDirectory.relationship(outsider, child)).toBeUndefined()
  })
})

describe("mailbox payload identity", () => {
  const base = {
    to: AgentDirectory.runAddress("target"),
    from: AgentDirectory.runAddress("sender"),
    prompt: Prompt.make("hello"),
    correlationId: "correlation",
    metadata: {},
  }

  it("is stable for the same payload and differs when any field changes", () => {
    expect(Mailbox.digest(base)).toBe(Mailbox.digest({ ...base }))
    expect(Mailbox.digest({ ...base, prompt: Prompt.make("different") })).not.toBe(Mailbox.digest(base))
    expect(Mailbox.digest({ ...base, correlationId: "other" })).not.toBe(Mailbox.digest(base))
    expect(Mailbox.digest({ ...base, inReplyTo: "msg:1" })).not.toBe(Mailbox.digest(base))
    expect(Mailbox.digest({ ...base, metadata: { a: 1 } })).not.toBe(Mailbox.digest(base))
  })

  it("charges a larger payload more bytes", () => {
    expect(Mailbox.promptBytes(Prompt.make("hi"))).toBeLessThan(Mailbox.promptBytes(Prompt.make("hi".repeat(200))))
  })
})

describe("delivery prompt", () => {
  const entryFor = (prompt: Prompt.Prompt): Mailbox.MailboxEntry => ({
    entryId: "entry",
    targetSessionId: "session",
    sequence: 0,
    from: AgentDirectory.runAddress("sender"),
    fromRunId: "sender",
    to: AgentDirectory.runAddress("target"),
    messageId: "msg",
    idempotencyKey: "key",
    digest: "digest",
    bytes: 1,
    admittedAtMillis: 0,
    prompt,
    correlationId: "correlation",
    metadata: {},
  })

  it("renders the message as user content attributed to its sender", () => {
    const prompt = Mailbox.deliveryPrompt(entryFor(Prompt.make("please review")))
    const message = prompt.content[0]
    expect(message?.role).toBe("user")
    expect(JSON.stringify(prompt)).toContain("please review")
    expect(JSON.stringify(message?.options)).toContain("sender")
  })

  it("keeps a system-authored payload as readable text rather than dropping it", () => {
    const prompt = Mailbox.deliveryPrompt(
      entryFor(Prompt.fromMessages([Prompt.makeMessage("system", { content: "system authored" })])),
    )
    expect(JSON.stringify(prompt)).toContain("system authored")
    expect(prompt.content[0]?.role).toBe("user")
  })
})
