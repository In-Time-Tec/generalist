import { describe, expect, expectTypeOf, it } from "vitest"
import { Schema, type Effect } from "effect"
import type { ShardId } from "effect/unstable/cluster/ShardId"
import type { RunnerStorage } from "effect/unstable/cluster/RunnerStorage"
import { Result } from "effect/unstable/workflow/Workflow"
import effectManifest from "../node_modules/effect/package.json" with { type: "json" }
import workspaceManifest from "../package.json" with { type: "json" }

describe("Effect Workflow substrate decision", () => {
  it("pins one override-free Effect release cohort", () => {
    const version = workspaceManifest.workspaces.catalog.effect
    const cohort = Object.entries(workspaceManifest.workspaces.catalog)
      .filter(([name]) => name === "effect" || (name.startsWith("@effect/") && name !== "@effect/tsgo"))
      .map(([, dependencyVersion]) => dependencyVersion)

    expect(version).toBe("4.0.0-rc.112")
    expect(effectManifest.version).toBe(version)
    expect(cohort).toHaveLength(12)
    expect(new Set(cohort)).toEqual(new Set([version]))
    expect("overrides" in workspaceManifest).toBe(false)
  })

  it("has no durable unknown workflow result", () => {
    expectTypeOf<Result<unknown, unknown>["_tag"]>().toEqualTypeOf<"Complete" | "Suspended">()

    const result = Schema.toCodecJson(Result({ success: Schema.Unknown, error: Schema.Unknown }))
    expect(Schema.decodeExit(result)({ _tag: "Unknown" })._tag).toBe("Failure")
  })

  it("returns shard identities rather than a monotonic ownership fence", () => {
    type Acquire = RunnerStorage["Service"]["acquire"]
    type Refresh = RunnerStorage["Service"]["refresh"]

    expectTypeOf<Effect.Success<ReturnType<Acquire>>>().toEqualTypeOf<Array<ShardId>>()
    expectTypeOf<Effect.Success<ReturnType<Refresh>>>().toEqualTypeOf<Array<ShardId>>()
  })
})
