import { Context } from "effect"
import type { Service } from "./application.js"

export type { Service } from "./application.js"

export class Runtime extends Context.Service<Runtime, Service>()("generalist/runtime/service/Runtime") {}
