import { Clock, Effect, Layer, Option, Ref, Stream } from "effect"
/* eslint-disable max-lines -- the memory Runtime layer implements one service contract */
import {
  AddressNotFound,
  ChildSelectionMissing,
  ExecutableIdentityMismatch,
  ExecutablePinMissing,
  ExecutableRegistrationInvalid,
  RunTerminal,
  StartInvalid,
  RuntimeUnavailable,
  IllegalOperatorAction,
} from "../../errors.js"
import { make as makeAddress, type Address } from "../../address.js"
import { origin as cursorOrigin } from "../../cursor.js"
import { make as makeMessage } from "../../messaging/message.js"
import { RunStore, type AdmitMessageInput, type AdmitSendInput, type AdmitStartInput } from "../../run/store.js"
import {
  Runtime,
  type Service as RuntimeService,
  type LayerOptions,
  type SendInput,
  type StartExecutionInput,
  type SpawnInput,
} from "../../service.js"
import { normalizePrompt } from "../prompt.js"
import { normalizeInitialChild, normalizeInitialFanOut } from "../start.js"
import { ActiveExecutions } from "../../execution/active-executions.js"
import { digest as steeringDigest } from "../../run/steering.js"
import { parseCursor } from "../../tree/cursor.js"
import { decodePinned, equals, resolveChild } from "../../executable/manifest-internal.js"
import type { PinnedExecutable } from "../../executable/manifest.js"
import { ExecutableResolver, type Input as ResolverInput } from "../../executable/resolver.js"
import { validate as validateRegistrations, type ExecutableRegistration } from "../../executable/registration.js"
import {
  make as makeRegisteredAgents,
  resolve as resolveRegisteredAgent,
  type RegisteredAgents,
} from "../../executable/registered-agent.js"
import { ModelPreviewLane, previews as modelPreviews } from "../../execution/model-response/preview-internal.js"
import { readEntry, resolveModelResponse } from "../../session/service.js"
type Registrations = ReadonlyArray<ExecutableRegistration>
import { childSessionId } from "../../child/session.js"
import { parseAddress, runAddress } from "../../execution/agent/directory.js"
import { authorize, Policy as MessagingPolicy, reachable } from "../../messaging/service.js"
import { defaultBounds, digest as messageDigest, promptBytes } from "../../messaging/mailbox.js"
import { defaultTreePolicy } from "../../tree/policy.js"
import { isTerminal, type RunInspection } from "../../run.js"
import { explain as explainRecovery, verify as verifyRecovery } from "../../execution/recovery/operator.js"
import { resolveWith as resolveDurableApproval } from "../../operation/approval.js"
import { awaitSessionTerminal } from "../../session/lifecycle.js"
import { make as makeAgentStart, untypedHandle } from "./agent-start.js"
import { normalizer as fanOutNormalizer } from "./fan-out.js"
import { messageDigestInput, messageDraft } from "./message.js"
import { Invalid as BudgetInvalid, make as makeBudget } from "../../../core/durable/run-budget.js"
import { generateId } from "../../../core/model/telemetry/events.js"
const nextMessageId = (prefix: string, key: string): string => `${prefix}:${key}`
const startAddress = makeAddress("runtime:start")
type MutableStartAdmission = { -readonly [Key in keyof AdmitStartInput]: AdmitStartInput[Key] }
type MutableSendAdmission = { -readonly [Key in keyof AdmitSendInput]: AdmitSendInput[Key] }
type MutableMessageAdmission = { -readonly [Key in keyof AdmitMessageInput]: AdmitMessageInput[Key] }

const makeRuntimeWith = (
  options: LayerOptions,
  agents: RegisteredAgents,
): Effect.Effect<RuntimeService, never, RunStore | ActiveExecutions | ExecutableResolver> =>
  Effect.gen(function* () {
    const store = yield* RunStore
    const active = yield* ActiveExecutions
    const resolver = yield* ExecutableResolver
    const previewLane = yield* Effect.serviceOption(ModelPreviewLane)
    const policy = MessagingPolicy.make(options.messagingPolicy ?? {})
    const bounds = { ...defaultBounds, ...options.mailboxBounds }
    const addresses = new Map<
      string,
      { readonly executable: PinnedExecutable; readonly registrations: Registrations }
    >()
    for (const entry of options.addresses) {
      addresses.set(entry.address, {
        executable: entry.executable,
        registrations: Object.freeze([...entry.registrations]),
      })
    }
    type ExecutableInput = StartExecutionInput["executable"]
    const decode = (executable: ExecutableInput) =>
      Effect.try({
        try: () => decodePinned(executable),
        catch: (error) => ExecutableRegistrationInvalid.make({ message: String(error) }),
      })
    const attest = (input: {
      readonly executable: PinnedExecutable
      readonly registrations: Registrations
      readonly runId: string
    }) =>
      Effect.gen(function* () {
        const registrations = yield* validateRegistrations(input.executable, input.registrations)
        const attestation = yield* Effect.scoped(
          resolveRegisteredAgent(agents, resolver, {
            runId: input.runId,
            ref: input.executable.ref,
            manifest: input.executable.manifest,
            registrations,
          } satisfies ResolverInput).pipe(
            Effect.map((resolution) => resolution.attestation),
            Effect.catchTag("generalist/runtime/UnknownAgent", () =>
              Effect.fail(ExecutablePinMissing.make({ runId: input.runId, ref: input.executable.ref })),
            ),
          ),
        )
        if (!equals(attestation, input.executable)) {
          return yield* ExecutableIdentityMismatch.make({
            runId: input.runId,
            expectedRef: input.executable.ref,
            actualRef: attestation.ref,
          })
        }
        return registrations
      })
    const admissionRegistrations = (input: {
      readonly address: Address
      readonly sessionId: string
      readonly idempotencyKey: string
      readonly executable: PinnedExecutable
      readonly registrations: Registrations
      readonly runId: string
    }) =>
      store
        .hasAdmission({
          address: input.address,
          sessionId: input.sessionId,
          idempotencyKey: input.idempotencyKey,
        })
        .pipe(Effect.flatMap((admitted) => (admitted ? Effect.succeed(input.registrations) : attest(input))))
    const awaitFanOut = (fanOutId: string): ReturnType<RuntimeService["awaitFanOut"]> =>
      Effect.gen(function* () {
        const current = yield* store.inspectFanOut(fanOutId)
        if (current.status !== "running") return current
        const streams = yield* Effect.forEach(current.members, (member) =>
          store
            .inspect(member.childRunId)
            .pipe(Effect.map((run) => store.events({ runId: member.childRunId, cursor: run.lastSequence }))),
        )
        const changes = streams.slice(1).reduce((left, right) => Stream.merge(left, right), streams[0]!)
        const rechecked = yield* store.inspectFanOut(fanOutId)
        if (rechecked.status !== "running") return rechecked
        yield* Stream.runHead(changes)
        return yield* awaitFanOut(fanOutId)
      })
    const childSettlementChanges = (
      input: Parameters<RuntimeService["childSettlementChanges"]>[0],
    ): ReturnType<RuntimeService["childSettlementChanges"]> =>
      Stream.unwrap(
        Effect.gen(function* () {
          const parent = yield* store.directory(input.parentRunId)
          const sequence = yield* Ref.make(input.afterSequence ?? -1)
          return store.treeChanges(parent.rootRunId).pipe(
            Stream.mapEffect(() =>
              Effect.flatMap(Ref.get(sequence), (afterSequence) =>
                store.settlementNotifications({
                  parentRunId: input.parentRunId,
                  afterSequence,
                  limit: Number.MAX_SAFE_INTEGER,
                }),
              ),
            ),
            Stream.flattenIterable,
            Stream.tap((notification) => Ref.set(sequence, notification.sequence)),
          )
        }),
      )
    const awaitChildSettlement = (
      input: Parameters<RuntimeService["awaitChildSettlement"]>[0],
    ): ReturnType<RuntimeService["awaitChildSettlement"]> =>
      childSettlementChanges({ parentRunId: input.parentRunId }).pipe(
        Stream.filter((notification) => notification.childRunId === input.childRunId),
        Stream.runHead,
        Effect.flatMap(
          Option.match({
            onNone: () => RuntimeUnavailable.make({ message: "child settlement subscription ended" }),
            onSome: Effect.succeed,
          }),
        ),
      )
    const normalizeFanOut = fanOutNormalizer(store)
    const validateInitialChildren = (
      input: StartExecutionInput,
      executable: PinnedExecutable,
      initialChildren: NonNullable<StartExecutionInput["initialChildren"]>,
    ) =>
      Effect.gen(function* () {
        if (initialChildren.length > 64) {
          return yield* StartInvalid.make({ message: "initialChildren cannot contain more than 64 requests" })
        }
        const activeEntry = executable.manifest.entries.find((entry) => entry.pin === executable.ref.active)
        const invocationIds = new Set<string>()
        const idempotencySources = new Set<string>()
        for (const child of initialChildren) {
          if (invocationIds.has(child.invocationId)) {
            return yield* StartInvalid.make({ message: `duplicate initial child invocationId: ${child.invocationId}` })
          }
          const source = `${child.sessionId}\0${child.idempotencyKey}`
          if (idempotencySources.has(source)) {
            return yield* StartInvalid.make({ message: "duplicate initial child sessionId/idempotencyKey" })
          }
          invocationIds.add(child.invocationId)
          idempotencySources.add(source)
          if (
            activeEntry?._tag !== "Agent" ||
            resolveChild(executable.ref, executable.manifest, child.selection) === undefined
          ) {
            return yield* ChildSelectionMissing.make({
              parentRunId: input.runId ?? "pending",
              selection: child.selection,
            })
          }
        }
      })

    const validateInitialFanOuts = (
      input: StartExecutionInput,
      executable: PinnedExecutable,
      initialFanOuts: NonNullable<StartExecutionInput["initialFanOuts"]>,
    ) =>
      Effect.gen(function* () {
        if (initialFanOuts.length > 64) {
          return yield* StartInvalid.make({ message: "initialFanOuts cannot contain more than 64 requests" })
        }
        const activeEntry = executable.manifest.entries.find((entry) => entry.pin === executable.ref.active)
        const fanOutKeys = new Set<string>()
        for (const fanOut of initialFanOuts) {
          if (fanOutKeys.has(fanOut.idempotencyKey)) {
            return yield* StartInvalid.make({
              message: `duplicate initial fan-out idempotencyKey: ${fanOut.idempotencyKey}`,
            })
          }
          fanOutKeys.add(fanOut.idempotencyKey)
          yield* normalizeFanOut(input.runId ?? "pending", fanOut)
          for (const member of fanOut.members) {
            if (
              activeEntry?._tag !== "Agent" ||
              resolveChild(executable.ref, executable.manifest, member.selection) === undefined
            ) {
              return yield* ChildSelectionMissing.make({
                parentRunId: input.runId ?? "pending",
                selection: member.selection,
              })
            }
          }
        }
      })

    const admitStart = (input: StartExecutionInput, activate: boolean) =>
      Effect.gen(function* () {
        const executable = yield* decode(input.executable)
        const registrations = yield* admissionRegistrations({
          address: startAddress,
          sessionId: input.sessionId,
          idempotencyKey: input.idempotencyKey,
          executable,
          registrations: input.registrations,
          runId: input.runId ?? "pending",
        })
        const initialChildren = input.initialChildren ?? []
        const initialFanOuts = input.initialFanOuts ?? []
        yield* validateInitialChildren(input, executable, initialChildren)
        yield* validateInitialFanOuts(input, executable, initialFanOuts)
        const prompt = normalizePrompt(input.prompt)
        const message = makeMessage(
          messageDraft({
            id: input.messageId ?? nextMessageId("start", input.idempotencyKey),
            to: startAddress,
            sessionId: input.sessionId,
            prompt,
            idempotencyKey: input.idempotencyKey,
            correlationId: input.correlationId ?? input.idempotencyKey,
            metadata: input.metadata ?? {},
            from: undefined,
            causationId: input.causationId,
            inReplyTo: undefined,
          }),
        )
        const admission: MutableStartAdmission = {
          message,
          executableRef: executable.ref,
          executableManifest: executable.manifest,
          registrations,
          treePolicy: input.treePolicy ?? defaultTreePolicy,
          initialChildren: initialChildren.map(normalizeInitialChild),
          initialFanOuts: initialFanOuts.map(normalizeInitialFanOut),
        }
        if (input.budget !== undefined) admission.budget = input.budget.allocation
        if (input.runId !== undefined) admission.runId = input.runId
        return yield* store.admitStart(admission, { activate })
      })
    const agentStart = makeAgentStart({ agents, store, admitStart })
    const operatorExplain: RuntimeService["operator"]["explain"] = (runId) =>
      store.recoveryJournal(runId).pipe(Effect.map(explainRecovery))
    const normalizeBudgetDelta = (delta: Parameters<RuntimeService["extendBudget"]>[1]) =>
      Effect.try({
        try: () => makeBudget(delta).allocation,
        catch: (error) => BudgetInvalid.make({ message: String(error), hint: "Use finite non-negative budget values" }),
      })
    const extendRunBudget: RuntimeService["extendBudget"] = (runId, delta) =>
      normalizeBudgetDelta(delta).pipe(Effect.flatMap((normalized) => store.extendBudget(runId, normalized)))
    const operatorRuns = Stream.paginate<string | undefined, RunInspection, RuntimeUnavailable>(
      undefined,
      (afterRunId) =>
        store
          .list({
            limit: 100,
            order: "oldest",
            ...(afterRunId === undefined ? undefined : { afterRunId }),
          })
          .pipe(
            Effect.map((runs) => {
              const last = runs.at(-1)
              return [
                runs,
                runs.length === 100 && last !== undefined ? Option.some(last.runId) : Option.none(),
              ] as const
            }),
          ),
    )
    const operator: RuntimeService["operator"] = {
      explain: operatorExplain,
      verify: (runId) => store.recoveryJournal(runId).pipe(Effect.map(verifyRecovery)),
      retry: (runId, operatorIdentity) =>
        Effect.gen(function* () {
          const explanation = yield* operatorExplain(runId)
          if (explanation.decision._tag !== "RetryOperation") {
            return yield* IllegalOperatorAction.make({
              runId,
              decision: explanation.decision,
              action: "retry",
            })
          }
          yield* store.retryRecovery({
            runId,
            operationId: explanation.decision.operationId,
            operator: operatorIdentity,
          })
        }),
      wake: (runId, operatorIdentity) => store.wakeRecovery({ runId, operator: operatorIdentity }),
      scanObligations: () =>
        operatorRuns.pipe(
          Stream.mapEffect((run) =>
            operatorExplain(run.runId).pipe(Effect.map((explanation) => ({ runId: run.runId, explanation }))),
          ),
          Stream.filter(({ explanation }) => explanation.decision._tag !== "Resume"),
          Stream.map(({ runId, explanation }) => ({
            runId,
            decision: explanation.decision,
          })),
        ),
      resolveUnknown: (runId, operationId, resolution, operatorIdentity) =>
        store.resolveUnknown({
          runId,
          operationId,
          operator: operatorIdentity,
          resolution:
            resolution.outcome === "succeeded"
              ? { _tag: "Succeeded", value: resolution.result }
              : { _tag: "Failed", error: resolution.error },
        }),
      resolveApproval: (token, decision, operatorIdentity) =>
        Effect.suspend(() => resolveDurableApproval(service, token, decision, { operator: operatorIdentity })),
      extendBudget: (runId, delta, operatorIdentity) =>
        Effect.gen(function* () {
          const explanation = yield* operatorExplain(runId)
          if (!explanation.obligations.some((decision) => decision._tag === "AwaitBudget")) {
            return yield* IllegalOperatorAction.make({
              runId,
              decision: explanation.decision,
              action: "extendBudget",
            })
          }
          const normalized = yield* normalizeBudgetDelta(delta)
          yield* store.extendBudgetRecovery({ runId, delta: normalized, operator: operatorIdentity })
        }),
    }
    const service: RuntimeService = {
      operator,
      register: agentStart.register,
      start: agentStart.start,
      startExecution: (input) => admitStart(input, true),
      admit: (input) =>
        admitStart({ ...input, initialChildren: [], initialFanOuts: [] }, false).pipe(
          Effect.map(({ runId, messageId, acceptedSequence, duplicate }) => ({
            runId,
            messageId,
            acceptedSequence,
            duplicate,
          })),
        ),
      activate: store.activate,
      send: (input: SendInput) =>
        Effect.gen(function* () {
          const binding = addresses.get(input.to)
          if (binding === undefined) return yield* AddressNotFound.make({ address: input.to })
          const executable = yield* decode(binding.executable)
          const registrations = yield* admissionRegistrations({
            address: input.to,
            sessionId: input.sessionId,
            idempotencyKey: input.idempotencyKey,
            executable,
            registrations: binding.registrations,
            runId: input.runId ?? "pending",
          })
          const prompt = normalizePrompt(input.prompt)
          const message = makeMessage(
            messageDraft({
              id: input.messageId ?? nextMessageId("msg", input.idempotencyKey),
              to: input.to,
              sessionId: input.sessionId,
              prompt,
              idempotencyKey: input.idempotencyKey,
              correlationId: input.correlationId ?? input.idempotencyKey,
              metadata: input.metadata ?? {},
              from: input.from,
              causationId: input.causationId,
              inReplyTo: input.inReplyTo,
            }),
          )
          const admission: MutableSendAdmission = {
            message,
            executableRef: executable.ref,
            executableManifest: executable.manifest,
            registrations,
            treePolicy: input.treePolicy ?? defaultTreePolicy,
          }
          if (input.runId !== undefined) admission.runId = input.runId
          return yield* store.admitSend(admission)
        }),
      spawn: (input: SpawnInput) =>
        Effect.gen(function* () {
          const sessionId =
            input.sessionId ?? childSessionId({ parentRunId: input.parentRunId, invocationId: input.invocationId })
          const idempotencyKey = input.idempotencyKey ?? `spawn:${input.parentRunId}:${input.invocationId}`
          const address = makeAddress(`spawn:${input.parentRunId}`)
          const prompt = normalizePrompt(input.prompt)
          const message = makeMessage({
            id: input.messageId ?? nextMessageId("spawn", idempotencyKey),
            to: address,
            sessionId,
            prompt,
            idempotencyKey,
            correlationId: input.correlationId ?? input.parentRunId,
            metadata: input.metadata ?? {},
          })
          return yield* store.admitSpawn({
            ...input,
            message,
            parentRunId: input.parentRunId,
          })
        }),
      events: (input) => store.events({ runId: input.runId, cursor: input.cursor ?? cursorOrigin }),
      previews: (input) => modelPreviews(previewLane)(input.runId),
      snapshot: (runId) => store.snapshot(runId),
      history: (input) =>
        store.history({ runId: input.runId, cursor: input.cursor ?? cursorOrigin, limit: input.limit }),
      createSession: store.createHostSession,
      session: store.hostSession,
      listSessions: store.listHostSessions,
      sessionRuns: store.hostSessionRuns,
      sessionEvents: (input) =>
        store.hostSessionEvents({ sessionId: input.sessionId, cursor: input.cursor ?? cursorOrigin }),
      acknowledge: store.acknowledge,
      acknowledged: store.acknowledged,
      sessionEntry: readEntry(store),
      resolveModelResponse: resolveModelResponse(store),
      treeReplay: (input) =>
        Effect.gen(function* () {
          const position = yield* parseCursor(input.rootRunId, input.cursor)
          return yield* store.treeReplay({ rootRunId: input.rootRunId, position, limit: input.limit })
        }),
      treeChanges: store.treeChanges,
      treeCheckpoint: store.treeCheckpoint,
      list: store.list,
      respond: store.respond,
      respondApproval: store.respondApproval,
      signal: store.signal,
      cancel: (input) =>
        Effect.gen(function* () {
          yield* store.cancel(input)
          const span = yield* Effect.option(Effect.currentSpan)
          if (Option.isSome(span)) {
            span.value.event("generalist.runtime.cancel.requested", yield* Clock.currentTimeNanos)
          }
          yield* active.interrupt(input.runId)
        }).pipe(
          Effect.withSpan("Generalist.Runtime.cancel", {
            attributes: { "generalist.runtime.run_id": input.runId },
          }),
        ),
      cancelSession: (input) =>
        Effect.gen(function* () {
          const runIds = yield* store.cancelSession(input)
          yield* Effect.forEach(runIds, (runId) => active.interrupt(runId), {
            concurrency: "unbounded",
            discard: true,
          })
        }),
      awaitSessionTerminal: (input) => awaitSessionTerminal({ store, ...input }),
      steer: (input) => {
        const prompt = normalizePrompt(input.prompt)
        return store.admitSteering({ ...input, prompt, digest: steeringDigest(prompt) })
      },
      sendMessage: (input) =>
        Effect.gen(function* () {
          const sender = yield* store.directory(input.fromRunId)
          const target = yield* store.resolveAddress(input.to)
          const addressTarget = yield* parseAddress(input.to)
          const durableTo = addressTarget._tag === "Session" ? input.to : runAddress(target.runId)
          yield* authorize({ sender, target, policy })
          if (addressTarget._tag !== "Session" && isTerminal(target.status)) {
            return yield* RunTerminal.make({ runId: target.runId, status: target.status })
          }
          const prompt = normalizePrompt(input.prompt)
          const correlationId = input.correlationId ?? input.idempotencyKey
          const metadata = input.metadata ?? {}
          const admission: MutableMessageAdmission = {
            fromRunId: sender.runId,
            fromAddress: runAddress(sender.runId),
            to: durableTo,
            targetSessionId: target.sessionId,
            messageId: input.messageId ?? nextMessageId("msg", input.idempotencyKey),
            idempotencyKey: input.idempotencyKey,
            digest: messageDigest(
              messageDigestInput({
                to: durableTo,
                from: runAddress(sender.runId),
                prompt,
                correlationId,
                metadata,
                causationId: input.causationId,
                inReplyTo: input.inReplyTo,
              }),
            ),
            bytes: promptBytes(prompt),
            prompt,
            correlationId,
            metadata,
            bounds,
          }
          if (input.causationId !== undefined) admission.causationId = input.causationId
          if (input.inReplyTo !== undefined) admission.inReplyTo = input.inReplyTo
          return yield* store.admitMessage(admission)
        }),
      messages: (input) =>
        Effect.gen(function* () {
          const entry = yield* store.directory(input.runId)
          return yield* store.pendingMessages({ sessionId: entry.sessionId, runId: input.runId, limit: input.limit })
        }),
      childSettlements: (input) =>
        store.settlementNotifications({
          parentRunId: input.parentRunId,
          afterSequence: input.afterSequence ?? -1,
          limit: input.limit,
        }),
      childSettlementChanges,
      awaitChildSettlement,
      directory: (runId) => reachable({ store, policy, runId }),
      registerAgentName: store.registerAgentName,
      resolveOperation: store.resolveOperation,
      extendBudget: extendRunBudget,
      inspect: (runId) =>
        Effect.all([store.snapshot(runId), store.loadExecution(runId)]).pipe(
          Effect.map(([snapshot, execution]) => {
            const inspection = {
              ...snapshot.run,
              turn: snapshot.turn,
              usage: snapshot.usage,
              budget: snapshot.budget,
            }
            return execution.suspension === undefined ? inspection : { ...inspection, suspension: execution.suspension }
          }),
        ),
      fork: (runId, input) =>
        Effect.gen(function* () {
          const newRunId = `run_${yield* generateId}`
          const receipt = yield* store.fork({ runId, newRunId, ...input })
          yield* store.activate({ runId: receipt.runId })
          return untypedHandle(store, receipt.runId)
        }),
      rewind: (runId, input) =>
        Effect.gen(function* () {
          yield* active.interrupt(runId)
          const branchRunId = `run_${yield* generateId}`
          yield* store.rewind({ runId, branchRunId, ...input })
          yield* store.activate({ runId })
        }),
      fanOut: (input) =>
        Effect.gen(function* () {
          return yield* store.admitFanOut(yield* normalizeFanOut(input.parentRunId, input))
        }),
      inspectFanOut: store.inspectFanOut,
      awaitFanOut,
    }
    return Runtime.of(service)
  })

export const makeRuntime = (options: LayerOptions) => makeRuntimeWith(options, makeRegisteredAgents())

export const makeWith = (agents: RegisteredAgents) => (options: LayerOptions) => makeRuntimeWith(options, agents)

export const layer = (options: LayerOptions) => Layer.effect(Runtime, makeRuntime(options))

export const layerRegisteredAgents = (agents: RegisteredAgents) => (options: LayerOptions) =>
  Layer.effect(Runtime, makeRuntimeWith(options, agents))
