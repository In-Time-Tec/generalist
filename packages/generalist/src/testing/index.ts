import { memory } from "./memory.js"
import { memo } from "./memo.js"
import { write } from "./report.js"
import { ruleStore } from "./rule-store.js"
import { runtimeDriver } from "./runtime-driver/index.js"
import { sandbox } from "./sandbox.js"

export * as TestModel from "./model/service.js"

export { codeExecutorConformance } from "./code-executor.js"
export type { Options as CodeExecutorConformanceOptions } from "./code-executor.js"

/** Reusable KernelPool provider lifecycle and remote ownership conformance. */
export * as KernelProviderConformance from "./repl/kernel-provider.js"

/** Public conformance suites and certification reporting. */
export const Testing = {
  runtimeDriver,
  memory,
  memo,
  ruleStore,
  sandbox,
  report: { write },
} as const
