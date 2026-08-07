import { ManagedRuntime } from "effect"
import { layer } from "@effect/platform-bun/BunServices"
import { program } from "./repository-graph-core.js"

const runtime = ManagedRuntime.make(layer)
await runtime.runPromise(program)
