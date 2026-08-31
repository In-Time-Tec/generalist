import { Console, Effect, ManagedRuntime, Option, Schema } from "effect"
import { HostBindings } from "generalist/repl"

class WorkspaceDenied extends Schema.TaggedError<WorkspaceDenied>()("@generalist/docs/WorkspaceDenied", {
  path: Schema.String,
}) {}

const readFile: HostBindings.AnyOperation = {
  name: "read",
  input: Schema.Struct({ path: Schema.String }),
  output: Schema.Struct({ text: Schema.String }),
  failure: WorkspaceDenied,
  handle: (input) => {
    const { path } = Schema.decodeUnknownOption(Schema.Struct({ path: Schema.String }))(input).pipe(Option.getOrThrow)
    return path.startsWith("/etc")
      ? Effect.fail(WorkspaceDenied.make({ path }))
      : Effect.succeed({ text: `contents of ${path}` })
  },
}

const workspace: HostBindings.Module = { name: "workspace", operations: [readFile] }

const program = Effect.gen(function* () {
  const registry = yield* HostBindings.HostBindings
  const mounted = registry.descriptors.map((entry) => `${entry.module}.${entry.operations.join("/")}`)
  yield* Console.log(`mounted: ${mounted.join(" ")}`)
  const allowed = yield* registry.invoke({ module: "workspace", operation: "read", input: { path: "/w/a.ts" } })
  yield* Console.log(`allowed: ${allowed._tag}`)
  const denied = yield* registry.invoke({ module: "workspace", operation: "read", input: { path: "/etc/passwd" } })
  yield* Console.log(`denied: ${denied._tag}`)
  const missing = yield* Effect.flip(registry.invoke({ module: "web", operation: "search", input: {} }))
  yield* Console.log(`${missing._tag} module=${missing.module}`)
  const badInput = yield* Effect.flip(registry.invoke({ module: "workspace", operation: "read", input: { path: 7 } }))
  yield* Console.log(
    Schema.is(HostBindings.HostModuleSchemaFailure)(badInput)
      ? `${badInput._tag} stage=${badInput.stage}`
      : badInput._tag,
  )
})

const runtime = ManagedRuntime.make(HostBindings.layer([workspace]))
await runtime.runPromise(program)
