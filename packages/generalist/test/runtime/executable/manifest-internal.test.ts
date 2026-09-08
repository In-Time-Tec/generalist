import { expect, it } from "@effect/vitest"
import { Agent, AgentManifest, ExecutableManifest, Pins } from "../../../src/index.js"
import { make as makeProgram, type ProgramManifest } from "../../../src/core/durable/manifest/program-manifest.js"
import { containsChild } from "../../../src/runtime/executable/manifest-internal.js"
import { durableIdentity } from "../../../src/runtime/executable/registered-agent.js"
import { program, programExecutable } from "../program/fixture.js"

it("checks authored Programs against canonical capability, schema, source, and budget authority", () => {
  const base = durableIdentity(Agent.make({ name: "program-parent" })).executable.manifest.entries[0]!
  if (base._tag !== "Agent") throw new TypeError("Expected an Agent fixture")
  const manifest = program.pinned.manifest
  const parent = AgentManifest.make({
    ...base.manifest,
    programAuthority: {
      sandbox: manifest.sandbox,
      input: manifest.input,
      output: manifest.output,
      maxSourceBytes: new TextEncoder().encode(manifest.source.text).byteLength,
      budget: manifest.budget,
      ...manifest.capabilities,
    },
  })
  const authority = ExecutableManifest.make({ root: parent.pin, entries: [{ _tag: "Agent", ...parent }] })
  expect(containsChild(authority, programExecutable)).toBe(true)
  const rejects = (changed: ProgramManifest) => {
    const pinned = makeProgram(changed)
    expect(
      containsChild(
        authority,
        ExecutableManifest.make({ root: pinned.pin, entries: [{ _tag: "Program", ...pinned }] }),
      ),
    ).toBe(false)
  }
  for (const dimension of [
    "agentRuns",
    "concurrency",
    "toolCalls",
    "tokens",
    "wallClockMillis",
    "logBytes",
    "outputBytes",
  ] as const) {
    rejects({ ...manifest, budget: { ...manifest.budget, [dimension]: manifest.budget[dimension] + 1 } })
  }
  rejects({ ...manifest, source: { ...manifest.source, text: `${manifest.source.text} ` } })
  const ungranted = Pins.makeCapability({ fixture: "ungranted" })
  rejects({ ...manifest, sandbox: ungranted })
  rejects({ ...manifest, input: ungranted })
  rejects({ ...manifest, output: ungranted })
  rejects({ ...manifest, capabilities: { ...manifest.capabilities, tools: [{ name: "ungranted", pin: ungranted }] } })
  rejects({ ...manifest, capabilities: { ...manifest.capabilities, steps: [{ name: "ungranted", pin: ungranted }] } })
})
