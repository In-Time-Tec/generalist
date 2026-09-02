import { DateTime, Effect } from "effect"
import type { UnknownAgent } from "../../errors.js"
import { resolve as resolveRegisteredAgent, type RegisteredAgents } from "../../executable/registered-agent.js"
import type { Service as ExecutableResolver } from "../../executable/resolver.js"
import type { ExecutionClaim, Service as RunStore } from "../../run/store.js"

export const make = (options: {
  readonly agents: RegisteredAgents
  readonly resolver: ExecutableResolver
  readonly store: RunStore
}) => ({
  resolver: {
    resolve: (input: Parameters<ExecutableResolver["resolve"]>[0]) =>
      resolveRegisteredAgent(options.agents, options.resolver, input),
  },
  suspendUnknown: (claim: ExecutionClaim, error: UnknownAgent) =>
    DateTime.now.pipe(
      Effect.map(DateTime.formatIso),
      Effect.flatMap((openedAt) =>
        options.store.suspend({
          ...claim,
          waits: [
            {
              waitId: `agent:${error.name}`,
              reason: { _tag: "External", capability: "agent-registration" },
              status: "open",
              openedAt,
            },
          ],
          suspension: error,
        }),
      ),
    ),
})
