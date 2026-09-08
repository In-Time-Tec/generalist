import { Deferred, Effect, Option } from "effect"
import { ConnectionStatusCapacity } from "../../../server/client.js"

export class StatusEpochRegistry {
  private readonly epochs = new Map<number, Deferred.Deferred<Option.Option<number>>>()
  private retiredThrough = -1

  readonly bind = (socketEpoch: number, deliveryEpoch: number): Effect.Effect<void> =>
    Effect.suspend(() => {
      if (socketEpoch <= this.retiredThrough) return Effect.void
      let deferred = this.epochs.get(socketEpoch)
      if (deferred === undefined) {
        deferred = Deferred.makeUnsafe<Option.Option<number>>()
        this.epochs.set(socketEpoch, deferred)
      }
      this.retiredThrough = Math.max(this.retiredThrough, socketEpoch - ConnectionStatusCapacity)
      const retired = [...this.epochs].filter(([epoch]) => epoch <= this.retiredThrough)
      return Deferred.succeed(deferred, Option.some(deliveryEpoch)).pipe(
        Effect.andThen(
          Effect.forEach(retired, ([epoch, entry]) =>
            Deferred.succeed(entry, Option.none()).pipe(
              Effect.andThen(
                Effect.sync(() => {
                  if (this.epochs.get(epoch) === entry) this.epochs.delete(epoch)
                }),
              ),
            ),
          ),
        ),
        Effect.asVoid,
      )
    }).pipe(Effect.uninterruptible)

  readonly get = (socketEpoch: number): Effect.Effect<Option.Option<number>> =>
    Effect.suspend(() => {
      if (socketEpoch <= this.retiredThrough) return Effect.succeed(Option.none())
      let deferred = this.epochs.get(socketEpoch)
      if (deferred === undefined) {
        deferred = Deferred.makeUnsafe<Option.Option<number>>()
        this.epochs.set(socketEpoch, deferred)
      }
      return Deferred.await(deferred)
    })

  get retained(): number {
    return this.epochs.size
  }
}
