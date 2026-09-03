# Co-edit

This offline example serves one browser editor and a Generalist Host from the same Bun server. The page joins `plan.md` over WebSocket as a human peer. A scripted `TestModel` agent reads the resulting version, edits it through `Artifact.tool`, and streams its attributed update back to the page.

```bash
bun run --cwd packages/generalist build
bun run --cwd examples/co-edit start
```

The command opens an actual WebSocket, applies one human edit, runs the agent, verifies the converged document, and exits. No model credentials are required. To try the page interactively, keep the same server Layer running instead of disposing the example after its scripted check.
