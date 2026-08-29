import { Effect, Function, Layer, Schema } from "effect"
import { Prompt, Tool } from "effect/unstable/ai"
import type { Agent, RunOptions } from "../../agent/service.js"
import { make as makeLoopDriver, type LoopDriverOptions } from "../loop-driver.js"
import { allocate, type RunBudget } from "../run-budget.js"
import { DriverError, DriverStateInvalid } from "../service.js"
import { currentDriverVersion, type DriverCheckpoint } from "./contract.js"
import { DriverInterpreter, layerInline } from "./interpreter.js"

const AgentInput = Schema.Struct({ toolkit: Schema.Unknown })

/** @experimental Construct the inline driver Layer for one Agent run. */
export const layerForRun: {
  <Tools extends Record<string, Tool.Any>, R>(
    options: RunOptions,
    prompt: Prompt.Prompt,
    budget?: RunBudget,
  ): (agent: Agent<Tools, R>) => Layer.Layer<DriverInterpreter, DriverError | DriverStateInvalid>
  <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
    options: RunOptions,
    prompt: Prompt.Prompt,
    budget?: RunBudget,
  ): Layer.Layer<DriverInterpreter, DriverError | DriverStateInvalid>
} = Function.dual(
  (args) => args.length >= 1 && Schema.is(AgentInput)(args[0]),
  <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
    options: RunOptions,
    prompt: Prompt.Prompt,
    budget?: RunBudget,
  ): Layer.Layer<DriverInterpreter, DriverError | DriverStateInvalid> => {
    const sessionId = options.sessionId ?? agent.name
    const logicalOperationId = options.logicalOperationId ?? sessionId
    let driverOptions: LoopDriverOptions = { logicalOperationId, sessionId }
    if (options.modelCallOrdinalStart !== undefined) {
      driverOptions = { ...driverOptions, modelCallOrdinalStart: options.modelCallOrdinalStart }
    }
    const driver = makeLoopDriver(driverOptions)
    const initial: Effect.Effect<DriverCheckpoint, DriverError | DriverStateInvalid> = Effect.gen(function* () {
      if (options.driverCheckpoint === undefined) {
        let driverInput: Parameters<typeof driver.initial>[0] = {
          prompt,
          budget: budget ?? allocate({}),
        }
        if (options.executableRef !== undefined) driverInput = { ...driverInput, executable: options.executableRef }
        return yield* driver.initial(driverInput)
      }
      const checkpoint = options.driverCheckpoint
      if (options.executableRef === undefined || checkpoint.executable === undefined) {
        return yield* DriverStateInvalid.make({
          message: "Persisted driver checkpoints require an explicit executable identity",
        })
      }
      if (
        checkpoint.driverVersion !== currentDriverVersion ||
        checkpoint.executable.executable !== options.executableRef.executable ||
        checkpoint.executable.active !== options.executableRef.active
      ) {
        return yield* DriverStateInvalid.make({
          message: "Persisted driver checkpoint does not match the active Agent",
        })
      }
      return checkpoint
    })
    return Layer.unwrap(initial.pipe(Effect.map((checkpoint) => layerInline({ driver, initial: checkpoint }))))
  },
)
