import { Console, Effect, ManagedRuntime, Result } from "effect"
import { Authorship, Overview, Store, Refinement } from "tenetkit/agent-guidance"

const program = Store.Store.use((store) =>
  Effect.gen(function* () {
    const state = yield* store.load("thread:demo")
    const proposal = yield* Authorship.authorProposal({
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
    })
    const result = Refinement.applyProposal(state, proposal)
    if (Result.isFailure(result)) return yield* Console.log(`rejected: ${result.failure.reason}`)
    yield* store.save(result.success.state)
    yield* Console.log(Overview.formatOverview(result.success.state, { maxEntriesPerKind: 4 }))
  }),
)

const runtime = ManagedRuntime.make(Store.layerMemory)
await runtime.runPromise(program)
