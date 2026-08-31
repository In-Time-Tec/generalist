import { Console, Effect } from "effect"
import { Entry, Registration, Snapshot, State } from "generalist/instructions"

const scope = "thread:demo"
const at = "2024-01-01T00:00:00.000Z"

const entry = (id: string, kind: Entry.GuidanceKind): Entry.GuidanceEntry => ({
  id,
  kind,
  scope,
  title: `title ${id}`,
  content: `content ${id}`,
  createdAt: at,
  updatedAt: at,
  version: 1,
})

const state = State.make({ scope, entries: [entry("prefers-bun", "memory"), entry("review", "skill")] })

const program = Effect.gen(function* () {
  const pinned = Registration.make(state, "guidance")
  yield* Console.log(`snapshot: ${pinned.id}`)
  yield* Console.log(`capability: ${pinned.capability.name}`)
  yield* Console.log(`codec: ${pinned.capability.content?.codec} version: ${pinned.capability.content?.version}`)

  // The durable host records { pin, codec, version, payload } and Generalist reconstructs the exact state.
  const restored = yield* Snapshot.decode(pinned.id, pinned.payload)
  yield* Console.log(
    `restored entries: ${State.allEntries(restored)
      .map((item) => item.id)
      .join(", ")}`,
  )

  const drifted = Snapshot.encode(State.make({ scope, entries: [entry("prefers-bun", "memory")] }))
  const mismatch = yield* Effect.flip(Snapshot.decode(pinned.id, drifted))
  yield* Console.log(`drifted payload: ${mismatch._tag}`)
})

await Effect.runPromise(program)
