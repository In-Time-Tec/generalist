import { Console, Effect } from "effect"
import { HarnessEntry, HarnessRegistration, HarnessSnapshot, HarnessState } from "@batonfx/harness"

const scope = "thread:demo"
const at = "2024-01-01T00:00:00.000Z"

const entry = (id: string, kind: HarnessEntry.HarnessKind): HarnessEntry.HarnessEntry => ({
  id,
  kind,
  scope,
  title: `title ${id}`,
  content: `content ${id}`,
  createdAt: at,
  updatedAt: at,
  version: 1,
})

const state = HarnessState.make({ scope, entries: [entry("prefers-bun", "memory"), entry("review", "skill")] })

const program = Effect.gen(function* () {
  const pinned = HarnessRegistration.registration(state, "harness")
  yield* Console.log(`snapshot: ${pinned.id}`)
  yield* Console.log(`capability: ${pinned.capability.name}`)
  yield* Console.log(`codec: ${pinned.capability.content?.codec} version: ${pinned.capability.content?.version}`)

  // The durable host records { pin, codec, version, payload } and Baton reconstructs the exact state.
  const restored = yield* HarnessSnapshot.decode(pinned.id, pinned.payload)
  yield* Console.log(
    `restored entries: ${HarnessState.allEntries(restored)
      .map((item) => item.id)
      .join(", ")}`,
  )

  const drifted = HarnessSnapshot.encode(HarnessState.make({ scope, entries: [entry("prefers-bun", "memory")] }))
  const mismatch = yield* Effect.flip(HarnessSnapshot.decode(pinned.id, drifted))
  yield* Console.log(`drifted payload: ${mismatch._tag}`)
})

await Effect.runPromise(program)
