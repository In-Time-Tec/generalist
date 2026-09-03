import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { dag } from "../../src/unstable/rl-export/index.js"
import { makeRuntime, runIds } from "./rl-fixture.js"

it.effect("projects fork, child, and compaction journal facts into one DAG", () =>
  Effect.gen(function* () {
    const { runtime } = makeRuntime()
    const trajectory = yield* dag(runtime, runIds.root)

    expect(trajectory.leaves).toEqual([
      `${runIds.root}:terminal`,
      `${runIds.fork}:terminal`,
      `${runIds.child}:terminal`,
    ])
    expect(trajectory.edges.map((edge) => edge.type)).toEqual([
      "compaction",
      "parent",
      "parent",
      "fork",
      "parent",
      "child",
      "parent",
    ])
    expect(trajectory.nodes.map((node) => [node.runId, node.operation._tag])).toEqual([
      [runIds.root, "ModelCall"],
      [runIds.root, "Compaction"],
      [runIds.root, "ChildLink"],
      [runIds.root, "Terminal"],
      [runIds.fork, "ModelCall"],
      [runIds.fork, "Terminal"],
      [runIds.child, "ModelCall"],
      [runIds.child, "Terminal"],
    ])
  }),
)
