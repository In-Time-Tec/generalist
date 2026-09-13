import { Context } from "effect"
import type { Tool } from "effect/unstable/ai"

/** Installed task-list capability. @experimental */
export interface Service {
  readonly tools: ReadonlyArray<Tool.Any>
}

/** Task-list tools installed for Agents in the current environment. @experimental */
export class Tasks extends Context.Service<Tasks, Service>()("generalist/tasks/service/Tasks") {}
