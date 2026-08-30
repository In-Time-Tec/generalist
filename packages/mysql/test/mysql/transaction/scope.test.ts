import { expect, it } from "@effect/vitest"
import { Effect, Metric, Tracer } from "effect"
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
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  return Effect.gen(function* () {
    yield* transactionWithDeadlockRetry({
      effect: Effect.succeed("committed"),
      transact: failingTransaction(failure, 2, attempts),
    })
    expect(attempts.value).toBe(3)
    const snapshots = yield* Metric.snapshot
    const retries = snapshots.find((snapshot) => snapshot.id === "tenetkit_runtime_sql_deadlock_retries")
    expect(retries?.type).toBe("Counter")
    if (retries?.type === "Counter") expect(retries.state.count).toBe(2)
    expect(spans[0]?.attributes.get("tenetkit.runtime.sql.retry.classification")).toBe("deadlock")
    expect(spans[0]?.attributes.get("tenetkit.runtime.sql.retry.attempt")).toBe(2)
  }).pipe(
    Effect.withSpan("mysql-transaction-test"),
    Effect.provideService(Tracer.Tracer, tracer),
    Effect.provideService(Metric.MetricRegistry, new Map()),
  )
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
