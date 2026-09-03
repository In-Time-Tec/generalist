import { expect, it } from "@effect/vitest"
import { Effect, Schema, Stream } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import packageManifest from "../../package.json" with { type: "json" }
import { make as makeTestModel, text, turn } from "../../src/testing/model/service.js"
import type { CompletedModelResponse } from "../../src/runtime/run/event.js"
import {
  Reward,
  VerifiersV1Record,
  dag,
  export as exportDag,
  type IncludeOptions,
} from "../../src/unstable/rl-export/index.js"
import { makeRuntime, runIds } from "./rl-fixture.js"

const decode = Schema.decodeSync(Schema.fromJsonString(VerifiersV1Record))
const allBranches: IncludeOptions = {
  logprobs: true,
  compactionBranches: true,
  childBranches: true,
  speculationLosers: true,
}

const exportRecords = <R, E>(
  trajectory: Parameters<typeof exportDag<R, E>>[0],
  reward: Reward.Service<R, E>,
  include: IncludeOptions = allBranches,
) =>
  exportDag(trajectory, { format: "verifiers-v1", include, reward }).pipe(
    Stream.map((bytes) => decode(new TextDecoder().decode(bytes).trim())),
    Stream.runCollect,
  )

it.effect("streams the golden root, fork, and child leaf set and journals gate rewards", () =>
  Effect.gen(function* () {
    const { runtime, rewards } = makeRuntime()
    const trajectory = yield* dag(runtime, runIds.root)
    const records = yield* exportRecords(trajectory, Reward.fromGates)

    expect(records.map((record) => record.reward)).toEqual([1, 0, 1])
    expect(records.map((record) => record.env)).toEqual([
      { taskset: "rl-golden", harness: `generalist@${packageManifest.version}` },
      { taskset: "rl-golden", harness: `generalist@${packageManifest.version}` },
      { taskset: "rl-golden", harness: `generalist@${packageManifest.version}` },
    ])
    expect(rewards.map(({ runId, leaf, value, source }) => ({ runId, leaf, value, source }))).toEqual([
      { runId: runIds.root, leaf: `${runIds.root}:terminal`, value: 1, source: "gates" },
      { runId: runIds.fork, leaf: `${runIds.fork}:terminal`, value: 0, source: "gates" },
      { runId: runIds.child, leaf: `${runIds.child}:terminal`, value: 1, source: "gates" },
    ])
  }),
)

it.effect("preserves deterministic provider tokens and logprobs on ModelCall operations", () =>
  Effect.gen(function* () {
    const model = yield* makeTestModel([turn([text("with logprobs")], { tokens: [101, 102], logprobs: [-0.1, -0.2] })])
    // oxlint-disable-next-line effecttsgo/strict-effect-provide -- the test is the scoped application boundary.
    const generated = yield* LanguageModel.generateText({ prompt: "record this" }).pipe(Effect.provide(model.layer))
    const recorded: CompletedModelResponse = {
      content: generated.content,
      usage: generated.usage,
      finishReason: generated.finishReason,
    }
    const { runtime } = makeRuntime({
      "call:root": recorded,
      "call:fork": recorded,
      "call:child": recorded,
    })
    const trajectory = yield* dag(runtime, runIds.root)
    const records = yield* exportRecords(trajectory, Reward.make("constant", Effect.succeed(0.5)))

    expect(records.map((record) => record.tokens)).toEqual([
      [101, 102],
      [101, 102, 101, 102],
      [101, 102],
    ])
    expect(records.map((record) => record.logprobs)).toEqual([
      [-0.1, -0.2],
      [-0.1, -0.2, -0.1, -0.2],
      [-0.1, -0.2],
    ])
  }),
)

it.effect("averages existing eval scorers into one reward", () =>
  Effect.gen(function* () {
    const { runtime } = makeRuntime()
    const trajectory = yield* dag(runtime, runIds.root)
    const reward = Reward.fromEval([
      { name: "exact", evaluate: () => Effect.succeed({ scorer: "exact", passed: true, value: 1 }) },
      { name: "partial", evaluate: () => Effect.succeed({ scorer: "partial", passed: false, value: 0.5 }) },
    ])
    const records = yield* exportRecords(trajectory, reward, {
      ...allBranches,
      compactionBranches: false,
      childBranches: false,
    })

    expect(records.map((record) => record.reward)).toEqual([0.75])
  }),
)

it.effect("marks unavailable logprobs null and does not invent speculation branches", () =>
  Effect.gen(function* () {
    const { runtime } = makeRuntime()
    const trajectory = yield* dag(runtime, runIds.root)
    const records = yield* exportRecords(trajectory, Reward.fromGates, {
      ...allBranches,
      compactionBranches: false,
      childBranches: false,
    })

    expect(records).toHaveLength(1)
    expect(records[0]?.logprobs).toBeNull()
    expect(records[0]).not.toHaveProperty("tokens")
    expect(records[0]?.messages.at(-1)).toMatchObject({ role: "assistant" })
  }),
)
