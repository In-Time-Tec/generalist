# Model middleware and guardrails

`ModelMiddleware` transforms each composed prompt before a model call and each streamed part before the agent loop accepts it. `Guardrail` builds middleware for validation, redaction, and filtering; both namespaces are exported by `generalist`.

## Usage

```ts
import { Guardrail, ModelMiddleware } from "generalist"
const email = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g
export const guardrails = ModelMiddleware.layer([
  // Earlier transformations are visible to later middleware.
  Guardrail.redactInput({ pattern: email }),
  Guardrail.redactOutput({ pattern: email }),
  Guardrail.filterOutput((part) => part.type !== "reasoning-delta"),
])
```

Provide `guardrails` with the other Layers used to run the agent. The input and output redactors both default to `[redacted]`.

## What runs

```text
Agent.run()
└── model turn { agentName: "support", turn: 0 }
    ├── compose Prompt
    ├── transformPrompt()        middleware 1 → 2 → 3
    ├── LanguageModel.streamText()
    └── each Response.StreamPart
        ├── transformPart()      middleware 1 → 2 → 3
        ├── validate transformed tool call, if any
        └── accepted part
            ├── fold into completed response
            ├── emit ModelPart
            └── persist authoritative transcript
```

An omitted hook is an identity operation. `Option.none()` from `transformPart` drops a non-tool-call part and skips the remaining middleware for that part.

## Data flow

```text
Prompt user text
"Email ada@example.com"
        │ redactInput()
        ▼
"Email [redacted]"             → model

text-delta "Ask ada@example.com"
        │ redactOutput()
        ▼
text-delta "Ask [redacted]"    → event, response, transcript
```

`redactInput` rewrites system text, user text parts, assistant text and reasoning, and tool-approval reasons. It leaves files, tool-call parameters, and tool results unchanged. `redactOutput` rewrites only `text-delta` parts.

## Failure paths

```text
transformPrompt()
├── validateInput() → Option.some("PII")
│   └── AgentError("Input guardrail blocked: PII")
└── recalled-message lineage changed
    └── MiddlewareViolation { turn: 0, detail: ... }
transformPart(tool-call)
├── Option.none()                  → MiddlewareViolation
├── replacement is not tool-call  → MiddlewareViolation
└── invalid tool parameters       → MiddlewareViolation
```

`MiddlewareViolation` records the turn and a detail string. Any `AgentError` returned by a middleware hook aborts the run; input validation fails before model invocation.

## Invariants

- `transformPrompt` runs on the composed prompt before every model turn, not only the first.
- `transformPart` runs on every provider stream part before folding, emission, or persistence.
- Both hooks receive `{ agentName, turn }` as `ModelMiddleware.TurnContext`.
- Middleware runs in array order; each hook sees the preceding hook's result.
- The first dropped part short-circuits the rest of the chain and enters no model event, committed response, or transcript.
- Tool-call parts may be transformed but cannot be dropped or changed into another part type.
- Every transformed tool call is decoded and its parameters validated against the selected tool before execution.
- Each prompt hook must retain every recalled-memory lineage exactly once and must not assign that lineage to another message.
- `Guardrail.redactInput` preserves recalled-message lineage while replacing its text.
- `Guardrail.validateInput` allows `Option.none()` and rejects `Option.some(reason)` with an `AgentError` whose message starts with `Input guardrail blocked:`.
- `Guardrail.filterOutput` uses a synchronous predicate for non-tool-call parts; tool calls pass without invoking it.
- `ModelMiddleware.layerIdentity` is an empty chain; an absent `ModelMiddleware` service has the same behavior.

## Related

- Source: `packages/generalist/src/core/model/middleware.ts`, `packages/generalist/src/core/policy/guardrail.ts`
- Site: `/docs/guides/middleware`
