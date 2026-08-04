import { Effect, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import {
  currentDriverVersion,
  type DriverCheckpoint,
  type DriverDecision,
  type OperationOutcome,
  makeOperation,
  operationKey,
} from "./driver-contract.js"
import { DriverError, DriverStateInvalid, type DurableAgentDriver, type DriverInput } from "./durable-driver.js"
import { charge, type RunBudget } from "./run-budget.js"

/** @experimental Scripted model response used by the tracer driver. */
export interface TracerModelStep {
  readonly text?: string
  readonly toolCalls?: ReadonlyArray<{ readonly name: string; readonly params: unknown }>
  readonly wait?: { readonly waitId: string; readonly reason: string }
}

/** @experimental Internal tracer state serialized in DriverCheckpoint.state. */
export const TracerState = Schema.Struct({
  promptText: Schema.String,
  text: Schema.String,
  phase: Schema.Literals(["model", "tool", "wait-resume", "done"]),
  modelIndex: Schema.Finite,
  toolIndex: Schema.Finite,
  pendingTools: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      params: Schema.Unknown,
    }),
  ),
  waitId: Schema.optionalKey(Schema.String),
  script: Schema.Array(
    Schema.Struct({
      text: Schema.optionalKey(Schema.String),
      toolCalls: Schema.optionalKey(
        Schema.Array(
          Schema.Struct({
            name: Schema.String,
            params: Schema.Unknown,
          }),
        ),
      ),
      wait: Schema.optionalKey(
        Schema.Struct({
          waitId: Schema.String,
          reason: Schema.String,
        }),
      ),
    }),
  ),
})

/** @experimental */
export type TracerState = typeof TracerState.Type

const promptText = (prompt: Prompt.Prompt): string => {
  const first = prompt.content[0]
  if (first === undefined) return ""
  if (typeof first.content === "string") return first.content
  const textPart = first.content.find((part) => part.type === "text")
  return textPart?.type === "text" ? textPart.text : ""
}

const decodeState = (checkpoint: DriverCheckpoint): Effect.Effect<TracerState, DriverStateInvalid> =>
  Schema.decodeUnknownEffect(TracerState)(checkpoint.state).pipe(
    Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
  )

const withState = (
  checkpoint: DriverCheckpoint,
  state: TracerState,
  budget: RunBudget = checkpoint.budget,
): DriverCheckpoint => ({
  driverVersion: checkpoint.driverVersion,
  ...(checkpoint.executable === undefined ? {} : { executable: checkpoint.executable }),
  turn: checkpoint.turn,
  budget,
  state,
})

const modelOperation = (checkpoint: DriverCheckpoint, input: unknown) =>
  makeOperation({
    key: operationKey(["tracer", checkpoint.turn, "model", checkpoint.executable?.active ?? "standalone"]),
    kind: "model",
    input,
    replayPolicy: "provider-idempotent",
  })

const toolOperation = (
  checkpoint: DriverCheckpoint,
  tool: { readonly name: string; readonly params: unknown },
  index: number,
) =>
  makeOperation({
    key: operationKey(["tracer", checkpoint.turn, "tool", index, tool.name]),
    kind: "tool",
    input: tool,
    replayPolicy: "never",
  })

const waitOperation = (checkpoint: DriverCheckpoint, wait: { readonly waitId: string; readonly reason: string }) =>
  makeOperation({
    key: operationKey(["tracer", checkpoint.turn, "wait", wait.waitId]),
    kind: "wait",
    input: wait,
    replayPolicy: "pure",
  })

const chargeModel = (budget: RunBudget): Effect.Effect<RunBudget, DriverError> =>
  charge(budget, { modelCalls: 1 }).pipe(
    Effect.mapError((error) => DriverError.make({ message: `Run budget exhausted: ${error.dimension}`, cause: error })),
  )

const chargeTool = (budget: RunBudget): Effect.Effect<RunBudget, DriverError> =>
  charge(budget, { toolCalls: 1 }).pipe(
    Effect.mapError((error) => DriverError.make({ message: `Run budget exhausted: ${error.dimension}`, cause: error })),
  )

const currentStep = (state: TracerState) => state.script[state.modelIndex]

/** @experimental Canonical in-memory driver for checkpoint/decision/apply conformance tests. */
export const makeTracer = (script: ReadonlyArray<TracerModelStep>): DurableAgentDriver => ({
  version: currentDriverVersion,
  initial: (input: DriverInput) =>
    Effect.succeed({
      driverVersion: currentDriverVersion,
      ...(input.executable === undefined ? {} : { executable: input.executable }),
      turn: 0,
      budget: input.budget,
      state: {
        promptText: promptText(input.prompt),
        text: "",
        phase: "model",
        modelIndex: 0,
        toolIndex: 0,
        pendingTools: [],
        script: script.map((step) => ({
          ...(step.text === undefined ? {} : { text: step.text }),
          ...(step.toolCalls === undefined ? {} : { toolCalls: step.toolCalls }),
          ...(step.wait === undefined ? {} : { wait: step.wait }),
        })),
      } satisfies TracerState,
    }),
  decide: (checkpoint) =>
    Effect.gen(function* () {
      const state = yield* decodeState(checkpoint)
      if (state.phase === "done") {
        return {
          _tag: "Complete",
          result: { text: state.text, turns: checkpoint.turn + 1 },
        } satisfies DriverDecision
      }
      if (state.phase === "wait-resume") {
        return {
          _tag: "Execute",
          operation: waitOperation(checkpoint, {
            waitId: state.waitId ?? "wait",
            reason: "tracer-resume",
          }),
        } satisfies DriverDecision
      }
      if (state.phase === "tool") {
        const tool = state.pendingTools[state.toolIndex]
        if (tool === undefined) {
          return yield* DriverStateInvalid.make({ message: "Tracer tool phase without pending tool" })
        }
        return {
          _tag: "Execute",
          operation: toolOperation(checkpoint, tool, state.toolIndex),
        } satisfies DriverDecision
      }
      return {
        _tag: "Execute",
        operation: modelOperation(checkpoint, {
          turn: checkpoint.turn,
          promptText: state.promptText,
          step: state.modelIndex,
        }),
      } satisfies DriverDecision
    }),
  apply: (checkpoint, outcome) =>
    Effect.gen(function* () {
      const state = yield* decodeState(checkpoint)
      if (outcome._tag === "Unknown") {
        return yield* DriverError.make({
          message: `Tracer cannot apply unknown outcome for operation ${outcome.operationId}`,
        })
      }
      if (outcome._tag === "Failed") {
        return yield* DriverError.make({ message: "Tracer received failed operation outcome", cause: outcome.error })
      }
      if (state.phase === "wait-resume") {
        return withState(checkpoint, (({ waitId: _waitId, ...rest }) => ({ ...rest, phase: "model" as const }))(state))
      }
      if (state.phase === "tool") {
        const budget = yield* chargeTool(checkpoint.budget)
        const nextToolIndex = state.toolIndex + 1
        if (nextToolIndex >= state.pendingTools.length) {
          return withState(
            { ...checkpoint, turn: checkpoint.turn + 1, budget },
            { ...state, phase: "model", toolIndex: 0, pendingTools: [] },
            budget,
          )
        }
        return withState(checkpoint, { ...state, toolIndex: nextToolIndex }, budget)
      }
      const step = currentStep(state)
      if (step === undefined) {
        return yield* DriverStateInvalid.make({ message: "Tracer model index out of script bounds" })
      }
      const budget = yield* chargeModel(checkpoint.budget)
      if (step.wait !== undefined) {
        return withState(
          checkpoint,
          {
            ...state,
            phase: "wait-resume",
            waitId: step.wait.waitId,
            modelIndex: state.modelIndex + 1,
          },
          budget,
        )
      }
      const toolCalls = step.toolCalls ?? []
      if (toolCalls.length > 0) {
        return withState(
          checkpoint,
          {
            ...state,
            modelIndex: state.modelIndex + 1,
            phase: "tool",
            toolIndex: 0,
            pendingTools: toolCalls,
          },
          budget,
        )
      }
      const text = step.text ?? ""
      return withState(checkpoint, { ...state, text, phase: "done", modelIndex: state.modelIndex + 1 }, budget)
    }),
})

/** @experimental Advance one Execute decision using a supplied outcome. */
export const applyOperation = (
  driver: DurableAgentDriver,
  checkpoint: DriverCheckpoint,
  outcome: OperationOutcome,
): Effect.Effect<DriverCheckpoint, DriverError | DriverStateInvalid> => driver.apply(checkpoint, outcome)

/** @experimental Produce a Complete decision from a terminal tracer checkpoint. */
export const completeFromCheckpoint = (
  checkpoint: DriverCheckpoint,
): Effect.Effect<Extract<DriverDecision, { _tag: "Complete" }>, DriverStateInvalid> =>
  Effect.gen(function* () {
    const state = yield* decodeState(checkpoint)
    if (state.phase !== "done") {
      return yield* DriverStateInvalid.make({ message: "Tracer checkpoint is not terminal" })
    }
    return { _tag: "Complete", result: { text: state.text, turns: checkpoint.turn + 1 } }
  })
