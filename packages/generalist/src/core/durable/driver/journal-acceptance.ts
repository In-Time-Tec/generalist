import { Effect, Exit, Ref } from "effect"
import { DriverError } from "../service.js"
import type { Journal } from "./interpreter.js"

export const make = (journal: Journal): Effect.Effect<Journal> =>
  Effect.gen(function* () {
    const failed = yield* Ref.make(false)
    const accept = <A>(effect: Effect.Effect<A, DriverError>): Effect.Effect<A, DriverError> =>
      Effect.gen(function* () {
        if (yield* Ref.get(failed)) {
          return yield* DriverError.make({
            message: "Journal acknowledgement failed; reconstruct the interpreter before continuing",
          })
        }
        return yield* effect.pipe(Effect.onExit((exit) => (Exit.isFailure(exit) ? Ref.set(failed, true) : Effect.void)))
      })
    return {
      onScheduled: (operation, checkpoint) => accept(Effect.suspend(() => journal.onScheduled(operation, checkpoint))),
      onCompleted: (operation, outcome, checkpoint) =>
        accept(Effect.suspend(() => journal.onCompleted(operation, outcome, checkpoint))),
      onCheckpoint: (checkpoint, commandId) =>
        accept(Effect.suspend(() => journal.onCheckpoint(checkpoint, commandId))),
    }
  })
