import { Console, Effect, ManagedRuntime, Result } from "effect"
import { Authorship, Overview, State, Store, Refinement } from "tenetkit/agent-guidance"

const scope = "thread:demo"

/** Exactly the shape a model proposes: no revision field exists on an authored edit. */
const modelProposal = {
  id: "proposal-1",
  at: "2024-01-01T00:00:00.000Z",
  rationale: "record one durable preference",
  edits: [
    {
      _tag: "Create",
      kind: "memory",
      id: "prefers-bun",
      value: { title: "Prefers Bun", content: "Run repository commands with bun." },
    },
  ],
}

const forged = {
  ...modelProposal,
  id: "proposal-2",
  edits: [
    {
      ...modelProposal.edits[0],
      revision: { createdAt: "1999-01-01T00:00:00.000Z", updatedAt: "1999-01-01T00:00:00.000Z", version: 4242 },
    },
  ],
}

const program = Store.Store.use((store) =>
  Effect.gen(function* () {
    const state = yield* store.load(scope)

    const proposal = yield* Authorship.authorProposal(modelProposal)
    const applied = Refinement.applyProposal(state, proposal)
    if (Result.isFailure(applied)) return yield* Console.log(`rejected: ${applied.failure.reason}`)
    yield* store.save(applied.success.state)

    const created = State.findEntry(applied.success.state, "memory", "prefers-bun")
    yield* Console.log(`created version: ${created?.version}, createdAt: ${created?.createdAt}`)

    const refused = yield* Effect.flip(Authorship.authorProposal(forged))
    yield* Console.log(`authorship refused: ${refused.reason}`)

    const inverse = Refinement.rollbackProposal(applied.success, { id: "rollback-1", at: "2024-01-02T00:00:00.000Z" })
    const restored = Refinement.applyTrustedProposal(applied.success.state, inverse)
    if (Result.isFailure(restored)) return yield* Console.log(`rollback rejected: ${restored.failure.reason}`)
    yield* store.save(restored.success.state)
    yield* Console.log(
      `after rollback: ${State.findEntry(restored.success.state, "memory", "prefers-bun") === undefined ? "absent" : "present"}`,
    )
    yield* Console.log(Overview.formatOverview(restored.success.state, { maxEntriesPerKind: 2 }))
  }),
)

const runtime = ManagedRuntime.make(Store.layerMemory)
await runtime.runPromise(program)
