# Memory

This example runs two independent agent calls with the same host-selected
memory key. Supermemory stores the first session's terminal exchange and recalls
it for the second session. Amazon Bedrock supplies the language model.

```bash
export SUPERMEMORY_API_KEY=sm_...
export AWS_REGION=us-east-1
bun --cwd examples/memory start
```

AWS uses its normal credential chain. The Supermemory container is
`user-ada`; use a different container per tenant.
