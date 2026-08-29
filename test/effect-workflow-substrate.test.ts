import { describe, expect, expectTypeOf, it } from "vitest"
import { Schema, type Effect } from "effect"
import type * as ShardId from "effect/unstable/cluster/ShardId"
import type * as RunnerStorage from "effect/unstable/cluster/RunnerStorage"
import * as Workflow from "effect/unstable/workflow/Workflow"
import effectManifest from "../node_modules/effect/package.json" with { type: "json" }
import workspaceManifest from "../package.json" with { type: "json" }

describe("Effect Workflow substrate decision", () => {
  it("pins the evaluated Effect release", () => {
    expect(workspaceManifest.workspaces.catalog.effect).toBe("4.0.0-rc.111")
    expect(effectManifest.version).toBe(workspaceManifest.workspaces.catalog.effect)
  })

  it("has no durable unknown workflow result", () => {
    expectTypeOf<Workflow.Result<unknown, unknown>["_tag"]>().toEqualTypeOf<"Complete" | "Suspended">()

    const result = Schema.toCodecJson(Workflow.Result({ success: Schema.Unknown, error: Schema.Unknown }))
    expect(Schema.decodeUnknownExit(result)({ _tag: "Unknown" })._tag).toBe("Failure")
  })

  it("returns shard identities rather than a monotonic ownership fence", () => {
    type Acquire = RunnerStorage.RunnerStorage["Service"]["acquire"]
    type Refresh = RunnerStorage.RunnerStorage["Service"]["refresh"]

    expectTypeOf<Effect.Success<ReturnType<Acquire>>>().toEqualTypeOf<Array<ShardId.ShardId>>()
    expectTypeOf<Effect.Success<ReturnType<Refresh>>>().toEqualTypeOf<Array<ShardId.ShardId>>()
  })
})
