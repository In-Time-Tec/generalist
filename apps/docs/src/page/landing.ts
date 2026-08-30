import { Option } from "effect"
import { type Html, inertHtml as ih } from "foldkit/html"

import {
  codeBlock,
  codeBlockContent,
  codeBlockCopyButton,
  codeBlockHeader,
  codeBlockTitle,
} from "@/components/ui/code-block"
import { cn } from "@/lib/styles"

import oneTurn from "virtual:source/src/snippets/landing/one-turn.ts"

import { ClickedCopyCode } from "../app/message"
import type { Model } from "../app/model"
import { betaBadge, mark } from "../layout/brand"
import { check, close, github } from "../layout/icon"
import { githubUrl } from "../layout/shell"

const h = ih

const quickstartPath = "/docs/start/quickstart"
const agentLoopPath = "/docs/learn/agent-loop"
const installCommand = "bun add effect tenetkit"

const glyph = (symbol: string, offsetY?: string): Html =>
  h.div(
    [h.Class("pointer-events-none -my-[9rem] px-6 select-none md:-my-[13.5rem] md:px-12 lg:px-20"), h.AriaHidden(true)],
    [
      h.div(
        [h.Class("mx-auto max-w-6xl")],
        [
          h.span(
            [
              h.DataAttribute("glyph", symbol),
              h.Class(
                cn(
                  "relative -z-10 inline-block -translate-x-1/4 font-mono text-[18rem] leading-none font-extrabold whitespace-nowrap text-accent-200/18 md:text-[27rem] dark:text-accent-400/4",
                  offsetY,
                ),
              ),
            ],
            [],
          ),
        ],
      ),
    ],
  )

const accent = (text: string): Html => h.span([h.Class("text-accent-600 dark:text-accent-500")], [text])

const sectionHeading = (text: string): Html =>
  h.h2([h.Class("text-3xl font-light tracking-tight text-gray-900 md:text-4xl dark:text-white")], [text])

const commandBlock = (model: Model, label: string, source: string): Html =>
  codeBlock({ language: "bash", class: "rounded-lg" }, [
    codeBlockHeader({}, [
      codeBlockTitle({}, [label]),
      codeBlockCopyButton({
        isCopied: Option.contains(model.copiedCode, source),
        onCopied: ClickedCopyCode({ source }),
      }),
    ]),
    codeBlockContent({ code: source, language: "bash" }),
  ])

const ctaRow = (): Html =>
  h.div(
    [h.Class("flex flex-wrap gap-3")],
    [
      h.a([h.Href(quickstartPath), h.Class("cta-primary")], ["Get started"]),
      h.a([h.Href(agentLoopPath), h.Class("cta-secondary")], ["Read the loop contract"]),
    ],
  )

const heroSection = (model: Model): Html =>
  h.section(
    [h.Class("landing-section")],
    [
      h.div(
        [h.Class("landing-section-narrow")],
        [
          h.div(
            [h.Class("flex flex-wrap items-center gap-4")],
            [
              mark("size-12 md:size-14"),
              h.h1(
                [h.Class("text-5xl font-light tracking-tight text-gray-900 md:text-6xl lg:text-7xl dark:text-white")],
                ["TenetKit"],
              ),
              betaBadge("px-2 py-1 text-xs"),
            ],
          ),
          h.p(
            [h.Class("mt-6 text-2xl font-light text-gray-900 md:text-3xl dark:text-white")],
            ["A TypeScript framework for building AI ", accent("agents"), " on Effect."],
          ),
          h.p(
            [h.Class("mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400")],
            [
              "An agent is a plain Effect value: instructions, typed tools, a turn policy. A run is a stream of typed events you fold, persist, or forward. Every seam (model, tools, approvals, permissions) is an Effect service with a deterministic test layer, so you can assert an agent's behavior in CI with zero API keys.",
            ],
          ),
          h.div([h.Class("mt-8 max-w-xl")], [commandBlock(model, "Install", installCommand)]),
          h.div([h.Class("mt-8")], [ctaRow()]),
        ],
      ),
    ],
  )

const pairSection = (): Html =>
  h.section(
    [h.Class("landing-section")],
    [
      h.div(
        [h.Class("landing-section-narrow")],
        [
          h.div(
            [h.Class("rounded-lg border border-gray-300 bg-cream/60 p-6 dark:border-gray-700 dark:bg-gray-850")],
            [
              h.p([h.Class("font-medium text-gray-900 dark:text-white")], ["One agent, two execution modes."]),
              h.p(
                [h.Class("mt-2 text-gray-600 dark:text-gray-400")],
                [
                  h.strong([h.Class("text-gray-900 dark:text-white")], ["tenetkit"]),
                  " defines the agent loop and its Effect services. Run it directly for process-local work, or add ",
                  h.a(
                    [
                      h.Href("/docs/learn/native-runtime"),
                      h.Class("font-medium text-accent-600 underline underline-offset-4 dark:text-accent-400"),
                    ],
                    ["tenetkit/runtime"],
                  ),
                  " for addressable runs, canonical event replay, durable waits, and memory, SQLite, PostgreSQL, or MySQL storage.",
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  )

const pillarCard = (title: string, body: string): Html =>
  h.div(
    [h.Class("rounded-lg border border-gray-300 bg-cream/60 p-6 dark:border-gray-700 dark:bg-gray-850")],
    [
      h.h3([h.Class("text-lg font-medium text-gray-900 dark:text-white")], [title]),
      h.p([h.Class("mt-2 text-gray-600 dark:text-gray-400")], [body]),
    ],
  )

const promiseSection = (): Html =>
  h.section(
    [h.Class("landing-section")],
    [
      h.div(
        [h.Class("landing-section-narrow")],
        [
          sectionHeading("An agent is a value."),
          h.p(
            [h.Class("mt-4 max-w-3xl text-lg text-gray-600 dark:text-gray-400")],
            [
              "You define an agent the way you define any Effect value, run it with the layers you choose, and observe it as a typed event stream. Turn iteration, permissions, approvals, steering, memory, skills, and multi-agent composition are in the box; storage, transport clients, and deployment stay yours.",
            ],
          ),
          h.div(
            [h.Class("mt-10 grid gap-4 md:grid-cols-3")],
            [
              pillarCard(
                "One payload vocabulary",
                "Ai.Prompt in, Ai.Response out, end to end. No translation layer between your code and the model.",
              ),
              pillarCard(
                "Explicit seams",
                "ToolExecutor, Approvals, TurnPolicy, and ModelRegistry are Effect services with test layers.",
              ),
              pillarCard(
                "Native durability",
                "tenetkit/runtime persists addressable runs and their canonical event streams in the store you choose.",
              ),
            ],
          ),
        ],
      ),
    ],
  )

const checkItem = (text: string): Html =>
  h.li(
    [h.Class("flex items-start gap-3")],
    [
      check("mt-1 size-4 shrink-0 text-accent-600 dark:text-accent-500"),
      h.span([h.Class("text-gray-700 dark:text-gray-300")], [text]),
    ],
  )

const crossItem = (text: string): Html =>
  h.li(
    [h.Class("flex items-start gap-3")],
    [
      close("mt-1 size-4 shrink-0 text-gray-400 dark:text-gray-500"),
      h.span([h.Class("text-gray-700 dark:text-gray-300")], [text]),
    ],
  )

const builtOnEffectSection = (): Html =>
  h.section(
    [h.Class("landing-section")],
    [
      h.div(
        [h.Class("landing-section-narrow")],
        [
          sectionHeading("Built on Effect AI. Nothing else underneath."),
          h.ul(
            [h.Class("mt-8 space-y-4 text-lg")],
            [
              checkItem("The loop is an Effect you compose and provide"),
              checkItem("Payloads are Ai.Prompt and Ai.Response from effect/unstable/ai"),
              checkItem("Every seam ships a deterministic test layer"),
              checkItem("Suspension is a typed error carrying a resume token, not a callback"),
            ],
          ),
        ],
      ),
    ],
  )

const traceRow = (label: string, indent: string, isAccented: boolean): Html =>
  h.div(
    [
      h.Class(
        cn(
          "rounded-md border px-3 py-2",
          indent,
          isAccented
            ? "border-accent-600/40 bg-accent-100/60 text-accent-700 dark:border-accent-500/40 dark:bg-accent-900/30 dark:text-accent-400"
            : "border-gray-300 bg-cream text-gray-700 dark:border-gray-700 dark:bg-gray-850 dark:text-gray-300",
        ),
      ),
    ],
    [label],
  )

const tracePanel = (): Html =>
  h.div(
    [h.Class("rounded-lg border border-gray-300 p-4 dark:border-gray-700")],
    [
      h.div(
        [h.Class("grid gap-2 font-mono text-xs")],
        [
          traceRow("Ai.Prompt", "", true),
          traceRow("Agent.stream", "ml-5", false),
          traceRow("ToolExecutor / Approvals / Permissions", "ml-10", true),
          traceRow("Ai.Response", "ml-5", false),
          traceRow("AgentEvent stream", "", true),
        ],
      ),
      h.p(
        [h.Class("mt-4 text-sm text-gray-600 dark:text-gray-400")],
        ["Turn 0 always runs; follow-up turns are policy-gated."],
      ),
    ],
  )

const showTheCodeSection = (model: Model): Html =>
  h.section(
    [h.Class("landing-section")],
    [
      h.div(
        [h.Class("landing-section-narrow")],
        [
          sectionHeading("See one turn."),
          h.div(
            [h.Class("mt-10 grid items-start gap-6 lg:grid-cols-[3fr_2fr]")],
            [
              codeBlock({ language: "typescript", class: "rounded-lg" }, [
                codeBlockHeader({}, [
                  codeBlockTitle({}, ["one-turn.ts"]),
                  codeBlockCopyButton({
                    isCopied: Option.contains(model.copiedCode, oneTurn),
                    onCopied: ClickedCopyCode({ source: oneTurn }),
                  }),
                ]),
                codeBlockContent({ code: oneTurn, language: "typescript" }),
              ]),
              tracePanel(),
            ],
          ),
        ],
      ),
    ],
  )

type FeatureCard = Readonly<{
  symbol: string
  title: string
  body: string
  href: string
}>

const featureCards: ReadonlyArray<FeatureCard> = [
  {
    symbol: "=>",
    title: "Agent loop",
    body: "Turn 0 always runs; TurnPolicy gates every turn after it.",
    href: "/docs/learn/agent-loop",
  },
  {
    symbol: "||",
    title: "Suspension",
    body: "Pause on a pending approval and resume with a decision.",
    href: "/docs/learn/suspension",
  },
  {
    symbol: "::",
    title: "Sessions and history",
    body: "Every run emits an ordered AgentEvent stream you can persist.",
    href: "/docs/learn/sessions-and-history",
  },
  {
    symbol: "?=",
    title: "Permissions",
    body: "Tool calls pass a permission check before they execute.",
    href: "/docs/guides/permissions",
  },
  {
    symbol: "~>",
    title: "Steering",
    body: "Inject user messages into a live run between turns.",
    href: "/docs/guides/steering",
  },
  {
    symbol: "{ }",
    title: "Compaction",
    body: "Trim history with a strategy you choose, not a vendor default.",
    href: "/docs/guides/compaction",
  },
  {
    symbol: "[+]",
    title: "Multi-agent",
    body: "Compose agents as tools of other agents in one process.",
    href: "/docs/guides/multi-agent",
  },
  {
    symbol: ">>",
    title: "Transport",
    body: "Serve the loop over HTTP with the same event vocabulary.",
    href: "/docs/guides/serve-transport",
  },
]

const featureCardView = (card: FeatureCard): Html =>
  h.a(
    [
      h.Href(card.href),
      h.Class(
        "group rounded-lg border border-gray-300 p-5 transition hover:border-accent-600/60 hover:bg-gray-100/60 dark:border-gray-700 dark:hover:border-accent-500/60 dark:hover:bg-gray-800/60",
      ),
    ],
    [
      h.p([h.Class("font-mono text-sm font-bold text-accent-600 dark:text-accent-500")], [card.symbol]),
      h.h3(
        [
          h.Class(
            "mt-2 font-medium text-gray-900 group-hover:text-accent-600 dark:text-white dark:group-hover:text-accent-400",
          ),
        ],
        [card.title],
      ),
      h.p([h.Class("mt-1 text-sm text-gray-600 dark:text-gray-400")], [card.body]),
    ],
  )

const featuresSection = (): Html =>
  h.section(
    [h.Class("landing-section")],
    [
      h.div(
        [h.Class("landing-section-narrow")],
        [
          sectionHeading("The seams, page by page."),
          h.div([h.Class("mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4")], featureCards.map(featureCardView)),
        ],
      ),
    ],
  )

const honestySection = (): Html =>
  h.section(
    [h.Class("landing-section")],
    [
      h.div(
        [h.Class("landing-section-narrow grid gap-10 md:grid-cols-2")],
        [
          h.div(
            [],
            [
              h.h2(
                [h.Class("text-2xl font-light tracking-tight text-gray-900 dark:text-white")],
                ["What's the catch?"],
              ),
              h.p(
                [h.Class("mt-4 text-gray-600 dark:text-gray-400")],
                [
                  "The tenetkit agent loop is process-local. Durable execution is explicit rather than hidden: add tenetkit/runtime and choose SQLite for one process or PostgreSQL/MySQL for multi-worker execution.",
                ],
              ),
              h.p(
                [h.Class("mt-4 text-gray-600 dark:text-gray-400")],
                [
                  "For addressable runs, replay, waits, recovery, and store choices, see ",
                  h.a(
                    [
                      h.Href("/docs/learn/native-runtime"),
                      h.Class("font-medium text-accent-600 underline underline-offset-4 dark:text-accent-400"),
                    ],
                    ["the native Runtime"],
                  ),
                  ".",
                ],
              ),
            ],
          ),
          h.div(
            [],
            [
              h.h2([h.Class("text-2xl font-light tracking-tight text-gray-900 dark:text-white")], ["Who it's for"]),
              h.ul(
                [h.Class("mt-4 space-y-3")],
                [
                  checkItem("Effect apps that need a composable agent loop"),
                  checkItem("Teams that need durable, addressable agent runs without a hosted platform"),
                  crossItem("A general-purpose workflow engine"),
                  crossItem("Non-Effect codebases"),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  )

const finalCtaSection = (model: Model): Html =>
  h.section(
    [h.Class("landing-section")],
    [
      h.div(
        [h.Class("landing-section-narrow")],
        [
          sectionHeading("Run your first turn."),
          h.div([h.Class("mt-8 max-w-xl")], [commandBlock(model, "Install", installCommand)]),
          h.div(
            [h.Class("mt-8 flex flex-wrap gap-3")],
            [
              h.a([h.Href(quickstartPath), h.Class("cta-primary")], ["Get started"]),
              h.a(
                [h.Href(githubUrl), h.Target("_blank"), h.Rel("noreferrer"), h.Class("cta-secondary")],
                [github("size-4"), "View on GitHub"],
              ),
            ],
          ),
        ],
      ),
    ],
  )

export const landing = (model: Model): Html =>
  h.main(
    [h.Id("main-content"), h.Class("isolate overflow-x-hidden")],
    [
      heroSection(model),
      pairSection(),
      glyph("( )"),
      promiseSection(),
      glyph("=>"),
      builtOnEffectSection(),
      glyph("~>"),
      showTheCodeSection(model),
      glyph("{ }", "-translate-y-1/4"),
      featuresSection(),
      glyph("??"),
      honestySection(),
      glyph("...", "-translate-y-1/3"),
      finalCtaSection(model),
    ],
  )
