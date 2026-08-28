import vm from "node:vm"
import { AsyncLocalStorage } from "node:async_hooks"
import { createRequire } from "node:module"
import { deserialize, serialize } from "node:v8"
import { Effect, Fiber, Predicate, Schema } from "effect"
import { actionable as actionableTextResult, type PendingHostRequest } from "./text-result.js"
import { commandLines } from "./command-lines.js"
import { formatValue as format, resultValue } from "./value.js"
import { details as errorDetails } from "./worker-error.js"

const RuntimeValueSchema = Schema.Unknown
type RuntimeValue = typeof RuntimeValueSchema.Type

interface Frame extends Record<string, RuntimeValue> {
  readonly _tag: string
}

interface CellState {
  readonly cellId: string
  readonly controller: AbortController
}

const workspaceRoot = process.cwd()

const frameOut = 3
const frameIn = 4

const commands = commandLines(frameIn)
const handshake = await commands.next()
const frameNonce = handshake.done === true ? "" : handshake.value

const requireFromWorkspace = createRequire(`${workspaceRoot}/tenetkit-kernel.js`)
const transpiler = new Bun.Transpiler({ loader: "tsx", replMode: true })
const encoder = new TextEncoder()
const frameWriter = Bun.file(frameOut).writer()
const rawWriters = { stdout: Bun.file(1).writer(), stderr: Bun.file(2).writer() }
const writeFrame = (frame: Frame): void =>
  void frameWriter.write(encoder.encode(`${frameNonce}${JSON.stringify(frame)}\n`))
const write = (frame: Frame, barrierCellId?: string): void => {
  flushOutput()
  if (barrierCellId !== undefined)
    for (const writer of Object.values(rawWriters))
      void writer.write(`\n${frameNonce}raw-barrier:${encodeURIComponent(barrierCellId)}\n`)
  void frameWriter.write(encoder.encode(`${frameNonce}${JSON.stringify(frame)}\n`))
}

let cell: CellState | undefined
const cellScope = new AsyncLocalStorage<CellState>()
const owningCell = (): CellState | undefined => cellScope.getStore() ?? cell
let hostRequestSeq = 0
const pending = new Map<string, PendingHostRequest>()
const recordedImports = new Set<string>()

const flushAfterMillis = 25
const flushAfterBytes = 8_192

interface PendingOutput {
  readonly cellId: string
  readonly channel: "stdout" | "stderr"
  text: string
  readonly timer: ReturnType<typeof Effect.runFork<void, never>>
}

let pendingOutput: PendingOutput | undefined

const flushOutput = (): void => {
  if (pendingOutput === undefined) return
  const flushed = pendingOutput
  pendingOutput = undefined
  Effect.runFork(Fiber.interrupt(flushed.timer))
  writeFrame({ _tag: "Output", cellId: flushed.cellId, channel: flushed.channel, text: flushed.text })
}

const emit = (channel: "stdout" | "stderr", text: string): void => {
  const active = owningCell()
  if (active === undefined) return
  if (pendingOutput !== undefined && (pendingOutput.channel !== channel || pendingOutput.cellId !== active.cellId)) {
    flushOutput()
  }
  if (pendingOutput === undefined) {
    pendingOutput = {
      cellId: active.cellId,
      channel,
      text: "",
      timer: Effect.runFork(Effect.sleep(flushAfterMillis).pipe(Effect.andThen(Effect.sync(flushOutput)))),
    }
  }
  pendingOutput.text += text
  if (pendingOutput.text.length >= flushAfterBytes) flushOutput()
}

const isModuleNamespace = (value: RuntimeValue): boolean => Object.prototype.toString.call(value) === "[object Module]"

const kernelConsole = {
  log: (...args: ReadonlyArray<unknown>) => emit("stdout", `${args.map(format).join(" ")}\n`),
  info: (...args: ReadonlyArray<unknown>) => emit("stdout", `${args.map(format).join(" ")}\n`),
  debug: (...args: ReadonlyArray<unknown>) => emit("stdout", `${args.map(format).join(" ")}\n`),
  error: (...args: ReadonlyArray<unknown>) => emit("stderr", `${args.map(format).join(" ")}\n`),
  warn: (...args: ReadonlyArray<unknown>) => emit("stderr", `${args.map(format).join(" ")}\n`),
  trace: (...args: ReadonlyArray<unknown>) => emit("stderr", `${args.map(format).join(" ")}\n`),
}

const hostRequest = (module: string, operation: string, input: RuntimeValue): Promise<RuntimeValue> => {
  hostRequestSeq += 1
  const requestId = `hr-${hostRequestSeq}`
  const result = Promise.withResolvers<RuntimeValue>()
  pending.set(requestId, { module, operation, resolve: result.resolve, reject: result.reject })
  write({ _tag: "HostRequest", cellId: owningCell()?.cellId, requestId, module, operation, input })
  return result.promise
}

const display = (input: { readonly mediaType: string; readonly data: string; readonly name?: string }): void => {
  const active = owningCell()
  if (active === undefined) return
  const frame: Frame = {
    _tag: "Display",
    cellId: active.cellId,
    mediaType: input.mediaType,
    data: input.data,
  }
  if (input.name !== undefined) frame.name = input.name
  write(frame)
}

const reserved = new Set([
  "console",
  "require",
  "globalThis",
  "Bun",
  "process",
  "fetch",
  "URL",
  "URLSearchParams",
  "TextEncoder",
  "TextDecoder",
  "AbortController",
  "AbortSignal",
  "Promise",
  "structuredClone",
  "queueMicrotask",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "Buffer",
  "kernel",
])

const bootstrap = {
  console: kernelConsole,
  require: requireFromWorkspace,
  Bun,
  process,
  fetch,
  URL,
  URLSearchParams,
  TextEncoder,
  TextDecoder,
  AbortController,
  AbortSignal,
  Promise,
  structuredClone,
  queueMicrotask,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Buffer,
}

const context = vm.createContext({ ...bootstrap })
Reflect.set(context, "globalThis", context)

interface ModuleDescriptor {
  readonly module: string
  readonly operations: ReadonlyArray<string>
}

interface HostBindings extends Record<string, RuntimeValue> {
  readonly display: typeof display
  readonly signal: () => AbortSignal | undefined
}

const mount = (modules: ReadonlyArray<ModuleDescriptor>) => {
  const host: HostBindings = {
    display,
    signal: () => owningCell()?.controller.signal,
  }
  for (const descriptor of modules) {
    const operations: Record<string, (input?: RuntimeValue) => Promise<RuntimeValue>> = {}
    for (const operation of descriptor.operations) {
      /**
       * An operation whose input is empty reads better called with no argument, and JSON cannot
       * carry the `undefined` that produces, so the empty object it stands for is sent instead.
       */
      operations[operation] = (input?: RuntimeValue) =>
        hostRequest(descriptor.module, operation, input === undefined ? {} : input)
    }
    host[descriptor.module] = operations
    reserved.add(descriptor.module)
    Reflect.set(context, descriptor.module, operations)
  }
  Reflect.set(context, "kernel", host)
}

mount([])

const importRecorder = (specifier: string): Promise<vm.Module> => {
  recordedImports.add(specifier)
  return import(specifier)
}

const evaluate = (cellId: string, code: string, deadlineMillis: number): RuntimeValue => {
  const compiled = transpiler.transformSync(code)
  const script = new vm.Script(compiled, {
    filename: `tenetkit-cell-${cellId}.ts`,
    importModuleDynamically: importRecorder,
  })
  const options: vm.RunningScriptOptions = {
    timeout: deadlineMillis,
    breakOnSigint: true,
  }
  return Schema.decodeUnknownSync(RuntimeValueSchema)(script.runInContext(context, options))
}

const stopKind = (error: RuntimeValue): "threw" | "timed-out" | "interrupted" | "aborted" => {
  const details = errorDetails(error)
  const code = details?.code
  if (code === "ERR_SCRIPT_EXECUTION_TIMEOUT" || details?.message?.includes("Script execution timed out") === true)
    return "timed-out"
  if (code === "ERR_SCRIPT_EXECUTION_INTERRUPTED") return "interrupted"
  if (details?.name === "KernelCellAborted") return "aborted"
  return "threw"
}

const execute = (cellId: string, code: string, deadlineMillis: number): Promise<void> => {
  const controller = new AbortController()
  const state: CellState = { cellId, controller }
  cell = state
  const started = Bun.nanoseconds()
  const elapsed = (): number => Math.round((Bun.nanoseconds() - started) / 1_000_000)
  const aborted = Promise.withResolvers<never>()
  const rejectAborted = (): void => {
    const error = new Error("the cell was aborted by its host")
    error.name = "KernelCellAborted"
    aborted.reject(error)
  }
  if (controller.signal.aborted) rejectAborted()
  else controller.signal.addEventListener("abort", rejectAborted, { once: true })
  let evaluated: Promise<RuntimeValue>
  try {
    evaluated = Promise.resolve(cellScope.run(state, () => evaluate(cellId, code, deadlineMillis)))
  } catch (error) {
    evaluated = Promise.reject(error)
  }
  return Promise.race([evaluated, aborted.promise])
    .then(
      (settled) => {
        const result = Schema.decodeUnknownOption(Schema.Struct({ value: Schema.optional(Schema.Unknown) }))(settled)
        const value = result._tag === "Some" ? result.value.value : undefined
        write({ _tag: "Completed", cellId, value: resultValue(value), durationMillis: elapsed() }, cellId)
        return undefined
      },
      (error) => {
        const failure = errorDetails(error)
        const stopped: Frame = {
          _tag: "Stopped",
          cellId,
          kind: stopKind(error),
          name: failure?.name ?? "Error",
          message: failure?.message ?? String(error),
          durationMillis: elapsed(),
        }
        if (failure?.stack !== undefined) stopped.stack = failure.stack
        write(stopped, cellId)
      },
    )
    .finally(() => {
      cell = undefined
    })
}

const isCapturable = (value: RuntimeValue): boolean => {
  try {
    deserialize(serialize(value))
    return true
  } catch {
    return false
  }
}

const ObjectValue = Schema.ObjectKeyword

const dropReason = (value: RuntimeValue): "function" | "class" | "module" | "live-handle" | "unserializable" => {
  if (Predicate.isFunction(value)) {
    return /^\s*class[\s{]/.test(Function.prototype.toString.call(value)) ? "class" : "function"
  }
  if (isModuleNamespace(value)) return "module"
  if (Schema.is(ObjectValue)(value) && Symbol.toStringTag in value) return "live-handle"
  return "unserializable"
}

const capture = (requestId: string): void => {
  const values: Record<string, RuntimeValue> = {}
  const sources: Record<string, string> = {}
  const restored: Array<{ name: string; kind: string }> = []
  const dropped: Array<{ name: string; reason: string }> = []
  for (const name of Object.keys(context)) {
    if (reserved.has(name)) continue
    const value: RuntimeValue = context[name]
    if (Predicate.isFunction(value)) {
      const source = Function.prototype.toString.call(value)
      if (source.startsWith("function") || source.startsWith("class") || source.startsWith("async function")) {
        sources[name] = source
        restored.push({ name, kind: "source" })
        continue
      }
      dropped.push({ name, reason: dropReason(value) })
      continue
    }
    if (isCapturable(value)) {
      values[name] = value
      restored.push({ name, kind: "value" })
      continue
    }
    dropped.push({ name, reason: dropReason(value) })
  }
  for (const specifier of recordedImports) restored.push({ name: specifier, kind: "import" })
  const payload = Buffer.from(serialize({ values, sources, imports: Array.from(recordedImports) })).toString("base64")
  write({ _tag: "Captured", requestId, payload, restored, dropped })
}

const restore = (requestId: string, payload: string): Promise<void> =>
  Promise.resolve().then(() => {
    const restored: Array<{ name: string; kind: string }> = []
    const dropped: Array<{ name: string; reason: string }> = []
    try {
      const Snapshot = Schema.Struct({
        values: Schema.Record(Schema.String, Schema.Unknown),
        sources: Schema.Record(Schema.String, Schema.String),
        imports: Schema.Array(Schema.String),
      })
      const decoded = Schema.decodeUnknownSync(Snapshot)(deserialize(Buffer.from(payload, "base64")))
      for (const [name, value] of Object.entries(decoded.values)) {
        Reflect.set(context, name, value)
        restored.push({ name, kind: "value" })
      }
      for (const [name, source] of Object.entries(decoded.sources)) {
        try {
          const restoredValue = Schema.decodeUnknownSync(RuntimeValueSchema)(
            vm.runInContext(`(${source})`, context, {
              filename: `tenetkit-restore-${name}.ts`,
            }),
          )
          Reflect.set(context, name, restoredValue)
          restored.push({ name, kind: "source" })
        } catch {
          dropped.push({ name, reason: "function" })
        }
      }
      return Promise.all(
        decoded.imports.map((specifier) =>
          import(specifier).then(
            () => ({ specifier, ok: true }),
            () => ({ specifier, ok: false }),
          ),
        ),
      ).then((replayed) => {
        for (const { specifier, ok } of replayed) {
          if (ok) {
            recordedImports.add(specifier)
            restored.push({ name: specifier, kind: "import" })
          } else {
            dropped.push({ name: specifier, reason: "module" })
          }
        }
        write({ _tag: "Restored", requestId, restored, dropped })
        return undefined
      })
    } catch (error) {
      write({
        _tag: "Restored",
        requestId,
        restored,
        dropped,
        failure: error instanceof Error ? error.message : String(error),
      })
      return undefined
    }
  })

const inspect = (requestId: string): void => {
  const bindings = Object.keys(context)
    .filter((name) => !reserved.has(name))
    .map((name) => {
      const value: RuntimeValue = context[name]
      const constructor = Schema.decodeUnknownOption(
        Schema.Struct({ constructor: Schema.Struct({ name: Schema.String }) }),
      )(value)
      let type = Object.prototype.toString.call(value).slice(8, -1).toLowerCase()
      if (value === null) type = "null"
      else if (constructor._tag === "Some") type = constructor.value.constructor.name
      return {
        name,
        type,
        snapshotable: !Predicate.isFunction(value) && isCapturable(value),
      }
    })
  write({ _tag: "Inspected", requestId, bindings })
}

process.on("SIGINT", () => {})

write({ _tag: "Ready", wireVersion: 1 })

let tail: Promise<void> = Promise.resolve()

const sequence = (task: () => void | Promise<void>): void => {
  tail = tail.then(task, task)
}

const Command = Schema.Union([
  Schema.TaggedStruct("Execute", { cellId: Schema.String, code: Schema.String, deadlineMillis: Schema.Finite }),
  Schema.TaggedStruct("Interrupt", { cellId: Schema.optional(Schema.String) }),
  Schema.TaggedStruct("HostResponse", {
    requestId: Schema.String,
    outcome: Schema.Struct({
      _tag: Schema.String,
      output: Schema.optional(Schema.Unknown),
      failure: Schema.optional(Schema.Unknown),
      message: Schema.optional(Schema.String),
    }),
  }),
  Schema.TaggedStruct("Mount", {
    modules: Schema.Array(Schema.Struct({ module: Schema.String, operations: Schema.Array(Schema.String) })),
  }),
  Schema.TaggedStruct("Restore", { requestId: Schema.String, payload: Schema.String }),
  Schema.TaggedStruct("Capture", { requestId: Schema.String }),
  Schema.TaggedStruct("Inspect", { requestId: Schema.String }),
  Schema.TaggedStruct("Shutdown", {}),
])

for await (const line of commands) {
  if (line.trim().length === 0) continue
  const frame = Schema.decodeUnknownSync(Command)(JSON.parse(line))
  if (frame._tag === "Execute") {
    const { cellId, code, deadlineMillis } = frame
    sequence(() => execute(cellId, code, deadlineMillis))
    continue
  }
  if (frame._tag === "Interrupt") {
    const target = frame.cellId
    if (cell !== undefined && (target === undefined || cell.cellId === target)) cell.controller.abort()
    continue
  }
  if (frame._tag === "HostResponse") {
    const { requestId, outcome } = frame
    const settler = pending.get(requestId)
    pending.delete(requestId)
    if (settler === undefined) continue
    if (outcome._tag === "Success")
      settler.resolve(
        actionableTextResult({ module: settler.module, operation: settler.operation, output: outcome.output }),
      )
    else if (outcome._tag === "Failure") settler.reject(outcome.failure)
    else settler.reject(new Error(outcome.message ?? "the host rejected the request"))
    continue
  }
  if (frame._tag === "Mount") {
    mount(frame.modules)
    continue
  }
  if (frame._tag === "Restore") {
    const { requestId, payload } = frame
    sequence(() => restore(requestId, payload))
    continue
  }
  if (frame._tag === "Capture") {
    const { requestId } = frame
    sequence(() => {
      capture(requestId)
    })
    continue
  }
  if (frame._tag === "Inspect") {
    inspect(frame.requestId)
    continue
  }
  if (frame._tag === "Shutdown") break
}

process.exit(0)
