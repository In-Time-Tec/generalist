import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { AgentManifest, ExecutableManifest, Pins } from "../../../src/index"

const payload = { schemaVersion: "1", entries: [{ id: "a" }] }
const content = { codec: "generalist/instructions/snapshot", version: "1", digest: Pins.digest(payload) }
const skillPin = Pins.makeCapability({ codec: content.codec, version: content.version, payload })

const manifest = (skills: ReadonlyArray<AgentManifest.NamedCapability>) =>
  AgentManifest.make({
    name: "pinned",
    model: Pins.makeModel({ fixture: "pinned" }),
    tools: [],
    skills,
    services: [],
    policy: { _tag: "Pinned", pin: Pins.makeCapability({ fixture: "pinned", policy: "1" }) },
    toolScheduling: { maxConcurrency: 1, parallelSafe: [] },
    budget: {},
    children: [],
  })

describe("AgentManifest pinned capability content", () => {
  it("carries codec, version, and payload digest on a named capability", () => {
    const pinned = manifest([{ name: "guidance", pin: skillPin, content }])
    expect(pinned.manifest.skills[0]?.content).toEqual(content)
  })

  it("changes the Agent manifest digest when pinned content changes", () => {
    const first = manifest([{ name: "guidance", pin: skillPin, content }])
    const second = manifest([
      { name: "guidance", pin: skillPin, content: { ...content, digest: Pins.digest({ other: true }) } },
    ])
    expect(second.pin).not.toBe(first.pin)
  })

  it("changes the Agent manifest digest when pinned content is added to an existing capability", () => {
    const without = manifest([{ name: "guidance", pin: skillPin }])
    const withContent = manifest([{ name: "guidance", pin: skillPin, content }])
    expect(withContent.pin).not.toBe(without.pin)
  })

  it("changes the executable digest when pinned content changes", () => {
    const executable = (pinnedContent: AgentManifest.PinnedContent) => {
      const agent = manifest([{ name: "guidance", pin: skillPin, content: pinnedContent }])
      return ExecutableManifest.make({ root: agent.pin, entries: [{ _tag: "Agent", ...agent }] })
    }
    const first = executable(content)
    const second = executable({ ...content, version: "2" })
    expect(second.ref.executable).not.toBe(first.ref.executable)
  })

  it("keeps the Agent manifest digest stable for identical pinned content", () => {
    expect(manifest([{ name: "guidance", pin: skillPin, content }]).pin).toBe(
      manifest([{ name: "guidance", pin: skillPin, content: { ...content } }]).pin,
    )
  })

  it("rejects a pinned content digest that is not a SHA-256 hex digest", () => {
    expect(() => manifest([{ name: "guidance", pin: skillPin, content: { ...content, digest: "nope" } }])).toThrow()
  })

  it("rejects an empty pinned codec", () => {
    expect(() => manifest([{ name: "guidance", pin: skillPin, content: { ...content, codec: "" } }])).toThrow()
  })

  it("rejects an empty pinned version", () => {
    expect(() => manifest([{ name: "guidance", pin: skillPin, content: { ...content, version: "" } }])).toThrow()
  })

  it("rejects an excess property inside pinned content", () => {
    expect(() =>
      Schema.decodeUnknownSync(AgentManifest.NamedCapability, { onExcessProperty: "error" })({
        name: "guidance",
        pin: skillPin,
        content: { ...content, extra: 1 },
      }),
    ).toThrow()
  })

  it("keeps pinned content optional", () => {
    expect(manifest([{ name: "guidance", pin: skillPin }]).manifest.skills[0]?.content).toBeUndefined()
  })

  it("round-trips a named capability with pinned content", () => {
    const capability: AgentManifest.NamedCapability = { name: "guidance", pin: skillPin, content }
    const encoded = Schema.encodeSync(AgentManifest.NamedCapability)(capability)
    expect(Schema.decodeSync(AgentManifest.NamedCapability)(encoded)).toEqual(capability)
  })

  it("pins content on Program authority capabilities", () => {
    const agent = AgentManifest.make({
      name: "authority",
      model: Pins.makeModel({ fixture: "authority" }),
      tools: [],
      skills: [],
      services: [],
      policy: { _tag: "Pinned", pin: Pins.makeCapability({ fixture: "authority", policy: "1" }) },
      toolScheduling: { maxConcurrency: 1, parallelSafe: [] },
      budget: {},
      children: [],
      programAuthority: {
        sandbox: Pins.makeCapability({ fixture: "sandbox" }),
        input: Pins.makeCapability({ fixture: "input" }),
        output: Pins.makeCapability({ fixture: "output" }),
        maxSourceBytes: 1024,
        tools: [{ name: "guidance", pin: skillPin, content }],
        agents: [],
        steps: [],
        budget: {
          agentRuns: 0,
          concurrency: 1,
          toolCalls: 0,
          tokens: 0,
          wallClockMillis: 0,
          logBytes: 0,
          outputBytes: 0,
        },
      },
    })
    expect(agent.manifest.programAuthority?.tools[0]?.content).toEqual(content)
  })
})
