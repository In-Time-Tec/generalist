import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { Agent, CodeExecutor } from "../../src/index.js"
import { CodeMode } from "../../src/runtime/index.js"
import { durableIdentity } from "../../src/runtime/executable/registered-agent.js"

const budget = {
  agentRuns: 1,
  concurrency: 1,
  toolCalls: 1,
  tokens: 100,
  wallClockMillis: 1_000,
  logBytes: 1_000,
  outputBytes: 1_000,
}

const tool = Tool.make("declared_tool", {
  parameters: Schema.Struct({ value: Schema.Finite }),
  success: Schema.Finite,
})
const otherTool = Tool.make("other_tool", {
  parameters: Schema.String,
  success: Schema.String,
})
const child = Agent.make({ name: "declared-child", input: Schema.Struct({ value: Schema.Finite }) })

const declaration = (overrides: Partial<CodeMode.AnyOptions> = {}): CodeMode.AnyOptions => ({
  tools: [{ tool, handlerVersion: "1", replay: "recorded" }],
  agents: [{ agent: child, selection: "declared-child", handlerVersion: "1", replay: "recorded" }],
  steps: [],
  executor: CodeExecutor.testIdentity,
  maxSourceBytes: 1_024,
  budget,
  ...overrides,
})

const caught = (evaluate: () => void): CodeMode.DeclarationError => {
  try {
    evaluate()
  } catch (error) {
    expect(error).toBeInstanceOf(CodeMode.DeclarationError)
    if (Schema.is(CodeMode.DeclarationError)(error)) return error
  }
  throw new Error("expected CodeMode.DeclarationError")
}

describe("CodeMode declarations", () => {
  it("pins exact revisions without publishing Program grants as Agent profiles", () => {
    const root = Agent.make({ name: "revision-root", tools: [tool], codeMode: declaration() })
    const first = durableIdentity(root, [root, child], "revision-1")
    const second = durableIdentity(root, [root, child], "revision-2")
    const active = first.executable.manifest.entries.find((entry) => entry.pin === first.executable.ref.active)
    expect(active?._tag).toBe("Agent")
    if (active?._tag !== "Agent" || active.manifest.programAuthority === undefined) {
      throw new Error("expected a pinned CodeMode Agent")
    }
    const ownerPayload = Schema.Struct({
      pin: Schema.String,
      revision: Schema.String,
      ownerAgentName: Schema.String,
    })
    const owned = first.registrations.filter((registration) => Schema.is(ownerPayload)(registration.payload))
    expect(owned).toHaveLength(1)
    expect(owned[0]).toMatchObject({
      pin: active.manifest.programAuthority.sandbox,
      payload: {
        pin: active.manifest.programAuthority.sandbox,
        revision: "revision-1",
        ownerAgentName: root.name,
      },
    })
    expect(first.executable.manifest.profiles).toEqual([])
    expect(first.executable.manifest.entries.filter((entry) => entry._tag === "Agent")).toHaveLength(2)
    expect(second.executable.ref.executable).not.toBe(first.executable.ref.executable)
    const secondActive = second.executable.manifest.entries.find((entry) => entry.pin === second.executable.ref.active)
    expect(secondActive?._tag === "Agent" ? secondActive.manifest.programAuthority?.sandbox : undefined).not.toBe(
      active.manifest.programAuthority.sandbox,
    )
  })

  it("preserves typed step callbacks without inspecting or invoking them", () => {
    let authorizations = 0
    let executions = 0
    const step = CodeMode.step({
      name: "typed_step",
      handlerVersion: "v2",
      input: Schema.Struct({ value: Schema.Finite }),
      output: Schema.Finite,
      failure: Schema.String,
      replay: "idempotent",
      authorize: () => Effect.sync(() => ++authorizations > 0),
      execute: ({ value }) => Effect.sync(() => (executions += value)),
    })
    const agent = Agent.make({
      name: "valid-code-mode",
      tools: [tool],
      codeMode: declaration({ steps: [step] }),
    })
    expect(agent.codeMode?.steps).toEqual([step])
    expect(authorizations).toBe(0)
    expect(executions).toBe(0)
    expect(Object.isFrozen(step)).toBe(true)
  })

  it("rejects duplicate names and tools outside the Agent toolkit", () => {
    const duplicateTool = caught(() =>
      Agent.make({
        name: "duplicate-tool",
        tools: [tool],
        codeMode: declaration({
          tools: [
            { tool, handlerVersion: "1", replay: "recorded" },
            { tool, handlerVersion: "2", replay: "idempotent" },
          ],
        }),
      }),
    )
    expect(duplicateTool).toMatchObject({ field: "tools", reason: "duplicate-name", name: tool.name })

    const duplicateAgent = caught(() =>
      Agent.make({
        name: "duplicate-agent",
        tools: [tool],
        codeMode: declaration({
          agents: [
            { agent: child, selection: "child", handlerVersion: "1", replay: "recorded" },
            { agent: child, selection: "child", handlerVersion: "2", replay: "idempotent" },
          ],
        }),
      }),
    )
    expect(duplicateAgent).toMatchObject({ field: "agents", reason: "duplicate-name", name: "child" })

    const first = CodeMode.step({
      name: "same_step",
      handlerVersion: "1",
      input: Schema.Void,
      output: Schema.Void,
      failure: Schema.Never,
      replay: "recorded",
      authorize: () => Effect.succeed(true),
      execute: () => Effect.void,
    })
    const duplicateStep = caught(() =>
      Agent.make({
        name: "duplicate-step",
        tools: [tool],
        codeMode: declaration({ steps: [first, { ...first }] }),
      }),
    )
    expect(duplicateStep).toMatchObject({ field: "steps", reason: "duplicate-name", name: "same_step" })

    const absent = caught(() =>
      Agent.make({
        name: "absent-tool",
        tools: [tool],
        codeMode: declaration({ tools: [{ tool: otherTool, handlerVersion: "1", replay: "recorded" }] }),
      }),
    )
    expect(absent).toMatchObject({ field: "tools", reason: "not-agent-tool", name: otherTool.name })
  })

  it("rejects unstable versions, invalid executor identity, and every invalid limit", () => {
    for (const [field, options] of [
      ["tools", declaration({ tools: [{ tool, handlerVersion: "", replay: "recorded" }] })],
      [
        "agents",
        declaration({
          agents: [{ agent: child, selection: "child", handlerVersion: " x ", replay: "recorded" }],
        }),
      ],
      [
        "steps",
        declaration({
          steps: [
            CodeMode.step({
              name: "versioned_step",
              handlerVersion: "x".repeat(129),
              input: Schema.Void,
              output: Schema.Void,
              failure: Schema.Never,
              replay: "recorded",
              authorize: () => Effect.succeed(true),
              execute: () => Effect.void,
            }),
          ],
        }),
      ],
    ] as const) {
      const failure = caught(() => Agent.make({ name: `invalid-${field}`, tools: [tool], codeMode: options }))
      expect(failure).toMatchObject({ field, reason: "version-invalid" })
    }

    const malformedIdentity = { ...CodeExecutor.testIdentity, physicalIsolation: "imaginary" }
    const invalidExecutor = caught(() =>
      Agent.make({
        name: "invalid-executor",
        tools: [tool],
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: this deliberate malformed input exercises the executor identity schema boundary.
        codeMode: declaration({ executor: malformedIdentity as CodeExecutor.Identity }),
      }),
    )
    expect(invalidExecutor).toMatchObject({ field: "executor", reason: "identity-invalid" })

    for (const maxSourceBytes of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(
        caught(() =>
          Agent.make({ name: `source-${maxSourceBytes}`, tools: [tool], codeMode: declaration({ maxSourceBytes }) }),
        ),
      ).toMatchObject({ field: "maxSourceBytes", reason: "limit-invalid" })
    }

    const budgetFields = [
      "agentRuns",
      "concurrency",
      "toolCalls",
      "tokens",
      "wallClockMillis",
      "logBytes",
      "outputBytes",
    ] as const
    for (const field of budgetFields) {
      const values = field === "concurrency" ? [0, -1, 1.5] : [-1, 1.5]
      for (const value of values) {
        const failure = caught(() =>
          Agent.make({
            name: `budget-${field}-${value}`,
            tools: [tool],
            codeMode: declaration({ budget: { ...budget, [field]: value } }),
          }),
        )
        expect(failure).toMatchObject({ field: "budget", reason: "limit-invalid", name: field })
      }
    }
  })
})
