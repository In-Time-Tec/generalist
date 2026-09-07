import { Effect, Schema } from "effect"
import { type Head as JournalHead, type State, make } from "../../src/durability/internal/journal.js"
import { ObjectStore, ObjectStoreFailure, type Service } from "../../src/durability/object-store.js"
import { atomicCreates, byteIntegrity, freshReads, listing } from "../../src/testing/durability/index.js"

export const Head = Schema.Struct({
  sequence: Schema.String,
  digest: Schema.String,
  stateDigest: Schema.String,
  state: Schema.Struct({ count: Schema.Int }),
})
const receipt = Schema.decodeUnknownSync(Schema.Struct({ count: Schema.Int }))
const check = (condition: boolean, message: string) => (condition ? Effect.void : Effect.die(new Error(message)))
export const open = (store: Service) =>
  make({ environment: "local", tenant: "integration", partition: "journal", snapshotEvery: 2 }).pipe(
    Effect.provideService(ObjectStore, store),
  )
const increment = (state: State) =>
  Effect.succeed({
    patches: [{ op: "set" as const, path: ["count"], value: Number(state.count ?? 0) + 1 }],
    receipt: { count: Number(state.count ?? 0) + 1 },
  })

export const append = ({ store, id }: { readonly store: Service; readonly id: string }) =>
  open(store).pipe(Effect.flatMap((journal) => journal.commit({ id, input: null }, increment)))

export const objectConformance = <E, R>(connect: Effect.Effect<Service, E, R>) =>
  Effect.gen(function* () {
    const conformance = { connect, prefix: "local-conformance" }
    yield* atomicCreates(conformance)
    yield* freshReads(conformance)
    yield* byteIntegrity(conformance)
    yield* listing(conformance)
  })

export const exercise = <E, R>(connect: Effect.Effect<Service, E, R>) =>
  Effect.gen(function* () {
    const journals = yield* Effect.forEach([0, 1, 2, 3], () => connect.pipe(Effect.flatMap(open)))
    const receipts = yield* Effect.forEach(
      journals,
      (journal, index) => journal.commit({ id: `contender-${index}`, input: null }, increment),
      { concurrency: 4 },
    )
    yield* check(
      receipts
        .map((value) => receipt(value).count)
        .toSorted()
        .join(",") === "1,2,3,4",
      "Concurrent journal commands must serialize exactly once",
    )
    const store = yield* connect
    let dropped = 0
    const faulted: Service = {
      ...store,
      create: (key, bytes) =>
        store.create(key, bytes).pipe(
          Effect.flatMap((result) => {
            if (key.includes("/commits/") && result === "created" && dropped === 0) {
              dropped += 1
              return Effect.fail(
                ObjectStoreFailure.make({
                  operation: "create",
                  key,
                  reason: "unavailable",
                  message: "Test client discarded a successful local service acknowledgement",
                }),
              )
            }
            return Effect.succeed(result)
          }),
        ),
    }
    const journal = yield* open(faulted)
    yield* check(
      receipt(yield* journal.commit({ id: "lost-ack", input: null }, increment)).count === 5,
      "Lost acknowledgement was not reconciled",
    )
    yield* check(dropped === 1, "Lost acknowledgement must be injected exactly once")
    return yield* journal.read
  })

export const recover = ({ store, expected }: { readonly store: Service; readonly expected: JournalHead }) =>
  Effect.gen(function* () {
    const journal = yield* open(store)
    const actual = yield* journal.read
    yield* check(
      actual.sequence === expected.sequence &&
        actual.digest === expected.digest &&
        actual.stateDigest === expected.stateDigest &&
        actual.state.count === expected.state.count,
      "Restart changed authoritative Journal head",
    )
    yield* check(
      receipt(
        yield* journal.commit({ id: "lost-ack", input: null }, () => Effect.die("Replayed command was redispatched")),
      ).count === 5,
      "Original receipt was not retained",
    )
    yield* check(
      receipt(yield* journal.commit({ id: "after-restart", input: null }, increment)).count === 6,
      "Restart did not continue authoritative history",
    )
  })
