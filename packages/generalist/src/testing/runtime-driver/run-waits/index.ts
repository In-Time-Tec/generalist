import { expect, it } from "@effect/vitest"
import { DateTime, Effect } from "effect"
import { TestClock } from "effect/testing"
import { Prompt } from "effect/unstable/ai"
import { digest } from "../../../runtime/run/steering.js"
import { toolSuspension } from "../plural-waits.js"
import type { Options, RuntimeCapability, Services } from "../contract.js"

type Provide<LayerError> = <A, E>(use: (services: Services) => Effect.Effect<A, E>) => Effect.Effect<A, E | LayerError>

const waitFor = (input: {
  readonly services: Services
  readonly capability: RuntimeCapability
  readonly runId: string
  readonly waitId: string
  readonly commandId: string
  readonly runs: ReadonlyArray<string>
  readonly messages: boolean
}) =>
  Effect.gen(function* () {
    const claim = yield* input.capability.claim(input.services, {
      runId: input.runId,
      commandId: `run-wait-claim:${input.waitId}`,
    })
    yield* input.services.store.suspend({
      ...claim,
      waits: [
        {
          waitId: input.waitId,
          status: "open" as const,
          openedAt: "2026-01-01T00:00:00.000Z",
          reason: {
            _tag: "AwaitEvent" as const,
            filter: {
              _tag: "Run" as const,
              runs: input.runs,
              messages: input.messages,
              commandId: input.commandId,
            },
            deadline: DateTime.formatIso(DateTime.makeUnsafe(4102444800000)),
          },
        },
      ],
      suspension: toolSuspension([input.waitId]),
    })
  })

const message = (input: { readonly runId: string; readonly fromRunId: string; readonly idempotencyKey: string }) => {
  const request = {
    runId: input.runId,
    idempotencyKey: input.idempotencyKey,
    prompt: Prompt.make("question from the child"),
    policy: "steer" as const,
    from: { runId: input.fromRunId },
  }
  return { ...request, digest: digest(request) }
}

const complete = (services: Services, capability: RuntimeCapability, runId: string, sessionId: string) =>
  Effect.gen(function* () {
    const claim = yield* capability.claim(services, { runId, commandId: `run-wait-complete:${runId}` })
    yield* services.store.complete({
      ...claim,
      commandId: `run-wait-complete:${runId}:result`,
      result: {
        text: "child settled",
        output: "child settled",
        turns: 1,
        session: { sessionId, leafId: null },
      },
    })
  })

const ids = (name: string, suffix: string) => {
  const prefix = `conformance:${name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}:run-waits:${suffix}`
  return { prefix, sessionId: `session:${prefix}` }
}

/** Shared message-or-settlement wait scenarios, including provider-result barrier retries. */
export const registerRunWaits = <LayerError, ClaimsLayerError>(input: {
  readonly options: Options<LayerError, ClaimsLayerError>
  readonly capability: RuntimeCapability
  readonly provide: Provide<LayerError>
}): void => {
  const { capability, options, provide } = input
  for (const early of [true, false]) {
    it.effect(
      `resumes one provider wait from a child message exactly once (${early ? "before" : "after"} registration)`,
      () =>
        provide((first) =>
          Effect.gen(function* () {
            const identity = ids(options.name, `message:${early}`)
            const parent = yield* first.runtime.send({
              to: options.address,
              sessionId: identity.sessionId,
              idempotencyKey: identity.prefix,
              prompt: "parent waiting",
            })
            const child = yield* first.runtime.spawn({
              parentRunId: parent.runId,
              invocationId: "message-child",
              selection: "researcher",
              sessionId: `${identity.sessionId}:child`,
              idempotencyKey: `${identity.prefix}:child`,
              prompt: "child asks",
            })
            const request = message({
              runId: parent.runId,
              fromRunId: child.runId,
              idempotencyKey: `${identity.prefix}:question`,
            })
            const messageReceipt = early ? yield* first.store.admitSteering(request) : undefined
            yield* waitFor({
              services: first,
              capability,
              runId: parent.runId,
              waitId: `${identity.prefix}:wait`,
              commandId: `${identity.prefix}:selector`,
              runs: [child.runId],
              messages: true,
            })
            const lateMessageReceipt = early ? undefined : yield* first.store.admitSteering(request)
            return {
              parentRunId: parent.runId,
              childRunId: child.runId,
              childSessionId: `${identity.sessionId}:child`,
              request,
              waitId: `${identity.prefix}:wait`,
              selector: `${identity.prefix}:selector`,
              messageReceipt: messageReceipt ?? lateMessageReceipt,
            }
          }).pipe(
            Effect.flatMap((state) =>
              provide((second) =>
                Effect.gen(function* () {
                  const execution = yield* second.store.loadExecution(state.parentRunId)
                  const resolution = execution.resolutions.find((entry) => entry.waitId === state.waitId)
                  expect(resolution).toMatchObject({
                    resolution: {
                      _tag: "ToolResult",
                      result: { _tag: "Message", cursor: 0 },
                    },
                  })
                  const consumed = (yield* second.runtime.history({ runId: state.parentRunId, limit: 100 })).filter(
                    (event) => event._tag === "SteeringConsumed",
                  )
                  expect(consumed).toHaveLength(1)
                  const replayed = yield* second.store.admitSteering(state.request)
                  expect(replayed.receipt).toEqual(state.messageReceipt?.receipt)
                  const claim = yield* capability.claim(second, {
                    runId: state.parentRunId,
                    commandId: `${state.selector}:retry-claim`,
                  })
                  yield* second.store.suspend({
                    ...claim,
                    waits: [
                      {
                        waitId: `${state.waitId}:retry`,
                        status: "open" as const,
                        openedAt: "2026-01-01T00:00:00.000Z",
                        reason: {
                          _tag: "AwaitEvent" as const,
                          filter: {
                            _tag: "Run" as const,
                            runs: [state.childRunId],
                            messages: true,
                            commandId: state.selector,
                          },
                          deadline: DateTime.formatIso(DateTime.makeUnsafe(4102444800000)),
                        },
                      },
                    ],
                    suspension: toolSuspension([`${state.waitId}:retry`]),
                  })
                  const retried = yield* second.store.loadExecution(state.parentRunId)
                  expect(retried.resolutions.find((entry) => entry.waitId === `${state.waitId}:retry`)).toMatchObject({
                    resolution: resolution?.resolution,
                  })
                  expect(
                    (yield* second.runtime.history({ runId: state.parentRunId, limit: 100 })).filter(
                      (event) => event._tag === "SteeringConsumed",
                    ),
                  ).toHaveLength(1)
                }),
              ),
            ),
          ),
        ),
    )
  }

  it.effect("chooses the earliest child settlement and preserves it across a fresh Layer", () =>
    provide((first) =>
      Effect.gen(function* () {
        const identity = ids(options.name, "settlement")
        const parent = yield* first.runtime.send({
          to: options.address,
          sessionId: identity.sessionId,
          idempotencyKey: identity.prefix,
          prompt: "parent waiting for children",
        })
        const child = yield* first.runtime.spawn({
          parentRunId: parent.runId,
          invocationId: "settlement-child",
          selection: "researcher",
          sessionId: `${identity.sessionId}:child`,
          idempotencyKey: `${identity.prefix}:child`,
          prompt: "child settles",
        })
        const sibling = yield* first.runtime.spawn({
          parentRunId: parent.runId,
          invocationId: "settlement-sibling",
          selection: "researcher",
          sessionId: `${identity.sessionId}:sibling`,
          idempotencyKey: `${identity.prefix}:sibling`,
          prompt: "sibling settles",
        })
        yield* waitFor({
          services: first,
          capability,
          runId: parent.runId,
          waitId: `${identity.prefix}:wait`,
          commandId: `${identity.prefix}:selector`,
          runs: [child.runId, sibling.runId],
          messages: false,
        })
        return { parentRunId: parent.runId, child, sibling, identity }
      }).pipe(
        Effect.flatMap((state) =>
          provide((second) =>
            Effect.gen(function* () {
              yield* complete(second, capability, state.sibling.runId, `${state.identity.sessionId}:sibling`)
              yield* complete(second, capability, state.child.runId, `${state.identity.sessionId}:child`)
              const resolution = (yield* second.store.loadExecution(state.parentRunId)).resolutions.find(
                (entry) => entry.waitId === `${state.identity.prefix}:wait`,
              )
              expect(resolution).toMatchObject({
                resolution: {
                  result: { _tag: "RunSettled", runId: state.sibling.runId },
                },
              })
              const resumed = (yield* second.runtime.history({ runId: state.parentRunId, limit: 100 })).filter(
                (event) => event._tag === "RunResumed",
              )
              expect(resumed).toHaveLength(1)
            }),
          ),
        ),
      ),
    ),
  )

  it.effect("rejects a message forged from an unrelated Run before writing the inbox", () =>
    provide((services) =>
      Effect.gen(function* () {
        const identity = ids(options.name, "authorization")
        const parent = yield* services.runtime.send({
          to: options.address,
          sessionId: identity.sessionId,
          idempotencyKey: identity.prefix,
          prompt: "authorization parent",
        })
        const outsider = yield* services.runtime.send({
          to: options.address,
          sessionId: `${identity.sessionId}:outsider`,
          idempotencyKey: `${identity.prefix}:outsider`,
          prompt: "unrelated",
        })
        const request = message({
          runId: parent.runId,
          fromRunId: outsider.runId,
          idempotencyKey: `${identity.prefix}:forged`,
        })
        const target = yield* services.store.directory(parent.runId)
        const error = yield* services.runtime
          .sendMessage({
            fromRunId: outsider.runId,
            to: target.address,
            idempotencyKey: request.idempotencyKey,
            prompt: request.prompt,
          })
          .pipe(Effect.flip)
        expect(error._tag).toBe("generalist/runtime/NotInFamily")
        expect(yield* services.store.pendingSteering({ runId: parent.runId, limit: 64 })).toEqual([])
      }),
    ),
  )

  it.effect("keeps a wait timeout local and accepts a late settlement without a second provider result", () =>
    provide((services) =>
      Effect.gen(function* () {
        const identity = ids(options.name, "timeout")
        const parent = yield* services.runtime.send({
          to: options.address,
          sessionId: identity.sessionId,
          idempotencyKey: identity.prefix,
          prompt: "timeout parent",
        })
        const child = yield* services.runtime.spawn({
          parentRunId: parent.runId,
          invocationId: "timeout-child",
          selection: "researcher",
          sessionId: `${identity.sessionId}:child`,
          idempotencyKey: `${identity.prefix}:child`,
          prompt: "late child",
        })
        const waitId = `${identity.prefix}:wait`
        const claim = yield* capability.claim(services, { runId: parent.runId, commandId: `${waitId}:claim` })
        yield* services.store.suspend({
          ...claim,
          waits: [
            {
              waitId,
              status: "open" as const,
              openedAt: "2026-01-01T00:00:00.000Z",
              reason: {
                _tag: "AwaitEvent" as const,
                filter: { _tag: "Run" as const, runs: [child.runId], messages: false, commandId: `${waitId}:selector` },
                deadline: "1970-01-01T00:00:01.000Z",
              },
            },
          ],
          suspension: toolSuspension([waitId]),
        })
        const due = yield* services.store.dueAwaitEvents({ now: Date.parse("2026-01-01T00:00:02.000Z"), limit: 10 })
        expect(due).toHaveLength(1)
        yield* TestClock.adjust("2 seconds")
        expect(yield* services.store.timeoutAwaitEvent({ ...due[0]!, commandId: `${waitId}:timeout` })).toBe(true)
        const timedOut = (yield* services.store.loadExecution(parent.runId)).resolutions.find(
          (entry) => entry.waitId === waitId,
        )
        expect(timedOut).toMatchObject({ resolution: { result: { _tag: "Timeout" } } })
        yield* complete(services, capability, child.runId, `${identity.sessionId}:child`)
        const lateClaim = yield* capability.claim(services, { runId: parent.runId, commandId: `${waitId}:late-claim` })
        yield* services.store.suspend({
          ...lateClaim,
          waits: [
            {
              waitId: `${waitId}:late`,
              status: "open" as const,
              openedAt: "2026-01-01T00:00:00.000Z",
              reason: {
                _tag: "AwaitEvent" as const,
                filter: {
                  _tag: "Run" as const,
                  runs: [child.runId],
                  messages: false,
                  commandId: `${waitId}:late-selector`,
                },
                deadline: DateTime.formatIso(DateTime.makeUnsafe(4102444800000)),
              },
            },
          ],
          suspension: toolSuspension([`${waitId}:late`]),
        })
        const late = (yield* services.store.loadExecution(parent.runId)).resolutions.find(
          (entry) => entry.waitId === `${waitId}:late`,
        )
        expect(late).toMatchObject({ resolution: { result: { _tag: "RunSettled", runId: child.runId } } })
        expect(
          (yield* services.runtime.history({ runId: parent.runId, limit: 100 })).filter(
            (event) => event._tag === "RunResumed",
          ),
        ).toHaveLength(2)
      }),
    ),
  )
}
