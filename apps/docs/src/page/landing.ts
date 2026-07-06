import type { Html } from "foldkit/html"
import { html } from "foldkit/html"

import { badge } from "@/components/ui/badge"
import { card, cardDescription, cardHeader, cardTitle } from "@/components/ui/card"
import { codeBlock, codeBlockContent } from "@/components/ui/code-block"

import type { Message } from "../app/message"
import { allDocsPages } from "../content/docs"

const h = html<Message>()

const tracePanel = (): Html =>
  h.div(
    [h.Class("rounded-md border bg-card p-4 text-sm shadow-sm")],
    [
      h.div(
        [h.Class("grid gap-2 font-mono text-xs")],
        [
          h.div([h.Class("rounded-md bg-muted px-3 py-2")], ["Ai.Prompt"]),
          h.div([h.Class("ml-6 rounded-md border px-3 py-2")], ["Agent.stream"]),
          h.div([h.Class("ml-12 rounded-md bg-muted px-3 py-2")], ["ToolExecutor / Approvals / Permissions"]),
          h.div([h.Class("ml-6 rounded-md border px-3 py-2")], ["Ai.Response"]),
          h.div([h.Class("rounded-md bg-muted px-3 py-2")], ["AgentEvent stream"]),
        ],
      ),
    ],
  )

const featureCard = (title: string, description: string): Html =>
  card({ class: "rounded-md shadow-none" }, [
    cardHeader({}, [cardTitle({}, [title]), cardDescription({}, [description])]),
  ])

const packageList = (): Html =>
  h.div(
    [h.Class("grid gap-3 sm:grid-cols-2")],
    allDocsPages
      .filter((page) => page.group === "Packages")
      .map((page) =>
        h.a(
          [
            h.Href(page.path),
            h.Class("rounded-md border px-4 py-3 text-sm hover:bg-accent hover:text-accent-foreground"),
          ],
          [page.title],
        ),
      ),
  )

export const landing = (): Html =>
  h.main(
    [h.Id("main-content")],
    [
      h.section(
        [h.Class("border-b")],
        [
          h.div(
            [h.Class("mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_28rem] lg:py-20")],
            [
              h.div(
                [],
                [
                  h.div(
                    [h.Class("flex flex-wrap gap-2")],
                    [
                      badge({ variant: "secondary" }, ["Effect-native"]),
                      badge({ variant: "outline" }, ["Non-durable"]),
                      badge({ variant: "outline" }, ["effect/unstable/ai"]),
                    ],
                  ),
                  h.h1([h.Class("mt-6 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl")], ["BatonFX"]),
                  h.p(
                    [h.Class("mt-5 max-w-2xl text-lg leading-8 text-muted-foreground")],
                    [
                      "A standalone agent loop over Effect AI. Baton owns turn iteration, local tool execution seams, observable events, and optional context seams while durable storage stays with the host.",
                    ],
                  ),
                  h.div(
                    [h.Class("mt-8 flex flex-wrap gap-3")],
                    [
                      h.a(
                        [
                          h.Href("/docs/getting-started"),
                          h.Class(
                            "inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90",
                          ),
                        ],
                        ["Get started"],
                      ),
                      h.a(
                        [
                          h.Href("/docs/core/agent-loop"),
                          h.Class(
                            "inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                          ),
                        ],
                        ["Read the loop contract"],
                      ),
                    ],
                  ),
                ],
              ),
              tracePanel(),
            ],
          ),
        ],
      ),
      h.section(
        [h.Class("mx-auto max-w-7xl px-4 py-12 sm:px-6")],
        [
          h.div(
            [h.Class("grid gap-4 md:grid-cols-3")],
            [
              featureCard(
                "One payload vocabulary",
                "Baton keeps Ai.Prompt and Ai.Response as the wire vocabulary and adds loop framing only.",
              ),
              featureCard(
                "Explicit seams",
                "Tools, approvals, permissions, memory, compaction, steering, and providers are separate Effect boundaries.",
              ),
              featureCard(
                "Host-owned durability",
                "Relay or another host owns durable state. Baton core stays standalone and effect-only.",
              ),
            ],
          ),
        ],
      ),
      h.section(
        [h.Class("mx-auto grid max-w-7xl gap-8 px-4 pb-16 sm:px-6 lg:grid-cols-[1fr_1fr]")],
        [
          h.div(
            [],
            [
              h.h2([h.Class("text-2xl font-semibold tracking-tight")], ["Install"]),
              h.p(
                [h.Class("mt-3 text-muted-foreground")],
                [
                  "Start with core. Add provider, memory, transport, skills, or FoldKit packages only when the app owns that seam.",
                ],
              ),
              h.div(
                [h.Class("mt-5")],
                [
                  codeBlock({ language: "bash", class: "rounded-md" }, [
                    codeBlockContent({
                      code: "bun add effect @batonfx/core\nbun add @batonfx/providers @batonfx/transport @batonfx/foldkit",
                    }),
                  ]),
                ],
              ),
            ],
          ),
          h.div(
            [],
            [
              h.h2([h.Class("text-2xl font-semibold tracking-tight")], ["Package pages"]),
              h.p(
                [h.Class("mt-3 text-muted-foreground")],
                [
                  "Each package page is sourced from the matching spec document and verified against the package export barrel.",
                ],
              ),
              h.div([h.Class("mt-5")], [packageList()]),
            ],
          ),
        ],
      ),
    ],
  )
