# Structured output

`RunOptions.output` adds one schema-decoded terminal model turn after the ordinary agent loop settles. The run keeps its accumulated text and transcript while returning a typed `value`.

## Usage

```ts
import { Effect, Schema } from "effect"
import { Agent } from "generalist"

const Answer = Schema.Struct({ city: Schema.String, temperatureC: Schema.Number })
const weather = Agent.make({ name: "weather" })

const program = Agent.generate(weather, {
  prompt: "What is the weather in Paris?",
  output: {
    schema: Answer,
    name: "weather_answer",
    prompt: "Return the city and temperature.",
  },
}).pipe(Effect.map((result) => result.value))
// program succeeds with { city: "Paris", temperatureC: 21 }
```

## What runs

```text
Agent.generate(weather, output: Answer)
└── ordinary loop
    ├── turn 0: model and tools → text "It is 21°C."
    └── loop settles
        └── turn 1: generateObject (purpose: structured-output)
            ├── prompt: completed transcript + output.prompt
            ├── schema: Answer; toolChoice: "none"
            ├── decode → { city: "Paris", temperatureC: 21 }
            ├── StructuredOutput(turn: 1, value: {...})
            └── Completed(turns: 2, text: "It is 21°C.")
```

## Failure paths

```text
ordinary loop settles
├── output absent + no committed text
│   └── RunEndedWithoutOutput
└── output present
    └── terminal model call
        ├── model/schema/persistence failure → AgentError(turn: 1)
        ├── replay content decode failure → DriverStateInvalid
        └── defect or interruption → preserved cause
```

`RunEndedWithoutOutput` records the provider finish reason when available, plus observed provider text and reasoning character counts. A structured run judges success by the schema value instead, so `Completed.text` may be empty.

## Invariants

- The API is exposed through the `Agent` namespace from `generalist`.
- `output.schema` is an Effect Schema object codec; `Agent.generate` returns its decoded type as `ObjectResult.value`.
- `output.name` defaults to `"output"`.
- `output.prompt` defaults to `"Return the final structured output for the task above."`.
- The terminal call receives the completed transcript plus the output prompt and cannot call tools.
- Exactly one terminal structured value is exposed after the ordinary loop and queued follow-up input settle.
- Follow-up input queued before the terminal call runs another ordinary turn first.
- Follow-up input accepted while the terminal call finishes invalidates that value, emits no `StructuredOutput` for it, runs the follow-up, and requests a new terminal value.
- The terminal turn is lazy and starts only when its stream is consumed.
- Schema decoding happens before `StructuredOutput` is emitted.
- `StructuredOutput` carries `turn`, `modelCallId`, `modelAttemptId`, `attempt`, decoded `value`, normalized response `content`, and optional `metadata`.
- On success, `StructuredOutput` is immediately before `Completed`; both are required by `Agent.generate`.
- The terminal prompt and response are included in the completed transcript.
- Structured-call usage contributes to total usage, and the terminal turn counts toward `Completed.turns`.
- A plain run requires committed assistant text; a structured run may complete with empty accumulated text.
- Terminal model or schema failures emit neither `StructuredOutput` nor `Completed`.
- Model resilience applies to the terminal call according to its error classification.
- Encoding terminal response content for durable persistence fails with `AgentError`; decoding it during replay fails with `DriverStateInvalid`.

## Related

- Source: `packages/generalist/src/core/agent/service.ts`, `packages/generalist/src/core/agent/loop/service.ts`, `packages/generalist/src/core/agent/model-turn/finish.ts`
- Site: `/docs/guides/structured-output`
