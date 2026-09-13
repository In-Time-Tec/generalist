/* oxlint-disable effecttsgo/any-unknown-in-error-context, typescript/no-unsafe-argument, typescript/no-unsafe-assignment, typescript/no-unsafe-return -- Validated Tool.Any, Agent.Any, and Step declarations intentionally erase heterogeneous schema and service parameters; their captured registration context restores those exact services before invocation. */
import { Context, Effect, Option, Schema, SchemaIssue, SchemaRepresentation } from "effect"
import { Prompt, Response, Toolkit } from "effect/unstable/ai"
import type { Any as AnyAgent } from "../../core/agent/lifecycle/definition.js"
import { encode as encodeAgentInput } from "../../core/agent/lifecycle/input.js"
import { setupToolAuthorizer } from "../../core/agent/lifecycle/setup.js"
import { managedToolHandlers } from "../../core/artifact.js"
import type { PinnedAgent, ProgramAuthority } from "../../core/durable/manifest/agent-manifest.js"
import { digest, makeCapability, type CapabilityPin } from "../../core/durable/pin.js"
import {
  ProgramAuthorizationFailure,
  ProgramCapabilityDenied,
  ProgramInvocationFailure,
  ProgramSuspended,
} from "../../core/program/capabilities.js"
import { CodeExecutor, type Service as CodeExecutorService } from "../../core/program/code-executor.js"
import {
  DeclarationError as CodeModeDeclarationError,
  type DeclarationError,
} from "../../core/program/code-mode-declaration.js"
import type {
  AgentInvocation,
  AnyAgent as ProgramAgent,
  Handlers,
  Invocation,
  TypedStep,
  TypedTool,
} from "../../core/program/handlers.js"
import { ToolContext } from "../../core/tools/tool-context.js"
import { executeToolkit } from "../../core/tools/tool-executor.js"
import type { ValidatedDeclaration } from "./declaration.js"

const identityFailure = (): DeclarationError =>
  CodeModeDeclarationError.make({ field: "executor", reason: "identity-invalid" })

const schemaIdentity = (schema: Schema.Top): Schema.Json =>
  SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(schema.ast))

const schemaPin = (schema: Schema.Top, identity: Readonly<Record<string, Schema.Json>>): CapabilityPin =>
  makeCapability({ ...identity, schema: schemaIdentity(schema) })

/** @internal Persisted pins derived solely from one validated declaration and registered revision. */
export interface DeclarationIdentity {
  readonly authority: ProgramAuthority
  readonly toolPins: ReadonlyMap<string, CapabilityPin>
  readonly stepPins: ReadonlyMap<string, CapabilityPin>
  readonly agentInputPins: ReadonlyMap<string, CapabilityPin>
}

/** @internal Lower declaration identity without acquiring or invoking live services. */
export const deriveIdentity = (input: {
  readonly owner: AnyAgent
  readonly declaration: ValidatedDeclaration
  readonly revision: string
  readonly agents: ReadonlyMap<AnyAgent, PinnedAgent>
}): DeclarationIdentity => {
  const prefix = {
    runtime: "generalist/code-mode",
    revision: input.revision,
    owner: input.owner.name,
  }
  const toolPins = new Map(
    input.declaration.tools.map(
      ({ tool, handlerVersion, replay }) =>
        [
          tool.name,
          schemaPin(tool.parametersSchema, {
            ...prefix,
            kind: "tool",
            name: tool.name,
            handlerVersion,
            replay,
            output: schemaIdentity(tool.successSchema),
            failure: schemaIdentity(tool.failureSchema),
          }),
        ] as const,
    ),
  )
  const stepPins = new Map(
    input.declaration.steps.map(
      ({ name, handlerVersion, input: stepInput, output, failure, replay }) =>
        [
          name,
          schemaPin(stepInput, {
            ...prefix,
            kind: "step",
            name,
            handlerVersion,
            replay,
            output: schemaIdentity(output),
            failure: schemaIdentity(failure),
          }),
        ] as const,
    ),
  )
  const agentInputPins = new Map(
    input.declaration.agents.map(
      ({ agent, selection, handlerVersion, replay }) =>
        [
          selection,
          schemaPin(agent.input, {
            ...prefix,
            kind: "agent",
            selection,
            handlerVersion,
            replay,
            agent: input.agents.get(agent)!.pin,
          }),
        ] as const,
    ),
  )
  return Object.freeze({
    authority: Object.freeze({
      sandbox: makeCapability({ ...prefix, kind: "executor", identity: input.declaration.executor }),
      input: schemaPin(Prompt.Prompt, { ...prefix, kind: "program-input" }),
      output: schemaPin(Schema.Unknown, { ...prefix, kind: "program-output" }),
      maxSourceBytes: input.declaration.maxSourceBytes,
      tools: Object.freeze(
        input.declaration.tools.map(({ tool }) => Object.freeze({ name: tool.name, pin: toolPins.get(tool.name)! })),
      ),
      agents: Object.freeze(
        input.declaration.agents.map(({ agent, selection }) =>
          Object.freeze({
            selection,
            agent: input.agents.get(agent)!.pin,
            input: agentInputPins.get(selection)!,
          }),
        ),
      ),
      steps: Object.freeze(
        input.declaration.steps.map(({ name }) => Object.freeze({ name, pin: stepPins.get(name)! })),
      ),
      budget: input.declaration.budget,
    }),
    toolPins,
    stepPins,
    agentInputPins,
  })
}

const closeCodec = <S extends Schema.Top>(
  schema: S,
  context: Context.Context<unknown>,
): Schema.Codec<S["Type"], S["Encoded"]> =>
  schema.pipe(
    Schema.middlewareDecoding((effect) => effect.pipe(Effect.provideContext(context))),
    Schema.middlewareEncoding((effect) => effect.pipe(Effect.provideContext(context))),
  )

const schemaError = (message: string): Schema.SchemaError =>
  new Schema.SchemaError(new SchemaIssue.InvalidValue({ message }))

/** @internal Exact live closure retained beside one registered Agent revision. */
export interface RegisteredCodeMode {
  readonly declaration: ValidatedDeclaration
  readonly identity: DeclarationIdentity
  readonly executor: CodeExecutorService
  readonly input: Schema.Codec<Prompt.Prompt, typeof Prompt.Prompt.Encoded>
  readonly output: Schema.Codec<unknown, unknown>
  readonly handlers: (runId: string) => Handlers
}

/** @internal Acquire handlers once from the registration environment without invoking them. */
export const bind = (input: {
  readonly owner: AnyAgent
  readonly declaration: ValidatedDeclaration
  readonly identity: DeclarationIdentity
  readonly context: Context.Context<unknown>
}): Effect.Effect<RegisteredCodeMode, DeclarationError> =>
  Effect.gen(function* () {
    const service = Context.getOption(input.context, CodeExecutor)
    if (Option.isNone(service) || digest(service.value.identity) !== digest(input.declaration.executor)) {
      return yield* identityFailure()
    }
    const declaredTools = input.declaration.tools.map(({ tool }) => tool)
    const toolkit =
      declaredTools.length === 0
        ? undefined
        : yield* Toolkit.make(...declaredTools).pipe(
            Effect.provideContext(input.context),
            Effect.mapError(() => CodeModeDeclarationError.make({ field: "tools", reason: "identity-invalid" })),
          )
    const authorizer =
      declaredTools.length === 0
        ? undefined
        : yield* setupToolAuthorizer(input.owner).pipe(
            Effect.provideContext(input.context),
            Effect.mapError(() => CodeModeDeclarationError.make({ field: "tools", reason: "identity-invalid" })),
          )
    const inputCodec = closeCodec(Prompt.Prompt, input.context)
    const outputCodec = closeCodec(Schema.Unknown, input.context)
    const handlers = (runId: string): Handlers => {
      const tools = input.declaration.tools.map(
        ({ tool, replay }): TypedTool => ({
          name: tool.name,
          pin: input.identity.toolPins.get(tool.name)!,
          input: closeCodec(tool.parametersSchema, input.context),
          output: closeCodec(tool.successSchema, input.context),
          replay,
          decode: (encoded) =>
            Schema.decodeUnknownEffect(tool.parametersSchema, { onExcessProperty: "error" })(encoded).pipe(
              Effect.provideContext(input.context),
              Effect.map((parameters): Invocation => {
                let operation: string | undefined
                const callFor = (id: string) =>
                  Response.makePart("tool-call", {
                    id,
                    name: tool.name,
                    params: parameters,
                    providerExecuted: false,
                  })
                return {
                  authorize: (currentOperation) => {
                    operation = currentOperation
                    const call = callFor(currentOperation)
                    return Effect.gen(function* () {
                      const decision = yield* authorizer!
                        .authorize({
                          call,
                          agentName: input.owner.name,
                          turn: 0,
                          sessionId: `code-mode:${runId}`,
                          runId,
                          tool,
                          active: true,
                          activeTools: declaredTools.map(({ name }) => name),
                          activatedSkills: [],
                          messages: [],
                          onApprovalRequired: () => Effect.void,
                        })
                        .pipe(
                          Effect.provideContext(input.context),
                          Effect.mapError((cause) =>
                            ProgramAuthorizationFailure.make({
                              capability: tool.name,
                              operation: currentOperation,
                              cause,
                            }),
                          ),
                        )
                      switch (decision._tag) {
                        case "Execute":
                          return true
                        case "Deny":
                          return yield* ProgramCapabilityDenied.make({
                            capability: tool.name,
                            operation: currentOperation,
                            reason: decision.error.message,
                          })
                        case "Suspend":
                          return yield* ProgramSuspended.make({
                            operation: currentOperation,
                            reason: "approval",
                            token: decision.token,
                          })
                      }
                    })
                  },
                  execute: Effect.scoped(
                    Effect.gen(function* () {
                      if (operation === undefined) {
                        return yield* ProgramInvocationFailure.make({ cause: "Tool execution was not authorized" })
                      }
                      const signal = yield* Effect.abortSignal
                      const toolContext = ToolContext.of({
                        signal,
                        emit: () => Effect.succeed(true),
                        sessionId: `code-mode:${runId}`,
                        runId,
                        rootRunId: runId,
                        toolCallId: operation,
                        operationKey: operation,
                        idempotencyKey: operation,
                      })
                      const call = callFor(operation)
                      const managed = managedToolHandlers(tool)
                      const context = Context.add(
                        managed === undefined ? input.context : Context.merge(input.context, managed),
                        ToolContext,
                        toolContext,
                      )
                      const outcome = yield* executeToolkit(toolkit!, {
                        call,
                        toolCallBatch: { calls: [call] },
                        turn: 0,
                        toolCallIndex: 0,
                        agentName: input.owner.name,
                        sessionId: `code-mode:${runId}`,
                      }).pipe(
                        Effect.provideContext(context),
                        Effect.mapError((cause) => ProgramInvocationFailure.make({ cause })),
                      )
                      if (outcome._tag === "Success") return outcome.result
                      if (outcome._tag === "Suspend") {
                        return yield* ProgramSuspended.make({
                          operation,
                          reason: "tool-wait",
                          token: outcome.token,
                        })
                      }
                      return yield* ProgramInvocationFailure.make({ cause: outcome.failure })
                    }),
                  ),
                }
              }),
            ),
        }),
      )
      const steps = input.declaration.steps.map(
        (step): TypedStep => ({
          name: step.name,
          pin: input.identity.stepPins.get(step.name)!,
          input: closeCodec(step.input, input.context),
          output: closeCodec(step.output, input.context),
          replay: step.replay,
          decode: (encoded) =>
            Schema.decodeUnknownEffect(step.input, { onExcessProperty: "error" })(encoded).pipe(
              Effect.provideContext(input.context),
              Effect.map(
                (parameters): Invocation => ({
                  authorize: () => step.authorize(parameters).pipe(Effect.provideContext(input.context)),
                  execute: step.execute(parameters).pipe(
                    Effect.provideContext(input.context),
                    Effect.catch((failure) =>
                      Schema.encodeEffect(step.failure, { onExcessProperty: "error" })(failure).pipe(
                        Effect.provideContext(input.context),
                        Effect.matchEffect({
                          onFailure: (error) =>
                            Effect.fail(
                              ProgramInvocationFailure.make({
                                cause: {
                                  _tag: "generalist/code-mode/StepFailureEncodingFailed",
                                  step: step.name,
                                  message: error.message,
                                },
                              }),
                            ),
                          onSuccess: (encoded) => Effect.fail(ProgramInvocationFailure.make({ cause: encoded })),
                        }),
                      ),
                    ),
                  ),
                }),
              ),
            ),
        }),
      )
      const agents = input.declaration.agents.map(
        ({ agent, selection, replay }): ProgramAgent => ({
          selection,
          agentName: agent.name,
          agent: input.identity.authority.agents.find((entry) => entry.selection === selection)!.agent,
          inputPin: input.identity.agentInputPins.get(selection)!,
          input: closeCodec(agent.input, input.context),
          replay,
          decode: (encoded) =>
            Schema.decodeUnknownEffect(agent.input, { onExcessProperty: "error" })(encoded).pipe(
              Effect.provideContext(input.context),
              Effect.flatMap((value) =>
                encodeAgentInput(agent.input, value).pipe(
                  Effect.provideContext(input.context),
                  Effect.mapError((error) => schemaError(error.message)),
                  Effect.map(
                    (prompt): AgentInvocation => ({
                      input: value,
                      prompt,
                      authorize: () => Effect.succeed(true),
                      execute: ProgramInvocationFailure.make({
                        cause: "Declared Agent calls require the durable Runtime child path",
                      }),
                    }),
                  ),
                ),
              ),
            ),
        }),
      )
      return Object.freeze({
        tools: Object.freeze(tools),
        steps: Object.freeze(steps),
        agents: Object.freeze(agents),
      })
    }
    return Object.freeze({
      declaration: input.declaration,
      identity: input.identity,
      executor: service.value,
      input: inputCodec,
      output: outputCodec,
      handlers,
    })
  })
