# Structured Output

`Agent.streamObject` and `Agent.generateObject` run the normal loop first, then ask for one terminal schema-validated structured output turn. Tool use still belongs to the loop; the structured-output turn is terminal and does not execute tools.

The schema is an Effect `Schema` codec. Invalid model output fails loudly instead of returning untyped data.

Runnable workflow: [`../../../examples/structured-extraction/README.md`](../../../examples/structured-extraction/README.md).
