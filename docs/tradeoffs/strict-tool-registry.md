# Strict tool registry

Validating ordered tool declarations before toolkit construction gives one schema, policy subject, handler, and origin per name. The cost is that duplicates already erased inside a pre-built Effect AI toolkit cannot be recovered; callers that need full collision evidence pass ordered tools to the Agent.

Replacing Effect AI toolkits was rejected because it would create a second tool model.
