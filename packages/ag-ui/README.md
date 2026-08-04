# @batonfx/ag-ui

Effect-native projection of canonical `@batonfx/runtime` runs into AG-UI 0.0.57 events.

```ts
import { AgUi } from "@batonfx/ag-ui"

const AgUiLive = AgUi.layer({ address: assistantAddress }).pipe(Layer.provide(RuntimeLive))
```

`AgUi.run(input)` treats AG-UI input as untrusted. It accepts only the final user message, preserves `runId`, maps `threadId` to the Runtime session, rejects client tools and authority-bearing roles, and resumes only the exact open Runtime wait. Runtime events remain the canonical persisted history.
