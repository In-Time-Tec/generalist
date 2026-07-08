import * as Prose from "../../prose"

export const comparisons = Prose.definePage({
  path: "/docs/learn/comparisons",
  title: "Batonfx vs raw Effect AI, AI SDK, and Mastra",
  navTitle: "Comparisons",
  group: "Learn",
  description:
    "An honest comparison with raw effect/unstable/ai, Vercel's AI SDK, and Mastra: what each is for, and when each is the right choice.",
  content: [
    Prose.p(
      "Batonfx is narrower than the frameworks it gets compared to, on purpose. It is an Effect-native agent loop with typed tools, typed errors, and Effect services as its only extension mechanism — not a general JavaScript AI toolkit and not an application framework. This page draws both comparisons honestly, including when to pick the other tool.",
    ),
    Prose.h2("batonfx-vs-raw-effect-ai", "Batonfx vs raw effect/unstable/ai"),
    Prose.p(
      "The strongest objection an Effect team can raise is also the easiest to answer: why not use ",
      Prose.code("effect/unstable/ai"),
      " directly? You should — Batonfx's payloads are its payloads, unmodified. Effect AI is a provider abstraction: a unified ",
      Prose.code("LanguageModel"),
      ", typed toolkits, and streaming. It resolves tool calls within a single generation — it even flags tools that need approval — but it models the model, not the agent: nothing decides when to take another turn, what a tool may do, who resolves an approval request, or how any of it is tested. That is the layer Batonfx is: ",
      Prose.code("Agent.stream"),
      " owns the iteration, and every decision an agent makes (execution, permissions, approvals, ",
      Prose.link("/docs/learn/suspension", "suspension"),
      ", steering, compaction) is an Effect service you provide or omit. The relationship is deliberately one-directional: Batonfx's payloads are Effect AI's payloads unmodified, and as ",
      Prose.code("effect/unstable/ai"),
      " grows — deeper tool resolution, richer approvals, loop helpers — Batonfx adopts it and moves its own floor up rather than competing with it. If a single model call with tools is all you need, use Effect AI directly and skip the framework — Batonfx starts paying for itself the moment a model call becomes an agent.",
    ),
    Prose.h2("batonfx-vs-ai-sdk", "Batonfx vs Vercel AI SDK"),
    Prose.p(
      "AI SDK is a broad JavaScript AI toolkit: provider APIs, UI-oriented streaming conventions, and framework bindings, designed to feel at home in a React or Next.js codebase. The differences that matter are architectural rather than a feature checklist.",
    ),
    Prose.bullets(
      [
        Prose.strong("Loop ownership."),
        " AI SDK resolves tool calls inside its client abstractions and hands you callbacks around the edges. Batonfx owns the loop explicitly: one primitive, ",
        Prose.code("Agent.stream"),
        ", emits a closed nine-event union you can fold, persist, or forward — the loop's internals are the public API (",
        Prose.link("/docs/learn/agent-loop", "The agent loop"),
        ").",
      ],
      [
        Prose.strong("Typed suspension."),
        " Human-in-the-loop in callback designs is your problem to model. Batonfx models it as ",
        Prose.code("AgentSuspended"),
        " on the error channel with a token-and-resume contract (",
        Prose.link("/docs/learn/suspension", "Suspension as a typed error"),
        ").",
      ],
      [
        Prose.strong("Effect services vs callbacks."),
        " AI SDK extension points are options and hooks. Batonfx extension points are Effect services with layers, so tests swap the model, the executor, and the approval gate without mocking (",
        Prose.link("/docs/learn/seams-as-services", "Seams as services"),
        ").",
      ],
    ),
    Prose.p(
      "Pick AI SDK when your application is a React or Next.js product, you want its UI hooks and hosted-platform integrations, and Effect is not part of your stack. Pick Batonfx when your application is already Effect-based, or when typed service seams, scoped resources, and typed suspension are central to your architecture rather than nice-to-haves.",
    ),
    Prose.h2("batonfx-vs-mastra", "Batonfx vs Mastra"),
    Prose.p(
      "Mastra is an application framework for agents and workflows: it brings its own project structure, workflow engine, storage integrations, and deployment story, and it is productive precisely because it decides those things for you. Batonfx is a library of primitives — the loop, the tool-execution seam, approvals, memory, provider registration, transport, and UI adapters — that you compose directly inside your own Effect application.",
    ),
    Prose.bullets(
      [
        Prose.strong("Framework vs library."),
        " Mastra hosts your agent code inside its structure. Batonfx is imported into yours: your process, your layer graph, your deployment.",
      ],
      [
        Prose.strong("Persistence."),
        " Mastra ships storage for memory and workflow state. Batonfx is non-durable by design — persistence seams exist (",
        Prose.link("/docs/learn/sessions-and-history", "sessions and history"),
        "), but the durable implementations are host-owned, which is exactly how Relayfx provides durability without Batonfx carrying a database (",
        Prose.link("/docs/learn/baton-and-relay", "where durability lives"),
        ").",
      ],
      [
        Prose.strong("Workflows."),
        " Mastra includes a workflow engine. Batonfx has none and will not grow one; multi-step orchestration belongs to your application or a durable runtime.",
      ],
    ),
    Prose.p(
      "Pick Mastra when you want an integrated framework that decides project structure, storage, and workflow orchestration for you, and you are not building on Effect. Pick Batonfx when you want to compose primitives directly in an Effect app, provide your own layers, and keep durability outside the agent package.",
    ),
    Prose.h2("how-to-decide", "How to decide in one paragraph"),
    Prose.p(
      "If Effect is not in your stack, Batonfx is probably the wrong choice and either alternative will serve you better — that is the honest version. If Effect is your foundation, Batonfx gives you an agent loop that behaves like the rest of your codebase: services, layers, typed errors, and streams, with nothing bolted on. The fastest way to test the claim is ",
      Prose.link("/docs/start/quickstart", "the quickstart"),
      " — a tool-calling agent and a CI eval, no API key required.",
    ),
  ],
})
