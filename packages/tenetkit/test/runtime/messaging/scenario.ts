import { Effect, Layer } from "effect"
import {
  ExecutableResolver,
  Runtime,
  RunStore,
  type AgentDirectory,
  type Mailbox,
  type Messaging,
} from "../../../src/runtime/index.js"
import {
  analyst,
  analystRef,
  assistant,
  assistantAddress,
  assistantRef,
  registrationsFor,
  researcher,
  researcherAddress,
  researcherRef,
  textPrompt,
} from "../execution/fixtures.js"
import { closedTestAgent } from "../run/identity.js"
import { provideScoped } from "../execution/scoped-provide.js"

const options = {
  resolver: ExecutableResolver.makeStatic([
    { executable: assistantRef, agent: closedTestAgent(assistant) },
    { executable: researcherRef, agent: closedTestAgent(researcher) },
    { executable: analystRef, agent: closedTestAgent(analyst) },
  ]),
  addresses: [
    { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
    { address: researcherAddress, executable: researcherRef, registrations: registrationsFor(researcherRef) },
  ],
  subscriberQueueCapacity: 8,
} satisfies Runtime.LayerOptions

/** The mailbox and policy knobs a messaging test chooses when it builds its Runtime. */
export interface MessagingOverrides {
  readonly mailboxBounds?: Partial<Mailbox.MailboxBounds>
  readonly messagingPolicy?: Messaging.Interface
}

/** A memory Runtime whose mailbox bounds and messaging policy the test chooses. */
export const messagingLayer = (overrides: MessagingOverrides) => Runtime.layerMemory({ ...options, ...overrides })

/**
 * One backend the addressed-messaging suites run against.
 *
 * `layer` is a factory rather than a value because mailbox bounds and cross-session policy are
 * Runtime construction options, so each bound and each policy is a different Runtime. `activate`
 * exists because the memory and SQLite Runtimes bundle a LocalScheduler that promotes a queued Run
 * itself while the SQL Runtimes expect an external worker to claim ready work.
 */
export interface MessagingBackend<StoreError, Extra = never> {
  readonly name: string
  readonly layer: (
    overrides: MessagingOverrides,
  ) => Layer.Layer<Runtime.Runtime | RunStore.RunStore | Extra, StoreError>
  readonly activate?: (runId: string) => Effect.Effect<void, never, Runtime.Runtime | RunStore.RunStore | Extra>
  readonly skip?: boolean
}

export const messagingBackend = <StoreError, Extra = never>(backend: MessagingBackend<StoreError, Extra>) => {
  const activate = backend.activate ?? (() => Effect.void)
  return {
    provide:
      (overrides: MessagingOverrides = {}) =>
      <A, E>(effect: Effect.Effect<A, E, Runtime.Runtime | RunStore.RunStore | Extra>) =>
        provideScoped(backend.layer(overrides), effect),
    familyFor: (sessionId: string) => family(sessionId).pipe(Effect.tap(({ parent }) => activate(parent.runId))),
    strangerFor: (sessionId: string) => stranger(sessionId).pipe(Effect.tap((entry) => activate(entry.runId))),
  }
}

/**
 * One parent Run with two spawned children.
 *
 * Every messaging test needs the same authoritative family: parent, two direct children that are
 * siblings of each other, and each child's own derived Session.
 */
export const family = (sessionId: string) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const parent = yield* runtime.send({
      to: assistantAddress,
      sessionId,
      idempotencyKey: `${sessionId}:parent`,
      prompt: textPrompt("plan"),
    })
    const first = yield* runtime.spawn({
      parentRunId: parent.runId,
      invocationId: "invocation:first",
      selection: "researcher",
      prompt: textPrompt("first"),
    })
    const second = yield* runtime.spawn({
      parentRunId: parent.runId,
      invocationId: "invocation:second",
      selection: "researcher",
      prompt: textPrompt("second"),
    })
    const directoryOf = (runId: string): Effect.Effect<AgentDirectory.DirectoryEntry> =>
      store.directory(runId).pipe(Effect.orDie)
    return {
      runtime,
      store,
      parent: yield* directoryOf(parent.runId),
      first: yield* directoryOf(first.runId),
      second: yield* directoryOf(second.runId),
    }
  })

/** A second, unrelated root Run: the natural negative case for relationship scope. */
export const stranger = (sessionId: string) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const receipt = yield* runtime.send({
      to: assistantAddress,
      sessionId,
      idempotencyKey: `${sessionId}:stranger`,
      prompt: textPrompt("unrelated"),
    })
    return yield* store.directory(receipt.runId).pipe(Effect.orDie)
  })
