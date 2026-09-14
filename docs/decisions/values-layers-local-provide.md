# Values, layers, and local provide

Features follow one composition pattern: configuration is a plain value, capabilities are Layers, and selection happens by local `Effect.provide` at the site that owns the choice. Strings name things only when identity is genuinely dynamic — a model id read from an environment variable, a tenant, a user session.

Providers and models are separate layers. An external Effect AI provider layer supplies the client; its model layer pins one model id and yields `LanguageModel`. A run receives that model with local `Effect.provide`. Changing a model or provider changes the Layer at the application boundary rather than the Agent definition. Child agents inherit the ambient model by default and can select another through the provider-neutral model selection contract, so a supervisor can run a specialist on another model without embedding a vendor SDK in Generalist.

Capabilities that were previously ambient or optional-with-silent-defaults become explicit layers that fail fast when required and absent. A tooled agent with no `Permissions`/`Approvals` policy fails at setup with an `AgentError` naming the fix instead of guessing an intent. `WorkingMemory` summarization takes a model layer on the option instead of a bespoke service. Compaction truncate is a layer (`layerTruncate`, `layerTruncateEstimated`) so its `Tokenizer` requirement is visible in the type.

The rejected alternative is a registry of named capabilities with string selection at use sites: it hides requirements from the type, defers misconfiguration from layer construction to run time, and forces every caller to agree on global names. Local provide keeps the dependency graph in the type signature and the choice at the call site that owns it.
