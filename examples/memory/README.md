# Memory

This example runs two independent agent calls with the same host-selected memory key. Supermemory stores the first session's terminal exchange and recalls it for the second session. Amazon Bedrock supplies the language model.

The memory store and model use separate credentials:

```bash
# Memory store
export SUPERMEMORY_API_KEY=sm_...

# Bedrock model (plus the normal AWS credential chain)
export AWS_REGION=us-east-1
bun --cwd examples/memory start
```

The Supermemory container is `user-ada`; use a different container per tenant.

The agent and memory code are provider-independent. To use OpenRouter instead, replace the Bedrock imports and `model` layer in `src/index.ts` with:

```ts
import { layerConfig, layerModel } from "generalist/providers/openrouter"

const model = layerModel({ model: "openai/gpt-4o-mini" }).pipe(
  Layer.provide(layerConfig({ apiKey: Config.redacted("OPENROUTER_API_KEY") })),
  Layer.provide(FetchHttpClient.layer),
)
```

Then set `OPENROUTER_API_KEY` instead of AWS credentials. `SUPERMEMORY_API_KEY` is still required because changing the model does not change the memory store.
