import vm from "node:vm"
import { AsyncLocalStorage } from "node:async_hooks"
import { writeSync } from "node:fs"
import { createRequire } from "node:module"
import { deserialize, serialize } from "node:v8"

interface Frame {
  readonly _tag: string
  readonly [key: string]: unknown
}

interface CellState {
  readonly cellId: string
  readonly controller: AbortController
}

const workspaceRoot = process.cwd()

/**
 * The control plane is a descriptor pair rather than a share of stdio: frames leave on `frameOut`
 * and commands arrive on `frameIn`. That alone settles the output channels — stdout and stderr
 * belong entirely to cell code, whatever writes them, and nothing written there is ever read as a
 * frame or consumed as a command.
 *
 * A descriptor is not by itself an authority boundary, though: cell code runs in this same process,
 * so it can name descriptor 3 and write to it. Every frame therefore also carries a boot-time
 * secret read from `frameIn` before any cell can run. The secret lives in this module's scope,
 * which the evaluation context genuinely cannot reach — a cell sees only the bindings the bootstrap
 * puts in its context, and `frameNonce` is not one of them. Argv and the environment would both be
 * readable by the cell, and the process table exposes argv to anything on the machine, so neither
 * the secret nor the workspace travels there: the secret arrives on the private descriptor that
 * only this process holds, and the workspace arrives as the spawned working directory.
 */
const frameOut = 3
const frameIn = 4

const commandLines = async function* (): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  let buffered = ""
  for await (const chunk of Bun.file(frameIn).stream()) {
    buffered += decoder.decode(chunk, { stream: true })
    let newline = buffered.indexOf("\n")
    while (newline >= 0) {
      yield buffered.slice(0, newline)
      buffered = buffered.slice(newline + 1)
      newline = buffered.indexOf("\n")
    }
  }
}

const commands = commandLines()
const handshake = await commands.next()
const frameNonce = handshake.done === true ? "" : handshake.value

const requireFromWorkspace = createRequire(`${workspaceRoot}/baton-kernel.js`)
const transpiler = new Bun.Transpiler({ loader: "tsx", replMode: true })
const encoder = new TextEncoder()

const write = (frame: Frame): void => {
  writeSync(frameOut, encoder.encode(`${frameNonce}${JSON.stringify(frame)}\n`))
}

let cell: CellState | undefined
const cellScope = new AsyncLocalStorage<CellState>()
const owningCell = (): CellState | undefined => cellScope.getStore() ?? cell
let hostRequestSeq = 0
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: unknown) => void }>()
const recordedImports = new Set<string>()

/**
 * Console output is a frame so it keeps its cell attribution and its order among the cell's other
 * frames. The bound lives in the host, which is the only place that sees every byte a cell emits.
 */
const emit = (channel: "stdout" | "stderr", text: string): void => {
  const active = owningCell()
  if (active === undefined) return
  write({ _tag: "Output", cellId: active.cellId, channel, text })
}

const format = (value: unknown): string =>
  typeof value === "string" ? value : Bun.inspect(value, { depth: 4, colors: false })

const kernelConsole = {
  log: (...args: ReadonlyArray<unknown>) => emit("stdout", `${args.map(format).join(" ")}\n`),
  info: (...args: ReadonlyArray<unknown>) => emit("stdout", `${args.map(format).join(" ")}\n`),
  debug: (...args: ReadonlyArray<unknown>) => emit("stdout", `${args.map(format).join(" ")}\n`),
  error: (...args: ReadonlyArray<unknown>) => emit("stderr", `${args.map(format).join(" ")}\n`),
  warn: (...args: ReadonlyArray<unknown>) => emit("stderr", `${args.map(format).join(" ")}\n`),
  trace: (...args: ReadonlyArray<unknown>) => emit("stderr", `${args.map(format).join(" ")}\n`),
}

const hostRequest = (module: string, operation: string, input: unknown): Promise<unknown> => {
  hostRequestSeq += 1
  const requestId = `hr-${hostRequestSeq}`
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    write({ _tag: "HostRequest", cellId: owningCell()?.cellId, requestId, module, operation, input })
  })
}

const display = (input: { readonly mediaType: string; readonly data: string; readonly name?: string }): void => {
  const active = owningCell()
  if (active === undefined) return
  write({
    _tag: "Display",
    cellId: active.cellId,
    mediaType: input.mediaType,
    data: input.data,
    ...(input.name === undefined ? {} : { name: input.name }),
  })
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

const bootstrap: Record<string, unknown> = {
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

const mount = (modules: ReadonlyArray<{ readonly module: string; readonly operations: ReadonlyArray<string> }>) => {
  const host: Record<string, unknown> = {
    display,
    signal: () => owningCell()?.controller.signal,
  }
  for (const descriptor of modules) {
    const operations: Record<string, unknown> = {}
    for (const operation of descriptor.operations) {
      operations[operation] = (input: unknown) => hostRequest(descriptor.module, operation, input)
    }
    host[descriptor.module] = operations
    reserved.add(descriptor.module)
    Reflect.set(context, descriptor.module, operations)
  }
  Reflect.set(context, "kernel", host)
}

mount([])

const importRecorder = async (specifier: string): Promise<unknown> => {
  recordedImports.add(specifier)
  return await import(specifier)
}

const evaluate = (cellId: string, code: string, deadlineMillis: number): unknown => {
  const compiled = transpiler.transformSync(code)
  return vm.runInContext(compiled, context, {
    filename: `baton-cell-${cellId}.ts`,
    timeout: deadlineMillis,
    breakOnSigint: true,
    importModuleDynamically: importRecorder,
  } as vm.RunningScriptOptions)
}

const stopKind = (error: unknown): "threw" | "timed-out" | "interrupted" | "aborted" => {
  const code = (error as { readonly code?: unknown } | undefined)?.code
  if (code === "ERR_SCRIPT_EXECUTION_TIMEOUT") return "timed-out"
  if (code === "ERR_SCRIPT_EXECUTION_INTERRUPTED") return "interrupted"
  if ((error as { readonly name?: unknown } | undefined)?.name === "KernelCellAborted") return "aborted"
  return "threw"
}

const execute = async (cellId: string, code: string, deadlineMillis: number): Promise<void> => {
  const controller = new AbortController()
  const state: CellState = { cellId, controller }
  cell = state
  const started = Bun.nanoseconds()
  const elapsed = (): number => Math.round((Bun.nanoseconds() - started) / 1_000_000)
  try {
    const evaluated = cellScope.run(state, () => evaluate(cellId, code, deadlineMillis))
    const aborted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => {
          const error = new Error("the cell was aborted by its host")
          error.name = "KernelCellAborted"
          reject(error)
        },
        { once: true },
      )
    })
    const settled = (await Promise.race([Promise.resolve(evaluated), aborted])) as { value?: unknown } | undefined
    write({ _tag: "Completed", cellId, value: format(settled?.value), durationMillis: elapsed() })
  } catch (error) {
    const failure = error as { name?: string; message?: string; stack?: string } | undefined
    write({
      _tag: "Stopped",
      cellId,
      kind: stopKind(error),
      name: failure?.name ?? "Error",
      message: failure?.message ?? String(error),
      ...(failure?.stack === undefined ? {} : { stack: failure.stack }),
      durationMillis: elapsed(),
    })
  } finally {
    cell = undefined
  }
}

const isCapturable = (value: unknown): boolean => {
  try {
    deserialize(serialize(value))
    return true
  } catch {
    return false
  }
}

const dropReason = (value: unknown): "function" | "class" | "module" | "live-handle" | "unserializable" => {
  if (typeof value === "function") {
    return /^\s*class[\s{]/.test(Function.prototype.toString.call(value)) ? "class" : "function"
  }
  if (typeof value === "object" && value !== null && Symbol.toStringTag in value) {
    return (value as { [Symbol.toStringTag]: unknown })[Symbol.toStringTag] === "Module" ? "module" : "live-handle"
  }
  return "unserializable"
}

const capture = (requestId: string): void => {
  const values: Record<string, unknown> = {}
  const sources: Record<string, string> = {}
  const restored: Array<{ name: string; kind: string }> = []
  const dropped: Array<{ name: string; reason: string }> = []
  for (const name of Object.keys(context)) {
    if (reserved.has(name)) continue
    const value = Reflect.get(context, name)
    if (typeof value === "function") {
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

const restore = async (requestId: string, payload: string): Promise<void> => {
  const restored: Array<{ name: string; kind: string }> = []
  const dropped: Array<{ name: string; reason: string }> = []
  try {
    const decoded = deserialize(Buffer.from(payload, "base64")) as {
      values: Record<string, unknown>
      sources: Record<string, string>
      imports: ReadonlyArray<string>
    }
    for (const [name, value] of Object.entries(decoded.values)) {
      Reflect.set(context, name, value)
      restored.push({ name, kind: "value" })
    }
    for (const [name, source] of Object.entries(decoded.sources)) {
      try {
        const declaration = source.startsWith("class") ? `${name} = ${source}` : source
        vm.runInContext(transpiler.transformSync(declaration), context, { filename: `baton-restore-${name}.ts` })
        restored.push({ name, kind: "source" })
      } catch {
        dropped.push({ name, reason: "function" })
      }
    }
    const replayed = await Promise.all(
      decoded.imports.map((specifier) =>
        import(specifier).then(
          () => ({ specifier, ok: true }),
          () => ({ specifier, ok: false }),
        ),
      ),
    )
    for (const { specifier, ok } of replayed) {
      if (ok) {
        recordedImports.add(specifier)
        restored.push({ name: specifier, kind: "import" })
      } else {
        dropped.push({ name: specifier, reason: "module" })
      }
    }
    write({ _tag: "Restored", requestId, restored, dropped })
  } catch (error) {
    write({
      _tag: "Restored",
      requestId,
      restored,
      dropped,
      failure: error instanceof Error ? error.message : String(error),
    })
  }
}

const inspect = (requestId: string): void => {
  const bindings = Object.keys(context)
    .filter((name) => !reserved.has(name))
    .map((name) => {
      const value = Reflect.get(context, name)
      return {
        name,
        type: value === null ? "null" : (value?.constructor?.name ?? typeof value),
        snapshotable: typeof value !== "function" && isCapturable(value),
      }
    })
  write({ _tag: "Inspected", requestId, bindings })
}

process.on("SIGINT", () => {})

write({ _tag: "Ready", wireVersion: 1 })

let tail: Promise<unknown> = Promise.resolve()

for await (const line of commands) {
  if (line.trim().length === 0) continue
  const frame = JSON.parse(line) as Frame
  if (frame._tag === "Execute") {
    const { cellId, code, deadlineMillis } = frame as unknown as {
      cellId: string
      code: string
      deadlineMillis: number
    }
    tail = tail.then(() => execute(cellId, code, deadlineMillis))
    continue
  }
  if (frame._tag === "Interrupt") {
    cell?.controller.abort()
    continue
  }
  if (frame._tag === "HostResponse") {
    const { requestId, outcome } = frame as unknown as {
      requestId: string
      outcome: { _tag: string; output?: unknown; failure?: unknown; message?: string }
    }
    const settler = pending.get(requestId)
    pending.delete(requestId)
    if (settler === undefined) continue
    if (outcome._tag === "Success") settler.resolve(outcome.output)
    else if (outcome._tag === "Failure") settler.reject(outcome.failure)
    else settler.reject(new Error(outcome.message ?? "the host rejected the request"))
    continue
  }
  if (frame._tag === "Mount") {
    mount(
      (frame as unknown as { modules: ReadonlyArray<{ module: string; operations: ReadonlyArray<string> }> }).modules,
    )
    continue
  }
  if (frame._tag === "Restore") {
    const { requestId, payload } = frame as unknown as { requestId: string; payload: string }
    tail = tail.then(() => restore(requestId, payload))
    continue
  }
  if (frame._tag === "Capture") {
    const { requestId } = frame as unknown as { requestId: string }
    tail = tail.then(() => {
      capture(requestId)
    })
    continue
  }
  if (frame._tag === "Inspect") {
    inspect((frame as unknown as { requestId: string }).requestId)
    continue
  }
  if (frame._tag === "Shutdown") break
}

process.exit(0)
