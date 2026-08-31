import { Effect, Function, Schema, Stream } from "effect"
import { arrayStreamCodec, DriverInterpreter, DriverUnknownReplay, type OperationSpec } from "./interpreter.js"
import { Exhausted, type BudgetLimits, type RunBudget } from "../run-budget.js"
import { LoopDriverState } from "../loop-driver-state.js"
import { DriverError, DriverStateInvalid } from "../service.js"
import type { ControlState } from "../../agent/handoff/state.js"

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
export const intercept: {
  <A, E, SRD, SRE, FRD, FRE>(
    spec: OperationSpec<A, E, SRD, SRE, FRD, FRE>,
  ): <R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<
    A,
    E | DriverError | DriverStateInvalid | DriverUnknownReplay | Exhausted,
    R | SRD | SRE | FRD | FRE | DriverInterpreter
  >
  <A, E, R, SRD, SRE, FRD, FRE>(
    spec: OperationSpec<A, E, SRD, SRE, FRD, FRE>,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    E | DriverError | DriverStateInvalid | DriverUnknownReplay | Exhausted,
    R | SRD | SRE | FRD | FRE | DriverInterpreter
  >
} = Function.dual(
  2,
  <A, E, R, SRD, SRE, FRD, FRE>(
    spec: OperationSpec<A, E, SRD, SRE, FRD, FRE>,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    E | DriverError | DriverStateInvalid | DriverUnknownReplay | Exhausted,
    R | SRD | SRE | FRD | FRE | DriverInterpreter
  > =>
    Effect.gen(function* () {
      const interpreter = yield* DriverInterpreter
      return yield* interpreter.run(spec, effect)
    }),
)

/** @experimental */
export const interceptStream: {
  <A, E, SRD, SRE, FRD, FRE>(
    spec: OperationSpec<ReadonlyArray<A>, E, SRD, SRE, FRD, FRE>,
  ): <R>(
    stream: Stream.Stream<A, E, R>,
  ) => Stream.Stream<
    A,
    E | DriverError | DriverStateInvalid | DriverUnknownReplay | Exhausted,
    R | SRD | SRE | FRD | FRE | DriverInterpreter
  >
  <A, E, R, SRD, SRE, FRD, FRE>(
    spec: OperationSpec<ReadonlyArray<A>, E, SRD, SRE, FRD, FRE>,
    stream: Stream.Stream<A, E, R>,
  ): Stream.Stream<
    A,
    E | DriverError | DriverStateInvalid | DriverUnknownReplay | Exhausted,
    R | SRD | SRE | FRD | FRE | DriverInterpreter
  >
} = Function.dual(
  2,
  <A, E, R, SRD, SRE, FRD, FRE>(
    spec: OperationSpec<ReadonlyArray<A>, E, SRD, SRE, FRD, FRE>,
    stream: Stream.Stream<A, E, R>,
  ): Stream.Stream<
    A,
    E | DriverError | DriverStateInvalid | DriverUnknownReplay | Exhausted,
    R | SRD | SRE | FRD | FRE | DriverInterpreter
  > =>
    Stream.unwrap(
      Effect.gen(function* () {
        const interpreter = yield* DriverInterpreter
        return interpreter.runStream(spec, stream, { successCodec: arrayStreamCodec<A>() })
      }),
    ),
)

/** @internal Replace the one current authored-order tool batch checkpoint. */
export const setToolBatch = (toolBatch: import("../../agent/tools/checkpoint.js").ToolBatchCheckpoint | undefined) =>
  Effect.flatMap(DriverInterpreter, (interpreter) => interpreter.setToolBatch(toolBatch))

/** @internal Apply one exact tool-call state transition to the current batch checkpoint. */
export const updateToolBatch = (
  update: (
    checkpoint: import("../../agent/tools/checkpoint.js").ToolBatchCheckpoint,
  ) => import("../../agent/tools/checkpoint.js").ToolBatchCheckpoint,
) => Effect.flatMap(DriverInterpreter, (interpreter) => interpreter.updateToolBatch(update))

/** @experimental */
export const abortPending = (error: typeof Schema.Unknown.Type) =>
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

/** @internal Persist a live handoff control transition in the owning checkpoint. */
export const setHandoffState = (state: ControlState) =>
  Effect.flatMap(DriverInterpreter, (interpreter) => interpreter.setHandoffState(state))

/** @experimental */
export const recorded = Effect.flatMap(DriverInterpreter, (interpreter) => interpreter.recorded)
