import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { DeadlockError, SqlError, UnknownError } from "effect/unstable/sql/SqlError"
import { transactionWithDeadlockRetry } from "../../../src/mysql/transaction/scope.js"

const sqlError = (reason: DeadlockError | UnknownError): SqlError => SqlError.make({ reason })

const failingTransaction =
  (failure: SqlError, failures: number, attempts: { value: number }) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.suspend(() => {
      attempts.value += 1
      return Effect.flatMap(effect, (result) =>
        attempts.value <= failures ? Effect.fail(failure) : Effect.succeed(result),
      )
    })

it.live("retries the whole transaction after a deadlock", () => {
  const attempts = { value: 0 }
  const failure = sqlError(DeadlockError.make({ cause: "forced", message: "Deadlock found; code 1213" }))
  return Effect.gen(function* () {
    yield* transactionWithDeadlockRetry({
      effect: Effect.succeed("committed"),
      transact: failingTransaction(failure, 2, attempts),
    })
    expect(attempts.value).toBe(3)
  })
})

it.live("exhausts the initial attempt plus four exact deadlock retries", () => {
  const attempts = { value: 0 }
  const deadlock = sqlError(DeadlockError.make({ cause: "forced", message: "SQLSTATE 40001 deadlock" }))
  return Effect.gen(function* () {
    expect(
      yield* transactionWithDeadlockRetry({
        effect: Effect.void,
        transact: failingTransaction(deadlock, Number.POSITIVE_INFINITY, attempts),
      }).pipe(Effect.flip),
    ).toBe(deadlock)
    expect(attempts.value).toBe(5)
  })
})

it.live("does not retry a non-deadlock SQL failure", () => {
  const attempts = { value: 0 }
  const failure = sqlError(UnknownError.make({ cause: "forced", message: "syntax failure" }))
  return Effect.gen(function* () {
    expect(
      yield* transactionWithDeadlockRetry({
        effect: Effect.void,
        transact: failingTransaction(failure, Number.POSITIVE_INFINITY, attempts),
      }).pipe(Effect.flip),
    ).toBe(failure)
    expect(attempts.value).toBe(1)
  })
})
