# AG-UI

This offline example serves a Generalist Host and a small AG-UI SSE route from one Bun server. Its plain-`fetch` client streams a run until the approval interrupt, posts the decision to the Host's existing approval route, and verifies that the run completes.

```bash
bun run --cwd packages/generalist build
bun run --cwd examples/ag-ui start
```

No CopilotKit or model credentials are required. Replace `scriptedModel` in `src/index.ts` with a live provider Layer to keep the same AG-UI and approval HTTP boundaries with a real model.
