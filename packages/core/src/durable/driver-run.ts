import { Effect, Schema, Stream } from "effect"
import { DriverInterpreter, type OperationSpec } from "./driver-interpreter.js"
import type { BudgetLimits, RunBudget } from "./run-budget.js"
import { LoopDriverState } from "./loop-driver-state.js"
import { DriverError, DriverStateInvalid } from "./durable-driver.js"
import { DriverUnknownReplay } from "./driver-interpreter.js"
import { RunBudgetExhausted } from "./run-budget.js"

/** @experimental */
export const checkpoint = Effect.flatMap(DriverInterpreter, (interpreter) => interpreter.checkpoint)

/** @experimental */
export const logicalOperationId = checkpoint.pipe(
  Effect.flatMap((current) =>
    Schema.decodeUnknownEffect(LoopDriverState)(current.state).pipe(
      Effect.map((state) => state.logicalOperationId),
      Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
    ),
  ),
)

/** @experimental */
export const intercept = <A, E, R>(
  spec: OperationSpec,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | DriverError | DriverStateInvalid | DriverUnknownReplay | RunBudgetExhausted, R> =>
  Effect.gen(function* () {
    const interpreter = yield* DriverInterpreter
    return yield* interpreter.run(spec, effect)
  }) as Effect.Effect<A, E | DriverError | DriverStateInvalid | DriverUnknownReplay | RunBudgetExhausted, R>

/** @experimental */
export const interceptStream = <A, E, R>(
  spec: OperationSpec,
  stream: Stream.Stream<A, E, R>,
): Stream.Stream<A, E | DriverError | DriverStateInvalid | DriverUnknownReplay | RunBudgetExhausted, R> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const interpreter = yield* DriverInterpreter
      return interpreter.runStream(spec, stream)
    }),
  ) as Stream.Stream<A, E | DriverError | DriverStateInvalid | DriverUnknownReplay | RunBudgetExhausted, R>

/** @experimental */
export const recordSuspension = (input: { readonly waitId: string; readonly reason: string; readonly token: string }) =>
  Effect.flatMap(DriverInterpreter, (interpreter) => interpreter.recordSuspension(input))

/** @experimental */
export const bindResume = (token: string) =>
  Effect.flatMap(DriverInterpreter, (interpreter) => interpreter.bindResume(token))

/** @experimental */
export const abortPending = (error: unknown) =>
  Effect.flatMap(DriverInterpreter, (interpreter) => interpreter.abortPending(error))

/** @experimental */
export const chargeUsage = (usage: BudgetLimits) =>
  Effect.flatMap(DriverInterpreter, (interpreter) => interpreter.chargeUsage(usage))

/** @experimental */
export const setBudget = (budget: RunBudget) =>
  Effect.flatMap(DriverInterpreter, (interpreter) => interpreter.setBudget(budget))

/** @experimental */
export const reserveChildBudget = (grant: BudgetLimits) =>
  Effect.flatMap(DriverInterpreter, (interpreter) => interpreter.reserveChild(grant))

/** @experimental */
export const refundChildBudget = (child: RunBudget) =>
  Effect.flatMap(DriverInterpreter, (interpreter) => interpreter.refundChild(child))

/** @experimental */
export const recorded = Effect.flatMap(DriverInterpreter, (interpreter) => interpreter.recorded)
