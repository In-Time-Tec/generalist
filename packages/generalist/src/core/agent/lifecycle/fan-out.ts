import { Context, Effect, Exit, Function, Option, Predicate, Schema } from "effect"
import { Prompt, Tool } from "effect/unstable/ai"
import { AgentError, ChildExceedsParent } from "../event.js"
import type { RunError } from "../run/error.js"
import {
  AgentTypeId,
  type Agent,
  type Any as AnyAgent,
  type ExecutionServices,
  type Input,
  type Output,
} from "./definition.js"
import { BudgetLimits } from "../../durable/run-budget.js"
import { ToolContext } from "../../tools/tool-context.js"
import { withInherited as withInheritedTasks } from "../../../tasks/internal.js"
import type { Items as TaskItems } from "../../../tasks/item.js"
import {
  descriptorDescendsFrom,
  descriptorsFromHandles,
  validateDescriptor,
  type Handle as CapabilityHandle,
} from "../../capability/internal.js"
import {
  Descriptor as CapabilityDescriptor,
  type Descriptor as CapabilityDescriptorValue,
} from "../../capability/state.js"

const CapabilityDescriptors = Schema.Array(CapabilityDescriptor)
const isCapabilityDescriptors = Schema.is(CapabilityDescriptors)

/** Authority and context inherited by one child Run. */
export const Inheritance = Schema.Struct({
  history: Schema.Literals(["none", "summary", "full"]),
  tools: Schema.Union([Schema.Literals(["attenuate", "same"]), CapabilityDescriptors]),
  permissions: Schema.Literals(["inherit", "fresh"]),
  budget: Schema.optionalKey(BudgetLimits),
  sandbox: Schema.Literals(["share", "fork", "fresh"]),
  instructions: Schema.Literals(["inherit", "own"]),
  memory: Schema.Literals(["inherit", "fresh"]),
  tasks: Schema.Literals(["read", "none"]),
})
export type Inheritance = typeof Inheritance.Type

/** Caller-authored child inheritance options. Omitted fields use safe defaults. */
export interface InheritanceOptions extends Partial<Omit<Inheritance, "tools">> {
  readonly tools?: "attenuate" | "same" | ReadonlyArray<CapabilityHandle>
}

/** Safe child inheritance defaults. */
export const defaultInheritance: Inheritance = {
  history: "none",
  tools: "attenuate",
  permissions: "inherit",
  sandbox: "fork",
  instructions: "inherit",
  memory: "inherit",
  tasks: "none",
}

/** Normalize one child inheritance record before execution or journaling. */
export const inheritance = (options?: InheritanceOptions | Inheritance): Inheritance => {
  const { tools, ...rest } = options ?? {}
  let normalizedTools: Inheritance["tools"] = defaultInheritance.tools
  if (tools !== undefined) {
    if (Schema.is(Schema.Literals(["attenuate", "same"]))(tools)) {
      normalizedTools = tools
    } else {
      normalizedTools = isCapabilityDescriptors(tools) ? tools : descriptorsFromHandles(tools)
    }
  }
  return {
    ...defaultInheritance,
    ...rest,
    tools: normalizedTools,
  }
}

const closePendingToolCalls = (parent: Prompt.Prompt): Prompt.Prompt => {
  const pending = new Map<string, Prompt.ToolCallPart>()
  for (const message of parent.content) {
    for (const part of message.content) {
      if (Schema.is(Schema.String)(part)) continue
      if (part.type === "tool-call") pending.set(part.id, part)
      if (part.type === "tool-result") pending.delete(part.id)
    }
  }
  if (pending.size === 0) return parent
  const result = Prompt.makeMessage("tool", {
    content: [...pending.values()].map((call) =>
      Prompt.makePart("tool-result", {
        id: call.id,
        name: call.name,
        isFailure: false,
        providerExecuted: false,
        result: { status: "delegated-to-child" },
      }),
    ),
  })
  return Prompt.concat(parent, Prompt.fromMessages([result]))
}

/** @internal Project the live parent transcript according to one normalized history policy. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal projection with two required direct-style arguments.
export const inheritedHistory = (
  policy: Inheritance["history"],
  parent: Prompt.Prompt | undefined,
): Prompt.Prompt | undefined => {
  if (parent === undefined || policy === "none") return undefined
  if (policy === "full") return closePendingToolCalls(parent)
  const latest = parent.content.findLast((message) => message.role === "user")
  return latest === undefined ? undefined : Prompt.fromMessages([latest])
}

const validCapabilityTools = (
  parent: AnyAgent,
  child: AnyAgent,
  descriptors: ReadonlyArray<CapabilityDescriptorValue>,
): boolean => {
  try {
    for (const descriptor of descriptors) {
      const tool = child.toolkit.tools[descriptor.tool]
      if (tool === undefined) return false
      validateDescriptor(descriptor, tool)
    }
  } catch {
    return false
  }
  const parentTools = Object.keys(parent.toolkit.tools)
  const childTools = Object.keys(child.toolkit.tools)
  const handleTools = descriptors.map((descriptor) => descriptor.tool)
  if (!childTools.every((name) => handleTools.includes(name))) return false
  if (!handleTools.every((name) => childTools.includes(name) && parentTools.includes(name))) return false
  const parentCapabilities = parent.capabilities
  return (
    parentCapabilities === undefined ||
    descriptors.every((descriptor) =>
      parentCapabilities.some((parentDescriptor) => descriptorDescendsFrom(descriptor, parentDescriptor)),
    )
  )
}

/** @internal Reject child authority that the parent does not hold. Shared by process-local and durable spawn paths. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal authority check with three required direct-style arguments.
export const validateAuthority = (
  parent: AnyAgent,
  child: AnyAgent,
  inherit: Inheritance,
): Effect.Effect<void, ChildExceedsParent> => {
  const parentTools = Object.keys(parent.toolkit.tools)
  const childTools = Object.keys(child.toolkit.tools)
  if (isCapabilityDescriptors(inherit.tools) && !validCapabilityTools(parent, child, inherit.tools)) {
    return ChildExceedsParent.make({ field: "tools" })
  }
  if (inherit.tools === "attenuate" && !childTools.every((name) => parentTools.includes(name))) {
    return ChildExceedsParent.make({ field: "tools" })
  }
  if (
    inherit.permissions === "fresh" &&
    child.authorization !== undefined &&
    child.authorization !== parent.authorization
  ) {
    return ChildExceedsParent.make({ field: "permissions" })
  }
  if (inherit.sandbox === "fresh" && child.sandbox !== undefined && parent.sandbox === undefined) {
    return ChildExceedsParent.make({ field: "sandbox" })
  }
  return Effect.void
}

const inheritedSandbox = (parent: AnyAgent, child: AnyAgent, policy: Inheritance["sandbox"]) => {
  if (policy === "fresh") return Effect.succeed(child.sandbox)
  if (policy === "share" || parent.sandbox === undefined) return Effect.succeed(parent.sandbox)
  return parent.sandbox.snapshot.pipe(
    Effect.flatMap(parent.sandbox.fork),
    Effect.mapError((cause) => AgentError.make({ message: "Failed to fork the parent Sandbox", turn: 0, cause })),
  )
}

const inheritedCapabilities = (
  parent: AnyAgent,
  child: AnyAgent,
  tools: Inheritance["tools"],
): ReadonlyArray<CapabilityDescriptorValue> | undefined => {
  if (isCapabilityDescriptors(tools)) return tools
  if (parent.capabilities === undefined) return undefined
  if (tools === "same") return parent.capabilities
  return parent.capabilities.filter((descriptor) => Object.hasOwn(child.toolkit.tools, descriptor.tool))
}

/** @internal Apply process-local child inheritance after authority validation. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal inheritance boundary with three required direct-style arguments.
export const applyInheritance = <A extends AnyAgent>(
  parent: AnyAgent,
  child: A,
  inherit: Inheritance,
): Effect.Effect<A, ChildExceedsParent | AgentError> =>
  Effect.gen(function* () {
    yield* validateAuthority(parent, child, inherit)
    const sandbox = yield* inheritedSandbox(parent, child, inherit.sandbox)
    const capabilities = inheritedCapabilities(parent, child, inherit.tools)
    const inherited = {
      ...child,
      ...Object.assign({}, inherit.tools === "same" ? { toolkit: parent.toolkit } : undefined),
      ...Object.assign({}, capabilities === undefined ? undefined : { capabilities }),
      ...Object.assign(
        {},
        inherit.permissions === "inherit" && parent.authorization !== undefined
          ? { authorization: parent.authorization }
          : undefined,
      ),
      ...Object.assign(
        {},
        inherit.instructions === "inherit" && parent.instructions !== undefined
          ? { instructions: parent.instructions }
          : undefined,
      ),
      ...Object.assign(
        {},
        inherit.memory === "inherit" && parent.memory !== undefined ? { memory: parent.memory } : undefined,
      ),
      ...Object.assign({}, sandbox === undefined ? undefined : { sandbox }),
    }
    return inherited
  })

/** One typed Agent invocation admitted into a process-local fan-out. */
export interface Child<A extends AnyAgent = AnyAgent> {
  readonly agent: A
  readonly input: Input<A>
  readonly inherit: Inheritance
  /** @internal Exact parent prefix captured by AgentTool.fanOut. */
  readonly history?: Prompt.Prompt
  /** @internal Read-only parent task snapshot captured by AgentTool.fanOut. */
  readonly tasks?: TaskItems
}

/** Process-local fan-out policy. */
export interface Options {
  readonly concurrency: number
  readonly onFailure: "collect" | "failFast"
}

/** One Exit for each child, preserving tuple order and each Agent's output type. */
export type Results<Children extends ReadonlyArray<Child>> = {
  readonly [Index in keyof Children]: Children[Index] extends Child<infer A> ? Exit.Exit<Output<A>, RunError> : never
}

/** Services required by every member of one typed fan-out. */
export type Requirements<Children extends ReadonlyArray<Child>> = ExecutionServices<Children[number]["agent"]>

/** Public process-local Agent.fanOut call signature. */
export interface FanOut {
  <Children extends ReadonlyArray<Child>>(
    options: Options,
  ): (children: Children) => Effect.Effect<Results<Children>, RunError, Requirements<Children>>
  <Children extends ReadonlyArray<Child>>(
    children: Children,
    options: Options,
  ): Effect.Effect<Results<Children>, RunError, Requirements<Children>>
}

/** One process-local child whose specific Agent type is hidden. */
export type AnyChild = Child<AnyAgent>

type BoundaryValue = typeof Schema.Unknown.Type
type ErasedAgent = Agent<Record<string, Tool.Any>, unknown, unknown, unknown, Schema.Top, Schema.Top>

/** @internal Recursive Agent.run implementation supplied without importing the service module back into this lifecycle owner. */
export interface AgentRunner {
  readonly run: (
    agent: ErasedAgent,
    input: BoundaryValue,
    inherit: Inheritance,
    history?: Prompt.Prompt,
    tasks?: TaskItems,
  ) => Effect.Effect<BoundaryValue, RunError>
}

type RunChild = (
  agent: ErasedAgent,
  input: BoundaryValue,
  options: { readonly budget?: BudgetLimits; readonly history?: Prompt.Prompt },
) => Effect.Effect<BoundaryValue, RunError>

/** @internal Construct the recursive runner used by Agent.run. */
export const recursiveAgentRunner = (execute: RunChild): AgentRunner => ({
  run: (agent, input, inherit, history, tasks) =>
    Effect.gen(function* () {
      const context = yield* Effect.serviceOption(ToolContext)
      const parent = Option.isSome(context) ? context.value : undefined
      let inheritedAgent = agent
      if (parent?.agent !== undefined) inheritedAgent = yield* applyInheritance(parent.agent, agent, inherit)
      else if (isCapabilityDescriptors(inherit.tools)) {
        inheritedAgent = yield* applyInheritance(agent, agent, { ...inherit, sandbox: "share" })
      }
      const parentHistory = history ?? (parent?.history === undefined ? undefined : yield* parent.history)
      const historyProjection = inheritedHistory(inherit.history, parentHistory)
      return yield* execute(tasks === undefined ? inheritedAgent : withInheritedTasks(inheritedAgent, tasks), input, {
        ...Object.assign({}, inherit.budget === undefined ? undefined : { budget: inherit.budget }),
        ...Object.assign({}, historyProjection === undefined ? undefined : { history: historyProjection }),
      })
    }),
})

/** Process-local child runner supplied by Agent.run and absent under a hosted Runtime. */
export interface ProcessRunnerService {
  readonly run: (child: AnyChild) => Effect.Effect<BoundaryValue, RunError>
}

/** @internal Optional recursive Agent.run capability for model-authored process-local fan-out. */
export class ProcessRunner extends Context.Service<ProcessRunner, ProcessRunnerService>()(
  "generalist/core/agent/lifecycle/fan-out/ProcessRunner",
) {}

const executeChild = (runner: AgentRunner, invocation: AnyChild) => {
  const hiddenAgent: unknown = invocation.agent
  // oxlint-disable-next-line anti-slop/no-widen-then-assert, typescript/no-unsafe-type-assertion -- SAFETY: Agent.child accepts only Agent definitions and preserves the paired input before existential erasure.
  const agent = hiddenAgent as ErasedAgent
  return runner.run(agent, invocation.input, invocation.inherit, invocation.history, invocation.tasks)
}

/** @internal Close a recursive runner over the caller's exact process-local Agent environment. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal constructor with two required direct-style arguments.
export const processRunner = <R>(context: Context.Context<R>, runner: AgentRunner): ProcessRunnerService => {
  const erased = Context.makeUnsafe<unknown>(context.mapUnsafe)
  return ProcessRunner.of({
    run: (invocation) => executeChild(runner, invocation).pipe(Effect.provideContext(erased)),
  })
}

/** Construct one lazy typed child invocation. */
export const child: {
  <A extends AnyAgent>(input: Input<A>, options?: { readonly inherit?: InheritanceOptions }): (agent: A) => Child<A>
  <A extends AnyAgent>(agent: A, input: Input<A>, options?: { readonly inherit?: InheritanceOptions }): Child<A>
} = Function.dual(
  (args) => args.length >= 2 && Predicate.hasProperty(args[0], AgentTypeId),
  <A extends AnyAgent>(agent: A, input: Input<A>, options?: { readonly inherit?: InheritanceOptions }): Child<A> => ({
    agent,
    input,
    inherit: inheritance(options?.inherit),
  }),
)

/** @internal Execute one fan-out through the caller-owned Agent runner. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal adapter with three required direct-style arguments.
export const run = <Children extends ReadonlyArray<Child>, R>(
  children: Children,
  options: Options,
  execute: (child: Children[number]) => Effect.Effect<unknown, RunError, R>,
): Effect.Effect<Results<Children>, RunError, R> => {
  if (!Number.isSafeInteger(options.concurrency) || options.concurrency < 1) {
    return AgentError.make({
      message: "Agent.fanOut concurrency must be a positive safe integer",
      turn: 0,
    })
  }
  if (options.onFailure === "collect") {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion -- SAFETY: forEach preserves input order and Effect.exit preserves each tuple member's output in the corresponding Exit.
    return Effect.forEach(children, (invocation) => Effect.exit(execute(invocation)), {
      concurrency: options.concurrency,
    }) as Effect.Effect<Results<Children>, RunError, R>
  }
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion -- SAFETY: forEach preserves input order; all successful outputs are wrapped at their corresponding tuple indices.
  return Effect.forEach(children, execute, { concurrency: options.concurrency }).pipe(
    Effect.map((outputs) => outputs.map(Exit.succeed)),
  ) as Effect.Effect<Results<Children>, RunError, R>
}

/** @internal Bind the public Agent.fanOut signature to Agent.run without a service-module cycle. */
export const make = (runner: AgentRunner): FanOut =>
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, effecttsgo/unsafe-effect-type-assertion, typescript/no-unsafe-type-assertion -- SAFETY: executeChild erases only scheduling internals; Child preserves each concrete output and requirement in the public mapped signature.
  Function.dual(2, (children: ReadonlyArray<Child>, options: Options) =>
    run(children, options, (invocation) => executeChild(runner, invocation)),
  ) as FanOut
