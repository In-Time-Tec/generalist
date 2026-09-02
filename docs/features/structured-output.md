# Structured output

An Agent owns its input and output schemas. `Agent.run` encodes the input, runs the ordinary model/tool loop, and returns the value decoded through the Agent's output schema. Both schemas default to `Schema.String`.

## Usage

```ts
import { Schema } from "effect"
import { Agent } from "generalist"

const WeatherInput = Schema.Struct({ city: Schema.String })
const WeatherOutput = Schema.Struct({ city: Schema.String, temperatureC: Schema.Number })

const weather = Agent.make({
  name: "weather",
  input: WeatherInput,
  output: WeatherOutput,
  instructions: "Look up the weather, then return the requested fields.",
})

const program = Agent.run(weather, { city: "Paris" })
// Effect<{ city: string; temperatureC: number }, Agent.RunError, ...>
```

## What runs

```text
Agent.run(weather, { city: "Paris" })
├── encode input with WeatherInput
├── ordinary loop
│   ├── turn 0: model and tools
│   └── loop settles
└── terminal output turn (purpose: structured-output)
    ├── provider-native structured output, or the provider's submit-tool fallback
    ├── decode with WeatherOutput
    └── Completed { output: { city: "Paris", temperatureC: 21 } }
```

Callers choose neither provider mechanism nor a per-run output option. The framework uses the configured provider's structured-output path and exposes only the decoded value.

## Failure paths

```text
input encode fails
└── AgentError

terminal output turn
├── model or persistence failure → AgentError
├── schema decode failure → InvalidOutput { issues }
├── replay content failure → DriverStateInvalid
└── defect or interruption → preserved cause
```

## Invariants

- `Agent.make` stores `input` and `output`; each defaults to `Schema.String`.
- The static Agent type carries both schemas. `Agent.run` returns `output.Type`, and `Agent.stream` ends with `Completed<output.Type>`.
- Default string Agents return the completed assistant text without a separate output turn.
- A non-string output runs one terminal structured-output turn after ordinary loop turns and queued follow-up input settle.
- The terminal turn receives the completed transcript plus `Agent.defaultObjectPrompt` and cannot call application tools.
- Follow-up input accepted while the terminal call finishes invalidates that candidate, runs the follow-up, and requests a new terminal value.
- The terminal turn is lazy and starts only when its stream is consumed.
- Schema decoding completes before `Completed` is emitted. Invalid data fails with `InvalidOutput`; no terminal event is emitted.
- `Completed.output` is the only terminal typed-value event. There is no parallel `StructuredOutput` event.
- The terminal prompt and response are included in the completed transcript.
- Structured-call usage contributes to total usage, and the terminal turn counts toward `Completed.turns`.
- Model resilience applies to the terminal call according to its error classification.

## Related

- Source: `packages/generalist/src/core/agent/service.ts`, `packages/generalist/src/core/agent/loop/service.ts`, `packages/generalist/src/core/agent/model-turn/finish.ts`
- Site: `/docs/guides/structured-output`
