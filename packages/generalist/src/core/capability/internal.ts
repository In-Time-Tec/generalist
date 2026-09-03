import { Clock, Duration, Effect, Equal, Function, Option, Predicate, Schema } from "effect"
import { IdGenerator, type Tool } from "effect/unstable/ai"
import { DriverInterpreter } from "../durable/driver/interpreter.js"
import { AttenuationWidened, Denied, Invalid } from "./errors.js"
import {
  Attenuation,
  Authority,
  CapabilityId,
  Checkpoint,
  DenialReason,
  Descriptor,
  Grant,
  Scope,
  Source,
  Use,
  accumulate,
  append,
  clear,
  initialize,
} from "./state.js"
import { decodeScope, immutableScope, isNarrower, scopeAllows } from "./scope.js"

/** An unforgeable process-local capability for one exact Tool declaration. */
export interface Handle<T extends Tool.Any = Tool.Any> {
  readonly _tag: "CapabilityHandle"
  readonly id: CapabilityId
  readonly tool: T
  readonly scope: Scope
  readonly expiresAt: number
}

interface Issued {
  readonly descriptor: Descriptor
  readonly tool?: Tool.Any
}

const handleDescriptors = new WeakMap<object, Descriptor>()
const issued = new Map<CapabilityId, Issued>()
const descendants = new Map<CapabilityId, Set<CapabilityId>>()
const revoked = new Set<CapabilityId>()
let nextId = 0

const capabilityId = (tool: string, identity: string): CapabilityId =>
  Schema.decodeSync(CapabilityId)(`capability:${tool}:${identity}`)

const nextCapabilityId = (tool: string, identity: string): CapabilityId => {
  let id: CapabilityId
  do id = capabilityId(tool, `${identity}:${++nextId}`)
  while (issued.has(id))
  return id
}

const toolName = (tool: { readonly name: unknown }): string => Schema.decodeUnknownSync(Schema.String)(tool.name)

const descriptorOf = (handle: Handle): Descriptor => {
  const descriptor = handleDescriptors.get(handle)
  if (descriptor !== undefined) return descriptor
  throw Invalid.make({ reason: "handle", message: "Capability handle was not issued by this process" })
}

type ToolArguments = Readonly<Record<string, Schema.Json>>

const validateLineage = (descriptor: Descriptor): boolean => {
  const [root, ...rest] = descriptor.lineage
  if (root?._tag !== "Grant") return false
  let parent: Authority = root
  for (const authority of rest) {
    if (
      authority._tag !== "Attenuation" ||
      authority.parentId !== parent.id ||
      authority.tool !== parent.tool ||
      authority.expiresAt > parent.expiresAt ||
      !isNarrower(authority.scope, parent.scope)
    ) {
      return false
    }
    parent = authority
  }
  return (
    parent.id === descriptor.id &&
    parent.tool === descriptor.tool &&
    parent.expiresAt === descriptor.expiresAt &&
    Equal.equals(parent.scope, descriptor.scope)
  )
}

const immutableDescriptor = (descriptor: Descriptor): Descriptor => {
  const lineage = descriptor.lineage.map((authority) =>
    Object.freeze({ ...authority, scope: immutableScope(authority.scope) }),
  )
  return Object.freeze({
    ...descriptor,
    scope: immutableScope(descriptor.scope),
    lineage: Object.freeze(lineage),
  })
}

/** @internal Verify that a live or journal-restored descriptor came from a trusted framework boundary. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal validation with an optional Tool identity witness.
export const validateDescriptor = (descriptor: Descriptor, expectedTool?: Tool.Any): void => {
  if (!validateLineage(descriptor)) {
    throw Invalid.make({ reason: "descriptor", message: `Capability ${descriptor.id} has an invalid lineage` })
  }
  const known = issued.get(descriptor.id)
  if (known === undefined || !Equal.equals(known.descriptor, descriptor)) {
    throw Invalid.make({ reason: "descriptor", message: `Capability ${descriptor.id} was not issued by the framework` })
  }
  if (expectedTool !== undefined && known.tool !== undefined && known.tool !== expectedTool) {
    throw Invalid.make({ reason: "descriptor", message: `Capability ${descriptor.id} belongs to another Tool value` })
  }
}

/** @internal Decide whether one descriptor preserves the authority lineage of another. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal authority relation with two required direct-style arguments.
export const descriptorDescendsFrom = (candidate: Descriptor, parent: Descriptor): boolean =>
  candidate.tool === parent.tool &&
  candidate.lineage.some((authority) => authority.id === parent.id) &&
  isNarrower(candidate.scope, parent.scope) &&
  candidate.expiresAt <= parent.expiresAt

/** @internal Convert only live unforgeable handles into serializable descriptors. */
export const descriptorsFromHandles = (handles: ReadonlyArray<unknown>): ReadonlyArray<Descriptor> => {
  const descriptors = handles.map((handle) => {
    if (!Predicate.isObject(handle)) {
      throw Invalid.make({ reason: "handle", message: "Capability handle was not issued by this process" })
    }
    const descriptor = handleDescriptors.get(handle)
    if (descriptor === undefined) {
      throw Invalid.make({ reason: "handle", message: "Capability handle was not issued by this process" })
    }
    return descriptor
  })
  if (new Set(descriptors.map((descriptor) => descriptor.tool)).size !== descriptors.length) {
    throw Invalid.make({ reason: "scope", message: "Child capability handles must name distinct tools" })
  }
  return descriptors
}

/** @internal Admit and freeze Schema-decoded descriptors from a framework-owned durable child journal. */
export const trustJournaled = (descriptors: ReadonlyArray<Descriptor>): ReadonlyArray<Descriptor> =>
  descriptors.map((input) => {
    const descriptor = immutableDescriptor(input)
    if (!validateLineage(descriptor)) {
      throw Invalid.make({ reason: "descriptor", message: `Capability ${descriptor.id} has an invalid lineage` })
    }
    const known = issued.get(descriptor.id)
    if (known !== undefined && !Equal.equals(known.descriptor, descriptor)) {
      throw Invalid.make({
        reason: "descriptor",
        message: `Capability ${descriptor.id} conflicts with issued authority`,
      })
    }
    if (known === undefined) issued.set(descriptor.id, { descriptor })
    return descriptor
  })

const makeHandle = <T extends Tool.Any>(tool: T, descriptor: Descriptor): Handle<T> => {
  const issuedDescriptor = immutableDescriptor(descriptor)
  const value: Handle<T> = {
    _tag: "CapabilityHandle",
    id: issuedDescriptor.id,
    tool,
    scope: issuedDescriptor.scope,
    expiresAt: issuedDescriptor.expiresAt,
  }
  const handle = Object.freeze(value)
  handleDescriptors.set(handle, issuedDescriptor)
  issued.set(issuedDescriptor.id, { descriptor: issuedDescriptor, tool })
  return handle
}

const recordAuthorities = (descriptor: Descriptor) =>
  Effect.serviceOption(DriverInterpreter).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.void,
        onSome: (interpreter) =>
          interpreter.updateCapabilityCheckpoint((checkpoint) => ({
            checkpoint: initialize(checkpoint, [descriptor]),
            value: undefined,
          })),
      }),
    ),
  )

/** Grant a time-scoped capability for one exact Tool value. */
export const grant = Effect.fn("Capability.grant")(function* <T extends Tool.Any>(
  tool: T,
  options: { readonly scope: Scope; readonly expires: Duration.Input },
) {
  const decodedScope = Schema.decodeOption(Scope)(options.scope)
  if (Option.isNone(decodedScope)) {
    return yield* Invalid.make({ reason: "scope", message: "Capability scope must contain non-empty string arrays" })
  }
  const scope = decodedScope.value
  const duration = Option.map(Duration.fromInput(options.expires), Duration.toMillis)
  if (Option.isNone(duration) || !Number.isFinite(duration.value) || duration.value <= 0) {
    return yield* Invalid.make({ reason: "expiry", message: "Capability expiry must be a positive finite duration" })
  }
  const issuedAt = yield* Clock.currentTimeMillis
  const expiresAt = issuedAt + duration.value
  if (!Number.isFinite(expiresAt)) {
    return yield* Invalid.make({ reason: "expiry", message: "Capability expiry must resolve to a finite deadline" })
  }
  const name = toolName(tool)
  const id = nextCapabilityId(name, yield* IdGenerator.defaultIdGenerator.generateId())
  const authority: Grant = { _tag: "Grant", id, tool: name, scope, issuedAt, expiresAt }
  const descriptor: Descriptor = {
    id,
    tool: name,
    scope,
    expiresAt,
    lineage: [authority],
  }
  const handle = makeHandle(tool, descriptor)
  yield* recordAuthorities(descriptorOf(handle))
  return handle
})

/** Construct a child handle only when its scope is provably contained by the parent. */
export const attenuate: {
  (narrowerScope: Scope): <T extends Tool.Any>(handle: Handle<T>) => Handle<T>
  <T extends Tool.Any>(handle: Handle<T>, narrowerScope: Scope): Handle<T>
} = Function.dual(2, <T extends Tool.Any>(handle: Handle<T>, narrowerScope: Scope): Handle<T> => {
  const parent = descriptorOf(handle)
  const scope = decodeScope(narrowerScope)
  if (!isNarrower(scope, parent.scope)) {
    throw AttenuationWidened.make({
      parentId: parent.id,
      message: `Capability ${parent.id} cannot widen its scope`,
    })
  }
  const id = nextCapabilityId(parent.tool, "attenuation")
  const authority: Attenuation = {
    _tag: "Attenuation",
    id,
    parentId: parent.id,
    tool: parent.tool,
    scope,
    expiresAt: parent.expiresAt,
  }
  const descriptor: Descriptor = {
    id,
    tool: parent.tool,
    scope,
    expiresAt: parent.expiresAt,
    lineage: [...parent.lineage, authority],
  }
  const children = descendants.get(parent.id) ?? new Set<CapabilityId>()
  children.add(id)
  descendants.set(parent.id, children)
  return makeHandle(handle.tool, descriptor)
})

const markRevoked = (id: CapabilityId): void => {
  const pending = [id]
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined || revoked.has(current)) continue
    revoked.add(current)
    pending.push(...(descendants.get(current) ?? []))
  }
}

/** Revoke a handle and every handle transitively attenuated from it. */
export const revoke = Effect.fn("Capability.revoke")(function* (handle: Handle) {
  const descriptor = handleDescriptors.get(handle)
  if (descriptor === undefined) {
    return yield* Invalid.make({ reason: "handle", message: "Capability handle was not issued by this process" })
  }
  const revokedAt = yield* Clock.currentTimeMillis
  markRevoked(descriptor.id)
  const interpreter = yield* Effect.serviceOption(DriverInterpreter)
  if (Option.isSome(interpreter)) {
    yield* interpreter.value.updateCapabilityCheckpoint((checkpoint) => ({
      checkpoint: append(initialize(checkpoint, [descriptor]), { _tag: "Revocation", id: descriptor.id, revokedAt }),
      value: undefined,
    }))
  }
})

const denial = (reason: DenialReason, descriptor: Descriptor | undefined, sources: ReadonlyArray<Source>): Denied =>
  Denied.make({
    reason,
    sources,
    message: `Capability ${descriptor?.id ?? "missing"} denied ${descriptor?.tool ?? "the tool"}: ${reason}`,
    ...(descriptor === undefined ? undefined : { capabilityId: descriptor.id, tool: descriptor.tool }),
  })

const denialReason = (
  descriptor: Descriptor,
  checkpoint: Checkpoint,
  now: number,
  arguments_: ToolArguments | undefined,
) => {
  const ids = new Set(descriptor.lineage.map((authority) => authority.id))
  if (
    descriptor.lineage.some((authority) => revoked.has(authority.id)) ||
    checkpoint.events.some((event) => event._tag === "Revocation" && ids.has(event.id))
  ) {
    return "revoked" as const
  }
  if (now >= descriptor.expiresAt) return "expired" as const
  return scopeAllows(descriptor.scope, arguments_) ? undefined : ("invalid-scope" as const)
}

/** Check one live handle outside an Agent loop. Agent-owned checks additionally journal the decision. */
export const check = Effect.fn("Capability.check")(function* <T extends Tool.Any>(
  handle: Handle<T>,
  arguments_: Tool.Parameters<T>,
) {
  const descriptor = handleDescriptors.get(handle)
  if (descriptor === undefined) {
    return yield* Invalid.make({ reason: "handle", message: "Capability handle was not issued by this process" })
  }
  const now = yield* Clock.currentTimeMillis
  const decodedArguments = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Json))(arguments_)
  const reason = denialReason(
    descriptor,
    initialize(undefined, [descriptor]),
    now,
    Option.getOrUndefined(decodedArguments),
  )
  if (reason !== undefined) return yield* denial(reason, descriptor, [])
})

export type CallDecision =
  | { readonly _tag: "Allowed" }
  | { readonly _tag: "Denied"; readonly error: Denied; readonly taint: ReadonlyArray<Source> }

const useKey = (turn: number, descriptor: Descriptor | undefined, tool: string, toolCallId: string): string =>
  JSON.stringify([turn, descriptor?.id ?? null, toolCallId, tool])

/** #354 replaces this one conservative whole-batch propagation rule with structural argument provenance. */
const taintForArguments = (
  checkpoint: Checkpoint,
  toolBatch: { readonly argumentTaint?: ReadonlyArray<Source> } | undefined,
): ReadonlyArray<Source> => toolBatch?.argumentTaint ?? checkpoint.taint

const decisionFromUse = (use: Use, descriptor: Descriptor | undefined): CallDecision =>
  use.decision === "allow"
    ? { _tag: "Allowed" }
    : {
        _tag: "Denied",
        error: denial(use.reason ?? "invalid-scope", descriptor, use.argumentTaint),
        taint: use.argumentTaint,
      }

interface UpdatedDecision {
  readonly checkpoint: Checkpoint
  readonly value: CallDecision
}

const decideWithoutDescriptor = (
  input: {
    readonly descriptors: ReadonlyArray<Descriptor> | undefined
    readonly tool: string
    readonly toolCallId: string
    readonly turn: number
    readonly untaintedArguments: ReadonlyArray<string>
  },
  checkpoint: Checkpoint,
  argumentTaint: ReadonlyArray<Source>,
  key: string,
): UpdatedDecision => {
  let reason: DenialReason | undefined = input.descriptors === undefined ? undefined : "missing"
  if (input.untaintedArguments.length > 0 && argumentTaint.length > 0) reason = "tainted"
  const use: Use = {
    _tag: "Use",
    key,
    tool: input.tool,
    toolCallId: input.toolCallId,
    turn: input.turn,
    decision: reason === undefined ? "allow" : "deny",
    ...(reason === undefined ? undefined : { reason }),
    argumentTaint,
  }
  const value: CallDecision =
    reason === undefined
      ? { _tag: "Allowed" }
      : { _tag: "Denied", error: denial(reason, undefined, argumentTaint), taint: argumentTaint }
  return { checkpoint: append(checkpoint, use), value }
}

/** @internal Check and journal one model-authored call before hooks and coarse permissions. */
export const checkCall = Effect.fn("Capability.checkCall")(function* (input: {
  readonly descriptors: ReadonlyArray<Descriptor> | undefined
  readonly tool: string
  readonly toolCallId: string
  readonly turn: number
  readonly arguments: unknown
  readonly untaintedArguments: ReadonlyArray<string>
}) {
  if (input.descriptors === undefined && input.untaintedArguments.length === 0) return { _tag: "Allowed" } as const
  const descriptor = input.descriptors?.find((candidate) => candidate.tool === input.tool)
  const interpreter = yield* DriverInterpreter
  const toolBatch = yield* interpreter.toolBatchCheckpoint
  const now = yield* Clock.currentTimeMillis
  const decodedArguments = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Json))(input.arguments)
  return yield* interpreter.updateCapabilityCheckpoint((checkpoint) => {
    const initialized = initialize(checkpoint, input.descriptors ?? [])
    const authoredTaint = taintForArguments(initialized, toolBatch)
    const key = useKey(input.turn, descriptor, input.tool, input.toolCallId)
    const replayed = initialized.events.find((event): event is Use => event._tag === "Use" && event.key === key)
    if (replayed !== undefined) return { checkpoint: initialized, value: decisionFromUse(replayed, descriptor) }
    if (descriptor === undefined) {
      return decideWithoutDescriptor(input, initialized, authoredTaint, key)
    }
    const revokedAuthority = descriptor.lineage.find((authority) => revoked.has(authority.id))
    const withRevocation =
      revokedAuthority === undefined
        ? initialized
        : append(initialized, { _tag: "Revocation", id: revokedAuthority.id, revokedAt: now })
    const argumentTaint = authoredTaint
    const reason =
      input.untaintedArguments.length > 0 && argumentTaint.length > 0
        ? ("tainted" as const)
        : denialReason(descriptor, withRevocation, now, Option.getOrUndefined(decodedArguments))
    const source: Source = { capabilityId: descriptor.id, tool: descriptor.tool, toolCallId: input.toolCallId }
    const use: Use = {
      _tag: "Use",
      key,
      id: descriptor.id,
      tool: descriptor.tool,
      toolCallId: input.toolCallId,
      turn: input.turn,
      decision: reason === undefined ? "allow" : "deny",
      ...(reason === undefined ? { source } : { reason }),
      argumentTaint,
    }
    const value: CallDecision =
      reason === undefined
        ? { _tag: "Allowed" }
        : { _tag: "Denied", error: denial(reason, descriptor, argumentTaint), taint: argumentTaint }
    return { checkpoint: append(withRevocation, use), value }
  })
})

/** @internal Propagate the authored batch's argument taint onto one tool result. */
export const taintForCall = Effect.fn("Capability.taintForCall")(function* (
  turn: number,
  tool: string,
  toolCallId: string,
) {
  const interpreter = yield* DriverInterpreter
  const checkpoint = yield* interpreter.capabilityCheckpoint
  const toolBatch = yield* interpreter.toolBatchCheckpoint
  const current = checkpoint ?? { events: [], taint: [] }
  const use = current.events.findLast(
    (event): event is Use =>
      event._tag === "Use" && event.turn === turn && event.tool === tool && event.toolCallId === toolCallId,
  )
  const arguments_ = use?.argumentTaint ?? taintForArguments(current, toolBatch)
  return use?.source === undefined ? arguments_ : [...arguments_, use.source]
})

/** @internal Journal and reset taint after a compaction has replaced model context. */
export const clearTaint = Effect.fn("Capability.clearTaint")(function* (turn: number, compaction: string) {
  const interpreter = yield* DriverInterpreter
  yield* interpreter.updateCapabilityCheckpoint((checkpoint) => ({
    checkpoint: clear(checkpoint, { _tag: "TaintCleared", turn, compaction }),
    value: undefined,
  }))
})

/** @internal Add a replayed tool result's persisted labels to the Run checkpoint. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal checkpoint transition with two required direct-style arguments.
export const accumulateTaint = (checkpoint: Checkpoint | undefined, sources: ReadonlyArray<Source>): Checkpoint =>
  accumulate(checkpoint, sources)
