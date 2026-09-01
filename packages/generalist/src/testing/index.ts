import * as chaos from "./chaos.js"
import { memory } from "./memory.js"
import { write } from "./report.js"
import { ruleStore } from "./rule-store.js"
import { runtimeDriver } from "./runtime-driver/index.js"

export * as TestModel from "./model/service.js"

export { codeExecutorConformance } from "./code-executor.js"
export type { Options as CodeExecutorConformanceOptions } from "./code-executor.js"

/** @experimental Reusable KernelPool provider lifecycle and remote ownership conformance. */
export * as KernelProviderConformance from "./repl/kernel-provider.js"

/** @experimental Public conformance suites, deterministic chaos helpers, and certification reporting. */
export const Testing = {
  runtimeDriver,
  memory,
  ruleStore,
  chaos: {
    interruptAfter: chaos.interruptAfter,
    dropConnection: chaos.dropConnection,
    flakyModel: chaos.flakyModel,
  },
  report: { write },
} as const
